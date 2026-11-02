import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const rpc=async(name,args=[])=>{const r=await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args);return r.rows[0].value;};
const receive=id=>rpc('jr_billing_receive_event',['acct_1UWyMhRxGUITlJWL',{id,object:'event',type:'customer.subscription.updated',livemode:false,data:{object:{id:'sub_A'}}}]);
const row=()=>({organisationId:a,customerId:'cus_A',subscriptionId:'sub_A',priceId:'price_1UX0fdRxGUITlJWLXoEGdcBE',status:'active',paidThroughMs:1792678400000,paidInvoiceId:'in_A',trialEndsAtMs:null,cancelAtPeriodEnd:false});
const begin=job=>rpc('jr_billing_begin_reconciliation',[job.event_id,job.lease_token,'cus_A']);
const commit=(job,lock,snapshot=row(),outcome='processed')=>rpc('jr_billing_complete_reconciliation',[job.event_id,job.lease_token,lock.token,snapshot,outcome]);
before(async()=>{await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table public.organisations(id uuid primary key);insert into public.organisations values('${a}'),('${b}');`);await db.exec(await readFile('supabase/migrations/20261101154212_subscription_billing_store.sql','utf8'));await db.query(`insert into public.jr_billing_customers(organisation_id,customer_id) values($1,'cus_A'),($2,'cus_B')`,[a,b]);await db.exec('set role service_role');});
after(()=>db.close());
test('different events for one business cannot reconcile concurrently',async()=>{
 await receive('evt_a');await receive('evt_b');const first=await rpc('jr_billing_claim_event'),second=await rpc('jr_billing_claim_event');
 const lock=await begin(first);assert.equal(lock.state,'acquired');assert.equal(lock.organisation_id,a);
 assert.equal((await begin(second)).state,'busy');assert.equal((await begin(first)).token,lock.token);
 assert.equal(await commit(first,lock),true);
 const lock2=await begin(second);assert.equal(lock2.state,'acquired');assert.equal(await commit(second,lock2,{...row(),status:'canceled',paidThroughMs:null,paidInvoiceId:null}),true);
 const r=await db.query(`select status from public.jr_billing_subscriptions`);assert.equal(r.rows[0].status,'canceled');
});
test('expired lease cannot write coverage or complete an event and a new worker can reclaim it',async()=>{
 await receive('evt_stale');const job=await rpc('jr_billing_claim_event'),lock=await begin(job);
 await db.exec(`update public.jr_billing_events set lease_expires_at=clock_timestamp()-interval '1 second' where event_id='evt_stale';update public.jr_billing_customers set reconcile_expires_at=clock_timestamp()-interval '1 second' where customer_id='cus_A'`);
 assert.equal(await commit(job,lock),false);
 const newer=await rpc('jr_billing_claim_event'),newLock=await begin(newer);assert.equal(newLock.state,'acquired');assert.notEqual(newLock.token,lock.token);
 assert.equal(await commit(job,lock),false);assert.equal(await commit(newer,newLock),true);
});
test('snapshot validation and business binding failures roll back event completion and all coverage writes',async()=>{
 await receive('evt_atomic');const job=await rpc('jr_billing_claim_event'),lock=await begin(job);
 for(const change of [{organisationId:b},{customerId:'cus_B'},{priceId:'price_other'},{paidInvoiceId:null},{paidThroughMs:-1},{cancelAtPeriodEnd:'true'}])await assert.rejects(commit(job,lock,{...row(),...change}),/billing_invalid_snapshot/);
 const state=await db.query(`select state from public.jr_billing_events where event_id='evt_atomic'`);assert.equal(state.rows[0].state,'processing');
 const sub=await db.query(`select paid_invoice_id from public.jr_billing_subscriptions`);assert.equal(sub.rows[0].paid_invoice_id,'in_A');
 assert.equal(await commit(job,lock,null,'review'),true);assert.equal((await db.query(`select reconcile_token from public.jr_billing_customers where customer_id='cus_A'`)).rows[0].reconcile_token,null);
});
test('unbound customers and browser roles cannot obtain a business reconciliation lease',async()=>{
 await receive('evt_unbound');const job=await rpc('jr_billing_claim_event');assert.equal((await rpc('jr_billing_begin_reconciliation',[job.event_id,job.lease_token,'cus_missing'])).state,'unbound');
 await rpc('jr_billing_finish_event',[job.event_id,job.lease_token,'review']);
 await db.exec('reset role');
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);try{await assert.rejects(begin(job),/permission denied/);await assert.rejects(commit(job,{token:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),/permission denied/);}finally{await db.exec('reset role');}
 }
 await db.exec('set role service_role');
});
