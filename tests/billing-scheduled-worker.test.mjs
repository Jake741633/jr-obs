import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {runBillingScheduledBatch} from '../lib/server/billingScheduled.mjs';
import {evidence} from './helpers/billingEvidence.mjs';
import {loadLocalTs} from './helpers/load-local-ts.mjs';
const db=new PGlite(),org='11111111-1111-4111-8111-111111111111',other='33333333-3333-4333-8333-333333333333';
const environment=()=>({JR_OS_BILLING_SCHEDULE_ENABLED:'true',JR_OS_BILLING_RECONCILIATION_ENABLED:'true',JR_OS_BILLING_WEBHOOK_ENABLED:'true',JR_OS_BILLING_SANDBOX_VERIFIED:'true',NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',STRIPE_MODE:'test',STRIPE_ACCOUNT_ID:'acct_1UWyMhRxGUITlJWL',STRIPE_RESTRICTED_KEY:'rk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_PRICE_MONTHLY:'price_1UX0fdRxGUITlJWLXoEGdcBE',STRIPE_PRICE_ANNUAL:'price_1UX0fpRxGUITlJWLs2gwl34S',STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture',APP_ORIGIN:'https://jr-os.example'});
const production={context:'production',published:true};
const fields={jr_billing_claim_event:[],jr_billing_begin_reconciliation:['p_event_id','p_lease_token','p_customer_id'],jr_billing_complete_reconciliation:['p_event_id','p_lease_token','p_reconcile_token','p_snapshot','p_outcome'],jr_billing_finish_event:['p_event_id','p_lease_token','p_outcome']};
const rpc=async(name,args=[])=>{const result=await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args);return result.rows[0].value;};
const enqueue=(id,type='invoice.paid')=>rpc('jr_billing_receive_event',['acct_1UWyMhRxGUITlJWL',{id,object:'event',type,livemode:false,data:{object:{id:'in_A',metadata:{organisationId:other}}}}]);
function setup({env=environment(),deployment=production,beforeRpc,afterRpc,readEvidence,resolveTarget,now=()=>0}={}){
 const requests=[],providerCalls=[],gatewayOptions=[];
 const fetchImpl=async(url,options)=>{
  requests.push({url,options});assert.equal(options.headers.apikey,'fixture-service');assert.equal(options.headers.Authorization,'Bearer fixture-service');
  const name=new URL(url).pathname.split('/').at(-1),args=JSON.parse(options.body);assert.ok(fields[name],'Only allowlisted service RPCs');
  const overridden=await beforeRpc?.(name,args);if(overridden)return overridden;
  try{const value=await rpc(name,fields[name].map(key=>args[key]));await afterRpc?.(name,value);return Response.json(value);}catch{return new Response('private SQL diagnostic',{status:500});}
 };
 const createGateway=options=>{gatewayOptions.push(options);return {async resolveBillingRisk(){throw Error('billing_evidence_review');},async resolveSubscriptionTarget(event){providerCalls.push('resolve');return resolveTarget?resolveTarget(event,options):{customerId:'cus_A',subscriptionId:'sub_A'};},async readSubscriptionEvidence(target){providerCalls.push('read');return readEvidence?readEvidence(target,options):evidence();}};};
 return {requests,providerCalls,gatewayOptions,fetchImpl,createGateway,run:()=>runBillingScheduledBatch({env,deployment,fetchImpl,createGateway,now})};
}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table public.organisations(id uuid primary key);insert into public.organisations values('${org}'),('${other}');`);
 await db.exec(await readFile('supabase/migrations/20261101154212_subscription_billing_store.sql','utf8'));await db.exec('set role service_role');
});
beforeEach(async()=>{await db.exec('delete from public.jr_billing_subscriptions;delete from public.jr_billing_operations;delete from public.jr_billing_events;delete from public.jr_billing_customers');await db.query("insert into public.jr_billing_customers(organisation_id,customer_id) values($1,'cus_A'),($2,'cus_Other')",[org,other]);});after(()=>db.close());
test('disabled, preview, unpublished and incomplete setup never touch the inbox or provider',async()=>{
 for(const key of ['JR_OS_BILLING_SCHEDULE_ENABLED','JR_OS_BILLING_RECONCILIATION_ENABLED','JR_OS_BILLING_WEBHOOK_ENABLED','JR_OS_BILLING_SANDBOX_VERIFIED']){
  const h=setup({env:{...environment(),[key]:'false'}});assert.deepEqual(await h.run(),{state:'disabled'});assert.equal(h.requests.length,0);assert.equal(h.gatewayOptions.length,0);
 }
 for(const deployment of [{context:'deploy-preview',published:false},{context:'production',published:false},{context:'branch-deploy',published:true},{}]){
  const h=setup({deployment});assert.deepEqual(await h.run(),{state:'disabled'});assert.equal(h.requests.length,0);assert.equal(h.gatewayOptions.length,0);
 }
 const bad=setup({env:{...environment(),STRIPE_MODE:'live'}});assert.equal((await bad.run()).state,'unavailable');assert.equal(bad.requests.length,0);assert.equal(bad.gatewayOptions.length,0);
});
test('one scheduled run processes at most five actual queue records and leaves the rest untouched',async()=>{
 for(let i=0;i<7;i++)await enqueue('evt_batch'+i);
 const h=setup(),result=await h.run();assert.equal(result.state,'finished');assert.equal(result.stop,'limit');assert.equal(result.handled,5);assert.equal(result.counts.processed,5);
 const rows=(await db.query('select state,attempts from public.jr_billing_events order by received_at,event_id')).rows;
 assert.deepEqual(rows.map(row=>row.state),['processed','processed','processed','processed','processed','pending','pending']);assert.equal(rows.at(-1).attempts,0);
 assert.deepEqual((await db.query('select organisation_id,paid_invoice_id from public.jr_billing_subscriptions')).rows,[{organisation_id:org,paid_invoice_id:'in_A'}]);
 assert.equal((await h.run()).handled,2);assert.equal((await h.run()).handled,0);
});
test('time budget stops before claiming another record rather than consuming its attempt',async()=>{
 await enqueue('evt_first');await enqueue('evt_second');let now=0;
 const h=setup({now:()=>now,readEvidence:()=>{now=17000;return evidence();}}),result=await h.run();assert.equal(result.handled,1);assert.equal(result.stop,'budget');assert.equal(result.counts.processed,1);
 assert.deepEqual((await db.query("select state,attempts from public.jr_billing_events where event_id='evt_second'")).rows,[{state:'pending',attempts:0}]);
});
test('an exhausted provider budget defers its claimed event and keeps cleanup time available',async()=>{
 await enqueue('evt_budget');let now=0;
 const h=setup({now:()=>now,readEvidence:(target,options)=>{assert.equal(options.remainingReadMs(),20000);now=20001;assert.ok(options.remainingReadMs()<1);throw Error('billing_processing_budget_exhausted');}}),result=await h.run();
 assert.equal(result.stop,'budget');assert.equal(result.counts.deferred,1);assert.equal(result.handled,1);
 assert.deepEqual((await db.query('select state,attempts from public.jr_billing_events')).rows,[{state:'pending',attempts:0}]);assert.equal((await db.query('select reconcile_token from public.jr_billing_customers where organisation_id=$1',[org])).rows[0].reconcile_token,null);
 assert.equal((await db.query('select * from public.jr_billing_subscriptions')).rows.length,0);
});
test('total I/O exhaustion cannot report completion and a later invocation can reclaim the lease',async()=>{
 await enqueue('evt_late');let now=0;
 const h=setup({now:()=>now,readEvidence:()=>{now=24001;return evidence();}}),result=await h.run();assert.equal(result.state,'unavailable');assert.equal(result.handled,0);
 assert.equal((await db.query('select * from public.jr_billing_subscriptions')).rows.length,0);assert.equal((await db.query('select state from public.jr_billing_events')).rows[0].state,'processing');
 await db.exec("update public.jr_billing_events set lease_expires_at=clock_timestamp()-interval '1 second';update public.jr_billing_customers set reconcile_expires_at=clock_timestamp()-interval '1 second' where reconcile_token is not null");
 const resumed=await setup().run();assert.equal(resumed.counts.processed,1);assert.equal((await db.query('select attempts from public.jr_billing_events')).rows[0].attempts,2);
});
test('overlapping batches defer a busy business and cannot duplicate its coverage completion',async()=>{
 await enqueue('evt_one');await enqueue('evt_two');let enter,release,reads=0;
 const entered=new Promise(resolve=>{enter=resolve;}),hold=new Promise(resolve=>{release=resolve;});
 const h=setup({readEvidence:async()=>{if(++reads===1){enter();await hold;}return evidence();}}),first=h.run();await entered;
 const second=await h.run();assert.equal(second.counts.deferred,1);release();assert.equal((await first).counts.processed,1);
 assert.deepEqual((await db.query('select state,attempts from public.jr_billing_events order by received_at,event_id')).rows,[{state:'processed',attempts:1},{state:'pending',attempts:0}]);assert.equal((await db.query('select * from public.jr_billing_subscriptions')).rows.length,1);
});
test('risk review and provider failures keep their existing persisted outcomes',async()=>{
 await enqueue('evt_risk','charge.refunded');await enqueue('evt_failure');
 const h=setup({readEvidence:()=>{throw Error('rk_test_private_provider_error');}}),result=await h.run();assert.equal(result.counts.review,1);assert.equal(result.counts.retry,1);assert.equal(result.handled,2);assert.equal(result.stop,'idle');
 assert.deepEqual((await db.query('select state,attempts from public.jr_billing_events order by received_at,event_id')).rows,[{state:'review',attempts:1},{state:'pending',attempts:1}]);
});
test('lost acquisition responses remain retryable and partial storage outages retain accurate counts',async()=>{
 await enqueue('evt_lost');let lost=false;
 const h=setup({afterRpc:name=>{if(name==='jr_billing_begin_reconciliation'&&!lost){lost=true;throw Error('lost response');}}}),result=await h.run();assert.equal(result.counts.retry,1);assert.equal((await db.query('select reconcile_token from public.jr_billing_customers where organisation_id=$1',[org])).rows[0].reconcile_token,null);
 await db.exec('delete from public.jr_billing_events');await enqueue('evt_ok');await enqueue('evt_outage');let claims=0;
 const outage=setup({beforeRpc:name=>name==='jr_billing_claim_event'&&++claims===2?new Response('private upstream error',{status:503}):null}),partial=await outage.run();assert.equal(partial.state,'unavailable');assert.equal(partial.handled,1);assert.equal(partial.counts.processed,1);
 assert.deepEqual((await db.query("select state,attempts from public.jr_billing_events where event_id='evt_outage'")).rows,[{state:'pending',attempts:0}]);
});
test('native scheduled entry ignores supplied commands and logs only safe aggregate outcomes',async()=>{
 await enqueue('evt_native');const h=setup({readEvidence:()=>{throw Error('rk_test_never_log');}}),logs=[];
 const entry=loadLocalTs(new URL('../netlify/functions/billing-reconcile.mjs',import.meta.url),{'../../lib/server/billingScheduled.mjs':{runBillingScheduledBatch:options=>runBillingScheduledBatch({...options,fetchImpl:h.fetchImpl,createGateway:h.createGateway,now:()=>0})}},{Netlify:{env:{get:key=>environment()[key]}},console:{info:(...args)=>logs.push(args)},Response});
 assert.equal(entry.config.schedule,'* * * * *');assert.equal(entry.config.path,undefined);
 const request=new Request('https://jr-os.example/.netlify/functions/billing-reconcile?mode=live',{method:'POST',body:JSON.stringify({organisationId:other,customerId:'cus_Other',enabled:true,maxJobs:999})});
 const response=await entry.default(request,{deploy:production});assert.equal(response.status,204);assert.match(logs.flat().join('\n'),/"retry":1/);assert.doesNotMatch(logs.flat().join('\n'),/cus_|evt_|rk_|fixture-service|https:\/\//);
 assert.equal((await db.query('select * from public.jr_billing_subscriptions')).rows.length,0);
});
test('native entry reports infrastructure failure with a fixed error and no private diagnostics',async()=>{
 const logs=[],entry=loadLocalTs(new URL('../netlify/functions/billing-reconcile.mjs',import.meta.url),{'../../lib/server/billingScheduled.mjs':{runBillingScheduledBatch:options=>runBillingScheduledBatch({...options,fetchImpl:async()=>new Response('secret',{status:503}),createGateway:()=>({}),now:()=>0})}},{Netlify:{env:{get:key=>environment()[key]}},console:{info:(...args)=>logs.push(args)},Response});
 await assert.rejects(entry.default(new Request('https://jr-os.example/'),{deploy:production}),/^Error: billing_schedule_unavailable$/);assert.doesNotMatch(JSON.stringify(logs),/secret|rk_|cus_/);
});

test('request-supplied readiness cannot activate a disabled or preview native entry',async()=>{
 await enqueue('evt_still_pending');
 for(const [env,deploy] of [[{...environment(),JR_OS_BILLING_SCHEDULE_ENABLED:'false'},production],[environment(),{context:'deploy-preview',published:false}]]){
  const h=setup(),entry=loadLocalTs(new URL('../netlify/functions/billing-reconcile.mjs',import.meta.url),{'../../lib/server/billingScheduled.mjs':{runBillingScheduledBatch:options=>runBillingScheduledBatch({...options,fetchImpl:h.fetchImpl,createGateway:h.createGateway,now:()=>0})}},{Netlify:{env:{get:key=>env[key]}},console:{info(){}},Response});
  const response=await entry.default(new Request('https://jr-os.example/?enabled=true',{method:'POST',body:JSON.stringify({enabled:true,deploy:production,JR_OS_BILLING_SCHEDULE_ENABLED:'true'})}),{deploy});assert.equal(response.status,204);assert.equal(h.requests.length,0);assert.equal(h.gatewayOptions.length,0);
 }
 assert.deepEqual((await db.query('select state,attempts from public.jr_billing_events')).rows,[{state:'pending',attempts:0}]);
});
