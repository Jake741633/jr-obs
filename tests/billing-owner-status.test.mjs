import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),org='11111111-1111-4111-8111-111111111111',other='33333333-3333-4333-8333-333333333333',uid='22222222-2222-4222-8222-222222222222',session='44444444-4444-4444-8444-444444444444';
const rpc=async()=>{const r=await db.query('select public.jr_billing_owner_status() as value');return r.rows[0].value;};
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;
 create table public.organisations(id uuid primary key);create table public.profiles(id uuid primary key,organisation_id uuid,role text,active boolean,customer_source_id text);create table auth.sessions(id uuid,user_id uuid);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.claims',true),''),'{}')::jsonb $$;
 create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
 insert into public.organisations values('${org}'),('${other}');insert into public.profiles values('${uid}','${org}','owner',true,null);`);
 await db.exec(await readFile('supabase/migrations/20260809_037_enforce_active_auth_sessions.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261101154212_subscription_billing_store.sql','utf8'));
 await db.query(`insert into public.jr_billing_customers(organisation_id,customer_id) values($1,'cus_Own'),($2,'cus_Other')`,[org,other]);
 await db.query(`insert into public.jr_billing_subscriptions(organisation_id,customer_id,subscription_id,price_id,status,paid_through,paid_invoice_id) values($1,'cus_Own','sub_Own','price_1UX0fdRxGUITlJWLXoEGdcBE','active',to_timestamp(1792678400),'in_Own'),($2,'cus_Other','sub_Other','price_1UX0fpRxGUITlJWLs2gwl34S','active',to_timestamp(1821536000),'in_Other')`,[org,other]);
});
beforeEach(async()=>{await db.exec('reset role');await db.exec(`update public.profiles set role='owner',active=true;delete from auth.sessions;insert into auth.sessions values('${session}','${uid}');`);await db.query("select set_config('test.user_id',$1,false),set_config('test.claims',$2,false)",[uid,JSON.stringify({session_id:session,is_anonymous:false})]);await db.exec('set role authenticated');});
after(()=>db.close());
test('active owner with a live session reads only sanitized own-business billing',async()=>{
 const data=await rpc();assert.equal(data.actorUserId,uid);assert.equal(data.organisationId,org);assert.equal(data.subscription.plan,'monthly');assert.equal(data.subscription.paidThroughMs,1792678400000);assert.equal(data.mode,'test');
 assert.equal(JSON.stringify(data).includes('cus_'),false);assert.equal(JSON.stringify(data).includes('sub_'),false);assert.equal(JSON.stringify(data).includes('in_'),false);
});
test('non-owner roles cannot call the privileged billing status helper',async()=>{
 for(const role of ['admin','office','electrician','customer']){await db.exec('reset role');await db.query('update public.profiles set role=$1',[role]);await db.exec('set role authenticated');await assert.rejects(rpc(),/billing_access_denied/);}
});
test('inactive membership, revoked session and anonymous claims deny owner billing reads',async()=>{
 await db.exec('reset role');await db.exec('update public.profiles set active=false');await db.exec('set role authenticated');await assert.rejects(rpc(),/billing_access_denied/);
 await db.exec('reset role');await db.exec('update public.profiles set active=true;delete from auth.sessions');await db.exec('set role authenticated');await assert.rejects(rpc(),/billing_access_denied/);
 await db.exec('reset role');await db.exec(`insert into auth.sessions values('${session}','${uid}')`);await db.query("select set_config('test.claims',$1,false)",[JSON.stringify({session_id:session,is_anonymous:true})]);await db.exec('set role authenticated');await assert.rejects(rpc(),/billing_access_denied/);
});
test('signed-out database role has no status RPC execution permission',async()=>{
 await db.exec('reset role;set role anon');await assert.rejects(rpc(),/permission denied/);
});

test('a signed recovery-session claim cannot read billing through the RPC directly',async()=>{
 await db.exec('reset role');await db.query("select set_config('test.claims',$1,false)",[JSON.stringify({session_id:session,is_anonymous:false,amr:[{method:'recovery',timestamp:1790000000}]})]);await db.exec('set role authenticated');
 await assert.rejects(rpc(),/billing_access_denied/);
});
