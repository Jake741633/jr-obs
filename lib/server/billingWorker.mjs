import {reconciledSubscription} from './billingReconciliation.mjs';
import {readStripeBillingConfig,createStripeBillingGateway} from './stripeBilling.mjs';
const unavailable=()=>{throw new Error('billing_store_unavailable');};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

export function createBillingReconciliationStore({env=process.env,fetchImpl=globalThis.fetch}={}){
 if(typeof window!=='undefined')unavailable();
 let base;try{base=new URL(env.NEXT_PUBLIC_SUPABASE_URL);}catch{unavailable();}
 if(base.protocol!=='https:'||base.username||base.password||base.port||base.pathname!=='/'||base.search||base.hash
  ||typeof env.SUPABASE_SERVICE_ROLE_KEY!=='string'||!env.SUPABASE_SERVICE_ROLE_KEY.trim())unavailable();
 async function rpc(name,parameters){
  try{
   const response=await fetchImpl(base.origin+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),
    headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(parameters)});
   if(!response.ok)unavailable();
   const reader=response.body?.getReader();if(!reader)unavailable();
   let size=0;const parts=[];try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>2100000){await reader.cancel();unavailable();}parts.push(value);}}finally{reader.releaseLock();}
   return JSON.parse(Buffer.concat(parts).toString('utf8'));
  }catch{unavailable();}
 }
 async function booleanRpc(name,parameters){const result=await rpc(name,parameters);if(typeof result!=='boolean')unavailable();return result;}
 return Object.freeze({
  async claimEvent(){
   const item=await rpc('jr_billing_claim_event',{});if(item===null)return null;
   if(!record(item)||typeof item.event_id!=='string'||!/^evt_[A-Za-z0-9_]+$/.test(item.event_id)||!uuid(item.lease_token)
    ||!Number.isSafeInteger(item.attempts)||item.attempts<1||item.attempts>10||!record(item.payload)||item.payload.id!==item.event_id)unavailable();return item;
  },
  async beginReconciliation(job,customerId){
   const lock=await rpc('jr_billing_begin_reconciliation',{p_event_id:job.event_id,p_lease_token:job.lease_token,p_customer_id:customerId});
   if(!record(lock)||!['acquired','busy','stale','unbound'].includes(lock.state)
    ||(lock.state==='acquired'&&(!uuid(lock.organisation_id)||!uuid(lock.token))))unavailable();return lock;
  },
  finishEvent:(job,outcome)=>booleanRpc('jr_billing_finish_event',{p_event_id:job.event_id,p_lease_token:job.lease_token,p_outcome:outcome}),
  completeReconciliation:(job,lock,snapshot,outcome)=>booleanRpc('jr_billing_complete_reconciliation',{p_event_id:job.event_id,p_lease_token:job.lease_token,p_reconcile_token:lock.token,p_snapshot:snapshot,p_outcome:outcome}),
 });
}

// One job per invocation. No public route/scheduler activates this worker.
export async function runBillingReconciliation({store,gateway}){
 const job=await store.claimEvent();if(!job)return {state:'idle'};
 let lock=null;
 async function conclude(outcome,snapshot=null){
  const committed=lock?await store.completeReconciliation(job,lock,snapshot,outcome):await store.finishEvent(job,outcome);
  return {state:!committed?'stale':outcome==='defer'?'deferred':outcome==='retry'&&job.attempts>=10?'review':outcome};
 }
 try{
  // Risk decisions require their own verified object graph and review workflow.
  // Never interpret refund/credit-note/fraud evidence as successful payment.
  if(/^(charge\.|radar\.|credit_note\.)/.test(job.payload.type||''))return await conclude('review');
  const target=await gateway.resolveSubscriptionTarget(job.payload);
  const candidate=await store.beginReconciliation(job,target.customerId);
  if(candidate.state==='stale')return {state:'stale'};
  if(candidate.state==='unbound')return await conclude('review');
  if(candidate.state==='busy')return await conclude('defer');
  lock=candidate;
  const evidence=await gateway.readSubscriptionEvidence(target);
  const snapshot=reconciledSubscription({...target,organisationId:lock.organisation_id,evidence});
  return await conclude('processed',snapshot);
 }catch(error){return conclude(error?.message==='billing_evidence_review'?'review':'retry');}
}

export async function runConfiguredBillingReconciliation({env=process.env,fetchImpl=globalThis.fetch}={}){
 if(env.JR_OS_BILLING_RECONCILIATION_ENABLED!=='true')return {state:'disabled'};
 try{return await runBillingReconciliation({store:createBillingReconciliationStore({env,fetchImpl}),gateway:createStripeBillingGateway({config:readStripeBillingConfig(env)})});}
 catch{return {state:'unavailable'};}
}
