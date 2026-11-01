import {runBillingReconciliation,createBillingReconciliationStore} from './billingWorker.mjs';
import {readStripeBillingConfig,createStripeBillingGateway} from './stripeBilling.mjs';

// The platform's native scheduled entry is the only caller. No request body
// controls readiness, scope, deadlines, queue order or batch size.
export async function runBillingScheduledBatch({env=process.env,deployment={},fetchImpl=globalThis.fetch,createStore=createBillingReconciliationStore,createGateway=createStripeBillingGateway,now=()=>performance.now()}={}){
 if(deployment?.context!=='production'||deployment?.published!==true
  ||['JR_OS_BILLING_SCHEDULE_ENABLED','JR_OS_BILLING_RECONCILIATION_ENABLED','JR_OS_BILLING_WEBHOOK_ENABLED','JR_OS_BILLING_SANDBOX_VERIFIED'].some(key=>env[key]!=='true'))return {state:'disabled'};
 const counts={processed:0,review:0,retry:0,deferred:0,stale:0};let handled=0;
 try{
  const config=readStripeBillingConfig(env);
  let last=now();if(!Number.isFinite(last)||last<0)throw Error('billing_schedule_unavailable');
  const processingDeadline=last+20000,totalDeadline=last+24000;
  function remaining(deadline){const current=now();if(!Number.isFinite(current)||current<last)throw Error('billing_schedule_unavailable');last=current;return deadline-current;}
  const store=createStore({env,fetchImpl,remainingRequestMs:()=>Math.min(3000,remaining(totalDeadline))});
  const gateway=createGateway({config,remainingReadMs:()=>remaining(processingDeadline)});
  while(handled<5){
   if(remaining(processingDeadline)<5000)return {state:'finished',handled,counts,stop:'budget'};
   const result=await runBillingReconciliation({store,gateway});
   if(result.state==='idle')return {state:'finished',handled,counts,stop:'idle'};
   if(!Object.hasOwn(counts,result.state))throw Error('billing_schedule_unavailable');
   counts[result.state]++;handled++;
  }
  return {state:'finished',handled,counts,stop:'limit'};
 }catch{return {state:'unavailable',handled,counts};}
}
