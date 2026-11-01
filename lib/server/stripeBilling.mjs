import { createHash } from 'node:crypto';
import Stripe from 'stripe';

// Test-only provider boundary. NOT an HTTP handler or tenant authentication.
// Callers must verify active owner membership, own the customer binding and hold
// a durable operation lock before calling. No runtime entry point uses this yet.
const accountId = 'acct_1UWyMhRxGUITlJWL';
const productId = 'jr_os_business';
const prices = Object.freeze({
  monthly: 'price_1UX0fdRxGUITlJWLXoEGdcBE',
  annual: 'price_1UX0fpRxGUITlJWLs2gwl34S',
});
const fail = code => { throw new Error(code); };
const clean = value => typeof value === 'string' && value.length > 0 && value.trim() === value;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function readStripeBillingConfig(env = process.env) {
  const invalid = () => fail('billing_not_configured');
  if (typeof window !== 'undefined' || !record(env)) invalid();
  if (env.STRIPE_MODE !== 'test' || env.STRIPE_ACCOUNT_ID !== accountId
    || !clean(env.STRIPE_RESTRICTED_KEY) || !/^rk_test_[a-zA-Z0-9]+$/.test(env.STRIPE_RESTRICTED_KEY || '')
    || !clean(env.STRIPE_WEBHOOK_SECRET) || !/^whsec_[a-zA-Z0-9]+$/.test(env.STRIPE_WEBHOOK_SECRET || '')
    || env.STRIPE_PRICE_MONTHLY !== prices.monthly || env.STRIPE_PRICE_ANNUAL !== prices.annual
    || !/^bpc_[a-zA-Z0-9]+$/.test(env.STRIPE_PORTAL_CONFIGURATION_ID || '')) invalid();
  let origin;
  try {
    origin = new URL(env.APP_ORIGIN);
    if (!clean(env.APP_ORIGIN) || origin.protocol !== 'https:' || origin.username || origin.password
      || origin.pathname !== '/' || origin.search || origin.hash || origin.port) invalid();
  } catch { invalid(); }
  return Object.freeze({mode:'test',accountId,productId,monthlyPriceId:prices.monthly,annualPriceId:prices.annual,
    restrictedKey:env.STRIPE_RESTRICTED_KEY,webhookSecret:env.STRIPE_WEBHOOK_SECRET,
    portalConfigurationId:env.STRIPE_PORTAL_CONFIGURATION_ID,appOrigin:origin.origin});
}

function operationValid(operation, checkout) {
  const keys = checkout ? ['organisationId','customerId','operationId','plan'] : ['organisationId','customerId','operationId'];
  if (!record(operation) || Object.keys(operation).some(key => !keys.includes(key))
    || !clean(operation.organisationId) || operation.organisationId.length > 128
    || !clean(operation.customerId) || !/^cus_[a-zA-Z0-9]+$/.test(operation.customerId || '')
    || !clean(operation.operationId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operation.operationId || '')
    || (checkout && !['monthly','annual'].includes(operation.plan))) fail('billing_invalid_operation');
}
function operationKey(operation, kind) {
  // Stable under retries; the DB must persist the full operation, including plan.
  return 'jr_os_' + kind + '_' + createHash('sha256').update(JSON.stringify([
    operation.organisationId,operation.customerId,operation.operationId,
  ])).digest('hex');
}
function providerUrl(value, host) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host && !url.username && !url.password && !url.port;
  } catch { return false; }
}

