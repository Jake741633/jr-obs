import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

export const nodes=tree=>Array.isArray(tree)?tree.flatMap(nodes):tree&&typeof tree==='object'?[tree,...nodes(tree.props?.children)]:[];
export const text=tree=>Array.isArray(tree)?tree.map(text).join(''):tree==null||typeof tree==='boolean'?'':typeof tree==='object'?text(tree.props?.children):String(tree);
export const savedExpense=(patch={})=>({id:'expense-existing',expenseDate:'2026-11-05',supplier:'CEF',description:'Cable',category:'Materials',paymentMethod:'Business card',status:'Ready',netAmount:100,vatAmount:20,grossAmount:120,notes:'Keep reference',createdAt:'2026-11-05T10:00:00Z',updatedAt:'2026-11-05T10:00:00Z',...patch});
const key='jr-os-expenses',queueKey='jr-os-cloud-sync-queue';
export async function expensePageHarness({mode='cloud',initial=[],initialPrivateQueue,identityPatch={},holdDownload=false}={}){
 const values=new Map(),blocked=new Set(),readers=[],slots=[],layouts=[],effects=[],attempts=[],lostAcks=new Set(),listeners=new Map();
 let cursor=0,sequence=0,lastCollection,clock=Date.parse('2026-11-08T12:00:00Z'),beforeMutation,retired=false,lateStateWrites=0,stateChanges=0;
 let identity=mode==='local'?null:{organisationId:'org-expenses',userId:'owner-expenses',role:'owner',...identityPatch};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 const storage={get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:key=>values.get(key)??null,setItem(key,value){if(blocked.has(key))throw Error('Synthetic quota: private fixture detail');values.set(key,String(value));},removeItem(key){if(blocked.has(key))throw Error('Synthetic quota');values.delete(key);}};
 const window={localStorage:storage,atob,addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);},dispatchEvent(event){for(const fn of [...(listeners.get(event.type)||[])])fn(event);}};
 const useState=initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],next=>{stateChanges++;if(retired)lateStateWrites++;slots[i]=typeof next==='function'?next(slots[i]):next;}];};
 const changed=(prior,deps)=>!prior||!deps||deps.some((value,i)=>!Object.is(value,prior.deps[i]));
 const memo=(fn,deps)=>{const i=cursor++;if(changed(slots[i],deps))slots[i]={deps,value:fn()};return slots[i].value;};
 const effect=(queue,fn,deps)=>{const i=cursor++,prior=slots[i];if(changed(prior,deps)){const next={deps,cleanup:prior?.cleanup};slots[i]=next;queue.push(()=>{next.cleanup?.();next.cleanup=fn();});}};
 const react={useState,useRef:value=>useState({current:value})[0],useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useEffect:(fn,deps)=>effect(effects,fn,deps),useLayoutEffect:(fn,deps)=>effect(layouts,fn,deps)};
 class Reader{static LOADING=1;readyState=0;result=null;abortCount=0;constructor(){readers.push(this);}readAsDataURL(file){this.file=file;this.readyState=1;this.delayedLoad=this.onload;this.delayedError=this.onerror;}abort(){this.abortCount++;this.readyState=2;this.onabort?.();}finish(result='data:image/jpeg;base64,eA=='){this.result=result;this.readyState=2;this.delayedLoad?.();}fail(){this.readyState=2;this.delayedError?.();}}
 const noNetwork=async()=>{throw Error('Expense tests must never access remote services');};
 const client=Object.fromEntries(['cloudPatch','cloudRpc','cloudSelect','cloudSelectFresh','cloudUpsert','cloudInsert','downloadPrivateObject','uploadPrivateObject','isCloudConflictError'].map(name=>[name,noNetwork]));
 client.downloadPrivateObject=async(_path,signal)=>holdDownload?new Promise((_resolve,reject)=>signal?.addEventListener('abort',()=>reject(signal.reason),{once:true})):new Blob(['synthetic receipt'],{type:'image/jpeg'});
 const cache=new Map();let storageModule;
 const overrides={react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'lucide-react':{},
  '../../components/ui/Button':{Button:'Button'},'../../components/ui/Card':{Card:'Card'},'../../components/ui/FormField':{InputField:'InputField',TextareaField:'TextareaField'},'../../components/ui/PageHeader':{PageHeader:'PageHeader'},
  './config':{effectiveCloudMode:()=>mode,cloudStorageBucket:'private'},'./client':client,'../supabase/client':{readSupabaseSession:()=>identity?{user:{id:identity.userId}}:null,supabaseFetch:noNetwork},
  './cloud/useCloudIdentity':{useCloudIdentity:()=>({identity,isReady:true,mode})},
  '../../lib/cloud/useCloudIdentity':{useCloudIdentity:()=>({identity,isReady:true,mode})},
  '../../lib/storage':{makeId:prefix=>`${prefix}_${++sequence}`,useCloudLocalCollection:(...args)=>storageModule.useCloudLocalCollection(...args)},
  '../../lib/cloud/coreBusinessCollections':{useExpensesCollection(){const base=storageModule.useCloudLocalCollection(key);lastCollection=base;
   const methods=memo(()=>Object.fromEntries(['createItem','updateItem','removeItem'].map((name)=>[name,(...args)=>{beforeMutation?.(name,args);attempts.push({name,args});const result=base[name](...args);if(lostAcks.delete(name))throw Error('Synthetic lost acknowledgement');return result;}])),[base.createItem,base.updateItem,base.removeItem]);
   return {...base,...methods};}},
 };
 function load(path){if(cache.has(path))return cache.get(path).exports;const mod={exports:{}};cache.set(path,mod);
  const source=ts.transpileModule(readFileSync(path,'utf8'),{fileName:path.replace(/\.(mjs|js)$/,'.ts'),compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const require=name=>{if(Object.hasOwn(overrides,name))return overrides[name];assert.ok(name.startsWith('.'),name);const candidate=resolve(dirname(path),name),file=[candidate,...['.ts','.tsx','.mjs','.js'].map(ext=>candidate+ext)].find(existsSync);assert.ok(file,name);return load(file);};
  vm.runInNewContext(source,{module:mod,exports:mod.exports,require,window,navigator:{onLine:false},Date:Clock,Intl,Error,AggregateError,URL,Blob,Uint8Array,AbortController,crypto:{randomUUID},queueMicrotask,Event:class Event{constructor(type){this.type=type;}},CustomEvent:class CustomEvent{constructor(type,options){this.type=type;this.detail=options?.detail;}},FileReader:Reader,atob,structuredClone});return mod.exports;
 }
 const root=resolve(new URL('../..',import.meta.url).pathname),adapter=load(root+'/lib/cloud/adapter.ts'),repository=load(root+'/lib/cloud/repository.ts');storageModule=load(root+'/lib/storage.ts');
 const scoped=()=>identity?adapter.accountStorageKey(key,identity.organisationId,identity.userId,identity.role):key;
 storage.setItem(scoped(),JSON.stringify(initial));repository.setActiveSyncIdentity(identity?.organisationId??null,identity?.userId??null,identity?.role??null);
 if(initialPrivateQueue)storage.setItem('jr-os-private-file-upload-queue',JSON.stringify(initialPrivateQueue));
 const Page=load(root+'/app/expenses/page.tsx').default;
 const paint=()=>{cursor=0;const view=Page();layouts.splice(0).forEach(fn=>fn());return view;};
 const render=()=>{const view=paint();effects.splice(0).forEach(fn=>fn());return view;};
 render();await new Promise(resolve=>setImmediate(resolve));render();
 const form=()=>nodes(render()).find(node=>node.type==='form');
 const button=label=>nodes(render()).find(node=>['Button','button'].includes(node.type)&&(text(node)===label||node.props['aria-label']===label));
 return {values,blocked,readers,attempts,lostAcks,render,paint,form,button,raw:()=>storage.getItem(scoped()),queue:()=>JSON.parse(storage.getItem(queueKey)||'[]'),privateQueue:()=>JSON.parse(storage.getItem('jr-os-private-file-upload-queue')||'[]'),key:scoped(),queueKey,
  click(label){const node=button(label);assert.ok(node,label);node.props.onClick();},
  field(label,value){const node=nodes(form()).find(node=>node.props.label===label);assert.ok(node,label);if(value!==undefined)node.props.onChange({target:{value}});return node;},
  fill(){this.click('Add expense');this.field('Expense date','2026-11-08');this.field('Supplier','TLC');this.field('Description','Socket supplies');this.field('Net amount (£)','15');this.field('VAT amount (£)','3');},
  receipt(name='receipt.jpg',size=1){const node=nodes(form()).find(node=>node.type==='input'&&node.props.type==='file');node.props.onChange({target:{files:[{name,size}],value:'selected'}});return readers.at(-1);},
  submit(){const submit=form().props.onSubmit;submit({preventDefault(){}});},
  register(){return nodes(render()).filter(node=>node.type==='select').at(-1);},
  current:()=>lastCollection,async settled(){await new Promise(resolve=>setImmediate(resolve));return render();},externalUpdate(id,update){lastCollection.updateItem(id,update);},beforeMutation(fn){beforeMutation=fn;},advance(){clock+=1000;},
  async account(patch={userId:'another-owner'}){identity={...identity,...patch};repository.setActiveSyncIdentity(identity.organisationId,identity.userId,identity.role);render();await new Promise(resolve=>setImmediate(resolve));render();},
  queueChanged(){window.dispatchEvent({type:'jr-os-private-file-queue-changed'});},queueListeners:()=>[...(listeners.get('jr-os-private-file-queue-changed')||[])],stateChanges:()=>stateChanges,
  lateStateWrites:()=>lateStateWrites,unmount(){slots.forEach(slot=>slot?.cleanup?.());retired=true;},
 };
}
