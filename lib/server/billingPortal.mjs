import {readBillingOwnerRequest} from './billingStatus.mjs';
import {readStripeBillingConfig,createStripeBillingGateway} from './stripeBilling.mjs';
const fail=code=>{throw new Error(code);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const portalId=value=>typeof value==='string'&&/^bps_[a-zA-Z0-9]+$/.test(value);
function portalUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='billing.stripe.com'&&!u.username&&!u.password&&!u.port;}catch{return false;}}
export function createBillingPortalStore({env=process.env,fetchImpl=globalThis.fetch}={}){
 if(typeof window!=='undefined')fail('billing_portal_unavailable');
 let base;try{base=new URL(env.NEXT_PUBLIC_SUPABASE_URL);}catch{fail('billing_portal_unavailable');}
 if(base.protocol!=='https:'||base.username||base.password||base.port||base.pathname!=='/'||base.search||base.hash||typeof env.SUPABASE_SERVICE_ROLE_KEY!=='string'||!env.SUPABASE_SERVICE_ROLE_KEY.trim())fail('billing_portal_unavailable');
 async function rpc(name,parameters){try{
  const response=await fetchImpl(base.origin+'/rest/v1/rpc/'+name,{method:'POST',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000),headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(parameters)});
  if(response.status===403)fail('billing_portal_denied');if(!response.ok)fail('billing_portal_unavailable');
  const reader=response.body?.getReader();if(!reader)fail('billing_portal_unavailable');let size=0;const parts=[];
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8000){await reader.cancel();fail('billing_portal_unavailable');}parts.push(value);}}finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
 }catch(error){fail(error?.message==='billing_portal_denied'?'billing_portal_denied':'billing_portal_unavailable');}}
 return Object.freeze({
  async reserve(owner){
   const value=await rpc('jr_billing_reserve_portal',{p_organisation_id:owner.organisationId,p_actor_id:owner.userId});
   if(!object(value)||!['reserved','busy','unbound'].includes(value.state))fail('billing_portal_unavailable');
   if(value.state!=='reserved')return {state:value.state};
   const op=value.operation;if(!object(op)||!uuid(op.operationId)||!uuid(op.leaseToken)||op.organisationId!==owner.organisationId||!/^cus_[a-zA-Z0-9]+$/.test(op.customerId||''))fail('billing_portal_unavailable');
   return {state:'reserved',operation:Object.freeze({operationId:op.operationId,leaseToken:op.leaseToken,organisationId:op.organisationId,customerId:op.customerId})};
  },
  async finish(op,owner,sessionId){
   const value=await rpc('jr_billing_finish_portal',{p_operation_id:op.operationId,p_lease_token:op.leaseToken,p_actor_id:owner.userId,p_session_id:sessionId});
   if(typeof value!=='boolean')fail('billing_portal_unavailable');return value;
  },
 });
}
export function createBillingPortalHandler({env=process.env,deployment={},fetchImpl=globalThis.fetch,createStore=createBillingPortalStore,createGateway=createStripeBillingGateway}={}){
 return async request=>{
  let store,op,access;
  try{
   if(['JR_OS_BILLING_PORTAL_ENABLED','JR_OS_BILLING_WEBHOOK_ENABLED','JR_OS_BILLING_RECONCILIATION_ENABLED','JR_OS_BILLING_SANDBOX_VERIFIED'].some(key=>env[key]!=='true'))fail('billing_portal_unavailable');
   access=await readBillingOwnerRequest({request,env,deployment,fetchImpl});
   const config=readStripeBillingConfig(env);store=createStore({env,fetchImpl});
   const reserved=await store.reserve(access.owner);
   if(reserved.state==='busy')fail('billing_portal_busy');if(reserved.state==='unbound')fail('billing_portal_not_started');op=reserved.operation;
   if(!await access.revalidateOwner())fail('billing_portal_denied');
   const {organisationId,customerId,operationId}=op;
   const result=await createGateway({config}).createPortal({organisationId,customerId,operationId});
   if(!portalId(result?.sessionId)||!portalUrl(result?.url))fail('billing_portal_unavailable');
   if(!await access.revalidateOwner())fail('billing_portal_denied');
   if(!await store.finish(op,access.owner,result.sessionId))fail('billing_portal_unavailable');
   if(!await access.revalidateOwner()||request.signal.aborted)fail('billing_portal_denied');
   return Response.json({mode:'test',sessionId:result.sessionId,url:result.url},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch(error){
   if(store&&op&&access){try{await store.finish(op,access.owner,null);}catch{/* Never expose or overwrite an already completed attempt. */}}
   const reason=error?.safeCode||error?.message;
   const code=['billing_sign_in_required','billing_access_denied','billing_portal_denied'].includes(reason)?'billing_portal_denied'
    :reason==='billing_invalid_request'?'billing_portal_invalid'
    :['billing_portal_busy','billing_portal_not_started'].includes(reason)?reason:'billing_portal_unavailable';
   const status=code==='billing_portal_denied'?(reason==='billing_sign_in_required'?401:403):code==='billing_portal_invalid'?400:code==='billing_portal_unavailable'?503:409;
   const response=Response.json({code},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});if(code==='billing_portal_busy')response.headers.set('Retry-After','2');return response;
  }
 };
}
