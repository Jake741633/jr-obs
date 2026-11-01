import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createBillingCheckoutHandler} from '../lib/server/billingCheckoutApi.mjs';
const db=new PGlite(),org='11111111-1111-4111-8111-111111111111',uid='22222222-2222-4222-8222-222222222222',sid='44444444-4444-4444-8444-444444444444';
const env=()=>({JR_OS_BILLING_CHECKOUT_ENABLED:'true',JR_OS_BILLING_SCHEDULE_ENABLED:'true',JR_OS_BILLING_WEBHOOK_ENABLED:'true',JR_OS_BILLING_RECONCILIATION_ENABLED:'true',JR_OS_BILLING_SANDBOX_VERIFIED:'true',NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-public',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',STRIPE_MODE:'test',STRIPE_ACCOUNT_ID:'acct_1UWyMhRxGUITlJWL',STRIPE_RESTRICTED_KEY:'rk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_PRICE_MONTHLY:'price_1UX0fdRxGUITlJWLXoEGdcBE',STRIPE_PRICE_ANNUAL:'price_1UX0fpRxGUITlJWLs2gwl34S',STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture',APP_ORIGIN:'https://jr-os.example'});
const request=(patch={})=>new Request('https://jr-os.example/api/billing/checkout',{method:'POST',headers:{Origin:'https://jr-os.example',Authorization:'Bearer fixture-user','x-jr-organisation':org,'Content-Type':'application/json',...patch.headers},body:patch.body??'{"plan":"monthly"}',signal:patch.signal});
const order={jr_billing_reserve_checkout:['p_organisation_id','p_actor_id','p_plan'],jr_billing_bind_checkout_customer:['p_operation_id','p_lease_token','p_actor_id','p_customer_id'],jr_billing_record_checkout_session:['p_operation_id','p_lease_token','p_actor_id','p_session_id','p_expires_at'],jr_billing_release_checkout:['p_operation_id','p_lease_token','p_actor_id','p_outcome']};
function setup({environment=env(),revokeAt,providerError,abortAfter}={}){
 const calls=[],writes=[],sessions=new Map();
 const gateway={async createBillingCustomer(op){writes.push('customer');return {customerId:'cus_A',op};},async createCheckout(op){writes.push('checkout');if(providerError)throw Error(providerError);const value={sessionId:'cs_test_A',url:'https://checkout.stripe.com/c/pay/A',status:'open',expiresAt:op.expiresAt,subscriptionId:null};sessions.set(value.sessionId,value);return value;},async readCheckoutSession(op){return sessions.get(op.sessionId);},async readSubscriptionStatus(){return {status:'active'};}};
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});if(url.endsWith('/auth/v1/user'))return Response.json({id:uid,is_anonymous:false});
  const name=new URL(url).pathname.split('/').at(-1),parameters=JSON.parse(options.body??'{}'),isOwner=name==='jr_billing_owner_status';
  assert.equal(options.headers.apikey,isOwner?'fixture-public':'fixture-service');assert.equal(options.headers.Authorization,isOwner?'Bearer fixture-user':'Bearer fixture-service');
  try{
   const result=await db.transaction(async tx=>{await tx.exec('set local role '+(isOwner?'authenticated':'service_role'));const fields=isOwner?[]:order[name];assert.ok(fields,'Only known RPCs');return (await tx.query(`select public.${name}(${fields.map((_,i)=>'$'+(i+1)).join(',')}) as value`,fields.map(k=>parameters[k]))).rows[0].value;});
   if(name===revokeAt)await db.exec('update public.profiles set active=false');if(name===abortAfter?.name)abortAfter.controller.abort();return Response.json(result);
  }catch(error){return Response.json({message:'private SQL details'},{status:error.code==='42501'?403:500});}
 };
 return {calls,writes,handler:createBillingCheckoutHandler({env:environment,fetchImpl,createGateway:()=>gateway})};
}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;
 create table public.organisations(id uuid primary key);create table public.profiles(id uuid primary key,organisation_id uuid,role text,active boolean,customer_source_id text);create table public.customers(organisation_id uuid,source_id text,deleted_at timestamptz);create table auth.sessions(id uuid,user_id uuid);grant select on public.profiles to service_role;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.claims',true),''),'{}')::jsonb $$;
 create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
 insert into public.organisations values('${org}');insert into public.profiles values('${uid}','${org}','owner',true,null);`);
 await db.exec(await readFile('supabase/migrations/20260809_037_enforce_active_auth_sessions.sql','utf8'));
 const latest=await readFile('supabase/migrations/20260813215116_revoke_deleted_customer_portals.sql','utf8');
 for(const definition of latest.matchAll(/create or replace function private\.[\s\S]*?\$\$;/g))await db.exec(definition[0]);
 await db.exec(await readFile('supabase/migrations/20261101154212_subscription_billing_store.sql','utf8'));
});
beforeEach(async()=>{await db.exec('delete from public.jr_billing_operations;delete from public.jr_billing_subscriptions;delete from public.jr_billing_customers;delete from auth.sessions;update public.profiles set active=true,role=\'owner\'');await db.query('insert into auth.sessions values($1,$2)',[sid,uid]);await db.query("select set_config('test.user_id',$1,false),set_config('test.claims',$2,false)",[uid,JSON.stringify({session_id:sid,is_anonymous:false,amr:[{method:'password'}]})]);});after(()=>db.close());
test('disabled or unverified environments make no auth/database/provider calls',async()=>{
 for(const key of ['JR_OS_BILLING_CHECKOUT_ENABLED','JR_OS_BILLING_WEBHOOK_ENABLED','JR_OS_BILLING_RECONCILIATION_ENABLED','JR_OS_BILLING_SANDBOX_VERIFIED','JR_OS_BILLING_SCHEDULE_ENABLED']){const h=setup({environment:{...env(),[key]:'false'}}),res=await h.handler(request());assert.equal(res.status,503);assert.equal(h.calls.length,0);assert.equal(h.writes.length,0);}
});
test('normal owner gets a persisted sandbox Session and repeated requests reuse it',async()=>{
 const h=setup(),res=await h.handler(request());assert.equal(res.status,200);assert.deepEqual(await res.json(),{mode:'test',sessionId:'cs_test_A',url:'https://checkout.stripe.com/c/pay/A'});assert.match(res.headers.get('cache-control'),/no-store/);
 const repeated=await h.handler(request());assert.equal(repeated.status,200);assert.deepEqual(h.writes,['customer','checkout']);assert.equal((await db.query('select state from public.jr_billing_operations')).rows[0].state,'ready');
});
test('wrong origin, missing bearer and body-supplied resources are rejected before network',async()=>{
 for(const patch of [{headers:{Origin:'https://evil.example'}},{headers:{Authorization:''}},{body:'{"plan":"monthly","customerId":"cus_wrong"}'},{body:'{"plan":"price_other"}'},{body:'{"plan":"annual","verified":true}'}]){const h=setup(),res=await h.handler(request(patch));assert.ok([400,401,403].includes(res.status));assert.equal(h.calls.length,0);assert.equal(h.writes.length,0);}
});
test('cross-business, staff, revoked and recovery sessions cannot start Checkout',async()=>{
 const cross=setup();assert.equal((await cross.handler(request({headers:{'x-jr-organisation':'33333333-3333-4333-8333-333333333333'}}))).status,403);assert.equal(cross.writes.length,0);
 await db.exec("update public.profiles set role='admin'");const staff=setup();assert.equal((await staff.handler(request())).status,403);assert.equal(staff.writes.length,0);
 await db.exec("update public.profiles set role='owner';delete from auth.sessions");const revoked=setup();assert.equal((await revoked.handler(request())).status,403);
 await db.query('insert into auth.sessions values($1,$2)',[sid,uid]);await db.query("select set_config('test.claims',$1,false)",[JSON.stringify({session_id:sid,is_anonymous:false,amr:[{method:'recovery'}]})]);const recovery=setup();assert.equal((await recovery.handler(request())).status,403);assert.equal(recovery.writes.length,0);
});
test('revocation after reservation prevents provider writes; revocation after recording prevents a URL response',async()=>{
 const first=setup({revokeAt:'jr_billing_reserve_checkout'});assert.equal((await first.handler(request())).status,403);assert.equal(first.writes.length,0);
 await db.exec('delete from public.jr_billing_operations;update public.profiles set active=true');const last=setup({revokeAt:'jr_billing_record_checkout_session'});const res=await last.handler(request());assert.equal(res.status,403);assert.deepEqual(await res.json(),{code:'billing_checkout_denied'});
});
test('cancelled requests and private provider errors never expose a link or unsafe message',async()=>{
 const controller=new AbortController();controller.abort();const h=setup();assert.equal((await h.handler(request({signal:controller.signal}))).status,403);assert.equal(h.writes.length,0);
 const bad=setup({providerError:'rk_test_private_provider_details'}),res=await bad.handler(request());assert.equal(res.status,503);assert.deepEqual(await res.json(),{code:'billing_checkout_unavailable'});
});


test('disconnects after reservation or session persistence return no URL and retry reuses one durable session',async()=>{
 for(const name of ['jr_billing_reserve_checkout','jr_billing_record_checkout_session']){
  await db.exec('delete from public.jr_billing_operations;delete from public.jr_billing_customers');
  const controller=new AbortController(),h=setup({abortAfter:{name,controller}});
  const interrupted=await h.handler(request({signal:controller.signal}));assert.equal(interrupted.status,403);assert.deepEqual(await interrupted.json(),{code:'billing_checkout_denied'});
  const resumed=await h.handler(request());assert.equal(resumed.status,200);assert.equal((await resumed.json()).sessionId,'cs_test_A');assert.deepEqual(h.writes,['customer','checkout']);assert.equal((await db.query('select * from public.jr_billing_operations')).rows.length,1);
 }
});
