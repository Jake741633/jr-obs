import test from 'node:test';
import assert from 'node:assert/strict';
import {createBillingStatusHandler} from '../lib/server/billingStatus.mjs';
const org='11111111-1111-4111-8111-111111111111',uid='22222222-2222-4222-8222-222222222222';
const env={NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-public'};
const status=()=>({actorUserId:uid,organisationId:org,role:'owner',mode:'test',subscription:null});
const request=({origin='https://jr-os.example',authorization='Bearer token',body='{}',organisation=org}={})=>new Request('https://jr-os.example/api/billing/status',{method:'POST',headers:{Origin:origin,Authorization:authorization,'Content-Type':'application/json','x-jr-organisation':organisation},body});
function setup({user={id:uid},result=status(),rpcStatus=200,environment=env}={}){const calls=[];const handler=createBillingStatusHandler({env:environment,fetchImpl:async(url,init)=>{calls.push({url,init});return url.endsWith('/auth/v1/user')?Response.json(user):Response.json(result,{status:rpcStatus});}});return {handler,calls};}
test('status authenticates the normal user and calls the owner-scoped RPC with that user token',async()=>{
 const h=setup(),res=await h.handler(request());assert.equal(res.status,200);assert.deepEqual(await res.json(),{mode:'test',subscription:null,checkoutAvailable:false,portalAvailable:false});assert.equal(h.calls.length,2);assert.equal(h.calls[1].url,'https://fixture.supabase.co/rest/v1/rpc/jr_billing_owner_status');assert.equal(h.calls[1].init.headers.Authorization,'Bearer token');assert.match(res.headers.get('Cache-Control'),/no-store/);
});

const ready=()=>({...env,JR_OS_BILLING_CHECKOUT_ENABLED:'true',JR_OS_BILLING_SCHEDULE_ENABLED:'true',JR_OS_BILLING_PORTAL_ENABLED:'true',JR_OS_BILLING_WEBHOOK_ENABLED:'true',JR_OS_BILLING_RECONCILIATION_ENABLED:'true',JR_OS_BILLING_SANDBOX_VERIFIED:'true',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',STRIPE_MODE:'test',STRIPE_ACCOUNT_ID:'acct_1UWyMhRxGUITlJWL',STRIPE_RESTRICTED_KEY:'rk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_PRICE_MONTHLY:'price_1UX0fdRxGUITlJWLXoEGdcBE',STRIPE_PRICE_ANNUAL:'price_1UX0fpRxGUITlJWLs2gwl34S',STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture',APP_ORIGIN:'https://jr-os.example'});
test('phone capabilities require complete private server readiness and an own-business binding',async()=>{
 const active={plan:'monthly',status:'active',paidThroughMs:Date.UTC(2030,0,1),trialEndsAtMs:null,cancelAtPeriodEnd:false,reconciledAtMs:1790000000000};
 for(const [result,wantCheckout,wantPortal] of [[{...status(),hasBillingCustomer:false},true,false],[{...status(),hasBillingCustomer:true},true,true],[{...status(),hasBillingCustomer:true,subscription:active},false,true],[{...status(),hasBillingCustomer:true,subscription:{...active,status:'canceled'}},true,true],[{...status(),hasBillingCustomer:true,subscription:{...active,status:'past_due'}},false,true]]){
  const res=await setup({environment:ready(),result}).handler(request()),data=await res.json();assert.equal(data.checkoutAvailable,wantCheckout);assert.equal(data.portalAvailable,wantPortal);assert.equal('hasBillingCustomer' in data,false);
 }
 for(const patch of [{JR_OS_BILLING_SANDBOX_VERIFIED:'false'},{JR_OS_BILLING_WEBHOOK_ENABLED:'false'},{JR_OS_BILLING_RECONCILIATION_ENABLED:'false'},{SUPABASE_SERVICE_ROLE_KEY:''},{STRIPE_MODE:'live'},{STRIPE_PRICE_MONTHLY:'price_other'}]){
  const res=await setup({environment:{...ready(),...patch},result:{...status(),hasBillingCustomer:true}}).handler(request()),data=await res.json();assert.equal(data.checkoutAvailable,false);assert.equal(data.portalAvailable,false);
 }
 const data=await(await setup({environment:{...ready(),JR_OS_BILLING_CHECKOUT_ENABLED:'false'},result:{...status(),hasBillingCustomer:true}}).handler(request())).json();assert.equal(data.checkoutAvailable,false);assert.equal(data.portalAvailable,true);
});
test('wrong origin, missing token, nonempty body or invalid organisation fail before network',async()=>{
 for(const opts of [{origin:'https://evil.example'},{authorization:''},{body:'{"customerId":"cus_wrong"}'},{body:'x'.repeat(1100)},{organisation:'not-a-business'}]){const h=setup(),r=await h.handler(request(opts));assert.ok([400,401,403,413].includes(r.status));assert.equal(h.calls.length,0);}
});
test('anonymous, wrong-owner, wrong-business and non-owner responses never expose billing data',async()=>{
 for(const opts of [{user:{id:uid,is_anonymous:true}},{result:{...status(),actorUserId:'other'}},{result:{...status(),organisationId:'other'}},{result:{...status(),role:'admin'}},{rpcStatus:403,result:{message:'private SQL details'}}]){const h=setup(opts),res=await h.handler(request());assert.equal(res.status,403);assert.deepEqual(await res.json(),{code:'billing_access_denied'});}
});
test('sanitized subscription status includes dates but excludes provider IDs and arbitrary fields',async()=>{
 const sub={plan:'monthly',status:'active',paidThroughMs:1792678400000,trialEndsAtMs:null,cancelAtPeriodEnd:true,reconciledAtMs:1790000000000,customerId:'cus_private',invoiceId:'in_private'};
 const h=setup({result:{...status(),subscription:sub}}),r=await h.handler(request());const data=await r.json();assert.equal(data.subscription.cancelAtPeriodEnd,true);assert.equal(data.subscription.paidThroughMs,1792678400000);assert.equal('customerId'in data.subscription,false);assert.equal('invoiceId'in data.subscription,false);
});
test('missing migration, malformed status or auth outages return a safe setup error',async()=>{
 for(const opts of [{rpcStatus:404,result:{message:'secret database text'}},{result:{...status(),mode:'live'}},{result:{...status(),subscription:{status:'active',paidThroughMs:Infinity}}}]){const h=setup(opts),r=await h.handler(request());assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'billing_status_unavailable'});}
 const r=await createBillingStatusHandler({env,fetchImpl:async()=>{throw Error('sensitive');}})(request());assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'billing_status_unavailable'});
});

test('pausing the scheduler blocks signup capability while preserving owner portal capability',async()=>{
 const res=await setup({environment:{...ready(),JR_OS_BILLING_SCHEDULE_ENABLED:'false'},result:{...status(),hasBillingCustomer:true}}).handler(request()),data=await res.json();assert.equal(data.checkoutAvailable,false);assert.equal(data.portalAvailable,true);
});
