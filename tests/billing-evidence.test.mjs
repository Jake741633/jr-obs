import test from 'node:test';
import assert from 'node:assert/strict';
import {reconciledSubscription} from '../lib/server/billingReconciliation.mjs';
const price='price_1UX0fdRxGUITlJWLXoEGdcBE';
const context={organisationId:'11111111-1111-4111-8111-111111111111',customerId:'cus_A',subscriptionId:'sub_A'};
import {evidence} from './helpers/billingEvidence.mjs';
const clone=()=>structuredClone(evidence());
const apply=x=>reconciledSubscription({...context,evidence:x});
test('coverage comes from the matching settled recurring line, not outer invoice period or event flags',()=>{
 const result=apply(evidence());assert.deepEqual(result,{organisationId:context.organisationId,customerId:'cus_A',subscriptionId:'sub_A',priceId:price,status:'active',paidThroughMs:1792678400000,paidInvoiceId:'in_A',trialEndsAtMs:null,cancelAtPeriodEnd:false});
 const e=clone();e.subscription.cancel_at_period_end=true;assert.equal(apply(e).cancelAtPeriodEnd,true);
});
test('wrong customer/subscription/product/price or multiple items cannot grant coverage',()=>{
 const mutations=[e=>e.subscription.customer='cus_other',e=>e.subscription.id='sub_other',e=>e.subscription.livemode=true,e=>e.subscription.items.has_more=true,e=>e.subscription.items.data.push(structuredClone(e.subscription.items.data[0])),e=>e.subscription.items.data[0].quantity=2,e=>e.subscription.items.data[0].price.product='prod_other',e=>e.subscription.items.data[0].price.id='price_other',e=>e.subscription.items.data[0].price.unit_amount=1,e=>e.subscription.items.data[0].price.transform_quantity={divide_by:2},e=>e.subscription.items.data[0].current_period_end=Infinity];
 for(const change of mutations){const e=clone();change(e);assert.throws(()=>apply(e),/billing_evidence_review/);}
});
test('manual, partial, refunded, disputed or unmatched payments cannot extend coverage',()=>{
 const mutations=[e=>e.invoice.status='open',e=>e.invoice.customer='cus_other',e=>e.invoice.amount_paid_off_stripe=2900,e=>e.invoice.amount_due=0,e=>e.invoice.amount_remaining=1,e=>e.invoice.amount_paid=100,e=>e.invoice.parent.subscription_details.subscription='sub_other',e=>e.invoice.lines.data[0].period.end+=100,e=>e.invoice.lines.data[0].parent.subscription_item_details.proration=true,e=>e.invoice.lines.data[0].pricing.price_details.price='price_other',e=>e.invoice.lines.has_more=true,e=>e.payments.has_more=true,e=>e.payments.data[0].invoice='in_other',e=>e.payments.data[0].payment.type='payment_record',e=>e.payments.data[0].amount_paid=1,e=>e.intent.status='processing',e=>e.intent.customer='cus_other',e=>e.charge.payment_intent='pi_other',e=>e.charge.amount_refunded=1,e=>e.charge.disputed=true,e=>e.charge.amount_captured=100];
 for(const change of mutations){const e=clone();change(e);assert.throws(()=>apply(e),/billing_evidence_review/);}
});
test('only bounded provider trials are recorded and failed/canceled states do not claim payment',()=>{
 const e=clone();e.subscription.status='trialing';e.subscription.trial_start=1790000000;e.subscription.trial_end=1791209600;
 const trial=apply(e);assert.equal(trial.trialEndsAtMs,1791209600000);assert.equal(trial.paidThroughMs,null);assert.equal(trial.paidInvoiceId,null);
 e.subscription.trial_end=null;assert.throws(()=>apply(e),/billing_evidence_review/);
 for(const status of ['canceled','past_due','unpaid','paused','incomplete','incomplete_expired']){const x=clone();x.subscription.status=status;const row=apply(x);assert.equal(row.status,status);assert.equal(row.paidThroughMs,null);assert.equal(row.trialEndsAtMs,null);}
});


test('prototype property names are never accepted as approved catalog prices',()=>{
 const e=clone();e.subscription.items.data[0].price.id='__proto__';e.subscription.items.data[0].price.unit_amount=undefined;e.subscription.items.data[0].price.recurring.interval=undefined;e.invoice.lines.data[0].amount=undefined;e.invoice.lines.data[0].pricing.price_details.price='__proto__';
 assert.throws(()=>apply(e),/billing_evidence_review/);
});

test('annual coverage uses the approved annual price and its paid yearly line',()=>{
 const e=clone(),item=e.subscription.items.data[0],line=e.invoice.lines.data[0];
 item.price.id='price_1UX0fpRxGUITlJWLs2gwl34S';item.price.unit_amount=29000;item.price.recurring.interval='year';item.current_period_end=1821536000;
 line.amount=29000;line.pricing.price_details.price='price_1UX0fpRxGUITlJWLs2gwl34S';line.period.end=1821536000;
 e.invoice.total=29000;e.invoice.amount_due=29000;e.invoice.amount_paid=29000;e.payments.data[0].amount_paid=29000;e.intent.amount_received=29000;e.charge.amount_captured=29000;
 const row=apply(e);assert.equal(row.priceId,'price_1UX0fpRxGUITlJWLs2gwl34S');assert.equal(row.paidThroughMs,1821536000000);
});

test('customer credits and credit notes require review rather than turning a partial cash payment into full coverage',()=>{
 for(const change of [e=>{e.invoice.starting_balance=-2800;e.invoice.amount_due=100;e.invoice.amount_paid=100;e.payments.data[0].amount_paid=100;e.intent.amount_received=100;e.charge.amount_captured=100;},e=>e.invoice.pre_payment_credit_notes_amount=100,e=>e.invoice.post_payment_credit_notes_amount=100,e=>e.invoice.total_pretax_credit_amounts=[{type:'credit_balance_transaction',amount:100,credit_balance_transaction:'cbtxn_fixture'}]]){
  const e=clone();change(e);assert.throws(()=>apply(e),/billing_evidence_review/);
 }
});
