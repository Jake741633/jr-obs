// Reconcile only current provider objects fetched AFTER the business lease.
// This reducer does not verify webhooks or authenticate business ownership.
const review=()=>{throw new Error('billing_evidence_review');};
const identifier=(value,prefix)=>typeof value==='string'&&new RegExp('^'+prefix+'_[A-Za-z0-9]+$').test(value);
const ref=value=>typeof value==='string'?value:value?.id;
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const instant=value=>Number.isSafeInteger(value)&&value>0&&Number.isSafeInteger(value*1000);
const single=list=>list?.has_more===false&&Array.isArray(list.data)&&list.data.length===1?list.data[0]:null;
const match=(actual,expected)=>ref(actual)===expected;
const approved={price_1UX0fdRxGUITlJWLXoEGdcBE:{amount:2900,interval:'month'},price_1UX0fpRxGUITlJWLs2gwl34S:{amount:29000,interval:'year'}};

export function reconciledSubscription({organisationId,customerId,subscriptionId,evidence}={}){
 const sub=evidence?.subscription,item=single(sub?.items),price=item?.price,plan=Object.hasOwn(approved,price?.id)?approved[price.id]:null;
 if(typeof organisationId!=='string'||!organisationId||organisationId.trim()!==organisationId
  ||!identifier(customerId,'cus')||!identifier(subscriptionId,'sub')
  ||sub?.object!=='subscription'||sub.id!==subscriptionId||sub.livemode!==false||!match(sub.customer,customerId)
  ||sub.currency!=='gbp'||typeof sub.cancel_at_period_end!=='boolean'||!item||item.quantity!==1||!identifier(item.id,'si')
  ||!plan||price.product!=='jr_os_business'||price.currency!=='gbp'||price.unit_amount!==plan.amount
  ||price.type!=='recurring'||price.billing_scheme!=='per_unit'||price.transform_quantity||price.custom_unit_amount
  ||price.recurring?.interval!==plan.interval||price.recurring?.interval_count!==1||price.recurring?.usage_type!=='licensed'
  ||!instant(item.current_period_start)||!instant(item.current_period_end)||item.current_period_end<=item.current_period_start)review();
 const row={organisationId,customerId,subscriptionId,priceId:price.id,status:sub.status,paidThroughMs:null,paidInvoiceId:null,trialEndsAtMs:null,cancelAtPeriodEnd:sub.cancel_at_period_end};
 if(['canceled','past_due','unpaid','paused','incomplete','incomplete_expired'].includes(sub.status))return row;
 if(sub.status==='trialing'){
  if(!instant(sub.trial_start)||!instant(sub.trial_end)||sub.trial_end<=sub.trial_start||sub.trial_end>item.current_period_end)review();
  row.trialEndsAtMs=sub.trial_end*1000;return row;
 }
 if(sub.status!=='active')review();
 const {invoice,payments,intent,charge}=evidence,line=single(invoice?.lines),payment=single(payments);
 if(invoice?.object!=='invoice'||!identifier(invoice.id,'in')||!match(sub.latest_invoice,invoice.id)
  ||invoice.livemode!==false||!match(invoice.customer,customerId)||invoice.status!=='paid'||invoice.currency!=='gbp'
  ||!integer(invoice.total)||invoice.total===0||invoice.starting_balance!==0||invoice.ending_balance!==0
  ||invoice.pre_payment_credit_notes_amount!==0||invoice.post_payment_credit_notes_amount!==0
  ||!(invoice.total_pretax_credit_amounts===null||(Array.isArray(invoice.total_pretax_credit_amounts)&&invoice.total_pretax_credit_amounts.every(credit=>credit?.type==='discount'&&integer(credit.amount))))
  ||!integer(invoice.amount_due)||invoice.amount_due!==invoice.total||!integer(invoice.amount_paid)||invoice.amount_paid<invoice.amount_due||invoice.amount_remaining!==0
  ||(invoice.amount_paid_off_stripe!==undefined&&invoice.amount_paid_off_stripe!==0)
  ||invoice.parent?.type!=='subscription_details'||!match(invoice.parent.subscription_details?.subscription,subscriptionId)
  ||!line||line.currency!=='gbp'||line.quantity!==1||line.amount!==plan.amount
  ||line.parent?.type!=='subscription_item_details'||line.parent.subscription_item_details?.subscription!==subscriptionId
  ||line.parent.subscription_item_details?.subscription_item!==item.id||line.parent.subscription_item_details?.proration!==false
  ||line.pricing?.type!=='price_details'||line.pricing.price_details?.price!==price.id||line.pricing.price_details?.product!=='jr_os_business'
  ||line.period?.start!==item.current_period_start||line.period?.end!==item.current_period_end
  ||!payment||payment.livemode!==false||!match(payment.invoice,invoice.id)||payment.currency!=='gbp'||payment.status!=='paid'
  ||!integer(payment.amount_paid)||payment.amount_paid<invoice.amount_due||payment.payment?.type!=='payment_intent'
  ||intent?.object!=='payment_intent'||!identifier(intent.id,'pi')||!match(payment.payment.payment_intent,intent.id)
  ||intent.livemode!==false||!match(intent.customer,customerId)||intent.status!=='succeeded'||intent.currency!=='gbp'
  ||!integer(intent.amount_received)||intent.amount_received<invoice.amount_due
  ||charge?.object!=='charge'||!identifier(charge.id,'ch')||!match(intent.latest_charge,charge.id)||!match(charge.payment_intent,intent.id)
  ||charge.livemode!==false||!match(charge.customer,customerId)||charge.currency!=='gbp'||charge.paid!==true||charge.captured!==true||charge.status!=='succeeded'
  ||!integer(charge.amount_captured)||charge.amount_captured<invoice.amount_due||charge.amount_refunded!==0||charge.refunded!==false||charge.disputed!==false
  ||charge.fraud_details?.stripe_report==='fraudulent')review();
 row.paidThroughMs=line.period.end*1000;row.paidInvoiceId=invoice.id;return row;
}
