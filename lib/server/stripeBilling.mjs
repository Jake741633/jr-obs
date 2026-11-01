import { createHash } from 'node:crypto';
import Stripe from 'stripe';

// Test-only provider boundary. NOT an HTTP handler or tenant authentication.
// Callers must verify active owner membership, own the customer binding and hold
// a durable operation lock before calling. The disabled webhook route uses signature verification only.
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
  const keys = checkout ? ['organisationId','customerId','operationId','plan','expiresAt'] : ['organisationId','customerId','operationId'];
  if (!record(operation) || Object.keys(operation).some(key => !keys.includes(key))
    || !clean(operation.organisationId) || operation.organisationId.length > 128
    || !clean(operation.customerId) || !/^cus_[a-zA-Z0-9]+$/.test(operation.customerId || '')
    || !clean(operation.operationId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operation.operationId || '')
    || (checkout && !['monthly','annual'].includes(operation.plan))
    || (operation.expiresAt !== undefined && (!Number.isSafeInteger(operation.expiresAt) || operation.expiresAt<=0 || !Number.isSafeInteger(operation.expiresAt*1000)))) fail('billing_invalid_operation');
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
function verifyPortalConfiguration(configuration, config) {
  if (!record(configuration) || configuration.id !== config.portalConfigurationId
    || configuration.object !== 'billing_portal.configuration' || configuration.is_default !== false
    || configuration.active !== true || configuration.livemode !== false || configuration.application !== null
    || configuration.login_page?.enabled !== false) fail('billing_provider_unavailable');
  const features = configuration.features;
  if (features?.invoice_history?.enabled !== true || features?.payment_method_update?.enabled !== true
    || features?.subscription_cancel?.enabled !== true || features.subscription_cancel.mode !== 'at_period_end'
    || features.subscription_cancel.proration_behavior !== 'none'
    || features?.subscription_update?.enabled !== false || features?.subscription_pause?.enabled !== false) fail('billing_provider_unavailable');
}

