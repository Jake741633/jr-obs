import {createBillingStatusHandler} from '../../../../lib/server/billingStatus.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const POST=createBillingStatusHandler({deployment:{url:process.env.JR_OS_DEPLOY_URL,alias:process.env.JR_OS_DEPLOY_PRIME_URL}});
