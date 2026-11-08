import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';
let operator={},command={};
try{operator=await import('../lib/server/billingReviewOperator.mjs');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
try{command=await import('../scripts/review-billing.mjs');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const db=new PGlite(),org='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
const environment=()=>({NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-private-service',JR_OS_BILLING_REVIEW_RESOLUTION_ENABLED:'false'});
const decision=patch=>({organisationId:org,customerId:'cus_A',expectedVersion:1,resolutionId:id,operatorReference:'ops:case-100',note:'Verified current sandbox records under case OPS-100.',...patch});
const args=patch=>{const d=decision(patch);return ['--resolve','--organisation',d.organisationId,'--customer',d.customerId,'--version',String(d.expectedVersion),'--resolution-id',d.resolutionId,'--operator-reference',d.operatorReference,'--note',d.note];};
const fields={jr_billing_operator_review:['p_organisation_id'],jr_billing_resolve_review:['p_organisation_id','p_customer_id','p_expected_version','p_resolution_id','p_operator_reference','p_note']};
const rpc=async(name,parameters)=>{const r=await db.query(`select public.${name}(${parameters.map((_,i)=>'$'+(i+1)).join(',')}) as value`,parameters);return r.rows[0].value;};
async function mark(eventId='evt_one'){
 await rpc('jr_billing_receive_event',['acct_1UWyMhRxGUITlJWL',{id:eventId,object:'event',type:'charge.refunded',livemode:false,data:{object:{id:'ch_A'}}}]);const j=await rpc('jr_billing_claim_event',[]),c=await rpc('jr_billing_begin_reconciliation',[j.event_id,j.lease_token,'cus_A']);assert.equal(await rpc('jr_billing_mark_review',[j.event_id,j.lease_token,c.token,'refund','ch_A']),true);
}
function setup({env=environment(),transform,loseReply=false,response}={}){
 const calls=[];let lost=false;
 const fetchImpl=async(url,options)=>{
  const name=new URL(url).pathname.split('/').at(-1);calls.push({url,options,name});assert.ok(fields[name]);assert.equal(options.method,'POST');assert.equal(options.headers.apikey,'fixture-private-service');assert.equal(options.headers.Authorization,'Bearer fixture-private-service');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.ok(options.signal instanceof AbortSignal);
  if(response)return response();const p=JSON.parse(options.body),value=await rpc(name,fields[name].map(k=>p[k]));
  if(loseReply&&name==='jr_billing_resolve_review'&&!lost){lost=true;return new Response('private SQL/provider details',{status:500});}
  return Response.json(transform?transform(value,name):value);
 };
 const output=[];return {calls,output,fetchImpl,store:()=>operator.createBillingReviewOperator({env,fetchImpl}),run:argv=>command.runBillingReviewCommand({args:argv,env,fetchImpl,write:line=>output.push(line)})};
}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table public.organisations(id uuid primary key);create table public.profiles(id uuid primary key,organisation_id uuid,role text,active boolean);insert into public.organisations values('${org}'),('${other}');grant select on public.profiles to service_role;`);
 await db.exec(await readFile('supabase/migrations/20261101154212_subscription_billing_store.sql','utf8'));
});
beforeEach(async()=>{
 await db.exec('reset role;delete from public.jr_billing_review_resolutions;delete from public.jr_billing_review_signals;delete from public.jr_billing_subscriptions;delete from public.jr_billing_events;delete from public.jr_billing_customers');await db.query("insert into public.jr_billing_customers(organisation_id,customer_id) values($1,'cus_A'),($2,'cus_B')",[org,other]);await db.exec('set role service_role');await mark();
});after(()=>db.close());

test('default command inspects exact business evidence without writing or printing arbitrary private data',async()=>{
 const h=setup({transform:value=>({...value,email:'private@example.org',rawPayload:'private-secret'})});assert.equal(await h.run(['--organisation',org]),0);assert.deepEqual(h.calls.map(c=>c.name),['jr_billing_operator_review']);
 const value=JSON.parse(h.output.join(''));assert.equal(value.state,'held');assert.equal(value.reviewVersion,1);assert.equal(value.signals[0].eventId,'evt_one');assert.doesNotMatch(h.output.join(''),/private@example|rawPayload|private-secret|fixture-private/);
 assert.equal((await rpc('jr_billing_operator_review',[org])).state,'held');assert.equal((await db.query('select * from public.jr_billing_review_resolutions')).rows.length,0);
});
test('resolution requires the private flag and strict decision values before any network call',async()=>{
 const disabled=setup();await assert.rejects(disabled.store().resolve(decision()),{message:'billing_review_disabled'});assert.equal(disabled.calls.length,0);
 const enabled=setup({env:{...environment(),JR_OS_BILLING_REVIEW_RESOLUTION_ENABLED:'true'}});
 for(const patch of [{organisationId:'other'},{customerId:'cus_A/other'},{expectedVersion:'1'},{expectedVersion:-1},{expectedVersion:2147483648},{resolutionId:'invalid'},{operatorReference:'fake owner claim with spaces'},{note:'short'},{note:' x'.repeat(1000)},{note:'contains\0a secret'}])await assert.rejects(enabled.store().resolve(decision(patch)),{message:'billing_review_invalid_request'});
 assert.equal(enabled.calls.length,0);await assert.rejects(enabled.store().inspect('other'),{message:'billing_review_invalid_request'});
});
test('invalid command flags, duplicates and incomplete resolution arguments fail without I/O',async()=>{
 for(const argv of [[],['--organisation','wrong'],['--organisation',org,'--organisation',other],['--organisation',org,'--customer','cus_A'],['--resolve','--organisation',org],['--organisation',org,'--enabled','true'],['--help','--resolve'],args({expectedVersion:'01'})]){
  const h=setup({env:{...environment(),JR_OS_BILLING_REVIEW_RESOLUTION_ENABLED:'true'}});assert.equal(await h.run(argv),2);assert.deepEqual(JSON.parse(h.output.join('')),{code:'billing_review_invalid_request'});assert.equal(h.calls.length,0);
 }
});
test('private origins and credentials cannot fall back to browser keys or arbitrary destinations',()=>{
 for(const patch of [{NEXT_PUBLIC_SUPABASE_URL:'http://fixture.supabase.co'},{NEXT_PUBLIC_SUPABASE_URL:'https://user:pass@fixture.supabase.co'},{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co/path'},{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co/?token=private'},{SUPABASE_SERVICE_ROLE_KEY:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public'}])assert.throws(()=>setup({env:{...environment(),...patch}}).store(),{message:'billing_review_unavailable'});
});
test('lost replies are retryable with the same decision and never clear a later hold',async()=>{
 const h=setup({env:{...environment(),JR_OS_BILLING_REVIEW_RESOLUTION_ENABLED:'true'},loseReply:true});
 assert.equal(await h.run(args()),2);assert.deepEqual(JSON.parse(h.output.pop()),{code:'billing_review_unavailable'});assert.equal((await rpc('jr_billing_operator_review',[org])).state,'clear');
 assert.equal(await h.run(args()),0);assert.deepEqual(JSON.parse(h.output.pop()),{state:'already_recorded'});await mark('evt_later');
 assert.equal(await h.run(args()),0);assert.deepEqual(JSON.parse(h.output.pop()),{state:'already_recorded'});assert.equal((await rpc('jr_billing_operator_review',[org])).state,'held');assert.equal((await db.query('select * from public.jr_billing_review_resolutions')).rows.length,1);
});
test('the enabled command sends only the exact inspected decision to the service RPC',async()=>{
 const h=setup({env:{...environment(),JR_OS_BILLING_REVIEW_RESOLUTION_ENABLED:'true'},transform:value=>({...value,accessGranted:true,privateDetails:'secret'})});assert.equal(await h.run(args()),0);assert.deepEqual(JSON.parse(h.output.join('')),{state:'cleared'});
 assert.deepEqual(JSON.parse(h.calls[0].options.body),{p_organisation_id:org,p_customer_id:'cus_A',p_expected_version:1,p_resolution_id:id,p_operator_reference:decision().operatorReference,p_note:decision().note});assert.equal((await rpc('jr_billing_operator_review',[org])).state,'clear');
});
test('safe non-success outcomes are never promoted to clearance',async()=>{
 for(const state of ['stale','busy','unbound','not_held','needs_investigation','conflict']){
  const h=setup({env:{...environment(),JR_OS_BILLING_REVIEW_RESOLUTION_ENABLED:'true'},response:()=>Response.json({state,privateDetails:'secret'})});assert.equal(await h.run(args()),1);assert.deepEqual(JSON.parse(h.output.join('')),{state});
 }
});
test('malformed scope, version, marker and bounded signal responses fail closed',async()=>{
 for(const patch of [{organisationId:other},{customerId:'cus_A/forged'},{customerId:'cus_A_B'},{reviewVersion:'1'},{signalCount:-1},{signalCount:2},{truncated:'false'},{signals:[]},{review:{reason:'unsupported',sourceId:'ch_A',eventId:'evt_one',markedAtMs:Date.now()}},{state:'clear'}]){
  const h=setup({transform:value=>({...value,...patch})});await assert.rejects(h.store().inspect(org),{message:'billing_review_unavailable'});
 }
});
test('oversized, malformed, provider errors and private exceptions produce only fixed safe codes',async()=>{
 for(const response of [()=>new Response('private SQL details',{status:500}),()=>new Response('x'.repeat(32769)),()=>new Response('{broken'),()=>Response.json([]),()=>Response.json({state:'secret_state'})]){
  const h=setup({response});assert.equal(await h.run(['--organisation',org]),2);assert.deepEqual(JSON.parse(h.output.join('')),{code:'billing_review_unavailable'});
 }
 const output=[];assert.equal(await command.runBillingReviewCommand({args:['--organisation',org],env:environment(),fetchImpl:async()=>{throw Error('private token details');},write:line=>output.push(line)}),2);assert.doesNotMatch(output.join(''),/private token/);
});
test('help and actual CLI invalid usage exit without network or secret diagnostics',async()=>{
 const h=setup();assert.equal(await h.run(['--help']),0);assert.match(h.output.join(''),/--organisation/);assert.equal(h.calls.length,0);
 const result=spawnSync(process.execPath,['scripts/review-billing.mjs','--organisation','invalid'],{encoding:'utf8',env:{...process.env,...environment(),SUPABASE_SERVICE_ROLE_KEY:'never-print-this-secret'}});
 assert.equal(result.status,2);assert.deepEqual(JSON.parse(result.stdout),{code:'billing_review_invalid_request'});assert.equal(result.stderr,'');assert.doesNotMatch(result.stdout,/never-print|fixture-private|Error:/);
});
