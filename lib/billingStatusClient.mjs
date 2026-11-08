const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const instant=value=>value===null||(Number.isSafeInteger(value)&&value>0&&value<=8640000000000000);
function publicStatus(value){
 if(!object(value)||value.mode!=='test'||typeof value.reviewRequired!=='boolean'||typeof value.checkoutAvailable!=='boolean'||typeof value.portalAvailable!=='boolean')return null;
 const capabilities={mode:'test',reviewRequired:value.reviewRequired,checkoutAvailable:value.checkoutAvailable,portalAvailable:value.portalAvailable};
 const sub=value.subscription;if(sub===null)return {...capabilities,subscription:null};
 if(!object(sub)||!['monthly','annual'].includes(sub.plan)||!['active','trialing','past_due','unpaid','paused','canceled','incomplete','incomplete_expired'].includes(sub.status)
  ||!instant(sub.paidThroughMs)||!instant(sub.trialEndsAtMs)||!instant(sub.reconciledAtMs)||sub.reconciledAtMs===null||typeof sub.cancelAtPeriodEnd!=='boolean')return null;
 return {...capabilities,subscription:{plan:sub.plan,status:sub.status,paidThroughMs:sub.paidThroughMs,trialEndsAtMs:sub.trialEndsAtMs,cancelAtPeriodEnd:sub.cancelAtPeriodEnd,reconciledAtMs:sub.reconciledAtMs}};
}
export async function loadOwnerBillingStatus({owner,signal,isCurrent,fetchImpl=globalThis.fetch}){
 const current=()=>!signal?.aborted&&isCurrent();
 if(!current()||owner?.role!=='owner'||!owner.accessToken||!owner.organisationId||!owner.userId)return null;
 const controller=new AbortController(),cancel=()=>controller.abort(signal?.reason);
 signal?.addEventListener('abort',cancel,{once:true});
 // Keep the deadline armed through the complete response body, not just headers.
 const timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetchImpl('/api/billing/status',{method:'POST',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Authorization:'Bearer '+owner.accessToken,'Content-Type':'application/json','x-jr-organisation':owner.organisationId},body:'{}'});
  if(!current())return null;
  if(controller.signal.aborted)return {state:'unavailable'};
  if(!response.ok)return {state:[401,403].includes(response.status)?'denied':'unavailable'};
  const payload=await response.json();if(!current())return null;
  if(controller.signal.aborted)return {state:'unavailable'};
  const data=publicStatus(payload);return data?{state:'ready',data}:{state:'unavailable'};
 }catch{return current()?{state:'unavailable'}:null;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.abort();}
}
