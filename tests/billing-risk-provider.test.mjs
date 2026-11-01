import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import Stripe from 'stripe';
import {createStripeBillingGateway,readStripeBillingConfig} from '../lib/server/stripeBilling.mjs';
import {evidence} from './helpers/billingEvidence.mjs';
const env={STRIPE_MODE:'test',STRIPE_ACCOUNT_ID:'acct_1UWyMhRxGUITlJWL',STRIPE_RESTRICTED_KEY:'rk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_PRICE_MONTHLY:'price_1UX0fdRxGUITlJWLXoEGdcBE',STRIPE_PRICE_ANNUAL:'price_1UX0fpRxGUITlJWLs2gwl34S',STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture',APP_ORIGIN:'https://jr-os.example'};
const kinds=[['charge.refunded','ch_A','refund'],['charge.dispute.created','dp_A','dispute'],['radar.early_fraud_warning.created','issfr_A','fraud'],['credit_note.created','cn_A','credit_note']];
const event=(type,id,patch={})=>({id:'evt_A',object:'event',type,livemode:false,data:{object:{id,customer:'cus_Forged',metadata:{organisationId:'other-business'}}},...patch});
async function fixture(t,changes={},options={}){
 const calls=[],data=evidence();
 const resources={'/v1/account':{id:env.STRIPE_ACCOUNT_ID},'/v1/charges/ch_A':{...data.charge,amount_refunded:100},'/v1/invoices/in_A':data.invoice,
  '/v1/disputes/dp_A':{id:'dp_A',object:'dispute',charge:'ch_A',payment_intent:'pi_A',livemode:false,status:'needs_response',amount:2900,currency:'gbp'},
  '/v1/radar/early_fraud_warnings/issfr_A':{id:'issfr_A',object:'radar.early_fraud_warning',charge:'ch_A',payment_intent:'pi_A',livemode:false,actionable:true,fraud_type:'misc',created:1790000000},
  '/v1/credit_notes/cn_A':{id:'cn_A',object:'credit_note',livemode:false,status:'issued',amount:100,customer:'cus_A',invoice:'in_A'}};
 const server=http.createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;calls.push(path);let value=resources[path];if(changes[path])value=changes[path](value);res.setHeader('Content-Type','application/json');if(!value)res.statusCode=404;res.end(JSON.stringify(value??{}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const createReader=(key,config)=>new Stripe(key,{...config,host:'127.0.0.1',port:server.address().port,protocol:'http'});
 return {gateway:createStripeBillingGateway({config:readStripeBillingConfig(env),createReader,...options}),calls};
}
test('risk roots resolve through fresh first-class Charge/Invoice customers rather than metadata',async t=>{
 const {gateway,calls}=await fixture(t);
 for(const [type,id,reason] of kinds)assert.deepEqual(await gateway.resolveBillingRisk(event(type,id)),{customerId:'cus_A',reason,sourceId:id,reviewRequired:true});
 assert.ok(calls.includes('/v1/charges/ch_A'));assert.ok(calls.includes('/v1/invoices/in_A'));
});
test('zero refunds and void credit notes cannot create a new financial review hold',async t=>{
 const {gateway}=await fixture(t,{'/v1/charges/ch_A':v=>({...v,amount_refunded:0}),'/v1/credit_notes/cn_A':v=>({...v,status:'void'})});
 assert.equal((await gateway.resolveBillingRisk(event('charge.refunded','ch_A'))).reviewRequired,false);assert.equal((await gateway.resolveBillingRisk(event('credit_note.created','cn_A'))).reviewRequired,false);
});
test('resolved disputes or non-actionable fraud warnings still require explicit operator review',async t=>{
 const {gateway}=await fixture(t,{'/v1/disputes/dp_A':v=>({...v,status:'won'}),'/v1/radar/early_fraud_warnings/issfr_A':v=>({...v,actionable:false})});
 assert.equal((await gateway.resolveBillingRisk(event('charge.dispute.created','dp_A'))).reviewRequired,true);assert.equal((await gateway.resolveBillingRisk(event('radar.early_fraud_warning.created','issfr_A'))).reviewRequired,true);
});
test('live, cross-account and malformed event scope fails without trusting supplied customers',async t=>{
 const {gateway,calls}=await fixture(t);
 for(const value of [event('charge.refunded','ch_A',{livemode:true}),event('charge.refunded','ch_A',{account:'acct_other'}),event('charge.refunded','ch_A',{context:'acct_other'}),event('charge.succeeded','ch_A'),event('charge.refunded','bad/id')])await assert.rejects(gateway.resolveBillingRisk(value),/billing_evidence_review/);
 assert.deepEqual(calls,[]);
});
test('current root, Charge and credit-note Invoice scope must agree',async t=>{
 for(const changes of [{'/v1/charges/ch_A':v=>({...v,livemode:true})},{'/v1/charges/ch_A':v=>({...v,id:'ch_Other'})},{'/v1/disputes/dp_A':v=>({...v,livemode:true})},{'/v1/disputes/dp_A':v=>({...v,payment_intent:'pi_Other'})},{'/v1/invoices/in_A':v=>({...v,customer:'cus_Other'})}]){
  const {gateway}=await fixture(t,changes),type=Object.keys(changes)[0].includes('invoices')?'credit_note.created':'charge.dispute.created',id=type==='credit_note.created'?'cn_A':'dp_A';await assert.rejects(gateway.resolveBillingRisk(event(type,id)),/billing_evidence_review/);
 }
});
test('each risk resource lookup stops at the shared processing deadline',async t=>{
 for(const [type,id] of kinds){let remaining=5000;const {gateway,calls}=await fixture(t,{'/v1/account':v=>{remaining=0;return v;}},{remainingReadMs:()=>remaining});await assert.rejects(gateway.resolveBillingRisk(event(type,id)),/billing_processing_budget_exhausted/);assert.deepEqual(calls,['/v1/account']);}
});
