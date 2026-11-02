// Private operator tooling only. No tenant request or browser value authorizes clearance.
const fail=code=>{throw new Error(code);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const version=value=>Number.isInteger(value)&&value>=0&&value<=2147483647;
const resource=(value,prefix)=>typeof value==='string'&&value.length<=128&&new RegExp('^'+prefix+'_[A-Za-z0-9_]+$').test(value);
const reason=value=>['refund','dispute','fraud','credit_note'].includes(value);
const instant=value=>Number.isSafeInteger(value)&&value>0&&value<=8640000000000000;
const outcomes=['cleared','already_recorded','stale','busy','unbound','not_held','needs_investigation','conflict'];
function marker(value){
 if(!object(value)||!reason(value.reason)||typeof value.sourceId!=='string'||value.sourceId.length>128||!/^[a-z]+_[A-Za-z0-9]+$/.test(value.sourceId)||!resource(value.eventId,'evt')||!instant(value.markedAtMs))fail('billing_review_unavailable');
 return {reason:value.reason,sourceId:value.sourceId,eventId:value.eventId,markedAtMs:value.markedAtMs};
}
function inspection(value,organisationId){
 if(!object(value))fail('billing_review_unavailable');
 if(value.state==='unbound')return {state:'unbound'};
 if(!['held','clear'].includes(value.state)||value.organisationId!==organisationId||!resource(value.customerId,'cus')||!/^cus_[A-Za-z0-9]+$/.test(value.customerId)||!version(value.reviewVersion)
  ||!Number.isInteger(value.signalCount)||value.signalCount<0||value.signalCount>2147483647||typeof value.truncated!=='boolean'||value.truncated!==(value.signalCount>20)
  ||typeof value.reconciliationBusy!=='boolean'||!Array.isArray(value.signals)||value.signals.length!==Math.min(20,value.signalCount))fail('billing_review_unavailable');
 const review=value.state==='held'?marker(value.review):null;
 if(value.state==='clear'&&(value.review!==null||value.signalCount!==0))fail('billing_review_unavailable');
 let previous=0;const seen=new Set();
 const signals=value.signals.map(signal=>{
  if(!object(signal)||!version(signal.reviewVersion)||signal.reviewVersion<=previous||signal.reviewVersion>value.reviewVersion)fail('billing_review_unavailable');
  const fields=marker(signal);if(seen.has(fields.eventId))fail('billing_review_unavailable');seen.add(fields.eventId);previous=signal.reviewVersion;
  return {reviewVersion:signal.reviewVersion,...fields};
 });
 return {state:value.state,organisationId,customerId:value.customerId,reviewVersion:value.reviewVersion,review,signals,signalCount:value.signalCount,truncated:value.truncated,reconciliationBusy:value.reconciliationBusy};
}
function decision(value){
 if(!object(value)||!uuid(value.organisationId)||!resource(value.customerId,'cus')||!/^cus_[A-Za-z0-9]+$/.test(value.customerId)||!version(value.expectedVersion)||!uuid(value.resolutionId)
  ||typeof value.operatorReference!=='string'||!/^[A-Za-z0-9][A-Za-z0-9@._:/+-]{2,127}$/.test(value.operatorReference)
  ||typeof value.note!=='string'||value.note.length<12||value.note.length>1000||value.note.trim()!==value.note||value.note.includes('\0'))fail('billing_review_invalid_request');
 return {p_organisation_id:value.organisationId.toLowerCase(),p_customer_id:value.customerId,p_expected_version:value.expectedVersion,p_resolution_id:value.resolutionId.toLowerCase(),p_operator_reference:value.operatorReference,p_note:value.note};
}
export function createBillingReviewOperator({env=process.env,fetchImpl=globalThis.fetch}={}){
 if(typeof window!=='undefined')fail('billing_review_unavailable');
 let base;try{base=new URL(env.NEXT_PUBLIC_SUPABASE_URL);}catch{fail('billing_review_unavailable');}
 const key=env.SUPABASE_SERVICE_ROLE_KEY,enabled=env.JR_OS_BILLING_REVIEW_RESOLUTION_ENABLED==='true';
 if(base.protocol!=='https:'||base.username||base.password||base.port||base.pathname!=='/'||base.search||base.hash||typeof key!=='string'||!key.trim())fail('billing_review_unavailable');
 async function rpc(name,parameters){
  try{
   const response=await fetchImpl(base.origin+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(parameters)});
   if(!response.ok)fail('billing_review_unavailable');const reader=response.body?.getReader();if(!reader)fail('billing_review_unavailable');
   const chunks=[];let bytes=0;try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>32768){await reader.cancel();fail('billing_review_unavailable');}chunks.push(value);}}finally{reader.releaseLock();}
   return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch{fail('billing_review_unavailable');}
 }
 return Object.freeze({
  async inspect(organisationId){if(!uuid(organisationId))fail('billing_review_invalid_request');const id=organisationId.toLowerCase();return inspection(await rpc('jr_billing_operator_review',{p_organisation_id:id}),id);},
  async resolve(value){
   if(!enabled)fail('billing_review_disabled');const parameters=decision(value),result=await rpc('jr_billing_resolve_review',parameters);
   if(!object(result)||!outcomes.includes(result.state))fail('billing_review_unavailable');return {state:result.state};
  },
 });
}
