const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail=code=>{throw Object.assign(new Error(code),{safeCode:code});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const instant=value=>value===null||(Number.isSafeInteger(value)&&value>0&&value<=8640000000000000);
function origin(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash&&!u.port?u.origin:null;}catch{return null;}}
async function json(source,maximum,code){
 const reader=source.body?.getReader();if(!reader)fail(code);const chunks=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximum){await reader.cancel();fail(code);}chunks.push(value);}}finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(code);}
}
function subscription(value){
 if(value===null)return null;
 if(!object(value)||!['monthly','annual'].includes(value.plan)||!['active','trialing','past_due','unpaid','paused','canceled','incomplete','incomplete_expired'].includes(value.status)
  ||!instant(value.paidThroughMs)||!instant(value.trialEndsAtMs)||!instant(value.reconciledAtMs)||value.reconciledAtMs===null||typeof value.cancelAtPeriodEnd!=='boolean')fail('billing_status_unavailable');
 return {plan:value.plan,status:value.status,paidThroughMs:value.paidThroughMs,trialEndsAtMs:value.trialEndsAtMs,cancelAtPeriodEnd:value.cancelAtPeriodEnd,reconciledAtMs:value.reconciledAtMs};
}
export function createBillingStatusHandler({env=process.env,deployment={},fetchImpl=globalThis.fetch}={}){
 return async request=>{
  try{
   const supplied=request.headers.get('origin'),target=new URL(request.url).origin;
   const immutable=origin(deployment.url),alias=origin(deployment.alias);
   if(supplied!==target&&!(immutable&&alias&&target===immutable&&supplied===alias))fail('billing_access_denied');
   const token=/^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization')||'')?.[1];if(!token||token.length>16000)fail('billing_sign_in_required');
   const organisationId=request.headers.get('x-jr-organisation');if(!uuid(organisationId))fail('billing_invalid_request');
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))fail('billing_invalid_request');
   const body=await json(request,1000,'billing_invalid_request');if(!object(body)||Object.keys(body).length)fail('billing_invalid_request');
   const base=origin(env.NEXT_PUBLIC_SUPABASE_URL),key=env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!base||!key)fail('billing_status_unavailable');
   const headers={apikey:key,Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'};
   async function call(path,method='GET'){
    const response=await fetchImpl(base+path,{method,headers,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000),...(method==='POST'?{body:'{}'}:{})});
    if(response.status===401)fail('billing_sign_in_required');if(response.status===403)fail('billing_access_denied');if(!response.ok)fail('billing_status_unavailable');
    return json(response,16000,'billing_status_unavailable');
   }
   const user=await call('/auth/v1/user');if(!object(user)||!uuid(user.id)||user.is_anonymous===true)fail('billing_access_denied');
   const result=await call('/rest/v1/rpc/jr_billing_owner_status','POST');
   if(!object(result)||result.actorUserId!==user.id||result.organisationId!==organisationId||result.role!=='owner')fail('billing_access_denied');
   if(result.mode!=='test')fail('billing_status_unavailable');
   return reply({mode:'test',subscription:subscription(result.subscription),checkoutAvailable:false});
  }catch(error){
   const code=['billing_access_denied','billing_sign_in_required','billing_invalid_request'].includes(error?.safeCode)?error.safeCode:'billing_status_unavailable';
   return reply({code},code==='billing_access_denied'?403:code==='billing_sign_in_required'?401:code==='billing_invalid_request'?400:503);
  }
 };
}
