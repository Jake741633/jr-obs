import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createBillingReconciliationStore,runBillingReconciliation} from '../lib/server/billingWorker.mjs';
import {evidence} from './helpers/billingEvidence.mjs';
const db=new PGlite(),org='11111111-1111-4111-8111-111111111111',other='33333333-3333-4333-8333-333333333333',actor='22222222-2222-4222-8222-222222222222',account='acct_1UWyMhRxGUITlJWL';
const rpc=async(name,args=[])=>{const r=await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args);return r.rows[0].value;};
const enqueue=(id='evt_risk',type='charge.refunded',source='ch_A')=>rpc('jr_billing_receive_event',[account,{id,object:'event',type,livemode:false,data:{object:{id:source,customer:'cus_Other',metadata:{organisationId:other}}}}]);
const fields={jr_billing_claim_event:[],jr_billing_begin_reconciliation:['p_event_id','p_lease_token','p_customer_id'],jr_billing_finish_event:['p_event_id','p_lease_token','p_outcome'],jr_billing_complete_reconciliation:['p_event_id','p_lease_token','p_reconcile_token','p_snapshot','p_outcome'],jr_billing_mark_review:['p_event_id','p_lease_token','p_reconcile_token','p_reason','p_source_id']};
function store(){return createBillingReconciliationStore({env:{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-service'},fetchImpl:async(url,options)=>{
 const name=new URL(url).pathname.split('/').at(-1),body=JSON.parse(options.body);assert.ok(fields[name]);assert.equal(options.headers.Authorization,'Bearer fixture-service');
 try{return Response.json(await rpc(name,fields[name].map(key=>body[key])));}catch{return new Response('private SQL error',{status:500});}
}});}
const gateway=(change={})=>({resolveBillingRisk:async()=>({customerId:'cus_A',reason:'refund',sourceId:'ch_A',reviewRequired:true}),resolveSubscriptionTarget:async()=>({customerId:'cus_A',subscriptionId:'sub_A'}),readSubscriptionEvidence:async()=>evidence(),...change});
before(async()=>{await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table public.organisations(id uuid primary key);create table public.profiles(id uuid primary key,organisation_id uuid,role text,active boolean);insert into public.organisations values('${org}'),('${other}');insert into public.profiles values('${actor}','${org}','owner',true);grant select on public.profiles to service_role;`);await db.exec(await readFile('supabase/migrations/20261101154212_subscription_billing_store.sql','utf8'));await db.exec('set role service_role');});
beforeEach(async()=>{await db.exec('reset role;delete from public.jr_billing_review_resolutions;delete from public.jr_billing_review_signals;delete from public.jr_billing_subscriptions;delete from public.jr_billing_operations;delete from public.jr_billing_events;delete from public.jr_billing_customers');await db.query("insert into public.jr_billing_customers(organisation_id,customer_id) values($1,'cus_A'),($2,'cus_Other')",[org,other]);await db.exec('set role service_role');});after(()=>db.close());
test('verified risk marks only its current bound business and atomically finishes in review',async()=>{
 await enqueue();assert.deepEqual(await runBillingReconciliation({store:store(),gateway:gateway()}),{state:'review'});
 assert.deepEqual((await db.query('select organisation_id,review_required from public.jr_billing_customers order by organisation_id')).rows,[{organisation_id:org,review_required:true},{organisation_id:other,review_required:false}]);
 const row=(await db.query('select review_reason,review_source_id,review_event_id,reconcile_token from public.jr_billing_customers where organisation_id=$1',[org])).rows[0];assert.deepEqual(row,{review_reason:'refund',review_source_id:'ch_A',review_event_id:'evt_risk',reconcile_token:null});assert.equal((await db.query('select state from public.jr_billing_events')).rows[0].state,'review');assert.equal((await db.query('select * from public.jr_billing_subscriptions')).rows.length,0);
 assert.deepEqual(await runBillingReconciliation({store:store(),gateway:gateway()}),{state:'idle'});
});
test('a later paid lifecycle update or resolved/no-op signal cannot silently clear the marker',async()=>{
 await enqueue();await runBillingReconciliation({store:store(),gateway:gateway()});await enqueue('evt_paid','invoice.paid','in_A');assert.equal((await runBillingReconciliation({store:store(),gateway:gateway()})).state,'processed');
 await enqueue('evt_void','credit_note.created','cn_A');assert.equal((await runBillingReconciliation({store:store(),gateway:gateway({resolveBillingRisk:async()=>({customerId:'cus_A',reason:'credit_note',sourceId:'cn_A',reviewRequired:false})})})).state,'review');
 const held=(await db.query('select review_required,review_event_id from public.jr_billing_customers where organisation_id=$1',[org])).rows[0];assert.deepEqual(held,{review_required:true,review_event_id:'evt_risk'});assert.equal((await db.query('select status from public.jr_billing_subscriptions')).rows[0].status,'active');
});
test('unknown binding or no current financial signal remains review work without marking another business',async()=>{
 for(const target of [{customerId:'cus_Unbound',reason:'refund',sourceId:'ch_A',reviewRequired:true},{customerId:'cus_A',reason:'refund',sourceId:'ch_A',reviewRequired:false}]){
  await db.exec('delete from public.jr_billing_events');await enqueue();assert.equal((await runBillingReconciliation({store:store(),gateway:gateway({resolveBillingRisk:async()=>target})})).state,'review');assert.equal((await db.query('select * from public.jr_billing_customers where review_required')).rows.length,0);
 }
});
test('stale, expired or foreign lease tokens cannot set review, and source mismatch rolls back',async()=>{
 await enqueue();const s=store(),job=await s.claimEvent(),lock=await s.beginReconciliation(job,'cus_A'),risk={reason:'refund',sourceId:'ch_A'};
 assert.equal(await s.markReview(job,{...lock,token:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},risk),false);
 await assert.rejects(s.markReview(job,lock,{reason:'dispute',sourceId:'dp_A'}),/billing_store_unavailable/);assert.equal((await db.query('select state from public.jr_billing_events')).rows[0].state,'processing');assert.equal((await db.query('select review_required from public.jr_billing_customers where organisation_id=$1',[org])).rows[0].review_required,false);
 await db.exec("update public.jr_billing_customers set reconcile_expires_at=clock_timestamp()-interval '1 second' where organisation_id='11111111-1111-4111-8111-111111111111'");assert.equal(await s.markReview(job,lock,risk),false);
});
test('browser roles cannot invoke the marker RPC or edit its service-owned fields',async()=>{
 await db.exec('reset role');for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(rpc('jr_billing_mark_review',['evt_risk',actor,actor,'refund','ch_A']),/permission denied/);await assert.rejects(db.exec('update public.jr_billing_customers set review_required=false'),/permission denied/);}finally{await db.exec('reset role');}}
});
test('risk provider failures retry and spent processing budget defers without a false hold',async()=>{
 for(const [message,want] of [['billing_provider_unavailable','retry'],['billing_processing_budget_exhausted','deferred']]){await db.exec('delete from public.jr_billing_events');await enqueue();assert.equal((await runBillingReconciliation({store:store(),gateway:gateway({resolveBillingRisk:async()=>{throw Error(message);}})})).state,want);assert.equal((await db.query('select * from public.jr_billing_customers where review_required')).rows.length,0);}
});
