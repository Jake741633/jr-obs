// Server-only checkout coordinator. Caller must authenticate the signed user,
// bind the intended organisation and supply fresh normal-owner revalidation.
// No public route or feature flag invokes this module yet.
const fail=code=>{throw new Error(code);};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const customer=value=>typeof value==='string'&&/^cus_[a-zA-Z0-9]+$/.test(value);
const session=value=>typeof value==='string'&&/^cs_test_[a-zA-Z0-9]+$/.test(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function providerUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='checkout.stripe.com'&&!u.username&&!u.password&&!u.port;}catch{return false;}}
export function createBillingCheckoutStore({env=process.env,fetchImpl=globalThis.fetch}={}){
 if(typeof window!=='undefined')fail('billing_checkout_unavailable');
 let base;try{base=new URL(env.NEXT_PUBLIC_SUPABASE_URL);}catch{fail('billing_checkout_unavailable');}
 if(base.protocol!=='https:'||base.username||base.password||base.port||base.pathname!=='/'||base.search||base.hash||!env.SUPABASE_SERVICE_ROLE_KEY)fail('billing_checkout_unavailable');
 async function rpc(name,parameters){try{
  const response=await fetchImpl(base.origin+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(parameters)});
  if(response.status===403)fail('billing_checkout_denied');if(!response.ok)fail('billing_checkout_unavailable');
  const reader=response.body?.getReader();if(!reader)fail('billing_checkout_unavailable');let size=0;const parts=[];
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>20000){await reader.cancel();fail('billing_checkout_unavailable');}parts.push(value);}}finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
 }catch(error){fail(error?.message==='billing_checkout_denied'?'billing_checkout_denied':'billing_checkout_unavailable');}}
 async function boolean(name,args){const result=await rpc(name,args);if(typeof result!=='boolean')fail('billing_checkout_unavailable');return result;}
 return Object.freeze({
  async reserve(owner,plan){
   const value=await rpc('jr_billing_reserve_checkout',{p_organisation_id:owner.organisationId,p_actor_id:owner.userId,p_plan:plan});
   if(!object(value)||!['reserved','busy','conflict','review','subscribed'].includes(value.state))fail('billing_checkout_unavailable');
   if(value.state==='reserved'){
    const op=value.operation;if(!object(op)||!uuid(op.operationId)||op.organisationId!==owner.organisationId||!uuid(op.leaseToken)||!['monthly','annual'].includes(op.plan)
     ||!(op.customerId===null||customer(op.customerId))||!(op.providerSessionId===null||session(op.providerSessionId))||(op.providerSessionId!==null&&op.customerId===null)
     ||!Number.isSafeInteger(op.createdAtMs)||op.createdAtMs<=0||!Number.isSafeInteger(op.expiresAt)||op.expiresAt<=0)fail('billing_checkout_unavailable');
   }return value;
  },
  bind:(op,owner,customerId)=>boolean('jr_billing_bind_checkout_customer',{p_operation_id:op.operationId,p_lease_token:op.leaseToken,p_actor_id:owner.userId,p_customer_id:customerId}),
  record:(op,owner,result)=>boolean('jr_billing_record_checkout_session',{p_operation_id:op.operationId,p_lease_token:op.leaseToken,p_actor_id:owner.userId,p_session_id:result.sessionId,p_expires_at:result.expiresAt}),
  release:(op,owner,outcome)=>boolean('jr_billing_release_checkout',{p_operation_id:op.operationId,p_lease_token:op.leaseToken,p_actor_id:owner.userId,p_outcome:outcome}),
 });
}
export async function startBillingCheckout({owner,plan,store,gateway,revalidateOwner,now=Date.now}){
 if(!['monthly','annual'].includes(plan))fail('billing_checkout_invalid');
 if(owner?.role!=='owner'||!uuid(owner.userId)||!uuid(owner.organisationId)||typeof revalidateOwner!=='function'||await revalidateOwner()!==true)fail('billing_checkout_denied');
 for(let cleanup=0;cleanup<2;cleanup++){
  const reserved=await store.reserve(owner,plan);
  if(reserved.state!=='reserved')fail({busy:'billing_checkout_busy',conflict:'billing_checkout_conflict',review:'billing_checkout_review',subscribed:'billing_already_subscribed'}[reserved.state]||'billing_checkout_unavailable');
  let op=reserved.operation;
  try{
   if(await revalidateOwner()!==true)fail('billing_checkout_denied');
   if(op.providerSessionId){
    const current=await gateway.readCheckoutSession({...op,sessionId:op.providerSessionId});
    if(current.status==='expired'){
     if(!await store.release(op,owner,'expired'))fail('billing_checkout_busy');
     continue;
    }
    if(current.status==='complete'){
     const subscription=await gateway.readSubscriptionStatus({customerId:op.customerId,subscriptionId:current.subscriptionId});
     if(['canceled','incomplete_expired'].includes(subscription.status)){
      if(!await store.release(op,owner,'retired'))fail('billing_checkout_busy');
      continue;
     }
     fail('billing_already_subscribed');
    }
    if(op.plan!==plan)fail('billing_checkout_conflict');
    if(current.status!=='open'||current.expiresAt!==op.expiresAt||current.expiresAt*1000<=now()||!providerUrl(current.url)||current.sessionId!==op.providerSessionId)fail('billing_checkout_review');
    if(!await store.release(op,owner,'retry'))fail('billing_checkout_busy');
    if(await revalidateOwner()!==true)fail('billing_checkout_denied');
    return {sessionId:current.sessionId,url:current.url};
   }
   if(now()-op.createdAtMs>=1200000)fail('billing_checkout_review');
   if(!op.customerId){
    const created=await gateway.createBillingCustomer({organisationId:op.organisationId,operationId:op.operationId});
    if(!customer(created.customerId))fail('billing_checkout_review');
    if(!await store.bind(op,owner,created.customerId))fail('billing_checkout_busy');
    op={...op,customerId:created.customerId};
   }
   if(await revalidateOwner()!==true)fail('billing_checkout_denied');
   const operation={organisationId:op.organisationId,customerId:op.customerId,operationId:op.operationId,plan:op.plan,expiresAt:op.expiresAt};
   const created=await gateway.createCheckout(operation);
   if(!session(created.sessionId))fail('billing_checkout_review');
   const current=await gateway.readCheckoutSession({...operation,sessionId:created.sessionId});
   if(current.sessionId!==created.sessionId||current.expiresAt!==op.expiresAt||!['open','complete','expired'].includes(current.status))fail('billing_checkout_review');
   if(!await store.record(op,owner,current))fail('billing_checkout_busy');
   if(current.status==='complete')fail('billing_already_subscribed');
   if(current.status!=='open'||current.expiresAt*1000<=now()||!providerUrl(current.url))fail('billing_checkout_review');
   if(await revalidateOwner()!==true)fail('billing_checkout_denied');
   return {sessionId:current.sessionId,url:current.url};
  }catch(error){
   const allowed=['billing_checkout_busy','billing_checkout_conflict','billing_checkout_denied','billing_checkout_review','billing_already_subscribed'];
   const code=allowed.includes(error?.message)?error.message:'billing_checkout_unavailable';
   try{await store.release(op,owner,code==='billing_already_subscribed'?(op.providerSessionId?'retry':'subscribed'):code==='billing_checkout_review'?'review':'retry');}catch{/* durable operation remains reserved until lease recovery */}
   fail(code);
  }
 }
 fail('billing_checkout_review');
}
