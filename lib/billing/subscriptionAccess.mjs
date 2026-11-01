/**
 * Foundation only: call on the server with a trusted, reconciled billing row.
 * This does not authenticate a caller or grant tenant/role permissions.
 * Never feed browser/localStorage records or raw Checkout redirects into this.
 * No runtime billing gate is wired until Checkout/webhooks/database enforcement exist.
 */
const identity=value=>typeof value==='string'&&value.length>0&&value.trim()===value;
const instant=value=>Number.isSafeInteger(value)&&value>0;
export function subscriptionAccess({organisationId,mode,allowedPriceIds,subscription,nowMs}={}) {
  const denied=reason=>({paidFeatures:false,reason});
  if(!identity(organisationId)||!['test','live'].includes(mode)||!instant(nowMs))return denied('invalid_context');
  if(!subscription||typeof subscription!=='object'||Array.isArray(subscription))return denied('not_subscribed');
  if(subscription.organisationId!==organisationId||subscription.mode!==mode)return denied('billing_scope_mismatch');
  if(!identity(subscription.subscriptionId)||!identity(subscription.priceId)||!Array.isArray(allowedPriceIds)||!allowedPriceIds.includes(subscription.priceId))return denied('unrecognised_product');
  if(subscription.status==='active'&&instant(subscription.paidThroughMs)&&nowMs<subscription.paidThroughMs)return {paidFeatures:true,reason:'paid_period'};
  if(subscription.status==='trialing'&&instant(subscription.trialEndsAtMs)&&nowMs<subscription.trialEndsAtMs)return {paidFeatures:true,reason:'trial_period'};
  return denied('payment_or_subscription_review');
}
export function canManageSubscription({role,membershipActive,organisationId,actorOrganisationId}={}) {
  return role==='owner'&&membershipActive===true&&identity(organisationId)&&organisationId===actorOrganisationId;
}
