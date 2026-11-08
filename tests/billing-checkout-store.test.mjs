import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),org='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222';
const rpc=async(name,args)=>{const r=await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args);return r.rows[0].value;};
const reserve=(plan='monthly',user=actor)=>rpc('jr_billing_reserve_checkout',[org,user,plan]);
before(async()=>{await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table public.organisations(id uuid primary key);create table public.profiles(id uuid primary key,organisation_id uuid,role text,active boolean);grant select on public.profiles to service_role;insert into public.organisations values('${org}');insert into public.profiles values('${actor}','${org}','owner',true);`);await db.exec(await readFile('supabase/migrations/20261101154212_subscription_billing_store.sql','utf8'));});
beforeEach(async()=>{await db.exec('reset role;delete from public.jr_billing_operations;delete from public.jr_billing_subscriptions;delete from public.jr_billing_customers;update public.profiles set active=true;set role service_role');});after(()=>db.close());
test('one owner operation is reserved and concurrent clicks cannot start another',async()=>{
 const first=await reserve();assert.equal(first.state,'reserved');assert.equal(first.operation.customerId,null);assert.equal((await reserve()).state,'busy');assert.equal((await reserve('annual')).state,'conflict');
 await db.exec("update public.jr_billing_operations set reservation_expires_at=clock_timestamp()-interval '1 second'");
 const next=await reserve();assert.equal(next.operation.operationId,first.operation.operationId);assert.notEqual(next.operation.leaseToken,first.operation.leaseToken);
});
test('binding requires the current lease and persists one customer per business',async()=>{
 const first=(await reserve()).operation;
 assert.equal(await rpc('jr_billing_bind_checkout_customer',[first.operationId,first.leaseToken,actor,'cus_A']),true);
 assert.equal((await db.query('select customer_id from public.jr_billing_customers')).rows[0].customer_id,'cus_A');
 await assert.rejects(rpc('jr_billing_bind_checkout_customer',[first.operationId,first.leaseToken,actor,'cus_other']),/billing_checkout_conflict/);
 await db.exec("update public.jr_billing_operations set reservation_expires_at=clock_timestamp()-interval '1 second'");
 assert.equal(await rpc('jr_billing_bind_checkout_customer',[first.operationId,first.leaseToken,actor,'cus_A']),false);
});
test('recorded sessions resume and only confirmed expiration permits a fresh operation',async()=>{
 const op=(await reserve()).operation;await rpc('jr_billing_bind_checkout_customer',[op.operationId,op.leaseToken,actor,'cus_A']);
 assert.equal(await rpc('jr_billing_record_checkout_session',[op.operationId,op.leaseToken,actor,'cs_test_A',op.expiresAt]),true);
 const resumed=(await reserve()).operation;assert.equal(resumed.operationId,op.operationId);assert.equal(resumed.providerSessionId,'cs_test_A');
 assert.equal(await rpc('jr_billing_release_checkout',[resumed.operationId,resumed.leaseToken,actor,'expired']),true);
 const replacement=(await reserve('annual')).operation;assert.notEqual(replacement.operationId,op.operationId);assert.equal(replacement.customerId,'cus_A');
});
test('unknown old creation outcomes and existing subscriptions prevent fresh signup',async()=>{
 await reserve();await db.exec("update public.jr_billing_operations set created_at=clock_timestamp()-interval '21 minutes',reservation_expires_at=clock_timestamp()-interval '1 second'");assert.equal((await reserve()).state,'review');
 await db.exec('delete from public.jr_billing_operations');await db.query(`insert into public.jr_billing_customers(organisation_id,customer_id) values($1,'cus_A')`,[org]);await db.query(`insert into public.jr_billing_subscriptions(organisation_id,customer_id,subscription_id,price_id,status) values($1,'cus_A','sub_A','price_1UX0fdRxGUITlJWLXoEGdcBE','active')`,[org]);assert.equal((await reserve()).state,'subscribed');
});
test('wrong or revoked owners and browser database roles cannot reserve or bind',async()=>{
 await assert.rejects(reserve('monthly','33333333-3333-4333-8333-333333333333'),/billing_checkout_denied/);
 await db.exec('reset role;update public.profiles set active=false;set role service_role');await assert.rejects(reserve(),/billing_checkout_denied/);
 await db.exec('reset role;set role authenticated');await assert.rejects(reserve(),/permission denied/);
});

test('a missing reservation token cannot bind or record a provider result',async()=>{
 const op=(await reserve()).operation;await db.exec('update public.jr_billing_operations set reservation_token=null,reservation_expires_at=null');
 assert.equal(await rpc('jr_billing_bind_checkout_customer',[op.operationId,null,actor,'cus_A']),false);
 assert.equal(await rpc('jr_billing_record_checkout_session',[op.operationId,null,actor,'cs_test_A',op.expiresAt]),false);
 assert.equal(await rpc('jr_billing_release_checkout',[op.operationId,null,actor,'retry']),false);
});
