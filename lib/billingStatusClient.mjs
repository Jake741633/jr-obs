const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const instant=value=>value===null||(Number.isSafeInteger(value)&&value>0&&value<=8640000000000000);
function publicStatus(value){
 if(!object(value)||value.mode!=='test'||value.checkoutAvailable!==false)return null;
 const sub=value.subscription;if(sub===null)return {mode:'test',checkoutAvailable:false,subscription:null};
 if(!object(sub)||!['monthly','annual'].includes(sub.plan)||!['active','trialing','past_due','unpaid','paused','canceled','incomplete','incomplete_expired'].includes(sub.status)
  ||!instant(sub.paidThroughMs)||!instant(sub.trialEndsAtMs)||!instant(sub.reconciledAtMs)||sub.reconciledAtMs===null||typeof sub.cancelAtPeriodEnd!=='boolean')return null;
 return {mode:'test',checkoutAvailable:false,subscription:{plan:sub.plan,status:sub.status,paidThroughMs:sub.paidThroughMs,trialEndsAtMs:sub.trialEndsAtMs,cancelAtPeriodEnd:sub.cancelAtPeriodEnd,reconciledAtMs:sub.reconciledAtMs}};
}
export async function loadOwnerBillingStatus({owner,signal,isCurrent,fetchImpl=globalThis.fetch}){
 const current=()=>!signal?.aborted&&isCurrent();
 if(!current()||owner?.role!=='owner'||!owner.accessToken||!owner.organisationId||!owner.userId)return null;
 try{
  const response=await fetchImpl('/api/billing/status',{method:'POST',cache:'no-store',redirect:'error',signal,headers:{Authorization:'Bearer '+owner.accessToken,'Content-Type':'application/json','x-jr-organisation':owner.organisationId},body:'{}'});
  if(!current())return null;
  if(!response.ok)return {state:[401,403].includes(response.status)?'denied':'unavailable'};
  const payload=await response.json();if(!current())return null;
  const data=publicStatus(payload);return data?{state:'ready',data}:{state:'unavailable'};
 }catch{return current()?{state:'unavailable'}:null;}
}
