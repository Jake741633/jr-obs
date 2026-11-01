import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {runBillingReconciliation,runConfiguredBillingReconciliation,createBillingReconciliationStore} from '../lib/server/billingWorker.mjs';
import {evidence} from './helpers/billingEvidence.mjs';
const db=new PGlite(),org='11111111-1111-4111-8111-111111111111';
const rpc=async(name,args=[])=>{const r=await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args);return r.rows[0].value;};
const enqueue=(type='invoice.paid')=>rpc('jr_billing_receive_event',['acct_1UWyMhRxGUITlJWL',{id:'evt_worker',type,object:'event',livemode:false,data:{object:{id:'in_A',status:'active',paid:true,metadata:{organisationId:'wrong'}}}}]);
function store({loseBegin=false}={}){return createBillingReconciliationStore({env:{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-secret'},fetchImpl:async(url,options)=>{
 const name=new URL(url).pathname.split('/').at(-1),body=JSON.parse(options.body);
 const fields={jr_billing_claim_event:[],jr_billing_finish_event:['p_event_id','p_lease_token','p_outcome'],jr_billing_begin_reconciliation:['p_event_id','p_lease_token','p_customer_id'],jr_billing_complete_reconciliation:['p_event_id','p_lease_token','p_reconcile_token','p_snapshot','p_outcome']}[name];assert.ok(fields,'Only allowlisted RPC operations');
 try{const result=await rpc(name,fields.map(f=>body[f]));if(loseBegin&&name==='jr_billing_begin_reconciliation')return new Response('lost response',{status:500});return Response.json(result);}catch{return new Response('database-private-error',{status:500});}
 }});}
