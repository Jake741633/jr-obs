import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {createBillingWebhookHandler} from '../lib/server/billingWebhook.mjs';
const secret='whsec_fixtureOnlyNotARealSecret';
const env=()=>({JR_OS_BILLING_WEBHOOK_ENABLED:'true',STRIPE_MODE:'test',STRIPE_ACCOUNT_ID:'acct_1UWyMhRxGUITlJWL',STRIPE_RESTRICTED_KEY:'rk_test_fixtureOnlyNotARealKey',STRIPE_WEBHOOK_SECRET:secret,STRIPE_PRICE_MONTHLY:'price_1UX0fdRxGUITlJWLXoEGdcBE',STRIPE_PRICE_ANNUAL:'price_1UX0fpRxGUITlJWLs2gwl34S',STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture',APP_ORIGIN:'https://jr-os.example',NEXT_PUBLIC_SUPABASE_URL:'https://billing-fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-service-credential'});
const event=()=>({id:'evt_fixture',object:'event',type:'invoice.paid',livemode:false,data:{object:{id:'in_fixture'}}});
const sdk=new Stripe('rk_test_fixtureOnlyNotARealKey');
function request(payload=JSON.stringify(event()),signed=payload){return new Request('https://jr-os.example/api/billing/webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':sdk.webhooks.generateTestHeaderString({payload:signed,secret})},body:payload});}
test('valid webhook is acknowledged only after durable receipt through server-only RPC',async()=>{
 const writes=[];const handler=createBillingWebhookHandler({env:env(),fetchImpl:async(url,options)=>{writes.push({url,options});return Response.json({received:true,duplicate:false});}});
 const res=await handler(request());assert.equal(res.status,200);assert.deepEqual(await res.json(),{received:true,duplicate:false});assert.match(res.headers.get('cache-control'),/no-store/);
 assert.equal(writes.length,1);assert.equal(writes[0].url,'https://billing-fixture.supabase.co/rest/v1/rpc/jr_billing_receive_event');assert.deepEqual(JSON.parse(writes[0].options.body),{p_account_id:'acct_1UWyMhRxGUITlJWL',p_event:event()});
});
test('duplicate delivery receives a successful durable acknowledgement',async()=>{
 const handler=createBillingWebhookHandler({env:env(),fetchImpl:async()=>Response.json({received:true,duplicate:true})});
 assert.deepEqual(await (await handler(request())).json(),{received:true,duplicate:true});
});
test('forged, tampered, connected-account and live events cannot reach persistence',async()=>{
 let calls=0;const handler=createBillingWebhookHandler({env:env(),fetchImpl:async()=>{calls++;return Response.json({received:true,duplicate:false});}});
 const raw=JSON.stringify(event());const payloads=[request(raw+' ',raw),request('{}',raw),request(JSON.stringify({...event(),livemode:true})),request(JSON.stringify({...event(),account:'acct_other'}))];
 for(const req of payloads){const res=await handler(req);assert.equal(res.status,400);assert.deepEqual(await res.json(),{code:'billing_invalid_webhook'});}
 assert.equal(calls,0);
});
test('oversized webhook bodies are rejected before persistence',async()=>{
 let calls=0;const handler=createBillingWebhookHandler({env:env(),fetchImpl:async()=>{calls++;}});
 const res=await handler(request('x'.repeat(1000001)));assert.equal(res.status,413);assert.equal(calls,0);
});
test('unconfigured or disabled endpoint does not contact providers or reveal credentials',async()=>{
 let calls=0;
 for(const patch of [{JR_OS_BILLING_WEBHOOK_ENABLED:'false'},{SUPABASE_SERVICE_ROLE_KEY:''},{NEXT_PUBLIC_SUPABASE_URL:'http://evil.example'},{NEXT_PUBLIC_SUPABASE_URL:'https://user:password@billing-fixture.supabase.co'},{STRIPE_WEBHOOK_SECRET:''}]){
  const res=await createBillingWebhookHandler({env:{...env(),...patch},fetchImpl:async()=>{calls++;}})(request());
  assert.equal(res.status,503);assert.deepEqual(await res.json(),{code:'billing_webhook_unavailable'});
 }
 assert.equal(calls,0);
});
test('persistence failures stay retryable and return no false success or sensitive error',async()=>{
 for(const fetchImpl of [async()=>new Response(null,{status:204}),async()=>new Response('x'.repeat(1001)),async()=>{throw new Error('private-key-and-provider-message');},async()=>new Response('database details',{status:500}),async()=>Response.json({received:false}),async()=>Response.json([{received:true,duplicate:false}])]){
  const res=await createBillingWebhookHandler({env:env(),fetchImpl})(request());assert.equal(res.status,503);assert.deepEqual(await res.json(),{code:'billing_webhook_unavailable'});
 }
});
test('valid unsupported events are ignored rather than queued without a handler',async()=>{
 let calls=0;const handler=createBillingWebhookHandler({env:env(),fetchImpl:async()=>{calls++;}});
 const res=await handler(request(JSON.stringify({...event(),type:'product.created'})));assert.equal(res.status,200);assert.deepEqual(await res.json(),{received:true,ignored:true});assert.equal(calls,0);
});
