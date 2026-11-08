import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOwnerBillingStatus} from '../lib/billingStatusClient.mjs';
import {controlledBillingStatus,nativeBillingStatusFixture,settleBillingRead,billingStatusFixtureData} from './helpers/billing-status-fixture.mjs';
const owner={userId:'22222222-2222-4222-8222-222222222222',organisationId:'11111111-1111-4111-8111-111111111111',role:'owner',accessToken:'fixture-token'};
test('client reads server status without sending provider IDs or trusting browser payment flags',async()=>{
 const calls=[];const value=await loadOwnerBillingStatus({owner,isCurrent:()=>true,fetchImpl:async(url,init)=>{calls.push({url,init});return Response.json({mode:'test',reviewRequired:false,checkoutAvailable:false,portalAvailable:false,subscription:null});}});
 assert.equal(value.state,'ready');assert.equal(value.data.subscription,null);assert.equal(calls[0].url,'/api/billing/status');assert.equal(calls[0].init.body,'{}');assert.equal(calls[0].init.headers['x-jr-organisation'],owner.organisationId);assert.equal(calls[0].init.cache,'no-store');
});
test('stale identity, non-owner and aborted reads make no billing request',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;};const controller=new AbortController();controller.abort();
 for(const args of [{owner,isCurrent:()=>false},{owner:{...owner,role:'admin'},isCurrent:()=>true},{owner,isCurrent:()=>true,signal:controller.signal}])assert.equal(await loadOwnerBillingStatus({...args,fetchImpl}),null);
 assert.equal(calls,0);
});
test('late responses from another account or retired operation are discarded',async()=>{
 let current=true,finish;const promise=loadOwnerBillingStatus({owner,isCurrent:()=>current,fetchImpl:()=>new Promise(resolve=>{finish=resolve;})});current=false;finish(Response.json({mode:'test',reviewRequired:false,checkoutAvailable:false,portalAvailable:false,subscription:null}));assert.equal(await promise,null);
});
test('errors and malformed payloads return fixed safe UI states',async()=>{
 for(const response of [new Response('secret',{status:503}),Response.json({mode:'live',subscription:null}),Response.json({mode:'test',reviewRequired:false,checkoutAvailable:'yes',portalAvailable:false,subscription:null})]){
  const result=await loadOwnerBillingStatus({owner,isCurrent:()=>true,fetchImpl:async()=>response});assert.equal(result.state,'unavailable');assert.equal('error'in result,false);
 }
 const forbidden=await loadOwnerBillingStatus({owner,isCurrent:()=>true,fetchImpl:async()=>new Response('',{status:403})});assert.equal(forbidden.state,'denied');
});
test('client requires explicit review provenance and retains only its public Boolean',async()=>{
 const status={mode:'test',checkoutAvailable:false,portalAvailable:true,subscription:null};
 for(const reviewRequired of [undefined,null,'false',0])assert.deepEqual(await loadOwnerBillingStatus({owner,isCurrent:()=>true,fetchImpl:async()=>Response.json({...status,reviewRequired})}),{state:'unavailable'});
 const held=await loadOwnerBillingStatus({owner,isCurrent:()=>true,fetchImpl:async()=>Response.json({...status,reviewRequired:true,review_source_id:'ch_Private',review_reason:'fraud'})});
 assert.deepEqual(held,{state:'ready',data:{...status,reviewRequired:true}});
});

for(const stage of ['headers','body']){
 test(`a native status response stalled at ${stage} times out safely and permits a successful retry`,async t=>{
  const client=controlledBillingStatus(),fixture=await nativeBillingStatusFixture(t,stage),controller=new AbortController();
  const read=()=>client.loadOwnerBillingStatus({owner,signal:controller.signal,isCurrent:()=>true,fetchImpl:fixture.fetchImpl});
  const pending=read();await fixture.pending;
  if(stage==='body'){await fixture.headersReceived;await new Promise(resolve=>setImmediate(resolve));}
  client.expire();
  assert.equal(JSON.stringify(await settleBillingRead(pending)),JSON.stringify({state:'unavailable'}));
  assert.equal(controller.signal.aborted,false,'the internal deadline must not retire the page owner');
  assert.equal(client.timers.size,0);
  fixture.ready();
  const retry=await read();assert.equal(retry.state,'ready');assert.deepEqual(JSON.parse(JSON.stringify(retry.data)),billingStatusFixtureData);
  assert.equal(fixture.calls(),2);assert.equal(client.timers.size,0);assert.deepEqual(client.scheduled,[20000,20000]);
 });
 test(`caller cancellation during native ${stage} reads still returns null and clears the deadline`,async t=>{
  const client=controlledBillingStatus(),fixture=await nativeBillingStatusFixture(t,stage),controller=new AbortController();
  const pending=client.loadOwnerBillingStatus({owner,signal:controller.signal,isCurrent:()=>true,fetchImpl:fixture.fetchImpl});
  await fixture.pending;if(stage==='body'){await fixture.headersReceived;await new Promise(resolve=>setImmediate(resolve));}controller.abort();
  assert.equal(await settleBillingRead(pending),null);assert.equal(client.timers.size,0);assert.equal(fixture.calls(),1);
 });
}

test('the status deadline discards a retired account instead of reporting an unavailable current owner',async t=>{
 const client=controlledBillingStatus(),fixture=await nativeBillingStatusFixture(t);let current=true;
 const pending=client.loadOwnerBillingStatus({owner,isCurrent:()=>current,fetchImpl:fixture.fetchImpl});
 await fixture.headersReceived;await new Promise(resolve=>setImmediate(resolve));current=false;client.expire();
 assert.equal(await settleBillingRead(pending),null);assert.equal(client.timers.size,0);
});

test('the status deadline remains armed through JSON parsing and clears after an interrupted native read',async t=>{
 const client=controlledBillingStatus(),fixture=await nativeBillingStatusFixture(t);
 const pending=client.loadOwnerBillingStatus({owner,isCurrent:()=>true,fetchImpl:fixture.fetchImpl});
 await fixture.headersReceived;await new Promise(resolve=>setImmediate(resolve));
 assert.equal(client.timers.size,1);assert.deepEqual(client.scheduled,[20000]);client.expire();
 assert.equal(JSON.stringify(await settleBillingRead(pending)),JSON.stringify({state:'unavailable'}));assert.equal(client.timers.size,0);
});
