import {createBillingPortalHandler} from '../../../../lib/server/billingPortal.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export const POST=createBillingPortalHandler({deployment:{url:process.env.JR_OS_DEPLOY_URL,alias:process.env.JR_OS_DEPLOY_PRIME_URL}});
