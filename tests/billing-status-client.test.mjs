import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOwnerBillingStatus} from '../lib/billingStatusClient.mjs';
const owner={userId:'22222222-2222-4222-8222-222222222222',organisationId:'11111111-1111-4111-8111-111111111111',role:'owner',accessToken:'fixture-token'};
test('client reads server status without sending provider IDs or trusting browser payment flags',async()=>{
 const calls=[];const value=await loadOwnerBillingStatus({owner,isCurrent:()=>true,fetchImpl:async(url,init)=>{calls.push({url,init});return Response.json({mode:'test',checkoutAvailable:false,subscription:null});}});
 assert.equal(value.state,'ready');assert.equal(value.data.subscription,null);assert.equal(calls[0].url,'/api/billing/status');assert.equal(calls[0].init.body,'{}');assert.equal(calls[0].init.headers['x-jr-organisation'],owner.organisationId);assert.equal(calls[0].init.cache,'no-store');
});
test('stale identity, non-owner and aborted reads make no billing request',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;};const controller=new AbortController();controller.abort();
 for(const args of [{owner,isCurrent:()=>false},{owner:{...owner,role:'admin'},isCurrent:()=>true},{owner,isCurrent:()=>true,signal:controller.signal}])assert.equal(await loadOwnerBillingStatus({...args,fetchImpl}),null);
 assert.equal(calls,0);
});
test('late responses from another account or retired operation are discarded',async()=>{
 let current=true,finish;const promise=loadOwnerBillingStatus({owner,isCurrent:()=>current,fetchImpl:()=>new Promise(resolve=>{finish=resolve;})});current=false;finish(Response.json({mode:'test',checkoutAvailable:false,subscription:null}));assert.equal(await promise,null);
});
test('errors and malformed payloads return fixed safe UI states',async()=>{
 for(const response of [new Response('secret',{status:503}),Response.json({mode:'live',subscription:null}),Response.json({mode:'test',checkoutAvailable:true,subscription:null})]){
  const result=await loadOwnerBillingStatus({owner,isCurrent:()=>true,fetchImpl:async()=>response});assert.equal(result.state,'unavailable');assert.equal('error'in result,false);
 }
 const forbidden=await loadOwnerBillingStatus({owner,isCurrent:()=>true,fetchImpl:async()=>new Response('',{status:403})});assert.equal(forbidden.state,'denied');
});
