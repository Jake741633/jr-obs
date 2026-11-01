import {readBillingOwnerRequest} from './billingStatus.mjs';
import {startBillingCheckout,createBillingCheckoutStore} from './billingCheckout.mjs';
import {readStripeBillingConfig,createStripeBillingGateway} from './stripeBilling.mjs';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const gates=['JR_OS_BILLING_CHECKOUT_ENABLED','JR_OS_BILLING_WEBHOOK_ENABLED','JR_OS_BILLING_RECONCILIATION_ENABLED','JR_OS_BILLING_SANDBOX_VERIFIED'];
const error=code=>{throw new Error(code);};
export function createBillingCheckoutHandler({env=process.env,deployment={},fetchImpl=globalThis.fetch,createStore=createBillingCheckoutStore,createGateway=createStripeBillingGateway}={}){
 return async request=>{
  try{
   if(gates.some(name=>env[name]!=='true'))error('billing_checkout_unavailable');
   const access=await readBillingOwnerRequest({request,env,deployment,fetchImpl,validateBody:body=>Object.keys(body).length===1&&['monthly','annual'].includes(body.plan)});
   const config=readStripeBillingConfig(env);
   if(typeof env.SUPABASE_SERVICE_ROLE_KEY!=='string'||!env.SUPABASE_SERVICE_ROLE_KEY.trim())error('billing_checkout_unavailable');
   const result=await startBillingCheckout({owner:access.owner,plan:access.body.plan,store:createStore({env,fetchImpl}),gateway:createGateway({config}),revalidateOwner:access.revalidateOwner});
   if(request.signal.aborted)error('billing_checkout_denied');
   const url=new URL(result.url);
   if(!/^cs_test_[a-zA-Z0-9]+$/.test(result.sessionId||'')||url.protocol!=='https:'||url.hostname!=='checkout.stripe.com'||url.username||url.password||url.port)error('billing_checkout_unavailable');
   return reply({mode:'test',sessionId:result.sessionId,url:result.url});
  }catch(caught){
   const reason=caught?.safeCode||caught?.message;
   const code=['billing_access_denied','billing_sign_in_required','billing_checkout_denied'].includes(reason)?'billing_checkout_denied'
    :['billing_invalid_request','billing_checkout_invalid'].includes(reason)?'billing_checkout_invalid'
    :['billing_checkout_busy','billing_checkout_conflict','billing_checkout_review','billing_already_subscribed'].includes(reason)?reason:'billing_checkout_unavailable';
   const status=code==='billing_checkout_denied'?(reason==='billing_sign_in_required'?401:403):code==='billing_checkout_invalid'?400:code==='billing_checkout_unavailable'?503:409;
   const response=reply({code},status);if(code==='billing_checkout_busy')response.headers.set('Retry-After','2');return response;
  }
 };
}
