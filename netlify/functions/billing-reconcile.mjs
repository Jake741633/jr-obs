import {runBillingScheduledBatch} from '../../lib/server/billingScheduled.mjs';

// Netlify environment values are server-only and scoped to Functions. No
// fallback to request headers, query strings, bodies or client storage.
const names=['JR_OS_BILLING_SCHEDULE_ENABLED','JR_OS_BILLING_RECONCILIATION_ENABLED','JR_OS_BILLING_WEBHOOK_ENABLED','JR_OS_BILLING_SANDBOX_VERIFIED',
 'NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','STRIPE_MODE','STRIPE_ACCOUNT_ID','STRIPE_RESTRICTED_KEY','STRIPE_WEBHOOK_SECRET',
 'STRIPE_PRICE_MONTHLY','STRIPE_PRICE_ANNUAL','STRIPE_PORTAL_CONFIGURATION_ID','APP_ORIGIN'];
export default async function billingReconcile(request,context){
 const env=Object.fromEntries(names.map(name=>[name,globalThis.Netlify?.env?.get(name)]));
 const result=await runBillingScheduledBatch({env,deployment:context?.deploy});
 console.info(JSON.stringify({event:'jr_billing_schedule',...result}));
 if(result.state==='unavailable')throw Error('billing_schedule_unavailable');
 return new Response(null,{status:204});
}
// Every minute, in UTC. Native scheduled functions have no public URL trigger.
export const config={schedule:'* * * * *'};
