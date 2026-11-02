import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import Stripe from 'stripe';
import {createStripeBillingGateway,readStripeBillingConfig} from '../lib/server/stripeBilling.mjs';
import {evidence} from './helpers/billingEvidence.mjs';
async function fixture(t,changes={},gatewayOptions={}){
 const data=evidence(),calls=[];
 const server=http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;calls.push(path);
  let value=path==='/v1/account'?{id:'acct_1UWyMhRxGUITlJWL'}:path==='/v1/subscriptions/sub_A'?data.subscription:path==='/v1/invoices/in_A'?data.invoice:path==='/v1/invoice_payments'?data.payments:path==='/v1/payment_intents/pi_A'?data.intent:path==='/v1/charges/ch_A'?data.charge:path==='/v1/checkout/sessions/cs_test_A'?{id:'cs_test_A',livemode:false,customer:'cus_A',subscription:'sub_A',mode:'subscription'}:null;
  res.setHeader('Content-Type','application/json');if(changes[path])value=await changes[path](value,res);if(res.destroyed)return;if(!value)res.statusCode=404;res.end(JSON.stringify(value));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const config=readStripeBillingConfig({STRIPE_MODE:'test',STRIPE_ACCOUNT_ID:'acct_1UWyMhRxGUITlJWL',STRIPE_RESTRICTED_KEY:'rk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_PRICE_MONTHLY:'price_1UX0fdRxGUITlJWLXoEGdcBE',STRIPE_PRICE_ANNUAL:'price_1UX0fpRxGUITlJWLs2gwl34S',STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture',APP_ORIGIN:'https://jr-os.example'});
 const stripe=new Stripe(config.restrictedKey,{host:'127.0.0.1',port:server.address().port,protocol:'http',maxNetworkRetries:0});
 const createReader=(key,options)=>new Stripe(key,{...options,host:'127.0.0.1',port:server.address().port,protocol:'http'});
 return {gateway:createStripeBillingGateway({config,stripe,createReader,...gatewayOptions}),calls,data};
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

test('subscription retirement checks current mode and customer before exposing an ended status',async t=>{
 const {gateway}=await fixture(t,{'/v1/subscriptions/sub_A':s=>({...s,status:'canceled'})});assert.deepEqual(await gateway.readSubscriptionStatus({customerId:'cus_A',subscriptionId:'sub_A'}),{status:'canceled'});
 const other=await fixture(t,{'/v1/subscriptions/sub_A':s=>({...s,customer:'cus_other'})});await assert.rejects(other.gateway.readSubscriptionStatus({customerId:'cus_A',subscriptionId:'sub_A'}),/billing_provider_unavailable/);
});

test('an exhausted provider budget makes no request and cannot return subscription evidence',async t=>{
 const {gateway,calls}=await fixture(t,{}, {remainingReadMs:()=>0});
 await assert.rejects(gateway.readSubscriptionEvidence({customerId:'cus_A',subscriptionId:'sub_A'}),/billing_processing_budget_exhausted/);
 assert.deepEqual(calls,[]);
});
test('remaining processing time bounds a real SDK request with a held HTTP response',{timeout:2500},async t=>{
 let release; t.after(()=>release?.());let deadline=Infinity;
 const {gateway,calls}=await fixture(t,{'/v1/account':async value=>{await new Promise(resolve=>{release=resolve;});return value;}},{remainingReadMs:()=>deadline-performance.now()});
 deadline=performance.now()+120;
 await assert.rejects(gateway.readSubscriptionEvidence({customerId:'cus_A',subscriptionId:'sub_A'}),/billing_(?:processing_budget_exhausted|provider_unavailable)/);
 assert.deepEqual(calls,['/v1/account']);release();
});

test('periodic body chunks cannot extend the absolute provider deadline',{timeout:3000},async t=>{
 let deadline=Infinity,closed;
 const connectionClosed=new Promise(resolve=>{closed=resolve;});
 const {gateway,calls}=await fixture(t,{'/v1/account':(value,res)=>new Promise(resolve=>{
  res.flushHeaders();res.write(' ');const interval=setInterval(()=>res.write(' '),20);
  const complete=setTimeout(()=>{clearInterval(interval);resolve(value);},750);
  res.once('close',()=>{clearInterval(interval);clearTimeout(complete);closed();resolve(value);});
 })},{remainingReadMs:()=>deadline-performance.now()});
 const start=performance.now();deadline=start+150;
 await assert.rejects(gateway.readSubscriptionEvidence({customerId:'cus_A',subscriptionId:'sub_A'}),/billing_processing_budget_exhausted/);
 await connectionClosed;assert.ok(performance.now()-start<500,'The real body connection must close before its trickling response completes');assert.deepEqual(calls,['/v1/account']);
});