export function createStripeBillingGateway({config = readStripeBillingConfig(), stripe, remainingReadMs, createReader=(key,options)=>new Stripe(key,options)} = {}) {
  if (typeof window !== 'undefined' || typeof globalThis.AbortController !== 'function' || typeof globalThis.fetch !== 'function') fail('billing_not_configured');
  if (remainingReadMs !== undefined && typeof remainingReadMs !== 'function' || typeof createReader !== 'function') fail('billing_not_configured');
  const client = stripe || new Stripe(config.restrictedKey, {
    apiVersion:'2026-10-28.endive',maxNetworkRetries:2,timeout:12000,
  });
  // Node's default transport times socket inactivity. The pinned SDK's fetch
  // transport keeps AbortController armed through complete JSON body reads.
  // Refuse runtimes without cancellation so its promise-race fallback is unused.
  const reader = createReader(config.restrictedKey, {apiVersion:'2026-10-28.endive',maxNetworkRetries:0,timeout:5000,httpClient:Stripe.createFetchHttpClient()});
  const resourceId = (value,prefix) => typeof value === 'string' && new RegExp('^'+prefix+'_[a-zA-Z0-9]+$').test(value);
  const ref = value => typeof value === 'string' ? value : value?.id;
  function readOptions() {
    const remaining = remainingReadMs ? remainingReadMs() : 5000;
    if (!Number.isFinite(remaining)) fail('billing_provider_unavailable');
    const timeout = Math.floor(Math.min(5000,remaining));
    if (timeout < 1) fail('billing_processing_budget_exhausted');
    return {timeout,maxNetworkRetries:0};
  }
  async function currentProvider(work) {
    try { return await work(); } catch(error) {
      if(error?.message === 'billing_evidence_review') fail('billing_evidence_review');
      if(error?.message === 'billing_processing_budget_exhausted'
        || remainingReadMs && Math.floor(remainingReadMs()) <= 0) fail('billing_processing_budget_exhausted');
      fail('billing_provider_unavailable');
    }
  }
  async function readerAccount() { if((await reader.accounts.retrieve(null,{},readOptions())).id !== config.accountId) fail('billing_provider_unavailable'); }
  async function provider(work) {
    try { return await work(); }
    catch(error) { if(['billing_already_subscribed','billing_processing_budget_exhausted'].includes(error?.message)) fail(error.message); fail('billing_provider_unavailable'); } // never expose provider messages/request headers
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
    async createBillingCustomer({organisationId,operationId}={}) {
      if(!/^[0-9a-f-]{36}$/i.test(organisationId||'') || !/^[0-9a-f-]{36}$/i.test(operationId||'')) fail('billing_invalid_operation');
      return provider(async()=>{
        if((await client.accounts.retrieve()).id!==config.accountId) fail('billing_provider_unavailable');
        const key='jr_os_customer_'+createHash('sha256').update(JSON.stringify([organisationId,operationId])).digest('hex');
        const customer=await client.customers.create({},{idempotencyKey:key});
        if(!/^cus_[a-zA-Z0-9]+$/.test(customer.id||'')||customer.deleted||customer.livemode!==false) fail('billing_provider_unavailable');
        return {customerId:customer.id};
      });
    },
    async readCheckoutSession({organisationId,customerId,operationId,plan,expiresAt,sessionId}={}) {
      operationValid({organisationId,customerId,operationId,plan,expiresAt},true);
      if(!/^cs_test_[a-zA-Z0-9]+$/.test(sessionId||'')) fail('billing_invalid_operation');
      return provider(async()=>{
        await verifyAccountAndCustomer(customerId);
        const value=await client.checkout.sessions.retrieve(sessionId);
        const subscriptionId=typeof value.subscription==='string'?value.subscription:value.subscription?.id||null;
        if(value.id!==sessionId||value.customer!==customerId||value.client_reference_id!==operationId||value.mode!=='subscription'||value.livemode!==false
          ||!['open','complete','expired'].includes(value.status)||!Number.isSafeInteger(value.expires_at)||value.expires_at!==expiresAt
          ||(value.status==='open'&&!providerUrl(value.url,'checkout.stripe.com'))
          ||(value.status==='complete'&&!/^sub_[a-zA-Z0-9]+$/.test(subscriptionId||''))) fail('billing_provider_unavailable');
        return {sessionId:value.id,url:value.url,status:value.status,expiresAt:value.expires_at,subscriptionId};
      });
    },
    async resolveSubscriptionTarget(event) {
      return currentProvider(async () => {
        if(event?.livemode !== false || event.account !== undefined || event.context !== undefined) fail('billing_evidence_review');
        await readerAccount();
        let target,subscriptionId;
        const id=event.data?.object?.id;
        if(typeof event.type==='string' && event.type.startsWith('customer.subscription.') && resourceId(id,'sub')) {
          target=await reader.subscriptions.retrieve(id,{},readOptions());subscriptionId=target.id;
          if(target.object!=='subscription' || target.id!==id) fail('billing_evidence_review');
        } else if(typeof event.type==='string' && event.type.startsWith('invoice.') && resourceId(id,'in')) {
          target=await reader.invoices.retrieve(id,{},readOptions());subscriptionId=ref(target.parent?.subscription_details?.subscription);
          if(target.object!=='invoice' || target.id!==id || target.parent?.type!=='subscription_details') fail('billing_evidence_review');
        } else if(typeof event.type==='string' && event.type.startsWith('checkout.session.') && resourceId(id,'cs_test')) {
          target=await reader.checkout.sessions.retrieve(id,{},readOptions());subscriptionId=ref(target.subscription);
          if(target.id!==id || target.mode!=='subscription') fail('billing_evidence_review');
        } else fail('billing_evidence_review');
        const customerId=ref(target.customer);
        if(target.livemode!==false || !resourceId(customerId,'cus') || !resourceId(subscriptionId,'sub')) fail('billing_evidence_review');
        return {customerId,subscriptionId};
      });
    },
    async readSubscriptionStatus({subscriptionId,customerId}={}) {
      if(!resourceId(subscriptionId,'sub')||!resourceId(customerId,'cus'))fail('billing_invalid_operation');
      return provider(async()=>{
        await readerAccount();
        const value=await reader.subscriptions.retrieve(subscriptionId,{},readOptions());
        if(value.id!==subscriptionId||value.object!=='subscription'||value.livemode!==false||ref(value.customer)!==customerId
          ||!['active','trialing','past_due','unpaid','paused','incomplete','canceled','incomplete_expired'].includes(value.status))fail('billing_provider_unavailable');
        return {status:value.status};
      });
    },
    async readSubscriptionEvidence({subscriptionId,customerId}={}) {
      return currentProvider(async () => {
        if(!resourceId(subscriptionId,'sub') || !resourceId(customerId,'cus')) fail('billing_evidence_review');
        await readerAccount();
        const subscription=await reader.subscriptions.retrieve(subscriptionId,{},readOptions());
        if(subscription.id!==subscriptionId || subscription.livemode!==false || ref(subscription.customer)!==customerId) fail('billing_provider_unavailable');
        if(subscription.status!=='active') return {subscription};
        const invoiceId=ref(subscription.latest_invoice);
        if(!resourceId(invoiceId,'in')) fail('billing_evidence_review');
        const invoice=await reader.invoices.retrieve(invoiceId,{},readOptions());
        const payments=await reader.invoicePayments.list({invoice:invoiceId,status:'paid',limit:2},readOptions());
        if(payments.has_more!==false || payments.data?.length!==1 || payments.data[0].payment?.type!=='payment_intent') fail('billing_evidence_review');
        const intentId=ref(payments.data[0].payment.payment_intent);
        if(!resourceId(intentId,'pi')) fail('billing_evidence_review');
        const intent=await reader.paymentIntents.retrieve(intentId,{},readOptions()),chargeId=ref(intent.latest_charge);
        if(!resourceId(chargeId,'ch')) fail('billing_evidence_review');
        const charge=await reader.charges.retrieve(chargeId,{},readOptions());
        return {subscription,invoice,payments,intent,charge};
      });
    },
    async createCheckout(operation) {
      operationValid(operation,true);
      return provider(async () => {
        await verifyAccountAndCustomer(operation.customerId);
        const priceId = await verifyPrice(operation.plan);
        const existing = await client.subscriptions.list({customer:operation.customerId,status:'all',limit:100});
        if(existing.has_more!==false || !Array.isArray(existing.data) || existing.data.some(sub=>sub.customer!==operation.customerId || sub.livemode!==false || !['active','trialing','past_due','unpaid','paused','incomplete','canceled','incomplete_expired'].includes(sub.status))) fail('billing_provider_unavailable');
        if(existing.data.some(sub=>!['canceled','incomplete_expired'].includes(sub.status))) fail('billing_already_subscribed');
        const key = operationKey(operation,'checkout');
        const suffix = Array.from(createHash('sha256').update(key).digest().subarray(0,8), b => String.fromCharCode(97 + b % 26)).join('');
        const session = await client.checkout.sessions.create({
          mode:'subscription',customer:operation.customerId,client_reference_id:operation.operationId,
          ...(operation.expiresAt!==undefined?{expires_at:operation.expiresAt}:{}),
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
        const configuration = await client.billingPortal.configurations.retrieve(config.portalConfigurationId);
        verifyPortalConfiguration(configuration,config);
        const session = await client.billingPortal.sessions.create({
          customer:operation.customerId,configuration:config.portalConfigurationId,
          return_url:config.appOrigin + '/settings/billing',expand:['configuration'],
        },{idempotencyKey:operationKey(operation,'portal')});
        verifyPortalConfiguration(session.configuration,config);
        if (!/^bps_[a-zA-Z0-9_]+$/.test(session.id || '') || session.livemode !== false
          || session.customer !== operation.customerId || ref(session.configuration) !== config.portalConfigurationId
          || session.return_url !== config.appOrigin + '/settings/billing' || session.on_behalf_of !== null
          || session.customer_account !== null || session.flow !== null
          || !providerUrl(session.url,'billing.stripe.com')) fail('billing_provider_unavailable');
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
