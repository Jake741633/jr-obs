import {createBillingWebhookHandler} from '../../../../lib/server/billingWebhook.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const POST=createBillingWebhookHandler();
