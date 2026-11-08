import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnerBillingActions} from '../lib/billingActionsClient.mjs';
const owner={userId:'22222222-2222-4222-8222-222222222222',organisationId:'11111111-1111-4111-8111-111111111111',role:'owner',accessToken:'fixture-user'};
const checkout={mode:'test',sessionId:'cs_test_A',url:'https://checkout.stripe.com/c/pay/A'},portal={mode:'test',sessionId:'bps_A',url:'https://billing.stripe.com/p/session/A'};
test('phone actions send only an approved plan selector or empty portal body and navigate to Stripe',async()=>{
 for(const [action,wantUrl,wantBody,response] of [['monthly','/api/billing/checkout','{"plan":"monthly"}',checkout],['annual','/api/billing/checkout','{"plan":"annual"}',checkout],['portal','/api/billing/portal','{}',portal]]){
  const calls=[],links=[],client=createOwnerBillingActions({owner,isCurrent:()=>true,navigate:url=>links.push(url),fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json(response);}});
  assert.deepEqual(await client.run(action),{state:'redirecting'});assert.equal(calls[0].url,wantUrl);assert.equal(calls[0].options.body,wantBody);assert.equal(calls[0].options.headers['x-jr-organisation'],owner.organisationId);assert.equal(calls[0].options.headers.Authorization,'Bearer fixture-user');assert.equal(calls[0].options.cache,'no-store');assert.deepEqual(links,[response.url]);
 }
});
test('a second tap is ignored while one billing request is in flight',async()=>{
 let finish,calls=0;const links=[],client=createOwnerBillingActions({owner,isCurrent:()=>true,navigate:url=>links.push(url),fetchImpl:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
 const first=client.run('monthly');assert.deepEqual(await client.run('annual'),{state:'busy'});assert.equal(calls,1);finish(Response.json(checkout));assert.deepEqual(await first,{state:'redirecting'});assert.equal(links.length,1);
});
test('account switches and cancellation discard a response even if the network ignores abort',async()=>{
 for(const kind of ['switch','cancel']){
  let current=true,finish;const links=[],client=createOwnerBillingActions({owner,isCurrent:()=>current,navigate:url=>links.push(url),fetchImpl:()=>new Promise(resolve=>{finish=resolve;})});
  const pending=client.run('portal');if(kind==='switch')current=false;else client.cancel();finish(Response.json(portal));assert.equal(await pending,null);assert.deepEqual(links,[]);
 }
 let calls=0;const bad=createOwnerBillingActions({owner:{...owner,role:'admin'},isCurrent:()=>true,navigate(){throw Error('must not navigate');},fetchImpl:()=>{calls++;}});assert.equal(await bad.run('monthly'),null);assert.equal(calls,0);
});
test('a switched identity while response JSON is resolving also prevents navigation',async()=>{
 let current=true,finishBody;const links=[],client=createOwnerBillingActions({owner,isCurrent:()=>current,navigate:url=>links.push(url),fetchImpl:async()=>({ok:true,json:()=>new Promise(resolve=>{finishBody=resolve;})})});
 const pending=client.run('monthly');await Promise.resolve();current=false;finishBody(checkout);assert.equal(await pending,null);assert.deepEqual(links,[]);
});
test('unsafe hosts, credentials, wrong mode or the wrong kind of Session are never followed',async()=>{
 for(const value of [{...checkout,url:'https://checkout.stripe.com.evil.example/pay'},{...checkout,url:'http://checkout.stripe.com/pay'},{...checkout,url:'https://user:pass@checkout.stripe.com/pay'},{...checkout,url:'https://billing.stripe.com/p/session/A'},{...checkout,mode:'live'},{...checkout,sessionId:'cs_live_A'}]){
  const links=[],client=createOwnerBillingActions({owner,isCurrent:()=>true,navigate:url=>links.push(url),fetchImpl:async()=>Response.json(value)});assert.deepEqual(await client.run('monthly'),{state:'unavailable'});assert.deepEqual(links,[]);
 }
});
test('server denials and conflicts become fixed states without copying private messages',async()=>{
 for(const [status,code,want] of [[403,'private','denied'],[409,'billing_checkout_busy','busy'],[409,'billing_checkout_conflict','conflict'],[409,'billing_already_subscribed','already_subscribed'],[409,'billing_checkout_review','review'],[409,'billing_portal_not_started','not_started'],[503,'rk_test_private_details','unavailable']]){
  const client=createOwnerBillingActions({owner,isCurrent:()=>true,navigate(){throw Error('must not navigate');},fetchImpl:async()=>Response.json({code,message:'sensitive'}, {status})});assert.deepEqual(await client.run('monthly'),{state:want});
 }
});
