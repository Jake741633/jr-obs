// Phone action controller. One pending request, no client-supplied resources,
// and no state/navigation after the captured owner is retired.
const states=new Map([['billing_checkout_busy','busy'],['billing_portal_busy','busy'],['billing_checkout_conflict','conflict'],['billing_checkout_review','review'],['billing_already_subscribed','already_subscribed'],['billing_portal_not_started','not_started']]);
export function createOwnerBillingActions({owner,isCurrent,navigate,fetchImpl=globalThis.fetch}){
 let pending=false,disposed=false,controller;
 const current=()=>!disposed&&isCurrent();
 return Object.freeze({
  cancel(){disposed=true;controller?.abort();},
  async run(action){
   if(!current()||owner?.role!=='owner'||!owner.accessToken||!owner.userId||!owner.organisationId)return null;
   if(!['monthly','annual','portal'].includes(action))return {state:'unavailable'};
   if(pending)return {state:'busy'};
   pending=true;controller=new AbortController();const timer=setTimeout(()=>controller.abort(),60000);
   try{
    const portal=action==='portal';
    const response=await fetchImpl(portal?'/api/billing/portal':'/api/billing/checkout',{method:'POST',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Authorization:'Bearer '+owner.accessToken,'Content-Type':'application/json','x-jr-organisation':owner.organisationId},body:portal?'{}':JSON.stringify({plan:action})});
    if(!current())return null;if(controller.signal.aborted)return {state:'unavailable'};
    if([401,403].includes(response.status))return {state:'denied'};
    if(!response.ok&&response.status!==409)return {state:'unavailable'};
    const value=await response.json();
    if(!current())return null;if(controller.signal.aborted)return {state:'unavailable'};
    if(!response.ok)return {state:states.get(value?.code)??'unavailable'};
    const url=new URL(value?.url);
    if(value?.mode!=='test'||!(portal?/^bps_[a-zA-Z0-9]+$/:/^cs_test_[a-zA-Z0-9]+$/).test(value.sessionId||'')
     ||url.protocol!=='https:'||url.hostname!==(portal?'billing.stripe.com':'checkout.stripe.com')||url.username||url.password||url.port)return {state:'unavailable'};
    if(!current())return null;
    navigate(value.url);return {state:'redirecting'};
   }catch{return current()?{state:'unavailable'}:null;}
   finally{clearTimeout(timer);pending=false;}
  },
 });
}