const gateway=(changes={})=>({resolveSubscriptionTarget:async()=>({customerId:'cus_A',subscriptionId:'sub_A'}),readSubscriptionEvidence:async()=>evidence(),...changes});
before(async()=>{await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table public.organisations(id uuid primary key);insert into public.organisations values('${org}');`);await db.exec(await readFile('supabase/migrations/20261101154212_subscription_billing_store.sql','utf8'));await db.exec('set role service_role');});
beforeEach(async()=>{await db.exec('delete from public.jr_billing_subscriptions;delete from public.jr_billing_operations;delete from public.jr_billing_events;delete from public.jr_billing_customers');await db.query(`insert into public.jr_billing_customers(organisation_id,customer_id) values($1,'cus_A')`,[org]);});
after(()=>db.close());
test('a paid event writes verified current coverage and finishes atomically; duplicates do not rerun',async()=>{
 await enqueue();assert.deepEqual(await runBillingReconciliation({store:store(),gateway:gateway()}),{state:'processed'});
 const rows=(await db.query('select organisation_id,status,paid_invoice_id from public.jr_billing_subscriptions')).rows;assert.deepEqual(rows,[{organisation_id:org,status:'active',paid_invoice_id:'in_A'}]);
 await enqueue();assert.deepEqual(await runBillingReconciliation({store:store(),gateway:gateway()}),{state:'idle'});
});
test('a delayed paid event reads the current canceled subscription rather than restoring active access',async()=>{
 await enqueue();const current=evidence();current.subscription.status='canceled';
 assert.deepEqual(await runBillingReconciliation({store:store(),gateway:gateway({readSubscriptionEvidence:async()=>current})}),{state:'processed'});
 assert.deepEqual((await db.query('select status,paid_through from public.jr_billing_subscriptions')).rows,[{status:'canceled',paid_through:null}]);
});
test('unknown customer bindings go to review without writing a business snapshot',async()=>{
 await enqueue();assert.deepEqual(await runBillingReconciliation({store:store(),gateway:gateway({resolveSubscriptionTarget:async()=>({customerId:'cus_missing',subscriptionId:'sub_A'}),readSubscriptionEvidence:async()=>{throw Error('must not read');}})}),{state:'review'});
 assert.equal((await db.query('select * from public.jr_billing_subscriptions')).rows.length,0);
});
test('provider outage retries the event and releases the business lease',async()=>{
 await enqueue();assert.deepEqual(await runBillingReconciliation({store:store(),gateway:gateway({readSubscriptionEvidence:async()=>{throw Error('billing_provider_unavailable');}})}),{state:'retry'});
 assert.equal((await db.query('select state from public.jr_billing_events')).rows[0].state,'pending');assert.equal((await db.query('select reconcile_token from public.jr_billing_customers')).rows[0].reconcile_token,null);
});
test('uncertain or refunded payment evidence enters review and never writes paid-through coverage',async()=>{
 await enqueue();const suspicious=evidence();suspicious.charge.amount_refunded=1;
 assert.deepEqual(await runBillingReconciliation({store:store(),gateway:gateway({readSubscriptionEvidence:async()=>suspicious})}),{state:'review'});
 assert.equal((await db.query('select * from public.jr_billing_subscriptions')).rows.length,0);
});
test('a worker whose event lease expires during provider reads cannot write coverage',async()=>{
 await enqueue();assert.deepEqual(await runBillingReconciliation({store:store(),gateway:gateway({readSubscriptionEvidence:async()=>{await db.exec("update public.jr_billing_events set lease_expires_at=clock_timestamp()-interval '1 second'");return evidence();}})}),{state:'stale'});
 assert.equal((await db.query('select * from public.jr_billing_subscriptions')).rows.length,0);assert.equal((await db.query('select state from public.jr_billing_events')).rows[0].state,'processing');
});
test('risk and credit-note events require review and cannot silently extend access',async()=>{
 await enqueue('charge.dispute.created');assert.deepEqual(await runBillingReconciliation({store:store(),gateway:gateway({resolveSubscriptionTarget:async()=>{throw Error('risk must be reviewed');}})}),{state:'review'});
});
test('worker activation defaults off and storage failure cannot report success',async()=>{
 assert.deepEqual(await runConfiguredBillingReconciliation({env:{},fetchImpl:async()=>{throw Error('must not connect');}}),{state:'disabled'});
 const unavailable=createBillingReconciliationStore({env:{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-secret'},fetchImpl:async()=>new Response('secret',{status:500})});
 await assert.rejects(runBillingReconciliation({store:unavailable,gateway:gateway()}),/billing_store_unavailable/);
});


test('a lost lease-acquisition response can retry without leaving the business locked',async()=>{
 await enqueue();assert.deepEqual(await runBillingReconciliation({store:store({loseBegin:true}),gateway:gateway()}),{state:'retry'});
 assert.equal((await db.query('select reconcile_token from public.jr_billing_customers')).rows[0].reconcile_token,null);
});

test('business contention defers work without consuming the failure budget or spinning into review',async()=>{
 await enqueue();const first=await rpc('jr_billing_claim_event');await rpc('jr_billing_begin_reconciliation',[first.event_id,first.lease_token,'cus_A']);
 await rpc('jr_billing_receive_event',['acct_1UWyMhRxGUITlJWL',{id:'evt_waiter',object:'event',type:'invoice.paid',livemode:false,data:{object:{id:'in_A'}}}]);
 assert.deepEqual(await runBillingReconciliation({store:store(),gateway:gateway()}),{state:'deferred'});
 for(let i=0;i<10;i++)assert.deepEqual(await runBillingReconciliation({store:store(),gateway:gateway()}),{state:'idle'});
 const queued=(await db.query("select state,attempts from public.jr_billing_events where event_id='evt_waiter'")).rows[0];assert.deepEqual(queued,{state:'pending',attempts:0});
 await rpc('jr_billing_finish_event',[first.event_id,first.lease_token,'review']);
 await db.exec("update public.jr_billing_events set available_at=clock_timestamp()-interval '1 second' where event_id='evt_waiter'");
 assert.deepEqual(await runBillingReconciliation({store:store(),gateway:gateway()}),{state:'processed'});
});

test('exhausted provider failures report review consistently with persisted queue state',async()=>{
 await enqueue();await db.exec('update public.jr_billing_events set attempts=9');
 assert.deepEqual(await runBillingReconciliation({store:store(),gateway:gateway({readSubscriptionEvidence:async()=>{throw Error('billing_provider_unavailable');}})}),{state:'review'});
 assert.equal((await db.query('select state from public.jr_billing_events')).rows[0].state,'review');
});
