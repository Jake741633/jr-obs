import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {startBillingCheckout,createBillingCheckoutStore} from '../lib/server/billingCheckout.mjs';
const db=new PGlite(),org='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222',owner={organisationId:org,userId:actor,role:'owner'};
const order={jr_billing_reserve_checkout:['p_organisation_id','p_actor_id','p_plan'],jr_billing_bind_checkout_customer:['p_operation_id','p_lease_token','p_actor_id','p_customer_id'],jr_billing_record_checkout_session:['p_operation_id','p_lease_token','p_actor_id','p_session_id','p_expires_at'],jr_billing_release_checkout:['p_operation_id','p_lease_token','p_actor_id','p_outcome']};
function store({loseRecord=false}={}){return createBillingCheckoutStore({env:{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,options)=>{
 const name=new URL(url).pathname.split('/').at(-1),body=JSON.parse(options.body),keys=order[name];assert.ok(keys);
 try{const value=(await db.query(`select public.${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) as value`,keys.map(k=>body[k]))).rows[0].value;if(loseRecord&&name==='jr_billing_record_checkout_session')return new Response('lost',{status:500});return Response.json(value);}catch{return new Response('private database error',{status:500});}
 }});}
function provider(){const customers=new Map(),sessions=new Map(),creates=[];let lostCustomer=false,expire=false;
 return {customers,sessions,creates,loseCustomer(){lostCustomer=true;},expire(){expire=true;},async createBillingCustomer(op){creates.push(['customer',op.operationId]);if(!customers.has(op.operationId))customers.set(op.operationId,'cus_A');if(lostCustomer){lostCustomer=false;throw Error('provider unavailable');}return {customerId:customers.get(op.operationId)};},async createCheckout(op){creates.push(['checkout',op.operationId]);if(!sessions.has(op.operationId))sessions.set(op.operationId,{sessionId:'cs_test_'+String(sessions.size+1),url:'https://checkout.stripe.com/c/pay/test',status:'open',expiresAt:op.expiresAt,subscriptionId:null});return sessions.get(op.operationId);},async readCheckoutSession(op){const value=[...sessions.values()].find(s=>s.sessionId===op.sessionId);return {...value,status:expire&&value===[...sessions.values()][0]?'expired':value.status};}};
}
const run=(gateway,options={})=>startBillingCheckout({owner,plan:'monthly',store:store(),gateway,revalidateOwner:async()=>true,...options});
before(async()=>{await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table public.organisations(id uuid primary key);create table public.profiles(id uuid primary key,organisation_id uuid,role text,active boolean);grant select on public.profiles to service_role;insert into public.organisations values('${org}');insert into public.profiles values('${actor}','${org}','owner',true);`);await db.exec(await readFile('supabase/migrations/20261101154212_subscription_billing_store.sql','utf8'));});
beforeEach(()=>db.exec('reset role;delete from public.jr_billing_operations;delete from public.jr_billing_subscriptions;delete from public.jr_billing_customers;set role service_role'));after(()=>db.close());
test('one durable operation binds the customer and resumes the same open session on repeated clicks',async()=>{
 const gateway=provider(),first=await run(gateway),second=await run(gateway);assert.deepEqual(second,first);assert.equal(first.url,'https://checkout.stripe.com/c/pay/test');assert.equal(gateway.creates.filter(c=>c[0]==='customer').length,1);assert.equal(gateway.creates.filter(c=>c[0]==='checkout').length,1);assert.equal('paidFeatures'in first,false);
});
test('lost customer creation responses retry the same persisted operation',async()=>{
 const gateway=provider();gateway.loseCustomer();await assert.rejects(run(gateway),/billing_checkout_unavailable/);await run(gateway);assert.equal(gateway.customers.size,1);const calls=gateway.creates.filter(c=>c[0]==='customer');assert.equal(calls[0][1],calls[1][1]);
});
test('a committed session whose database response was lost is resumed without another creation',async()=>{
 const gateway=provider();await assert.rejects(run(gateway,{store:store({loseRecord:true})}),/billing_checkout_unavailable/);await run(gateway);assert.equal(gateway.creates.filter(c=>c[0]==='checkout').length,1);
});
test('provider-confirmed expired sessions can be replaced using the existing bound customer',async()=>{
 const gateway=provider();const first=await run(gateway);gateway.expire();const second=await run(gateway);assert.notEqual(second.sessionId,first.sessionId);assert.equal(gateway.creates.filter(c=>c[0]==='customer').length,1);
});
test('retired owner contexts prevent provider creation and old uncertain attempts require review',async()=>{
 const gateway=provider();await assert.rejects(run(gateway,{revalidateOwner:async()=>false}),/billing_checkout_denied/);assert.equal(gateway.creates.length,0);
 gateway.loseCustomer();await assert.rejects(run(gateway));await db.exec("update public.jr_billing_operations set created_at=clock_timestamp()-interval '21 minutes'");await assert.rejects(run(gateway),/billing_checkout_review/);assert.equal(gateway.customers.size,1);
});
test('an existing provider subscription blocks new creation and no caller can choose a raw price',async()=>{
 const gateway=provider();gateway.createCheckout=async()=>{throw Error('billing_already_subscribed');};await assert.rejects(run(gateway),/billing_already_subscribed/);assert.equal((await db.query('select state from public.jr_billing_operations')).rows[0].state,'failed');
 await assert.rejects(run(gateway,{plan:'price_arbitrary'}),/billing_checkout_invalid/);
});

test('completed attempts remain resumable and a provider-confirmed ended subscription can sign up again',async()=>{
 const gateway=provider(),first=await run(gateway),read=gateway.readCheckoutSession;let status='active';
 gateway.readSubscriptionStatus=async()=>({status});
 gateway.readCheckoutSession=async op=>op.sessionId===first.sessionId?{...await read(op),status:'complete',subscriptionId:'sub_A'}:read(op);
 await assert.rejects(run(gateway),/billing_already_subscribed/);
 assert.equal((await db.query('select state from public.jr_billing_operations')).rows[0].state,'ready');
 status='canceled';const next=await run(gateway);assert.notEqual(next.sessionId,first.sessionId);assert.equal(gateway.creates.filter(c=>c[0]==='customer').length,1);
});
test('service reservation refuses a held customer before creating or resuming an operation',async()=>{
 await db.query("insert into public.jr_billing_customers(organisation_id,customer_id,review_required,review_reason,review_source_id,review_event_id,review_marked_at) values($1,'cus_A',true,'refund','ch_A','evt_A',clock_timestamp())",[org]);
 assert.deepEqual(await store().reserve(owner,'monthly'),{state:'review'});assert.equal((await db.query('select * from public.jr_billing_operations')).rows.length,0);
 const gateway=provider();await assert.rejects(run(gateway),/billing_checkout_review/);assert.equal(gateway.creates.length,0);
});
