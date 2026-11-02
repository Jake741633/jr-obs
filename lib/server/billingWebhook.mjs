import {readStripeBillingConfig,createStripeBillingGateway} from './stripeBilling.mjs';

const supported=new Set([
  'checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed',
  'customer.subscription.created','customer.subscription.updated','customer.subscription.deleted',
  'customer.subscription.paused','customer.subscription.resumed',
  'invoice.paid','invoice.payment_failed','invoice.payment_action_required','invoice.voided','invoice.marked_uncollectible',
  'charge.dispute.created','charge.refunded','radar.early_fraud_warning.created','credit_note.created',
]);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function readBounded(source,limit){
  const reader=source.body?.getReader();if(!reader)fail('billing_invalid_webhook');
  let size=0;const chunks=[];
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();fail('billing_webhook_too_large');}chunks.push(value);}}
  finally{reader.releaseLock();}
  return Buffer.concat(chunks);
}
function persistenceConfiguration(env){
  const value=env.NEXT_PUBLIC_SUPABASE_URL;let base;
  try{base=new URL(value);}catch{fail('billing_webhook_unavailable');}
  if(typeof value!=='string'||value.trim()!==value||base.protocol!=='https:'||base.username||base.password||base.port||base.pathname!=='/'||base.search||base.hash
    ||typeof env.SUPABASE_SERVICE_ROLE_KEY!=='string'||!env.SUPABASE_SERVICE_ROLE_KEY.trim())fail('billing_webhook_unavailable');
  return {url:base.origin+'/rest/v1/rpc/jr_billing_receive_event',key:env.SUPABASE_SERVICE_ROLE_KEY};
}

// Durable RECEIPT only. The worker must reconcile current provider state and
// commit entitlement changes with lease fencing before marking work processed.
export function createBillingWebhookHandler({env=process.env,fetchImpl=globalThis.fetch}={}){
 return async function POST(request){
  try{
   if(env.JR_OS_BILLING_WEBHOOK_ENABLED!=='true')fail('billing_webhook_unavailable');
   const config=readStripeBillingConfig(env),persistence=persistenceConfiguration(env);
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))fail('billing_invalid_webhook');
   const raw=await readBounded(request,1000000);
   const event=createStripeBillingGateway({config}).verifyWebhook(raw,request.headers.get('stripe-signature'));
   if(!supported.has(event.type))return reply({received:true,ignored:true});
   const response=await fetchImpl(persistence.url,{
    method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),
    headers:{apikey:persistence.key,Authorization:'Bearer '+persistence.key,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({p_account_id:config.accountId,p_event:event}),
   });
   if(!response.ok)fail('billing_webhook_unavailable');
   let received;
   try{received=JSON.parse((await readBounded(response,1000)).toString('utf8'));}
   catch{fail('billing_webhook_unavailable');}
   if(!received||Array.isArray(received)||received.received!==true||typeof received.duplicate!=='boolean')fail('billing_webhook_unavailable');
   return reply({received:true,duplicate:received.duplicate});
  }catch(error){
   const code=error?.code==='billing_webhook_too_large'?'billing_webhook_too_large':error?.code==='billing_invalid_webhook'||error?.message==='billing_invalid_webhook'?'billing_invalid_webhook':'billing_webhook_unavailable';
   return reply({code},code==='billing_webhook_too_large'?413:code==='billing_invalid_webhook'?400:503);
  }
 };
}
