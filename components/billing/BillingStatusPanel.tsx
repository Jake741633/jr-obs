import {CreditCard,CalendarDays,RefreshCw,ShieldCheck} from 'lucide-react';
import {Card} from '../ui/Card';
import {Button} from '../ui/Button';
import type {BillingStatusResult,PublicBillingSubscription} from '../../lib/billingStatusClient.mjs';
import type {BillingAction} from '../../lib/billingActionsClient.mjs';
const date=(value:number)=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/London'}).format(value);
function stateLabel(sub:PublicBillingSubscription|null){
 if(!sub)return 'No subscription started';
 if(sub.status==='active')return sub.paidThroughMs&&sub.paidThroughMs>Date.now()?'Active subscription':sub.paidThroughMs?'Paid period ended':'Payment confirmation needed';
 if(sub.status==='trialing')return sub.trialEndsAtMs&&sub.trialEndsAtMs>Date.now()?'Trial in progress':'Trial ended';
 if(sub.status==='canceled')return 'Cancelled';
 return 'Payment needs attention';
}
export function BillingStatusPanel({result,onRefresh,onAction,busy=null,actionMessage=null,checkoutPending=false,reviewReported=false}:{result:BillingStatusResult;onRefresh:()=>void;onAction?:(action:BillingAction)=>void;busy?:BillingAction|null;actionMessage?:string|null;checkoutPending?:boolean;reviewReported?:boolean}){
 const sub=result.state==='ready'?result.data.subscription:null;
 const review=result.state!=='denied'&&(reviewReported||result.state==='ready'&&result.data.reviewRequired);
 const checkout=!review&&result.state==='ready'&&result.data.reviewRequired===false&&result.data.checkoutAvailable,portal=result.state==='ready'&&result.data.portalAvailable;
 const label=review?'Payment needs review':stateLabel(sub),pending=checkoutPending&&!review&&label!=='Active subscription';
 return <div className="space-y-5">
  {pending?<Card><p role="status" className="text-sm text-amber-200">Checkout returned. Your payment confirmation is pending. Refresh billing status in a moment.</p></Card>:null}
  <Card>
   <div className="flex flex-wrap items-start justify-between gap-4"><div><CreditCard className="size-9 text-cyan-300" aria-hidden="true"/><h2 className="mt-3 text-xl font-bold">Your subscription</h2></div><span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-200">Stripe sandbox</span></div>
   <div aria-live="polite" className="mt-4 space-y-2">
    {result.state==='loading'&&!review?<p>Checking your billing status…</p>:result.state==='denied'?<p>Sign in with the business owner account to view billing.</p>:result.state==='unavailable'&&!review?<><p className="font-semibold text-amber-200">Subscription setup in progress</p><p className="text-sm text-slate-300">Billing status is not available yet. Try again once account setup is complete.</p></>:<><p className="text-lg font-semibold">{label}</p>{review?<p className="text-sm text-amber-200">New subscriptions are paused while your payment is reviewed.</p>:null}{sub?<><p className="text-sm text-slate-300">JR OS Business · {sub.plan==='annual'?'Annual':'Monthly'}</p>{!review&&sub.status==='active'&&sub.paidThroughMs?<p className="flex items-center gap-2 text-sm"><CalendarDays aria-hidden="true" className="size-5 text-cyan-300"/>{sub.cancelAtPeriodEnd?'Ends on':'Paid through'} {date(sub.paidThroughMs)}</p>:null}{!review&&sub.status==='trialing'&&sub.trialEndsAtMs?<p className="text-sm">Trial ends {date(sub.trialEndsAtMs)}</p>:null}<p className="text-xs text-slate-400">Last checked {date(sub.reconciledAtMs)}</p></>:null}</>}
   </div>
   <Button variant="secondary" className="mt-5 min-h-12 w-full gap-2 sm:w-auto" disabled={result.state==='loading'||Boolean(busy)} onClick={onRefresh}><RefreshCw aria-hidden="true" className="size-5"/>Refresh billing status</Button>
  </Card>
  <div className="grid gap-4 sm:grid-cols-2">
   <Card><p className="font-semibold text-slate-300">Monthly</p><p className="mt-2 text-4xl font-bold">£29<span className="text-base font-normal text-slate-400"> / month</span></p><p className="mt-3 text-sm text-slate-300">JR OS Business for one business.</p><Button className="mt-5 min-h-14 w-full" disabled={!checkout||Boolean(busy)||!onAction} onClick={()=>onAction?.('monthly')}>Choose monthly</Button></Card>
   <Card><p className="font-semibold text-slate-300">Annual</p><p className="mt-2 text-4xl font-bold">£290<span className="text-base font-normal text-slate-400"> / year</span></p><p className="mt-3 text-sm text-slate-300">Two months free compared with monthly billing.</p><Button className="mt-5 min-h-14 w-full" disabled={!checkout||Boolean(busy)||!onAction} onClick={()=>onAction?.('annual')}>Choose annual</Button></Card>
  </div>
  <Card><h2 className="font-bold">Planned founding customer offer</h2><p className="mt-2 text-sm text-slate-300">£19/month for the first 12 months, then £29/month. Limited to the first 20 eligible businesses. This offer is not available in Checkout yet.</p></Card>
  <Card><ShieldCheck aria-hidden="true" className="size-8 text-cyan-300"/><h2 className="mt-3 font-bold">{review?'Payment review in progress':checkout||portal?'Secure Stripe billing':'Payments are not open yet'}</h2><p className="mt-2 text-sm text-slate-300">{review?'Use Manage subscription when available to view invoices, update your payment method or cancel. A review is needed before you can start another subscription.':checkout||portal?'Use Stripe to view invoices, update your payment method or cancel at the end of your paid period.':'Subscription setup is still in progress. These actions will become available once billing is ready.'}</p><Button disabled={!portal||Boolean(busy)||!onAction} variant="secondary" className="mt-4 min-h-14 w-full" onClick={()=>onAction?.('portal')}>Manage subscription</Button>{actionMessage?<p role="status" className="mt-4 text-sm text-amber-200">{actionMessage}</p>:null}</Card>
 </div>;
}
