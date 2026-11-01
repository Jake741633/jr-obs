import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import Stripe from 'stripe';
import { readStripeBillingConfig, createStripeBillingGateway } from '../lib/server/stripeBilling.mjs';

// Breaks caught: accepting live/wrong-business setup, silently changing prices,
// leaking secrets, unsafe redirects, forged webhooks and non-idempotent retries.
const monthly='price_1UX0fdRxGUITlJWLXoEGdcBE';
const annual='price_1UX0fpRxGUITlJWLs2gwl34S';
const environment=()=>({STRIPE_MODE:'test',STRIPE_ACCOUNT_ID:'acct_1UWyMhRxGUITlJWL',STRIPE_RESTRICTED_KEY:'rk_test_fixtureOnlyNotARealKey',STRIPE_WEBHOOK_SECRET:'whsec_fixtureOnlyNotARealSecret',STRIPE_PRICE_MONTHLY:monthly,STRIPE_PRICE_ANNUAL:annual,STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture',APP_ORIGIN:'https://jr-os.example'});
const operation=()=>({organisationId:'business-a',customerId:'cus_businessA',operationId:'11111111-1111-4111-8111-111111111111',plan:'monthly'});
const catalog=id=>({id,object:'price',livemode:false,active:true,currency:'gbp',unit_amount:id===monthly?2900:29000,product:'jr_os_business',type:'recurring',billing_scheme:'per_unit',recurring:{interval:id===monthly?'month':'year',interval_count:1,usage_type:'licensed'},tax_behavior:'unspecified'});
const portalConfiguration=()=>({id:'bpc_fixture',object:'billing_portal.configuration',active:true,is_default:false,application:null,livemode:false,login_page:{enabled:false,url:null},features:{invoice_history:{enabled:true},payment_method_update:{enabled:true,payment_method_configuration:null},subscription_cancel:{enabled:true,mode:'at_period_end',proration_behavior:'none',cancellation_reason:{enabled:false,options:[]}},subscription_update:{enabled:false,default_allowed_updates:[],products:[],proration_behavior:'none'},subscription_pause:{enabled:false,duration:{}}}});
async function fixture(t, overrides={}) {
  const requests=[];
  const server=http.createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const path=new URL(req.url,'http://localhost').pathname;
    const record={path,method:req.method,headers:req.headers,body:new URLSearchParams(raw)};requests.push(record);
    let payload;
    if(path==='/v1/customers'&&req.method==='POST')payload={id:'cus_created',object:'customer',livemode:false};
    else if(path==='/v1/subscriptions')payload={object:'list',data:[],has_more:false};
    else if(path==='/v1/checkout/sessions/cs_test_session')payload={id:'cs_test_session',livemode:false,customer:'cus_businessA',mode:'subscription',status:'open',subscription:null,client_reference_id:'11111111-1111-4111-8111-111111111111',expires_at:1900000000,url:'https://checkout.stripe.com/c/pay/cs_test_session'};
    else if(path==='/v1/account')payload={id:'acct_1UWyMhRxGUITlJWL',object:'account'};
    else if(path.startsWith('/v1/prices/'))payload=catalog(path.split('/').at(-1));
    else if(path==='/v1/customers/cus_businessA')payload={id:'cus_businessA',object:'customer',livemode:false};
    else if(path==='/v1/checkout/sessions')payload={id:'cs_test_session',object:'checkout.session',livemode:false,url:'https://checkout.stripe.com/c/pay/cs_test_session',customer:'cus_businessA',mode:'subscription'};
    else if(path==='/v1/billing_portal/configurations/bpc_fixture')payload=portalConfiguration();
    else if(path==='/v1/billing_portal/sessions')payload={id:'bps_fixture',object:'billing_portal.session',created:1793553600,configuration:portalConfiguration(),livemode:false,url:'https://billing.stripe.com/p/session/fixture',customer:'cus_businessA',customer_account:null,on_behalf_of:null,flow:null,locale:null,return_url:'https://jr-os.example/settings/billing'};
    else {res.writeHead(404);res.end('{}');return;}
    if(overrides[path])payload=overrides[path](payload,record);
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(payload));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const config=readStripeBillingConfig(environment());
  const stripe=new Stripe(config.restrictedKey,{host:'127.0.0.1',port:server.address().port,protocol:'http',maxNetworkRetries:0,apiVersion:'2026-10-28.endive'});
  return {config,stripe,requests,gateway:createStripeBillingGateway({config,stripe})};
}

test('billing configuration is server-only, exact sandbox configuration and never reveals secrets',()=>{
  const cfg=readStripeBillingConfig(environment());
  assert.equal(cfg.mode,'test');assert.equal(cfg.appOrigin,'https://jr-os.example');
  const changes=[{STRIPE_MODE:'live'},{STRIPE_ACCOUNT_ID:'acct_other'},{STRIPE_RESTRICTED_KEY:'sk_live_sensitive'},{STRIPE_RESTRICTED_KEY:'rk_live_sensitive'},{STRIPE_RESTRICTED_KEY:['rk_test_fixtureOnlyNotARealKey']},{STRIPE_RESTRICTED_KEY:''},{STRIPE_WEBHOOK_SECRET:''},{STRIPE_PRICE_MONTHLY:annual},{STRIPE_PRICE_ANNUAL:'price_other'},{APP_ORIGIN:'http://jr-os.example'},{APP_ORIGIN:'https://jr-os.example/path'},{APP_ORIGIN:'https://user:password@jr-os.example'},{APP_ORIGIN:'https://jr-os.example/?next=evil'},{STRIPE_PORTAL_CONFIGURATION_ID:''}];
  for(const change of changes)assert.throws(()=>readStripeBillingConfig({...environment(),...change}),e=>e.message==='billing_not_configured');
  assert.throws(()=>readStripeBillingConfig({}),/billing_not_configured/);
});

test('monthly Checkout uses approved price, quantity one, fixed return URL and stable durable-operation idempotency',async t=>{
  const {gateway,requests}=await fixture(t);
  const result=await gateway.createCheckout(operation());
  assert.deepEqual(result,{sessionId:'cs_test_session',url:'https://checkout.stripe.com/c/pay/cs_test_session'});
  await gateway.createCheckout(operation());
  const posts=requests.filter(r=>r.path==='/v1/checkout/sessions');
  assert.equal(posts.length,2);assert.ok(posts[0].headers['idempotency-key']);assert.equal(posts[0].headers['idempotency-key'],posts[1].headers['idempotency-key']);
  const b=posts[0].body;
  assert.equal(b.get('mode'),'subscription');assert.equal(b.get('customer'),'cus_businessA');assert.equal(b.get('line_items[0][price]'),monthly);assert.equal(b.get('line_items[0][quantity]'),'1');
  assert.equal(b.get('subscription_data[billing_mode][type]'),'flexible');assert.match(b.get('integration_identifier'),/^jr_os_subscription_[a-z]{8}$/);
  assert.equal(b.get('success_url'),'https://jr-os.example/settings/billing?checkout=pending');assert.equal(b.get('cancel_url'),'https://jr-os.example/settings/billing');
  assert.equal([...b.keys()].some(k=>/payment_method_types|automatic_tax|metadata|trial|discount/.test(k)),false);
});

test('annual Checkout uses annual amount and never applies founding monthly discount',async t=>{
  const {gateway,requests}=await fixture(t);await gateway.createCheckout({...operation(),plan:'annual'});
  assert.equal(requests.find(r=>r.path==='/v1/checkout/sessions').body.get('line_items[0][price]'),annual);
});

test('invalid or client-extended operations fail before any Stripe request',async t=>{
  const {gateway,requests}=await fixture(t);
  for(const change of [{plan:'founders'},{plan:'price_arbitrary'},{priceId:annual},{success_url:'https://evil.example'},{discount:true},{organisationId:''},{customerId:'cus_a?evil'},{operationId:'random-click'},{quantity:2},{customerId:['cus_businessA']},{operationId:['11111111-1111-4111-8111-111111111111']}]) {
    await assert.rejects(gateway.createCheckout({...operation(),...change}),/billing_invalid_operation/);
  }
  assert.equal(requests.length,0);
});

test('provider account mismatch prevents Checkout and portal writes',async t=>{
  const {gateway,requests}=await fixture(t,{'/v1/account':p=>({...p,id:'acct_wrong'})});
  await assert.rejects(gateway.createCheckout(operation()),/billing_provider_unavailable/);
  const {organisationId,customerId,operationId}=operation();
  await assert.rejects(gateway.createPortal({organisationId,customerId,operationId}),/billing_provider_unavailable/);
  assert.equal(requests.some(r=>r.method==='POST'),false);
});

test('inactive, live, different-product or changed-price catalog cannot create Checkout',async t=>{
  for(const change of [{transform_quantity:{divide_by:10,round:'up'}},{active:false},{livemode:true},{product:'prod_wrong'},{currency:'usd'},{unit_amount:2901},{recurring:{interval:'year',interval_count:1,usage_type:'licensed'}},{recurring:{interval:'month',interval_count:2,usage_type:'licensed'}},{recurring:{interval:'month',interval_count:1,usage_type:'metered'}}]) {
    const {gateway,requests}=await fixture(t,{['/v1/prices/'+monthly]:p=>({...p,...change})});
    await assert.rejects(gateway.createCheckout(operation()),/billing_provider_unavailable/);
    assert.equal(requests.some(r=>r.method==='POST'),false);
  }
});

test('deleted or live customer binding cannot start Checkout',async t=>{
  for(const change of [{deleted:true},{livemode:true},{id:'cus_other'}]) {
    const {gateway,requests}=await fixture(t,{'/v1/customers/cus_businessA':p=>({...p,...change})});
    await assert.rejects(gateway.createCheckout(operation()),/billing_provider_unavailable/);assert.equal(requests.some(r=>r.method==='POST'),false);
  }
});

test('portal uses the trusted customer, approved configuration and fixed return URL',async t=>{
  const {gateway,requests}=await fixture(t);const {organisationId,customerId,operationId}=operation();
  assert.equal((await gateway.createPortal({organisationId,customerId,operationId})).url,'https://billing.stripe.com/p/session/fixture');
  const b=requests.find(r=>r.path==='/v1/billing_portal/sessions').body;
  assert.equal(b.get('customer'),'cus_businessA');assert.equal(b.get('configuration'),'bpc_fixture');assert.equal(b.get('return_url'),'https://jr-os.example/settings/billing');
  assert.equal(b.get('expand[0]'),'configuration');
});

test('portal refuses drifted configuration before creating a bearer link',async t=>{
  const bad=[{active:false},{livemode:true},{id:'bpc_other'},{application:'ca_other'},{login_page:{enabled:true,url:'https://billing.stripe.com/p/login/other'}},
    ...[['invoice_history','enabled',false],['payment_method_update','enabled',false],['subscription_cancel','enabled',false],['subscription_cancel','mode','immediately'],['subscription_cancel','proration_behavior','create_prorations'],['subscription_update','enabled',true],['subscription_pause','enabled',true]].map(([feature,key,value])=>({features:{...portalConfiguration().features,[feature]:{...portalConfiguration().features[feature],[key]:value}}}))];
  for(const change of bad){
    const {gateway,requests}=await fixture(t,{'/v1/billing_portal/configurations/bpc_fixture':p=>({...p,...change})});
    await assert.rejects(gateway.createPortal({organisationId:'business-a',customerId:'cus_businessA',operationId:'11111111-1111-4111-8111-111111111111'}),/billing_provider_unavailable/);
    assert.equal(requests.some(r=>r.method==='POST'),false);
  }
});

test('portal checks the returned configuration, business and fixed return destination',async t=>{
  for(const change of [{configuration:'bpc_other'},{customer:'cus_other'},{livemode:true},{return_url:'https://evil.example'},{on_behalf_of:'acct_other'},{customer_account:'acct_other'},{flow:{type:'subscription_update'}},{url:'https://billing.stripe.com.evil.example/p/session/x'}]){
    const {gateway}=await fixture(t,{'/v1/billing_portal/sessions':p=>({...p,...change})});
    await assert.rejects(gateway.createPortal({organisationId:'business-a',customerId:'cus_businessA',operationId:'11111111-1111-4111-8111-111111111111'}),/billing_provider_unavailable/);
  }
});

test('a portal configuration changed during creation cannot release its Session URL',async t=>{
  for(const [feature,key,value] of [['subscription_cancel','mode','immediately'],['subscription_update','enabled',true],['subscription_pause','enabled',true]]){
    const {gateway,requests}=await fixture(t,{'/v1/billing_portal/sessions':p=>({...p,configuration:{...p.configuration,features:{...p.configuration.features,[feature]:{...p.configuration.features[feature],[key]:value}}}})});
    await assert.rejects(gateway.createPortal({organisationId:'business-a',customerId:'cus_businessA',operationId:'11111111-1111-4111-8111-111111111111'}),/billing_provider_unavailable/);
    assert.equal(requests.some(r=>r.path==='/v1/billing_portal/configurations/bpc_fixture'),true);
  }
});
test('portal needs a dedicated configuration and an expanded configuration on creation',async t=>{
  for(const overrides of [{'/v1/billing_portal/configurations/bpc_fixture':p=>({...p,is_default:true})},{'/v1/billing_portal/sessions':p=>({...p,configuration:'bpc_fixture'})}]){
    const {gateway}=await fixture(t,overrides);
    await assert.rejects(gateway.createPortal({organisationId:'business-a',customerId:'cus_businessA',operationId:'11111111-1111-4111-8111-111111111111'}),/billing_provider_unavailable/);
  }
});

test('unexpected provider redirect URLs and returned customer/mode are rejected',async t=>{
  for(const change of [{url:'https://checkout.stripe.com.evil.example/pay'},{url:'https://evil.example'},{url:'http://checkout.stripe.com/pay'},{url:'https://user:pass@checkout.stripe.com/pay'},{customer:'cus_other'},{livemode:true},{mode:'payment'}]) {
    const {gateway}=await fixture(t,{'/v1/checkout/sessions':p=>({...p,...change})});
    await assert.rejects(gateway.createCheckout(operation()),/billing_provider_unavailable/);
  }
});

test('webhook verification accepts raw signed sandbox events but rejects tampering, replay-age and live events',async t=>{
  const {gateway,stripe,config,requests}=await fixture(t);
  const event={id:'evt_fixture',object:'event',type:'invoice.paid',livemode:false,data:{object:{id:'in_fixture'}}};
  const raw=JSON.stringify(event);const sign=payload=>stripe.webhooks.generateTestHeaderString({payload,secret:config.webhookSecret});
  assert.deepEqual(gateway.verifyWebhook(raw,sign(raw)),event);
  for(const [payload,signature] of [[raw+' ',sign(raw)],[raw,'t=1,v1=bad'],[raw,stripe.webhooks.generateTestHeaderString({payload:raw,secret:config.webhookSecret,timestamp:1})],[JSON.stringify({...event,livemode:true}),sign(JSON.stringify({...event,livemode:true}))],[raw.repeat(100000),sign(raw)]])assert.throws(()=>gateway.verifyWebhook(payload,signature),/billing_invalid_webhook/);
  assert.equal(requests.length,0);
});


test('retrying a persisted operation with a changed plan retains the same provider idempotency key',async t=>{
  const {gateway,requests}=await fixture(t);
  await gateway.createCheckout(operation());
  await gateway.createCheckout({...operation(),plan:'annual'});
  const posts=requests.filter(r=>r.path==='/v1/checkout/sessions');
  // Stripe must reject changed parameters under one key, not create a second checkout.
  assert.equal(posts[0].headers['idempotency-key'],posts[1].headers['idempotency-key']);
});

test('signed connected-account or context webhook deliveries cannot enter single-business billing',async t=>{
  const {gateway,stripe,config}=await fixture(t);
  for(const scope of [{account:'acct_other'},{account:config.accountId},{context:'acct_other'}]) {
    const payload=JSON.stringify({id:'evt_crossAccount',object:'event',type:'invoice.paid',livemode:false,data:{object:{id:'in_other'}},...scope});
    const signature=stripe.webhooks.generateTestHeaderString({payload,secret:config.webhookSecret});
    assert.throws(()=>gateway.verifyWebhook(payload,signature),/billing_invalid_webhook/);
  }
});


test('customer creation retries use a stable operation key and no browser metadata',async t=>{
 const {gateway,requests}=await fixture(t);const op={organisationId:'22222222-2222-4222-8222-222222222222',operationId:'11111111-1111-4111-8111-111111111111'};
 assert.deepEqual(await gateway.createBillingCustomer(op),{customerId:'cus_created'});await gateway.createBillingCustomer(op);
 const posts=requests.filter(r=>r.path==='/v1/customers');assert.equal(posts.length,2);assert.equal(posts[0].headers['idempotency-key'],posts[1].headers['idempotency-key']);assert.equal([...posts[0].body.keys()].length,0);
});
test('provider subscriptions prevent a second Checkout before a snapshot is reconciled',async t=>{
 const {gateway,requests}=await fixture(t,{'/v1/subscriptions':()=>({data:[{id:'sub_A',customer:'cus_businessA',livemode:false,status:'active'}],has_more:false})});
 await assert.rejects(gateway.createCheckout(operation()),/billing_already_subscribed/);assert.equal(requests.some(r=>r.method==='POST'),false);
});
test('Checkout pins operation reference and expiry and recovery checks the same customer/reference',async t=>{
 const {gateway,requests}=await fixture(t);const op={...operation(),expiresAt:1900000000};await gateway.createCheckout(op);
 const body=requests.find(r=>r.path==='/v1/checkout/sessions').body;assert.equal(body.get('expires_at'),'1900000000');assert.equal(body.get('client_reference_id'),'11111111-1111-4111-8111-111111111111');
 const current=await gateway.readCheckoutSession({...op,sessionId:'cs_test_session'});assert.equal(current.status,'open');assert.equal(current.expiresAt,1900000000);
 const other=await fixture(t,{'/v1/checkout/sessions/cs_test_session':s=>({...s,client_reference_id:'other'})});await assert.rejects(other.gateway.readCheckoutSession({...op,sessionId:'cs_test_session'}),/billing_provider_unavailable/);
});
