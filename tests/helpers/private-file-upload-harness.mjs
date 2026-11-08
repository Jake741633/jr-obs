import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as queue from '../../lib/cloud/privateUploadQueue-core.mjs';
import * as replay from '../../lib/cloud/privateUploadReplay-core.mjs';

const source=ts.transpileModule(readFileSync(new URL('../../lib/cloud/privateFiles.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
export function privateUploadHarness(){
 const values=new Map(),uploads=[],confirmations=[],blocked=new Set();
 const authorization={organisationId:'org-1',userId:'user-1',role:'owner'};
 let active={...authorization},online=true,upload=async()=>{};
 const same=other=>queue.privateUploadMatchesAuthorization({organisationId:active.organisationId,userId:active.userId,authorizationRole:active.role,authorizationCustomerSourceId:active.customerSourceId},other);
 const localStorage={getItem:key=>key==='jr-os-active-organisation'?active.organisationId:values.get(key)??null,setItem:(key,value)=>{if(blocked.has(key))throw Error('Synthetic private queue quota');values.set(key,String(value));}};
 const dependencies={react:{},'../supabase/client':{readSupabaseSession:()=>({user:{id:active.userId}})},'./config':{effectiveCloudMode:()=> 'cloud',cloudStorageBucket:'private'},
  './privateUploadQueue-core.mjs':queue,'./privateUploadReplay-core.mjs':replay,
  './repository':{activeSyncAuthorizationMatches:same,revalidateSyncAuthorization:async other=>same(other)},
  './client':{cloudUpsert:async(table,rows)=>rows.map(row=>({...row,id:'file-'+row.source_id})),uploadPrivateObject:async(path,blob,mime)=>{uploads.push({path,blob,mime});await upload(path,blob,mime);}},
 };
 class Clock extends Date{constructor(value='2026-11-08T18:00:00.000Z'){super(value);}static now(){return Date.UTC(2026,10,8,18);}}
 const mod={exports:{}};
 vm.runInNewContext(source,{module:mod,exports:mod.exports,Blob,Uint8Array,Date:Clock,Error,CustomEvent,
  window:{localStorage,atob,dispatchEvent(){}},navigator:{get onLine(){return online;}},
  require:key=>{assert.ok(key in dependencies,key);return dependencies[key];},
 });
 const api=mod.exports,key=api.PRIVATE_FILE_UPLOAD_QUEUE_KEY;
 return {api,authorization,uploads,confirmations,blocked,upload(fn){upload=fn;},active(value){active={...value};},online(value){online=value;},
  queue(sourceId,patch={}){return api.queuePrivateFileUpload({organisationId:authorization.organisationId,userId:authorization.userId,authorizationRole:authorization.role,storageKey:'jr-os-job-documents',sourceId,fileName:sourceId+'.jpg',mimeType:'image/jpeg',size:3,dataUrl:'data:image/jpeg;base64,b2xk',objectPath:authorization.organisationId+'/jobs/job-1/'+sourceId+'/'+sourceId+'.jpg',...patch});},
  pending:()=>JSON.parse(values.get(key)||'[]'),replace(items){values.set(key,JSON.stringify(items));},
  flush(storageKey='jr-os-job-documents',onSynced=item=>confirmations.push(item.sourceId)){return api.flushPrivateFileUploadQueue(authorization,storageKey,onSynced);},
 };
}
export const settleUploads=()=>new Promise(resolve=>setImmediate(resolve));