export function createStripeBillingGateway({config = readStripeBillingConfig(), stripe} = {}) {
  if (typeof window !== 'undefined') fail('billing_not_configured');
  const client = stripe || new Stripe(config.restrictedKey, {
    apiVersion:'2026-10-28.endive',maxNetworkRetries:2,timeout:12000,
  });
  async function provider(work) {
    try { return await work(); }
    catch { fail('billing_provider_unavailable'); } // never expose provider messages/request headers
  }
  async function verifyAccountAndCustomer(customerId) {
    const account = await client.accounts.retrieve();
    if (account.id !== config.accountId) fail('billing_provider_unavailable');
    const customer = await client.customers.retrieve(customerId);
    if (customer.id !== customerId || customer.deleted || customer.livemode !== false) fail('billing_provider_unavailable');
  }
  async function verifyPrice(plan) {
    const priceId = plan === 'monthly' ? config.monthlyPriceId : config.annualPriceId;
    const price = await client.prices.retrieve(priceId);
    if (price.id !== priceId || price.livemode !== false || price.active !== true || price.product !== config.productId
      || price.currency !== 'gbp' || price.unit_amount !== (plan === 'monthly' ? 2900 : 29000)
      || price.transform_quantity || price.custom_unit_amount
      || price.type !== 'recurring' || price.billing_scheme !== 'per_unit'
      || price.recurring?.interval !== (plan === 'monthly' ? 'month' : 'year')
      || price.recurring?.interval_count !== 1 || price.recurring?.usage_type !== 'licensed') fail('billing_provider_unavailable');
    return priceId;
  }
  return Object.freeze({
    async createCheckout(operation) {
      operationValid(operation,true);
      return provider(async () => {
        await verifyAccountAndCustomer(operation.customerId);
        const priceId = await verifyPrice(operation.plan);
        const key = operationKey(operation,'checkout');
        const suffix = Array.from(createHash('sha256').update(key).digest().subarray(0,8), b => String.fromCharCode(97 + b % 26)).join('');
        const session = await client.checkout.sessions.create({
          mode:'subscription',customer:operation.customerId,
          line_items:[{price:priceId,quantity:1}],subscription_data:{billing_mode:{type:'flexible'}},
          integration_identifier:'jr_os_subscription_' + suffix,
          success_url:config.appOrigin + '/settings/billing?checkout=pending',
          cancel_url:config.appOrigin + '/settings/billing',
        },{idempotencyKey:key});
        if (!/^cs_test_[a-zA-Z0-9_]+$/.test(session.id || '') || session.livemode !== false
          || session.customer !== operation.customerId || session.mode !== 'subscription'
          || !providerUrl(session.url,'checkout.stripe.com')) fail('billing_provider_unavailable');
        return {sessionId:session.id,url:session.url};
      });
    },
    async createPortal(operation) {
      operationValid(operation,false);
      return provider(async () => {
        await verifyAccountAndCustomer(operation.customerId);
        const session = await client.billingPortal.sessions.create({
          customer:operation.customerId,configuration:config.portalConfigurationId,
          return_url:config.appOrigin + '/settings/billing',
        },{idempotencyKey:operationKey(operation,'portal')});
        if (!/^bps_[a-zA-Z0-9_]+$/.test(session.id || '') || session.livemode !== false
          || session.customer !== operation.customerId || !providerUrl(session.url,'billing.stripe.com')) fail('billing_provider_unavailable');
        return {sessionId:session.id,url:session.url};
      });
    },
    verifyWebhook(rawBody, signature) {
      try {
        if (!(typeof rawBody === 'string' || Buffer.isBuffer(rawBody)) || Buffer.byteLength(rawBody) > 1000000
          || typeof signature !== 'string' || signature.length > 4096) fail('billing_invalid_webhook');
        const event = client.webhooks.constructEvent(rawBody,signature,config.webhookSecret,300);
        if (event.account !== undefined || event.context !== undefined
          || event.object !== 'event' || event.livemode !== false || !/^evt_[a-zA-Z0-9_]+$/.test(event.id || '')
          || !clean(event.type) || !record(event.data?.object)) fail('billing_invalid_webhook');
        // Verified delivery only. Caller must durably deduplicate/reconcile it;
        // this does not grant access or trust event order/metadata/payment flags.
        return event;
      } catch { fail('billing_invalid_webhook'); }
    },
  });
}
