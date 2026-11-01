import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import Stripe from 'stripe';
import {createStripeBillingGateway,readStripeBillingConfig} from '../lib/server/stripeBilling.mjs';
import {evidence} from './helpers/billingEvidence.mjs';
async function fixture(t,changes={}){
 const data=evidence(),calls=[];
 const server=http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;calls.push(path);
  let value=path==='/v1/account'?{id:'acct_1UWyMhRxGUITlJWL'}:path==='/v1/subscriptions/sub_A'?data.subscription:path==='/v1/invoices/in_A'?data.invoice:path==='/v1/invoice_payments'?data.payments:path==='/v1/payment_intents/pi_A'?data.intent:path==='/v1/charges/ch_A'?data.charge:path==='/v1/checkout/sessions/cs_test_A'?{id:'cs_test_A',livemode:false,customer:'cus_A',subscription:'sub_A',mode:'subscription'}:null;
  if(changes[path])value=changes[path](value);res.setHeader('Content-Type','application/json');if(!value)res.statusCode=404;res.end(JSON.stringify(value));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const config=readStripeBillingConfig({STRIPE_MODE:'test',STRIPE_ACCOUNT_ID:'acct_1UWyMhRxGUITlJWL',STRIPE_RESTRICTED_KEY:'rk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_PRICE_MONTHLY:'price_1UX0fdRxGUITlJWLXoEGdcBE',STRIPE_PRICE_ANNUAL:'price_1UX0fpRxGUITlJWLs2gwl34S',STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture',APP_ORIGIN:'https://jr-os.example'});
 const stripe=new Stripe(config.restrictedKey,{host:'127.0.0.1',port:server.address().port,protocol:'http',maxNetworkRetries:0});
 return {gateway:createStripeBillingGateway({config,stripe}),calls,data};
}
const event=(type,id)=>({livemode:false,type,data:{object:{id}}});
test('lifecycle, invoice and Checkout targets resolve through current provider objects',async t=>{
 const {gateway,calls}=await fixture(t);
 for(const [type,id]of [['customer.subscription.deleted','sub_A'],['invoice.paid','in_A'],['checkout.session.completed','cs_test_A']]){
  assert.deepEqual(await gateway.resolveSubscriptionTarget(event(type,id)),{customerId:'cus_A',subscriptionId:'sub_A'});
 }
 assert.ok(calls.includes('/v1/subscriptions/sub_A'));assert.ok(calls.includes('/v1/invoices/in_A'));assert.ok(calls.includes('/v1/checkout/sessions/cs_test_A'));
});
test('payment evidence is fetched freshly from subscription through invoice payment to charge',async t=>{
 const {gateway,data}=await fixture(t);assert.deepEqual(await gateway.readSubscriptionEvidence({customerId:'cus_A',subscriptionId:'sub_A'}),data);
});
test('canceled and trialing subscriptions do not pretend to have a settled payment',async t=>{
 const {gateway,calls}=await fixture(t,{'/v1/subscriptions/sub_A':s=>({...s,status:'canceled'})});
 const result=await gateway.readSubscriptionEvidence({customerId:'cus_A',subscriptionId:'sub_A'});assert.equal(result.subscription.status,'canceled');assert.equal(result.invoice,undefined);assert.equal(calls.includes('/v1/invoice_payments'),false);
});
test('wrong account, customer or mode is rejected before trusting subscription evidence',async t=>{
 for(const change of [{'/v1/account':s=>({...s,id:'acct_other'})},{'/v1/subscriptions/sub_A':s=>({...s,customer:'cus_other'})},{'/v1/subscriptions/sub_A':s=>({...s,livemode:true})}]){
  const {gateway}=await fixture(t,change);await assert.rejects(gateway.readSubscriptionEvidence({customerId:'cus_A',subscriptionId:'sub_A'}),/billing_provider_unavailable/);
 }
});
