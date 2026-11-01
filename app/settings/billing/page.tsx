'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import Link from 'next/link';
import {ArrowLeft} from 'lucide-react';
import {Card} from '../../../components/ui/Card';
import {BillingStatusPanel} from '../../../components/billing/BillingStatusPanel';
import {useCloudIdentity} from '../../../lib/cloud/useCloudIdentity';
import {captureSupabaseSessionOwnership} from '../../../lib/supabase/client';
import {sameSupabaseSessionOwnership,supabaseSessionUserId} from '../../../lib/supabase/sessionOwnership-core.mjs';
import {loadOwnerBillingStatus,type BillingStatusResult} from '../../../lib/billingStatusClient.mjs';
import {createOwnerBillingActions,type BillingAction,type BillingActionState} from '../../../lib/billingActionsClient.mjs';
type Owner={userId:string;organisationId:string;role:'owner';accessToken:string;ownership:ReturnType<typeof captureSupabaseSessionOwnership>};
const messages:Record<BillingActionState,string>={redirecting:'Opening secure Stripe billing…',busy:'A billing request is already in progress. Try again in a moment.',denied:'Sign in again with the business owner account to manage billing.',conflict:'Another plan is already being prepared. Refresh billing status before trying again.',review:'This subscription needs a setup check before another Checkout can start.',already_subscribed:'A subscription already exists. Refresh billing status to manage it.',not_started:'Start your subscription before opening billing management.',unavailable:'Billing is temporarily unavailable. Please try again shortly.'};
const subscribeToLocation=(notify:()=>void)=>{window.addEventListener('popstate',notify);return ()=>window.removeEventListener('popstate',notify);};
const pendingCheckout=()=>new URLSearchParams(window.location.search).get('checkout')==='pending';
function ownsCurrentSession(owner:Owner){const current=captureSupabaseSessionOwnership();return sameSupabaseSessionOwnership(current.session,current.epoch,owner.ownership.session,owner.ownership.epoch)&&!current.session?.is_password_recovery&&supabaseSessionUserId(current.session)===owner.userId;}
function OwnerBilling({owner}:{owner:Owner}){
 const [result,setResult]=useState<BillingStatusResult>({state:'loading'}),[revision,setRevision]=useState(0);
 const [busy,setBusy]=useState<BillingAction|null>(null),[actionMessage,setActionMessage]=useState<string|null>(null),inFlight=useRef(false);
 const actionClient=useRef<ReturnType<typeof createOwnerBillingActions>|null>(null);
 const checkoutPending=useSyncExternalStore(subscribeToLocation,pendingCheckout,()=>false);
 useEffect(()=>()=>{actionClient.current?.cancel();},[]);
 useEffect(()=>{
  const controller=new AbortController();
  const isCurrent=()=>!controller.signal.aborted&&ownsCurrentSession(owner);
  void loadOwnerBillingStatus({owner,signal:controller.signal,isCurrent}).then(value=>{if(value&&isCurrent())setResult(value);});
  return ()=>controller.abort();
 },[owner,revision]);
 async function begin(action:BillingAction){
  if(inFlight.current||result.state!=='ready'||!(action==='portal'?result.data.portalAvailable:result.data.checkoutAvailable))return;
  inFlight.current=true;setBusy(action);setActionMessage(action==='portal'?'Opening secure Stripe billing…':'Opening secure Stripe checkout…');
  const actions=createOwnerBillingActions({owner,isCurrent:()=>ownsCurrentSession(owner),navigate:url=>window.location.assign(url)});actionClient.current=actions;
  const outcome=await actions.run(action);inFlight.current=false;
  if(outcome&&ownsCurrentSession(owner)){setBusy(null);setActionMessage(messages[outcome.state]);if(outcome.state==='denied')setResult({state:'denied'});}
 }
 return <BillingStatusPanel result={result} busy={busy} actionMessage={actionMessage} checkoutPending={checkoutPending} onAction={action=>void begin(action)} onRefresh={()=>{setActionMessage(null);setResult({state:'loading'});setRevision(value=>value+1);}}/>;
}
export default function BillingPage(){
 const {identity,isReady,mode}=useCloudIdentity(),ownership=captureSupabaseSessionOwnership(),session=ownership.session;
 if(!isReady)return <Card>Checking your account…</Card>;
 if(mode==='local'||!identity||!session?.access_token||session.is_password_recovery||supabaseSessionUserId(session)!==identity.userId)return <Card><h1 className="text-xl font-bold">Subscription &amp; billing</h1><p className="mt-3 text-sm text-slate-300">Sign in with your normal cloud account to view billing.</p><Link className="mt-4 inline-flex min-h-12 items-center font-semibold text-cyan-300" href="/cloud">Open account settings</Link></Card>;
 if(identity.role!=='owner')return <Card><h1 className="text-xl font-bold">Subscription &amp; billing</h1><p className="mt-3 text-sm text-slate-300">Only the business owner can view and manage subscriptions.</p></Card>;
 const owner:Owner={userId:identity.userId,organisationId:identity.organisationId,role:'owner',accessToken:session.access_token,ownership};
 const key=JSON.stringify([identity.userId,identity.organisationId,identity.role,ownership.epoch,session.access_token]);
 return <div className="mx-auto max-w-3xl space-y-5"><Link href="/settings" className="inline-flex min-h-12 items-center gap-2 text-sm text-cyan-300"><ArrowLeft aria-hidden="true" className="size-5"/>Settings</Link><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Business account</p><h1 className="mt-2 text-3xl font-bold">Subscription &amp; billing</h1><p className="mt-2 text-sm text-slate-400">Your JR OS plan and subscription status.</p></div><OwnerBilling key={key} owner={owner}/></div>;
}
