import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";

const code=ts.transpileModule(readFileSync(new URL('../lib/quoteClip.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const file={name:'site.mov',type:'video/quicktime',size:1000};
function setup(config={}){
 const resources={urls:0,revoked:0,closed:0,stopped:0,paused:0,disconnected:0,canvas:[],recorders:[],timers:new Map(),startupResolvers:[]};let timerId=0,media;
 const doc=new EventTarget();doc.visibilityState='visible';
 class Media extends EventTarget {
  constructor(){super();this.duration=config.duration??12;this.readyState=0;this.videoWidth=1920;this.videoHeight=1080;this.time=0;this.ended=false;}
  set src(v){this.source=v;if(!config.stallLoad)queueMicrotask(()=>{this.readyState=2;this.dispatchEvent(new Event('loadeddata'));});}
  get src(){return this.source;}
  get currentTime(){return this.time;}
  set currentTime(v){this.time=v;if(!config.stallSeek)queueMicrotask(()=>this.dispatchEvent(new Event('seeked')));}
  play(){if(config.holdPlay)return new Promise(resolve=>resources.startupResolvers.push(resolve));if(config.playError)return Promise.reject(new Error('codec playback failed'));if(resources.recorders.some(r=>r.state==='recording')&&!config.holdRecording)queueMicrotask(()=>{this.time=this.duration;this.ended=true;this.dispatchEvent(new Event('timeupdate'));this.dispatchEvent(new Event('ended'));});return Promise.resolve();}
  pause(){resources.paused++;} removeAttribute(){} load(){}
 }
 class Recorder extends EventTarget {
  static isTypeSupported(type){return !config.unsupported && type==='audio/webm;codecs=opus';}
  constructor(stream,options){super();this.state='inactive';this.mimeType=options.mimeType;resources.recorders.push(this);}
  start(){this.state='recording';}
  stop(){this.state='inactive';queueMicrotask(()=>{const e=new Event('dataavailable');e.data=new Blob([new Uint8Array(config.oversizeAudio?1500001:16)],{type:this.mimeType});this.dispatchEvent(e);this.dispatchEvent(new Event('stop'));});}
 }
 class Context {
  constructor(){this.state='running';}
  resume(){return config.holdResume?new Promise(resolve=>resources.startupResolvers.push(resolve)):Promise.resolve();}
  createMediaElementSource(){return {connect(){},disconnect(){resources.disconnected++;if(config.disconnectError)throw new Error("disconnect failed");}};}
  createMediaStreamDestination(){return {stream:{getTracks:()=>[{stop(){resources.stopped++;}}]},disconnect(){resources.disconnected++;if(config.disconnectError)throw new Error("disconnect failed");}};}
  close(){resources.closed++;return Promise.resolve();}
 }
 class Reader extends EventTarget {
  readAsDataURL(blob){blob.arrayBuffer().then(buffer=>{this.result='data:'+blob.type+';base64,'+Buffer.from(buffer).toString('base64');this.dispatchEvent(new Event('load'));this.onload?.();});}
  abort(){this.dispatchEvent(new Event('abort'));}
 }
 doc.createElement=tag=>{
  if(tag!=='canvas')return media=new Media();
  const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){},fillStyle:''}),toBlob(callback){queueMicrotask(()=>callback(config.emptyFrame?null:new Blob([new Uint8Array(config.oversizeFrame?250001:4)],{type:'image/jpeg'})));}};resources.canvas.push(canvas);return canvas;
 };
 const mod={exports:{}};
 vm.runInNewContext(code,{module:mod,exports:mod.exports,window:{AudioContext:Context},document:doc,MediaRecorder:Recorder,URL:{createObjectURL(){resources.urls++;return 'blob:site';},revokeObjectURL(){resources.revoked++;}},Blob,FileReader:Reader,AbortController,DOMException,Error,Number,Math,Set,Promise,
 setTimeout(fn,ms){const id=++timerId;resources.timers.set(id,{fn,ms});return id;},clearTimeout(id){resources.timers.delete(id);}});
 return {api:mod.exports,resources,doc,media:()=>media,fireTimers(){[...resources.timers.values()].forEach(t=>t.fn());}};
}
async function tickUntil(check){for(let i=0;i<100&&!check();i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(check());}
function clean(h,{audio=true}={}){assert.equal(h.resources.urls,h.resources.revoked);assert.equal(h.resources.closed,audio?1:0);assert.equal(h.resources.stopped,audio?1:0);assert.equal(h.resources.timers.size,0);assert.ok(h.resources.paused>0);}

test('clip metadata and combined notes have explicit bounds and attributed speech',()=>{
 const h=setup();assert.equal(h.api.clipFileError(file),null);
 for(const patch of [{size:0},{size:100*1024*1024+1},{type:'text/html',name:'site.html'},{name:''}])assert.ok(h.api.clipFileError({...file,...patch}));
 assert.equal(h.api.clipFileError({...file,type:''}),null);assert.match(h.api.clipNotes('Two sockets','Also a pendant'),/Reviewed speech from site recording:\nAlso a pendant/);
 assert.throws(()=>h.api.clipNotes('x'.repeat(12000),'More'),/12,000/);
});
test('video preparation returns only bounded sound and three scaled, ordered stills',async()=>{
 const h=setup(),progress=[];const result=await h.api.prepareQuoteClip(file,{speech:true,onProgress:m=>progress.push(m)});
 assert.match(result.audio,/^data:audio\/webm;base64,/);assert.equal(result.duration,12);assert.equal(result.frames.length,3);
 assert.ok(result.frames.every((frame,i)=>frame.seconds>=0&&frame.seconds<=12&&(!i||frame.seconds>result.frames[i-1].seconds)));
 assert.ok(h.resources.canvas.every(c=>c.width===960&&c.height===540));assert.ok(progress.length>0);clean(h);
});
test('frames-only preparation does not open an audio context or recorder',async()=>{
 const h=setup({unsupported:true});const result=await h.api.prepareQuoteClip(file,{speech:false});assert.equal(result.audio,null);assert.equal(result.frames.length,3);assert.equal(h.resources.recorders.length,0);clean(h,{audio:false});
});
test('audio-only recordings produce no image frames',async()=>{
 const h=setup();const result=await h.api.prepareQuoteClip({...file,name:'notes.m4a',type:'audio/mp4'},{speech:true});assert.equal(result.frames.length,0);assert.ok(result.audio);clean(h);
});
test('unreadable duration, unavailable recorder and excessive outputs fail without partial success',async()=>{
 for(const config of [{duration:61},{duration:Infinity},{duration:0},{unsupported:true},{oversizeAudio:true},{oversizeFrame:true},{emptyFrame:true},{playError:true}]){
  const h=setup(config);await assert.rejects(h.api.prepareQuoteClip(file,{speech:true}));assert.equal(h.resources.urls,h.resources.revoked);assert.equal(h.resources.timers.size,0);assert.ok(h.resources.closed<=1);
 }
});
test('abort and backgrounding discard recordings and release every resource',async()=>{
 for(const kind of ['abort','hidden']){
  const h=setup({holdRecording:true}),abort=new AbortController();const pending=h.api.prepareQuoteClip(file,{signal:abort.signal,speech:true});
  await tickUntil(()=>h.resources.recorders.some(r=>r.state==='recording'));
  if(kind==='abort')abort.abort();else{h.doc.visibilityState='hidden';h.doc.dispatchEvent(new Event('visibilitychange'));}
  await assert.rejects(pending);await new Promise(resolve=>setImmediate(resolve));clean(h);
 }
 const h=setup(),abort=new AbortController();abort.abort();await assert.rejects(h.api.prepareQuoteClip(file,{signal:abort.signal,speech:true}));assert.equal(h.resources.urls,0);
});
test('stalled loading or seeking times out and cleans up without waiting indefinitely',async()=>{
 for(const config of [{stallLoad:true},{stallSeek:true}]){
  const h=setup(config);const pending=h.api.prepareQuoteClip(file,{speech:false});await tickUntil(()=>config.stallSeek?h.media()?.currentTime>0:h.resources.timers.size>0);h.fireTimers();await assert.rejects(pending);clean(h,{audio:false});
 }
});

test("cleanup continues when an audio node cannot disconnect",async()=>{const h=setup({disconnectError:true});await h.api.prepareQuoteClip(file,{speech:true});clean(h);});

for(const promise of ['holdPlay','holdResume'])for(const stop of ['abort','hidden','timeout'])
 test(`startup ${promise} is released by ${stop} after loadeddata and ignores late settlement`,async()=>{
  const h=setup({[promise]:true}),abort=new AbortController();let outcome;
  const pending=h.api.prepareQuoteClip(file,{signal:abort.signal,speech:true}).then(value=>{outcome={value};},error=>{outcome={error};});
  await tickUntil(()=>h.media()?.readyState===2);
  if(stop==='abort')abort.abort();else if(stop==='hidden'){h.doc.visibilityState='hidden';h.doc.dispatchEvent(new Event('visibilitychange'));}else h.fireTimers();
  await tickUntil(()=>Boolean(outcome));await pending;
  assert.ok(outcome.error,`${promise}/${stop} must reject`);clean(h);assert.equal(h.resources.recorders.length,0);
  h.resources.startupResolvers.forEach(resolve=>resolve());h.media().dispatchEvent(new Event('loadeddata'));
  await new Promise(resolve=>setImmediate(resolve));clean(h);assert.equal(h.resources.recorders.length,0);
 });
