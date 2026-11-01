'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft} from 'lucide-react';
import {Card} from '../../../components/ui/Card';
import {BillingStatusPanel} from '../../../components/billing/BillingStatusPanel';
import {useCloudIdentity} from '../../../lib/cloud/useCloudIdentity';
import {captureSupabaseSessionOwnership} from '../../../lib/supabase/client';
import {sameSupabaseSessionOwnership,supabaseSessionUserId} from '../../../lib/supabase/sessionOwnership-core.mjs';
import {loadOwnerBillingStatus,type BillingStatusResult} from '../../../lib/billingStatusClient.mjs';
type Owner={userId:string;organisationId:string;role:'owner';accessToken:string;ownership:ReturnType<typeof captureSupabaseSessionOwnership>};
function OwnerBilling({owner}:{owner:Owner}){
 const [result,setResult]=useState<BillingStatusResult>({state:'loading'}),[revision,setRevision]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  const isCurrent=()=>{const current=captureSupabaseSessionOwnership();return !controller.signal.aborted&&sameSupabaseSessionOwnership(current.session,current.epoch,owner.ownership.session,owner.ownership.epoch)&&!current.session?.is_password_recovery&&supabaseSessionUserId(current.session)===owner.userId;};
  void loadOwnerBillingStatus({owner,signal:controller.signal,isCurrent}).then(value=>{if(value&&isCurrent())setResult(value);});
  return ()=>controller.abort();
 },[owner,revision]);
 return <BillingStatusPanel result={result} onRefresh={()=>{setResult({state:'loading'});setRevision(value=>value+1);}}/>;
}
export default function BillingPage(){
 const {identity,isReady,mode}=useCloudIdentity(),ownership=captureSupabaseSessionOwnership(),session=ownership.session;
 if(!isReady)return <Card>Checking your account…</Card>;
 if(mode==='local'||!identity||!session?.access_token||session.is_password_recovery||supabaseSessionUserId(session)!==identity.userId)return <Card><h1 className="text-xl font-bold">Subscription &amp; billing</h1><p className="mt-3 text-sm text-slate-300">Sign in with your normal cloud account to view billing.</p><Link className="mt-4 inline-flex min-h-12 items-center font-semibold text-cyan-300" href="/cloud">Open account settings</Link></Card>;
 if(identity.role!=='owner')return <Card><h1 className="text-xl font-bold">Subscription &amp; billing</h1><p className="mt-3 text-sm text-slate-300">Only the business owner can view and manage subscriptions.</p></Card>;
 const owner:Owner={userId:identity.userId,organisationId:identity.organisationId,role:'owner',accessToken:session.access_token,ownership};
 const key=JSON.stringify([identity.userId,identity.organisationId,identity.role,ownership.epoch]);
 return <div className="mx-auto max-w-3xl space-y-5"><Link href="/settings" className="inline-flex min-h-12 items-center gap-2 text-sm text-cyan-300"><ArrowLeft aria-hidden="true" className="size-5"/>Settings</Link><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Business account</p><h1 className="mt-2 text-3xl font-bold">Subscription &amp; billing</h1><p className="mt-2 text-sm text-slate-400">Your JR OS plan and subscription status.</p></div><OwnerBilling key={key} owner={owner}/></div>;
}
