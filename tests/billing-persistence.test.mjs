import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const account='acct_1UWyMhRxGUITlJWL';
const event=id=>({id,object:'event',type:'invoice.paid',livemode:false,data:{object:{id:'in_fixture'}}});
const rpc=async(name,args=[])=>{const {rows}=await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args);return rows[0].value;};
async function as(role,work){await db.exec('set role '+role);try{return await work();}finally{await db.exec('reset role');}}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table public.organisations(id uuid primary key);
 insert into public.organisations values('${a}'),('${b}');`);
 await db.exec(await readFile('supabase/migrations/20261101154212_subscription_billing_store.sql','utf8'));
});
after(()=>db.close());
test('billing persistence exists in real Postgres with RLS and no browser privileges',async()=>{
 for(const table of ['jr_billing_customers','jr_billing_subscriptions','jr_billing_operations','jr_billing_events','jr_billing_review_signals','jr_billing_review_resolutions']){
  const {rows}=await db.query('select relrowsecurity from pg_class where oid=to_regclass($1)', ['public.'+table]);
  assert.equal(rows[0]?.relrowsecurity,true);
  for(const role of ['anon','authenticated'])for(const action of ['select','insert','update','delete','truncate']){
   const r=await db.query('select has_table_privilege($1,$2,$3) as allowed',[role,'public.'+table,action]);assert.equal(r.rows[0].allowed,false);
  }
 }
 for(const role of ['anon','authenticated'])await as(role,()=>assert.rejects(rpc('jr_billing_receive_event',[account,event('evt_denied')]),/permission denied/));
});
test('customer binding cannot cross businesses or environments',async()=>{
 await as('service_role',async()=>{
  await db.query(`insert into public.jr_billing_customers(organisation_id,customer_id) values($1,'cus_A'),($2,'cus_B')`,[a,b]);
  await assert.rejects(db.query(`insert into public.jr_billing_customers(organisation_id,customer_id) values($1,'cus_A')`,[b]),/duplicate key/);
  await assert.rejects(db.query(`insert into public.jr_billing_customers(organisation_id,customer_id,mode) values($1,'cus_live','live')`,[a]),/check constraint/);
  await assert.rejects(db.query(`insert into public.jr_billing_customers(organisation_id,customer_id,account_id) values($1,'cus_wrong','acct_other')`,[a]),/check constraint/);
  await assert.rejects(db.query(`insert into public.jr_billing_subscriptions(organisation_id,customer_id,subscription_id,price_id,status) values($1,'cus_A','sub_wrong','price_fixture','active')`,[b]),/foreign key/);
  await assert.rejects(db.query(`insert into public.jr_billing_subscriptions(organisation_id,customer_id,subscription_id,price_id,status,paid_through) values($1,'cus_A','sub_unpaid','price_fixture','active',now())`,[a]),/check constraint/);
 });
});
test('only one pending Checkout per business and scope is possible',async()=>{
 await as('service_role',async()=>{
  await db.query(`insert into public.jr_billing_operations(organisation_id,customer_id,kind,plan) values($1,'cus_A','checkout','monthly')`,[a]);
  await assert.rejects(db.query(`insert into public.jr_billing_operations(organisation_id,customer_id,kind,plan) values($1,'cus_A','checkout','annual')`,[a]),/duplicate key/);
  await db.query(`update public.jr_billing_operations set state='succeeded' where organisation_id=$1`,[a]);
  await db.query(`insert into public.jr_billing_operations(organisation_id,customer_id,kind,plan) values($1,'cus_A','checkout','annual')`,[a]);
 });
});
test('webhook receipt deduplicates durably without overwriting first receipt',async()=>{
 await as('service_role',async()=>{
  assert.deepEqual(await rpc('jr_billing_receive_event',[account,event('evt_once')]),{received:true,duplicate:false});
  assert.deepEqual(await rpc('jr_billing_receive_event',[account,{...event('evt_once'),type:'invoice.payment_failed'}]),{received:true,duplicate:true});
  const {rows}=await db.query(`select payload from public.jr_billing_events where event_id='evt_once'`);assert.equal(rows.length,1);assert.equal(rows[0].payload.type,'invoice.paid');
  for(const wrong of [{...event('evt_bad'),livemode:true},{...event('evt_bad'),account:'acct_other'},{...event('evt_bad'),context:'acct_other'},{...event('evt_bad'),id:'bad'}])await assert.rejects(rpc('jr_billing_receive_event',[account,wrong]),/billing_invalid_event/);
  await assert.rejects(rpc('jr_billing_receive_event',['acct_other',event('evt_bad')]),/billing_invalid_event/);
 });
});
test('leases prevent parallel claims, recover crashes and fence stale workers',async()=>{
 await as('service_role',async()=>{
  const first=await rpc('jr_billing_claim_event');assert.equal(first.event_id,'evt_once');assert.equal(first.attempts,1);
  assert.equal(await rpc('jr_billing_claim_event'),null);
  assert.equal(await rpc('jr_billing_finish_event',[first.event_id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','processed']),false);
  await db.exec(`update public.jr_billing_events set lease_expires_at=now()-interval '1 second' where event_id='evt_once'`);
  const second=await rpc('jr_billing_claim_event');assert.equal(second.event_id,first.event_id);assert.notEqual(second.lease_token,first.lease_token);assert.equal(second.attempts,2);
  assert.equal(await rpc('jr_billing_finish_event',[first.event_id,first.lease_token,'processed']),false);
  assert.equal(await rpc('jr_billing_finish_event',[second.event_id,second.lease_token,'processed']),true);
  assert.equal(await rpc('jr_billing_claim_event'),null);
 });
});
test('failed work can retry and exhausted attempts go to review without silently fulfilling',async()=>{
 await as('service_role',async()=>{
  await rpc('jr_billing_receive_event',[account,event('evt_retry')]);
  const item=await rpc('jr_billing_claim_event');
  assert.equal(await rpc('jr_billing_finish_event',[item.event_id,item.lease_token,'retry']),true);
  assert.equal(await rpc('jr_billing_claim_event'),null);
  await db.exec("update public.jr_billing_events set available_at=clock_timestamp()-interval '1 second' where event_id='evt_retry'");
  const retried=await rpc('jr_billing_claim_event');assert.equal(retried.attempts,2);
  await db.exec(`update public.jr_billing_events set attempts=10 where event_id='evt_retry'`);
  await rpc('jr_billing_finish_event',[retried.event_id,retried.lease_token,'retry']);
  assert.equal(await rpc('jr_billing_claim_event'),null);
  const {rows}=await db.query(`select state from public.jr_billing_events where event_id='evt_retry'`);assert.equal(rows[0].state,'review');
 });
});

test('a Checkout record cannot omit its approved billing interval',async()=>{
 await as('service_role',()=>assert.rejects(db.query(`insert into public.jr_billing_operations(organisation_id,customer_id,kind) values($1,'cus_B','checkout')`,[b]),/check constraint/));
});
test('repeated crashes exhaust the claim budget and require review',async()=>{
 await as('service_role',async()=>{
  await rpc('jr_billing_receive_event',[account,event('evt_crash')]);
  await rpc('jr_billing_claim_event');
  await db.exec(`update public.jr_billing_events set attempts=10,lease_expires_at=now()-interval '1 second' where event_id='evt_crash'`);
  assert.equal(await rpc('jr_billing_claim_event'),null);
  const {rows}=await db.query(`select state from public.jr_billing_events where event_id='evt_crash'`);assert.equal(rows[0].state,'review');
 });
});
test('RLS still denies browser reads and writes if a table grant is accidentally added',async()=>{
 await db.exec('grant select,insert,update,delete on public.jr_billing_events to authenticated');
 try{await as('authenticated',async()=>{
  assert.equal((await db.query('select * from public.jr_billing_events')).rows.length,0);
  await assert.rejects(db.query(`insert into public.jr_billing_events(account_id,event_id,payload) values($1,'evt_forged',$2)`,[account,event('evt_forged')]),/row-level security/);
  assert.equal((await db.query(`update public.jr_billing_events set state='review' returning event_id`)).rows.length,0);
  assert.equal((await db.query(`delete from public.jr_billing_events returning event_id`)).rows.length,0);
 });}finally{await db.exec('revoke select,insert,update,delete on public.jr_billing_events from authenticated');}
});
