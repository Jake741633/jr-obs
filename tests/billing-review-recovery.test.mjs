import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {subscriptionAccess} from '../lib/billing/subscriptionAccess.mjs';

const db=new PGlite(),a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const account='acct_1UWyMhRxGUITlJWL',resolutionId='33333333-3333-4333-8333-333333333333';
const rpc=async(name,args=[])=>{const r=await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args);return r.rows[0].value;};
const inspect=(organisationId=a)=>rpc('jr_billing_operator_review',[organisationId]);
const input=patch=>({organisationId:a,customerId:'cus_A',expectedVersion:1,resolutionId,operatorReference:'ops:case-100',note:'Reviewed case OPS-100 against current sandbox payment records.',...patch});
const resolve=patch=>{const p=input(patch);return rpc('jr_billing_resolve_review',[p.organisationId,p.customerId,p.expectedVersion,p.resolutionId,p.operatorReference,p.note]);};
async function mark(id='evt_one',customerId='cus_A'){
 await rpc('jr_billing_receive_event',[account,{id,object:'event',type:'charge.refunded',livemode:false,data:{object:{id:'ch_'+id.slice(4)}}}]);
 const job=await rpc('jr_billing_claim_event'),lock=await rpc('jr_billing_begin_reconciliation',[job.event_id,job.lease_token,customerId]);
 assert.equal(await rpc('jr_billing_mark_review',[job.event_id,job.lease_token,lock.token,'refund','ch_'+id.slice(4)]),true);
 return {job,lock};
}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table public.organisations(id uuid primary key);create table public.profiles(id uuid primary key,organisation_id uuid,role text,active boolean);
 insert into public.organisations values('${a}'),('${b}');grant select on public.profiles to service_role;`);
 await db.exec(await readFile('supabase/migrations/20261101154212_subscription_billing_store.sql','utf8'));
});
beforeEach(async()=>{
 await db.exec('reset role');for(const table of ['jr_billing_review_resolutions','jr_billing_review_signals'])if((await db.query('select to_regclass($1) as relation',['public.'+table])).rows[0].relation)await db.exec('delete from public.'+table);
 await db.exec('delete from public.jr_billing_subscriptions;delete from public.jr_billing_operations;delete from public.jr_billing_events;delete from public.jr_billing_customers');
 await db.query("insert into public.jr_billing_customers(organisation_id,customer_id) values($1,'cus_A'),($2,'cus_B')",[a,b]);await db.exec('set role service_role');
});
after(()=>db.close());

test('every new verified signal advances the version without replacing first evidence',async()=>{
 const {job,lock}=await mark();const first=await inspect();await mark('evt_two');const second=await inspect();
 assert.equal(second.state,'held');assert.equal(second.organisationId,a);assert.equal(second.customerId,'cus_A');assert.equal(second.reviewVersion,2);assert.deepEqual(second.review,first.review);
 assert.deepEqual(second.signals.map(s=>({version:s.reviewVersion,id:s.eventId})),[{version:1,id:'evt_one'},{version:2,id:'evt_two'}]);
 assert.equal(second.signalCount,2);assert.equal(second.truncated,false);assert.equal(second.reconciliationBusy,false);assert.equal(typeof second.review.markedAtMs,'number');
 await rpc('jr_billing_receive_event',[account,{id:'evt_one',object:'event',type:'charge.refunded',livemode:false,data:{object:{id:'ch_one'}}}]);
 assert.equal(await rpc('jr_billing_claim_event'),null);assert.equal(await rpc('jr_billing_mark_review',[job.event_id,job.lease_token,lock.token,'refund','ch_one']),false);assert.equal((await inspect()).reviewVersion,2);
 assert.doesNotMatch(JSON.stringify(second),/payload|lease_token|metadata|secret/);
});
test('a changed generation makes a previously inspected resolution stale',async()=>{
 await mark();await mark('evt_two');assert.deepEqual(await resolve(),{state:'stale'});assert.equal((await inspect()).state,'held');assert.equal((await db.query('select * from public.jr_billing_review_resolutions')).rows.length,0);
});
test('clearance audits exact signals and invalidates all old paid and trial coverage only for that binding',async()=>{
 await mark();
 await db.query(`insert into public.jr_billing_subscriptions(organisation_id,customer_id,subscription_id,price_id,status,paid_through,paid_invoice_id,trial_ends_at) values
 ($1,'cus_A','sub_A','price_A','active',now()+interval '1 year','in_A',now()+interval '1 day'),
 ($1,'cus_A','sub_Old','price_A','canceled',now()+interval '1 year','in_Old',now()+interval '1 day'),
 ($2,'cus_B','sub_B','price_A','active',now()+interval '1 year','in_B',null)`,[a,b]);
 assert.deepEqual(await resolve(),{state:'cleared'});const current=await inspect();assert.equal(current.state,'clear');assert.equal(current.reviewVersion,1);assert.equal(current.review,null);assert.deepEqual(current.signals,[]);
 const rows=(await db.query('select organisation_id,status,paid_through,paid_invoice_id,trial_ends_at from public.jr_billing_subscriptions order by subscription_id')).rows;
 for(const row of rows.filter(r=>r.organisation_id===a)){
  assert.equal(row.paid_through,null);assert.equal(row.paid_invoice_id,null);assert.equal(row.trial_ends_at,null);
  for(const status of ['active','trialing'])assert.equal(subscriptionAccess({organisationId:a,mode:'test',allowedPriceIds:['price_A'],nowMs:Date.now(),subscription:{organisationId:a,mode:'test',subscriptionId:'sub_A',priceId:'price_A',status,reviewRequired:false,paidThroughMs:null,trialEndsAtMs:null}}).paidFeatures,false);
 }
 assert.notEqual(rows.find(r=>r.organisation_id===b).paid_through,null);
 const audit=(await db.query('select * from public.jr_billing_review_resolutions')).rows[0];assert.equal(audit.id,resolutionId);assert.equal(audit.review_version,1);assert.equal(audit.operator_reference,input().operatorReference);assert.equal(audit.note,input().note);assert.equal(audit.signals[0].eventId,'evt_one');assert.equal(audit.organisation_id,a);
});
test('a lost reply can be retried but an old decision cannot clear a later hold',async()=>{
 await mark();await resolve();assert.deepEqual(await resolve(),{state:'already_recorded'});await mark('evt_later');
 assert.deepEqual(await resolve(),{state:'already_recorded'});assert.equal((await inspect()).state,'held');assert.equal((await inspect()).reviewVersion,2);
 assert.deepEqual(await resolve({expectedVersion:2,note:'A different case or a changed decision.'}),{state:'conflict'});assert.equal((await inspect()).state,'held');
 assert.deepEqual(await resolve({expectedVersion:1,resolutionId:b}),{state:'stale'});
 assert.deepEqual(await resolve({expectedVersion:2,resolutionId:b}),{state:'cleared'});assert.equal((await db.query('select * from public.jr_billing_review_resolutions')).rows.length,2);
});
test('wrong business or Customer cannot clear another binding',async()=>{
 await mark();for(const [patch,state] of [[{organisationId:b},'unbound'],[{customerId:'cus_B'},'unbound'],[{organisationId:b,customerId:'cus_B'},'stale']])assert.deepEqual(await resolve(patch),{state});
 assert.equal((await inspect()).state,'held');assert.equal((await inspect(b)).state,'clear');assert.deepEqual(await inspect(resolutionId),{state:'unbound'});
});
test('active work blocks resolution; expired work is fenced and cannot write after clearance',async()=>{
 await mark();await rpc('jr_billing_receive_event',[account,{id:'evt_busy',object:'event',type:'invoice.paid',livemode:false,data:{object:{id:'in_A'}}}]);
 const job=await rpc('jr_billing_claim_event'),lock=await rpc('jr_billing_begin_reconciliation',[job.event_id,job.lease_token,'cus_A']);
 assert.equal((await inspect()).reconciliationBusy,true);assert.deepEqual(await resolve(),{state:'busy'});
 await db.exec("update public.jr_billing_customers set reconcile_expires_at=clock_timestamp()-interval '1 second' where customer_id='cus_A'");assert.deepEqual(await resolve(),{state:'cleared'});
 assert.equal(await rpc('jr_billing_complete_reconciliation',[job.event_id,job.lease_token,lock.token,null,'review']),false);assert.equal((await inspect()).state,'clear');
});
test('resolution and audit roll back together if coverage invalidation fails',async()=>{
 await mark();await db.query("insert into public.jr_billing_subscriptions(organisation_id,customer_id,subscription_id,price_id,status) values($1,'cus_A','sub_A','price_A','active')",[a]);
 await db.exec("reset role;create function private.reject_recovery_fixture() returns trigger language plpgsql as $$ begin raise exception 'fixture_rejected'; end $$;create trigger reject_recovery_fixture before update on public.jr_billing_subscriptions for each row execute function private.reject_recovery_fixture();set role service_role");
 try{await assert.rejects(resolve(),/fixture_rejected/);assert.equal((await inspect()).state,'held');assert.equal((await db.query('select * from public.jr_billing_review_resolutions')).rows.length,0);}
 finally{await db.exec('reset role;drop trigger reject_recovery_fixture on public.jr_billing_subscriptions;drop function private.reject_recovery_fixture();set role service_role');}
});
test('browser roles have no review RPC/table privileges and service audit rows cannot be changed',async()=>{
 await mark();await resolve();
 for(const table of ['jr_billing_review_signals','jr_billing_review_resolutions']){
  assert.equal((await db.query('select relrowsecurity from pg_class where oid=to_regclass($1)',['public.'+table])).rows[0].relrowsecurity,true);
  for(const action of ['update','delete','truncate'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed',['service_role','public.'+table,action])).rows[0].allowed,false);
 }
 for(const role of ['anon','authenticated']){
  await db.exec('reset role;set role '+role);
  try{await assert.rejects(inspect(),/permission denied/);await assert.rejects(resolve(),/permission denied/);for(const table of ['jr_billing_review_signals','jr_billing_review_resolutions'])await assert.rejects(db.query('select * from public.'+table),/permission denied/);}
  finally{await db.exec('reset role;set role service_role');}
 }
 await assert.rejects(db.exec("update public.jr_billing_review_resolutions set note='edited'"),/permission denied/);await assert.rejects(db.exec('delete from public.jr_billing_review_signals'),/permission denied/);
});
test('invalid operator decisions fail without clearing or auditing',async()=>{
 await mark();for(const patch of [{operatorReference:''},{operatorReference:'contains spaces'},{note:'short'},{note:'x'.repeat(1001)},{expectedVersion:-1},{resolutionId:null}])await assert.rejects(resolve(patch));
 assert.equal((await inspect()).state,'held');assert.equal((await db.query('select * from public.jr_billing_review_resolutions')).rows.length,0);
});
test('missing ledger evidence requires investigation rather than an invented resolution',async()=>{
 await db.exec("update public.jr_billing_customers set review_required=true,review_version=1,review_reason='refund',review_source_id='ch_Missing',review_event_id='evt_missing',review_marked_at=clock_timestamp() where customer_id='cus_A'");
 assert.equal((await inspect()).signalCount,0);assert.deepEqual(await resolve(),{state:'needs_investigation'});assert.equal((await inspect()).state,'held');
});
test('an incomplete truncated inspection cannot clear a case with twenty-one signals',async()=>{
 for(let i=1;i<=21;i++)await mark('evt_signal'+i);
 const value=await inspect();assert.equal(value.signalCount,21);assert.equal(value.truncated,true);assert.equal(value.signals.length,20);assert.deepEqual(await resolve({expectedVersion:21}),{state:'needs_investigation'});assert.equal((await inspect()).state,'held');
});
test('the complete twenty-signal boundary can be resolved and retained in its audit',async()=>{
 for(let i=1;i<=20;i++)await mark('evt_signal'+i);
 const value=await inspect();assert.equal(value.signalCount,20);assert.equal(value.truncated,false);assert.equal(value.signals.length,20);assert.deepEqual(await resolve({expectedVersion:20}),{state:'cleared'});
 assert.equal((await db.query('select signals from public.jr_billing_review_resolutions')).rows[0].signals.length,20);
});
