import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createBillingPortalHandler,createBillingPortalStore} from '../lib/server/billingPortal.mjs';
const db=new PGlite(),org='11111111-1111-4111-8111-111111111111',uid='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',sid='44444444-4444-4444-8444-444444444444';
const owner={organisationId:org,userId:uid,role:'owner'};
const env=()=>({JR_OS_BILLING_PORTAL_ENABLED:'true',JR_OS_BILLING_WEBHOOK_ENABLED:'true',JR_OS_BILLING_RECONCILIATION_ENABLED:'true',JR_OS_BILLING_SANDBOX_VERIFIED:'true',NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-public',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',STRIPE_MODE:'test',STRIPE_ACCOUNT_ID:'acct_1UWyMhRxGUITlJWL',STRIPE_RESTRICTED_KEY:'rk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_PRICE_MONTHLY:'price_1UX0fdRxGUITlJWLXoEGdcBE',STRIPE_PRICE_ANNUAL:'price_1UX0fpRxGUITlJWLs2gwl34S',STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture',APP_ORIGIN:'https://jr-os.example'});
const request=(patch={})=>new Request('https://jr-os.example/api/billing/portal',{method:'POST',headers:{Origin:'https://jr-os.example',Authorization:'Bearer fixture-user','x-jr-organisation':org,'Content-Type':'application/json',...patch.headers},body:patch.body??'{}',signal:patch.signal});
const order={jr_billing_reserve_portal:['p_organisation_id','p_actor_id'],jr_billing_finish_portal:['p_operation_id','p_lease_token','p_actor_id','p_session_id']};
function setup({environment=env(),afterRpc,providerError,providerResult,providerWork}={}){
 const calls=[],operations=[];
 const gateway={async createPortal(op){operations.push(op);await providerWork?.();if(providerError)throw Error(providerError);return providerResult??{sessionId:'bps_A',url:'https://billing.stripe.com/p/session/A'};}};
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});if(url.endsWith('/auth/v1/user'))return Response.json({id:uid,is_anonymous:false});
  const name=new URL(url).pathname.split('/').at(-1),parameters=JSON.parse(options.body??'{}'),isOwner=name==='jr_billing_owner_status';
  assert.equal(options.headers.apikey,isOwner?'fixture-public':'fixture-service');assert.equal(options.headers.Authorization,isOwner?'Bearer fixture-user':'Bearer fixture-service');
  try{
   const value=await db.transaction(async tx=>{await tx.exec('set local role '+(isOwner?'authenticated':'service_role'));const fields=isOwner?[]:order[name];assert.ok(fields,'Only known billing RPCs');return (await tx.query(`select public.${name}(${fields.map((_,i)=>'$'+(i+1)).join(',')}) as value`,fields.map(k=>parameters[k]))).rows[0].value;});
   await afterRpc?.(name,value);return Response.json(value);
  }catch(error){return Response.json({message:'private SQL details'},{status:error.code==='42501'?403:500});}
 };
 return {calls,operations,fetchImpl,handler:createBillingPortalHandler({env:environment,fetchImpl,createGateway:()=>gateway})};
}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;
 create table public.organisations(id uuid primary key);create table public.profiles(id uuid primary key,organisation_id uuid,role text,active boolean,customer_source_id text);create table public.customers(organisation_id uuid,source_id text,deleted_at timestamptz);create table auth.sessions(id uuid,user_id uuid);grant select on public.profiles to service_role;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.claims',true),''),'{}')::jsonb $$;
 create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
 insert into public.organisations values('${org}'),('${other}');insert into public.profiles values('${uid}','${org}','owner',true,null);`);
 await db.exec(await readFile('supabase/migrations/20260809_037_enforce_active_auth_sessions.sql','utf8'));
 const latest=await readFile('supabase/migrations/20260813215116_revoke_deleted_customer_portals.sql','utf8');
 for(const definition of latest.matchAll(/create or replace function private\.[\s\S]*?\$\$;/g))await db.exec(definition[0]);
 await db.exec(await readFile('supabase/migrations/20261101154212_subscription_billing_store.sql','utf8'));
});
beforeEach(async()=>{
 await db.exec("delete from public.jr_billing_operations;delete from public.jr_billing_customers;delete from auth.sessions;update public.profiles set active=true,role='owner'");
 await db.query('insert into auth.sessions values($1,$2)',[sid,uid]);await db.query("select set_config('test.user_id',$1,false),set_config('test.claims',$2,false)",[uid,JSON.stringify({session_id:sid,is_anonymous:false,amr:[{method:'password'}]})]);
 await db.query("insert into public.jr_billing_customers(organisation_id,customer_id) values($1,'cus_Own'),($2,'cus_Other')",[org,other]);
});after(()=>db.close());
test('portal stays off before all server readiness gates and private setup pass',async()=>{
 for(const [key,value] of [['JR_OS_BILLING_PORTAL_ENABLED','false'],['JR_OS_BILLING_WEBHOOK_ENABLED','false'],['JR_OS_BILLING_RECONCILIATION_ENABLED','false'],['JR_OS_BILLING_SANDBOX_VERIFIED','false'],['STRIPE_MODE','live'],['SUPABASE_SERVICE_ROLE_KEY','']]){
  const h=setup({environment:{...env(),[key]:value}}),res=await h.handler(request());assert.equal(res.status,503);assert.equal(h.operations.length,0);if(key.startsWith('JR_OS_'))assert.equal(h.calls.length,0);
 }
});
test('normal owner gets only their bound customer portal after a durable attempt; repeat is fresh',async()=>{
 const h=setup(),res=await h.handler(request());assert.equal(res.status,200);assert.deepEqual(await res.json(),{mode:'test',sessionId:'bps_A',url:'https://billing.stripe.com/p/session/A'});assert.match(res.headers.get('cache-control'),/no-store/);
 assert.equal(h.operations[0].customerId,'cus_Own');assert.equal(h.operations[0].organisationId,org);
 const saved=(await db.query('select * from public.jr_billing_operations')).rows;assert.equal(saved.length,1);assert.equal(saved[0].state,'succeeded');assert.equal(saved[0].provider_session_id,'bps_A');assert.equal(JSON.stringify(saved).includes('https://'),false);
 assert.equal((await h.handler(request())).status,200);assert.equal(h.operations.length,2);assert.notEqual(h.operations[0].operationId,h.operations[1].operationId);
});
test('portal rejects resource substitution, wrong origin, missing bearer and cross-business selection',async()=>{
 for(const patch of [{body:'{"customerId":"cus_Other"}'},{body:'{"returnUrl":"https://evil.example"}'},{body:'{"enabled":true}'},{headers:{Origin:'https://evil.example'}},{headers:{Authorization:''}},{headers:{'x-jr-organisation':other}}]){
  const h=setup(),res=await h.handler(request(patch));assert.ok([400,401,403].includes(res.status));assert.equal(h.operations.length,0);if(patch.body||patch.headers?.Origin||patch.headers?.Authorization==='')assert.equal(h.calls.length,0);
 }
});
test('staff, deleted sessions, recovery and inactive owners receive no link',async()=>{
 for(const sql of ["update public.profiles set role='admin'","update public.profiles set role='office'","delete from auth.sessions","update public.profiles set active=false"]){
  await db.exec(sql);const h=setup();assert.equal((await h.handler(request())).status,403);assert.equal(h.operations.length,0);await db.exec("update public.profiles set role='owner',active=true;delete from auth.sessions");await db.query('insert into auth.sessions values($1,$2)',[sid,uid]);
 }
 await db.query("select set_config('test.claims',$1,false)",[JSON.stringify({session_id:sid,is_anonymous:false,amr:[{method:'recovery'}]})]);const h=setup();assert.equal((await h.handler(request())).status,403);assert.equal(h.operations.length,0);
});
test('a customer must already be server-bound before portal access',async()=>{
 await db.query('delete from public.jr_billing_customers where organisation_id=$1',[org]);const h=setup(),res=await h.handler(request());assert.equal(res.status,409);assert.deepEqual(await res.json(),{code:'billing_portal_not_started'});assert.equal(h.operations.length,0);
});
test('busy portal leases and stale completion cannot be bypassed by a second request',async()=>{
 const h=setup(),store=createBillingPortalStore({env:env(),fetchImpl:h.fetchImpl}),first=await store.reserve(owner);
 assert.equal(first.state,'reserved');assert.equal((await h.handler(request())).status,409);assert.equal(h.operations.length,0);
 await db.exec("update public.jr_billing_operations set reservation_expires_at=clock_timestamp()-interval '1 second'");
 const next=await store.reserve(owner);assert.equal(next.state,'reserved');assert.notEqual(next.operation.operationId,first.operation.operationId);
 assert.equal(await store.finish(first.operation,owner,'bps_Stale'),false);assert.equal(await store.finish(next.operation,owner,'bps_Current'),true);
 const states=(await db.query('select state,provider_session_id from public.jr_billing_operations order by created_at')).rows;assert.deepEqual(states.map(x=>x.state),['expired','succeeded']);assert.equal(states[0].provider_session_id,null);
});
test('browser roles cannot reserve or complete portal operations directly',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);try{await assert.rejects(db.query('select public.jr_billing_reserve_portal($1,$2)',[org,uid]),/permission denied/);await assert.rejects(db.query('select public.jr_billing_finish_portal($1,$2,$3,$4)',[sid,sid,uid,'bps_Forged']),/permission denied/);}finally{await db.exec('reset role');}
 }
});
test('owner revocation or disconnect after reserve or completion prevents URL delivery',async()=>{
 for(const point of ['jr_billing_reserve_portal','jr_billing_finish_portal'])for(const kind of ['revoke','abort']){
  await db.exec("delete from public.jr_billing_operations;update public.profiles set active=true");const controller=new AbortController();let fired=false;
  const h=setup({afterRpc:async name=>{if(name!==point||fired)return;fired=true;if(kind==='revoke')await db.exec('update public.profiles set active=false');else controller.abort();}}),res=await h.handler(request({signal:controller.signal}));
  assert.equal(res.status,403);assert.deepEqual(await res.json(),{code:'billing_portal_denied'});if(point==='jr_billing_reserve_portal')assert.equal(h.operations.length,0);
 }
});
test('provider errors, malformed results and expired completion return safe errors without a URL',async()=>{
 for(const opts of [{providerError:'rk_test_private_details'},{providerResult:{sessionId:'bps_X',url:'https://evil.example'}},{providerResult:{sessionId:'cs_test_Wrong',url:'https://billing.stripe.com/p/session/X'}},{providerWork:()=>db.exec("update public.jr_billing_operations set reservation_expires_at=clock_timestamp()-interval '1 second'")}]){
  await db.exec('delete from public.jr_billing_operations');const h=setup(opts),res=await h.handler(request());assert.equal(res.status,503);assert.deepEqual(await res.json(),{code:'billing_portal_unavailable'});
 }
});
