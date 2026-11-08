import assert from 'node:assert/strict';
import test from 'node:test';
const path='../lib/billing/subscriptionAccess.mjs';
let api={};try{api=await import(path);}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const nowMs=1793534400000;
const record={organisationId:'business-a',mode:'test',subscriptionId:'sub_example',priceId:'price_example',status:'active',paidThroughMs:nowMs+3600000,trialEndsAtMs:null,reviewRequired:false};
const input=patch=>({organisationId:'business-a',mode:'test',allowedPriceIds:['price_example'],subscription:record,nowMs,...patch});
test('only matching server billing records with paid coverage enable the configured product',()=>{
 assert.equal(typeof api.subscriptionAccess,'function');assert.equal(api.subscriptionAccess(input()).paidFeatures,true);
 for(const patch of [{subscription:null},{organisationId:'other'},{mode:'live'},{allowedPriceIds:['other']},{subscription:{...record,paidThroughMs:nowMs}},{subscription:{...record,paidThroughMs:NaN}},{subscription:{...record,paidThroughMs:String(nowMs+3600000)}},{subscription:{...record,subscriptionId:''}}])assert.equal(api.subscriptionAccess(input(patch)).paidFeatures,false);
});
test('a scheduled cancellation retains paid coverage through the exact paid boundary',()=>{
 assert.equal(api.subscriptionAccess(input({subscription:{...record,cancelAtPeriodEnd:true}})).paidFeatures,true);
 assert.equal(api.subscriptionAccess(input({nowMs:record.paidThroughMs})).paidFeatures,false);
});
test('only a bounded provider trial grants trial access and it cannot become paid coverage',()=>{
 const trial={...record,status:'trialing',paidThroughMs:null,trialEndsAtMs:nowMs+1000};assert.equal(api.subscriptionAccess(input({subscription:trial})).paidFeatures,true);
 assert.equal(api.subscriptionAccess(input({subscription:trial,nowMs:trial.trialEndsAtMs})).paidFeatures,false);
 assert.equal(api.subscriptionAccess(input({subscription:{...trial,status:'active'}})).paidFeatures,false);
});
test('failed, unpaid, canceled, paused and unknown statuses never unlock paid features',()=>{
 for(const status of ['past_due','unpaid','canceled','incomplete','incomplete_expired','paused','unknown',undefined])assert.equal(api.subscriptionAccess(input({subscription:{...record,status}})).paidFeatures,false);
});
test('browser success flags and unrecognised environments cannot establish payment',()=>{
 for(const subscription of [{active:true,checkoutSuccess:true},{...record,status:'paid'},{...record,mode:'sandbox'}])assert.equal(api.subscriptionAccess(input({subscription})).paidFeatures,false);
 for(const patch of [{mode:'sandbox'},{nowMs:NaN},{nowMs:'1793534400000'},{organisationId:''},{allowedPriceIds:[]}])assert.equal(api.subscriptionAccess(input(patch)).paidFeatures,false);
});
test('billing management requires an active owner of the same exact business',()=>{
 assert.equal(typeof api.canManageSubscription,'function');const actor={role:'owner',membershipActive:true,organisationId:'business-a',actorOrganisationId:'business-a'};assert.equal(api.canManageSubscription(actor),true);
 for(const patch of [{role:'admin'},{role:'office'},{role:'customer'},{membershipActive:false},{membershipActive:'true'},{actorOrganisationId:'other'},{organisationId:''}])assert.equal(api.canManageSubscription({...actor,...patch}),false);
});
test('paid and trial coverage require an explicitly clear trusted billing review state',()=>{
 for(const status of ['active','trialing'])for(const reviewRequired of [true,undefined,null,'false',0]){
  const subscription={...record,status,trialEndsAtMs:nowMs+1000,reviewRequired};
  assert.deepEqual(api.subscriptionAccess(input({subscription})),{paidFeatures:false,reason:'payment_or_subscription_review'});
 }
});
