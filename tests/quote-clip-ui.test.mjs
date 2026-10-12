import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { nodes, text } from "./helpers/customer-page-harness.mjs";
import * as ownership from "../lib/supabase/sessionOwnership-core.mjs";
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const source=compile('../components/ai/QuoteClipInput.tsx');
const clipMod={exports:{}};vm.runInNewContext(compile('../lib/quoteClip.ts'),{module:clipMod,exports:clipMod.exports,Error,Set,Number,Math});
const prepared={audio:'data:audio/webm;base64,GkXfowAAAAAAAAAA',frames:[{dataUrl:'data:image/jpeg;base64,/9j/2Q==',seconds:2}],duration:20};
function harness(){
 let cursor=0,epoch=1,session={access_token:'token',user:{id:'user-1'}},preparer=async()=>prepared,fetcher=async()=>new Response(JSON.stringify({transcript:'Add two sockets.'}));
 const slots=[],effects=[],calls=[],prepares=[],uses=[];
 const props={context:{job:'one'},enabled:true,notes:'Kitchen',organisationId:'org-1',userId:'user-1',onUse:value=>uses.push(value)};
 const useState=initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];};
 const changed=(old,deps)=>!old||!deps||deps.some((v,i)=>!Object.is(v,old.deps?.[i]));
 const deps={
 'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
 react:{useState,useRef:v=>useState({current:v})[0],useMemo(fn,deps){const i=cursor++;if(changed(slots[i],deps))slots[i]={value:fn(),deps};return slots[i].value;},useLayoutEffect(fn,deps){const i=cursor++,old=slots[i];if(changed(old,deps)){const next={deps,cleanup:old?.cleanup};slots[i]=next;effects.push(()=>{next.cleanup?.();next.cleanup=fn();});}}},
 'next/image':{default:'Image'},'../ui/Button':{Button:'Button'},'../ui/FormField':{TextareaField:'TextareaField'},
 '../../lib/quoteClip':{...clipMod.exports,prepareQuoteClip:(...args)=>{prepares.push(args);return preparer(...args);}},
 '../../lib/supabase/client':{captureSupabaseSessionOwnership:()=>({session,epoch}),readSupabaseSession:()=>session,readSupabaseSessionOwnershipEpoch:()=>epoch},
 '../../lib/supabase/sessionOwnership-core.mjs':ownership,
 };
 const mod={exports:{}};vm.runInNewContext(source,{module:mod,exports:mod.exports,AbortController,Error,JSON,require:key=>{assert.ok(key in deps,key);return deps[key];},fetch:async(url,init)=>{calls.push({url,init});return fetcher();}});
 function render(){cursor=0;const tree=mod.exports.QuoteClipInput(props);effects.splice(0).forEach(fn=>fn());return tree;}
 function button(label){const b=nodes(render()).find(n=>n.type==='Button'&&text(n).includes(label));assert.ok(b,label);return b;}
 function choose(){nodes(render()).find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[{name:'site.mov',type:'video/quicktime',size:50000}],value:''}});render();}
 return{props,calls,prepares,uses,render,button,choose,prepare(fn){preparer=fn;},fetch(fn){fetcher=fn;},async ready(){choose();await button('Prepare sound and frames').props.onClick();render();},async transcribe(){await button('Transcribe speech').props.onClick();render();},review(){nodes(render()).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});render();},edit(value){nodes(render()).find(n=>n.type==='TextareaField').props.onChange({target:{value}});render();},session(){epoch++;session={access_token:'changed',user:{id:'other'}};},recover(){session={...session,is_password_recovery:true};},unmount(){slots.forEach(s=>s?.cleanup?.());}};
}
test('prepare, send, transcript review and handoff are separate explicit actions',async()=>{
 const h=harness();h.choose();assert.equal(h.prepares.length,0);assert.equal(h.calls.length,0);await h.button('Prepare sound and frames').props.onClick();h.render();assert.equal(h.calls.length,0);
 await h.transcribe();assert.deepEqual(JSON.parse(h.calls[0].init.body),{operation:'transcribe',consent:true,audio:prepared.audio});assert.equal(h.button('Use checked transcript').props.disabled,true);
 h.review();const use=h.button('Use checked transcript').props.onClick;use();use();assert.equal(h.uses.length,1);assert.equal(h.uses[0].transcript,'Add two sockets.');assert.equal(h.uses[0].frames[0].seconds,2);assert.equal(h.props.notes,'Kitchen');
});
test('edits reset transcript review and frames-only use makes no provider request',async()=>{
 const h=harness();await h.ready();await h.transcribe();h.review();h.edit('Three sockets.');assert.equal(h.button('Use checked transcript').props.disabled,true);h.review();h.button('Use checked transcript').props.onClick();assert.equal(h.uses[0].transcript,'Three sockets.');
 const frames=harness();await frames.ready();frames.button('Use video frames without speech').props.onClick();assert.equal(frames.calls.length,0);assert.equal(frames.uses[0].transcript,'');
});
test('account, target, note, readiness and session changes discard local preparation',async()=>{
 for(const change of [h=>{h.props.context={job:'two'};h.render();},h=>{h.props.notes='Other notes';h.render();},h=>{h.props.userId='other';h.render();},h=>{h.props.enabled=false;h.render();},h=>h.session(),h=>h.unmount()]){
  const h=harness();let done;h.prepare(()=>new Promise(resolve=>{done=resolve;}));h.choose();const pending=h.button('Prepare sound and frames').props.onClick();change(h);done(prepared);await pending;assert.equal(h.calls.length,0);assert.equal(h.uses.length,0);assert.ok(!text(h.render()).includes('Use video frames without speech'));
 }
});
test('old transcripts and callbacks cannot apply to a changed source or session',async()=>{
 const h=harness();await h.ready();let done;h.fetch(()=>new Promise(resolve=>{done=resolve;}));const pending=h.transcribe();h.props.notes='New note';h.render();done(new Response(JSON.stringify({transcript:'Old answer'})));await pending;assert.doesNotMatch(text(h.render()),/Old answer/);
 for(const change of [h=>{h.props.context={};h.render();},h=>h.session(),h=>{h.props.enabled=false;h.render();}]){const old=harness();await old.ready();await old.transcribe();old.review();const use=old.button('Use checked transcript').props.onClick;change(old);use();assert.equal(old.uses.length,0);}
});
test('duplicate taps are single flight and clear aborts a pending transcription',async()=>{
 const h=harness();await h.ready();let done;h.fetch(()=>new Promise(resolve=>{done=resolve;}));const send=h.button('Transcribe speech').props.onClick;const pending=send();await send();assert.equal(h.calls.length,1);h.button('Clear recording').props.onClick();assert.equal(h.calls[0].init.signal.aborted,true);done(new Response(JSON.stringify({transcript:'Old answer'})));await pending;assert.doesNotMatch(text(h.render()),/Old answer/);assert.equal(h.uses.length,0);
});
test('billing failures preserve notes and recovery or excessive text cannot apply',async()=>{
 const h=harness();await h.ready();h.fetch(async()=>new Response(JSON.stringify({error:'OpenAI API credit is exhausted.'}),{status:402}));await h.transcribe();assert.match(text(h.render()),/credit is exhausted/);assert.equal(h.props.notes,'Kitchen');assert.equal(h.uses.length,0);
 const recovery=harness();recovery.recover();recovery.choose();await recovery.button('Prepare sound and frames').props.onClick();assert.equal(recovery.prepares.length,0);
 const long=harness();await long.ready();await long.transcribe();long.edit('x'.repeat(12000));long.review();long.button('Use checked transcript').props.onClick();assert.equal(long.uses.length,0);assert.match(text(long.render()),/12,000/);
});
