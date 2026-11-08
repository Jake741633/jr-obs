import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {loadLocalTs} from './load-local-ts.mjs';

export function controlledBillingStatus(){
 const timers=new Map(),scheduled=[];
 const {loadOwnerBillingStatus}=loadLocalTs(new URL('../../lib/billingStatusClient.mjs',import.meta.url),{}, {
  AbortController,fetch,
  setTimeout(fn,ms){const id=Symbol();timers.set(id,{fn,ms});scheduled.push(ms);return id;},
  clearTimeout(id){timers.delete(id);},
 });
 return {loadOwnerBillingStatus,timers,scheduled,expire(){for(const {fn} of [...timers.values()])fn();}};
}

export const billingStatusFixtureData={mode:'test',reviewRequired:false,checkoutAvailable:true,portalAvailable:true,subscription:null};
export async function nativeBillingStatusFixture(t,stage='body'){
 let mode=stage,started,closed,received,calls=0;
 const pending=new Promise(resolve=>{started=resolve;}),connectionClosed=new Promise(resolve=>{closed=resolve;}),headersReceived=new Promise(resolve=>{received=resolve;});
 const server=createServer((req,res)=>{
  calls++;assert.equal(req.url,'/api/billing/status');
  if(mode==='ready'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(billingStatusFixtureData));return;}
  res.on('close',()=>closed());
  if(mode==='body'){res.writeHead(200,{'Content-Type':'application/json'});res.write('{"private":"fixture-secret",');}
  started();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 return {
  pending,connectionClosed,headersReceived,calls:()=>calls,ready(){mode='ready';},
  async fetchImpl(url,init){assert.equal(url,'/api/billing/status');const response=await fetch(`http://127.0.0.1:${server.address().port}${url}`,init);received();return response;},
 };
}

export async function settleBillingRead(pending){
 let timer;
 try{
  const value=await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>resolve(undefined),500);})]);
  assert.notEqual(value,undefined,'billing status must settle when its deadline or caller cancels');return value;
 }finally{clearTimeout(timer);}
}
