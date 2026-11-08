import test from 'node:test';
import assert from 'node:assert/strict';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadLocalTs} from './helpers/load-local-ts.mjs';
import {loadOwnerBillingStatus} from '../lib/billingStatusClient.mjs';
import {createOwnerBillingActions} from '../lib/billingActionsClient.mjs';
import {controlledBillingStatus,nativeBillingStatusFixture,settleBillingRead} from './helpers/billing-status-fixture.mjs';
function harness({holdCheckout=false,reviewRequired=false,checkoutReview=false,checkoutPending=false,portalAvailable=false,holdReviewStatus=false,holdRefreshStatus=false,conflictPlan=null,statusClient=loadOwnerBillingStatus,statusFetch}={}){
 const slots=[],effects=[],calls=[],links=[],statusResolvers=[];let cursor=0,finishCheckout,reportedReview=false,lastPanel,statusReads=0,lastStatusRead;
 let session={access_token:'fixture-token',user:{id:'22222222-2222-4222-8222-222222222222'}};
 const identity={userId:session.user.id,organisationId:'11111111-1111-4111-8111-111111111111',role:'owner'};
 const useState=initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];};
 const changed=(old,deps)=>!old||deps.some((value,i)=>!Object.is(value,old.deps[i]));
 const react={useState,useRef:value=>useState({current:value})[0],useMemo(fn,deps){const i=cursor++;if(changed(slots[i],deps))slots[i]={deps,value:fn()};return slots[i].value;},useSyncExternalStore(subscribe,snapshot){cursor++;return snapshot();},useEffect(fn,deps){const i=cursor++,old=slots[i];if(changed(old,deps)){const next={deps,fn,cleanup:old?.cleanup};slots[i]=next;effects.push(()=>{next.cleanup?.();next.cleanup=fn();});}}};
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  if(url==='/api/billing/status'){
   statusReads++;
   if(statusFetch)return statusFetch(url,options);
   if(reportedReview&&holdReviewStatus||holdRefreshStatus&&statusReads>1)return new Promise((resolve,reject)=>{
    const cancel=()=>reject(options.signal.reason);options.signal.addEventListener('abort',cancel,{once:true});
    statusResolvers.push(value=>{options.signal.removeEventListener('abort',cancel);resolve(value);});
   });
   return Response.json({mode:'test',reviewRequired:reportedReview||reviewRequired,checkoutAvailable:!reportedReview,portalAvailable:portalAvailable||reviewRequired,subscription:null});
  }
  if(url==='/api/billing/portal')return Response.json({mode:'test',sessionId:'bps_A',url:'https://billing.stripe.com/p/session/A'});
  assert.equal(url,'/api/billing/checkout');
  if(checkoutReview){reportedReview=true;return Response.json({code:'billing_checkout_review'},{status:409});}
  if(JSON.parse(options.body).plan===conflictPlan)return Response.json({code:'billing_checkout_conflict'},{status:409});
  if(holdCheckout)return new Promise(resolve=>{finishCheckout=resolve;});
  return Response.json({mode:'test',sessionId:'cs_test_A',url:'https://checkout.stripe.com/c/pay/A'});
 };
 const Page=loadLocalTs(new URL('../app/settings/billing/page.tsx',import.meta.url),{
  react,'react/jsx-runtime':jsx,'lucide-react':{ArrowLeft:()=>null,CreditCard:()=>null,CalendarDays:()=>null,RefreshCw:()=>null,ShieldCheck:()=>null},'next/link':{default:()=>null},
  '../../../lib/cloud/useCloudIdentity':{useCloudIdentity:()=>({identity,isReady:true,mode:'cloud'})},
  '../../../lib/supabase/client':{captureSupabaseSessionOwnership:()=>({session,epoch:'one'})},
  '../../../lib/billingStatusClient.mjs':{loadOwnerBillingStatus:options=>{lastStatusRead=statusClient({...options,fetchImpl});return lastStatusRead;}},
  '../../../lib/billingActionsClient.mjs':{createOwnerBillingActions:options=>createOwnerBillingActions({...options,fetchImpl})},
 },{AbortController,URLSearchParams,window:{location:{search:checkoutPending?'?checkout=pending':'',assign:url=>links.push(url)},addEventListener(){},removeEventListener(){}}}).default;
 const ownerElement=Page().props.children.at(-1);
 function render(){cursor=0;lastPanel=ownerElement.type(ownerElement.props);effects.splice(0).forEach(fn=>fn());return lastPanel.props;}
 return {calls,links,render,statusSettled:()=>lastStatusRead,html:()=>renderToStaticMarkup(lastPanel),finishStatus:response=>statusResolvers.at(-1)(response),async settled(){await new Promise(resolve=>setImmediate(resolve));return render();},replayEffects(){for(const slot of slots)if(slot?.fn){slot.cleanup?.();slot.cleanup=slot.fn();}},unmount(){for(const slot of slots)slot?.cleanup?.();},switchAccount(){session={access_token:'different',user:{id:'another-user'}};},finish(){finishCheckout(Response.json({mode:'test',sessionId:'cs_test_A',url:'https://checkout.stripe.com/c/pay/A'}));}};
}
test('actual phone page can start Checkout after a development effect cleanup/replay',async()=>{
 const h=harness();h.render();await h.settled();h.replayEffects();const view=await h.settled();assert.equal(view.result.state,'ready');view.onAction('monthly');await h.settled();
 assert.equal(h.calls.filter(x=>x.url==='/api/billing/checkout').length,1);assert.deepEqual(h.links,['https://checkout.stripe.com/c/pay/A']);h.unmount();
});
test('an actual page status timeout enables Refresh and the next native read recovers',async t=>{
 const client=controlledBillingStatus(),fixture=await nativeBillingStatusFixture(t),h=harness({statusClient:client.loadOwnerBillingStatus,statusFetch:fixture.fetchImpl});
 t.after(()=>h.unmount());
 const refresh=()=>[...h.html().matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(x=>x[2].replace(/<[^>]*>/g,'').includes('Refresh billing status'));
 h.render();await fixture.headersReceived;await new Promise(resolve=>setImmediate(resolve));assert.equal(h.render().result.state,'loading');assert.match(refresh()[1],/\sdisabled(?:=|\s|$)/);
 client.expire();
 await settleBillingRead(h.statusSettled());let view=await h.settled();
 assert.equal(view.result.state,'unavailable');assert.doesNotMatch(refresh()[1],/\sdisabled(?:=|\s|$)/);assert.equal(client.timers.size,0);
 fixture.ready();view.onRefresh();h.render();
 await h.statusSettled();view=await h.settled();
 assert.equal(view.result.state,'ready');assert.doesNotMatch(refresh()[1],/\sdisabled(?:=|\s|$)/);assert.equal(fixture.calls(),2);assert.deepEqual(h.links,[]);assert.equal(client.timers.size,0);
});
test('actual phone page locks duplicate actions and discards the old account on unmount',async()=>{
 const h=harness({holdCheckout:true});h.render();const view=await h.settled();view.onAction('monthly');view.onAction('annual');assert.equal(h.calls.filter(x=>x.url==='/api/billing/checkout').length,1);assert.equal(h.render().busy,'monthly');
 h.switchAccount();h.unmount();h.finish();await h.settled();assert.deepEqual(h.links,[]);
});
test('actual phone page refuses Checkout during review while keeping Portal action available',async()=>{
 const h=harness({reviewRequired:true});h.render();const view=await h.settled();view.onAction('monthly');view.onAction('annual');await h.settled();assert.equal(h.calls.filter(x=>x.url==='/api/billing/checkout').length,0);
 h.render().onAction('portal');await h.settled();assert.deepEqual(h.links,['https://billing.stripe.com/p/session/A']);h.unmount();
});
test('a different-plan conflict explains how to resume the original Checkout and permits that retry',async()=>{
 const h=harness({conflictPlan:'annual'});h.render();let view=await h.settled();view.onAction('annual');view=await h.settled();
 assert.deepEqual(h.links,[]);assert.match(h.html(),/original plan.*resume|resume.*original plan/i);assert.match(h.html(),/expire/i);assert.doesNotMatch(h.html(),/Refresh billing status before trying again/);
 assert.equal(view.busy,null);view.onAction('monthly');await h.settled();
 const requests=h.calls.filter(call=>call.url==='/api/billing/checkout');assert.deepEqual(requests.map(call=>JSON.parse(call.options.body)),[{plan:'annual'},{plan:'monthly'}]);assert.deepEqual(h.links,['https://checkout.stripe.com/c/pay/A']);h.unmount();
});
test('a review learned from verified status survives refresh failure but yields to a sign-in denial',async()=>{
 const h=harness({reviewRequired:true,holdRefreshStatus:true,checkoutPending:true});h.render();let view=await h.settled();assert.match(h.html(),/Payment needs review/);
 view.onRefresh();h.render();assert.match(h.html(),/Payment needs review/);assert.doesNotMatch(h.html(),/payment confirmation is pending/i);
 h.finishStatus(new Response('',{status:503}));view=await h.settled();assert.match(h.html(),/Payment needs review/);assert.doesNotMatch(h.html(),/Subscription setup in progress|payment confirmation is pending/i);
 view.onAction('annual');await h.settled();assert.equal(h.calls.filter(call=>call.url==='/api/billing/checkout').length,0);
 h.render().onRefresh();h.render();h.finishStatus(new Response('',{status:403}));await h.settled();assert.match(h.html(),/Sign in with the business owner/);assert.doesNotMatch(h.html(),/Payment needs review|payment confirmation is pending/i);
 h.render().onRefresh();h.render();assert.doesNotMatch(h.html(),/Payment needs review|payment confirmation is pending/i);h.finishStatus(new Response('',{status:403}));await h.settled();h.unmount();
});
test('a fresh clear status replaces a prior status-read review with current recovery information',async()=>{
 const h=harness({reviewRequired:true,holdRefreshStatus:true,checkoutPending:true});h.render();const view=await h.settled();assert.match(h.html(),/Payment needs review/);
 view.onRefresh();h.render();assert.match(h.html(),/Payment needs review/);
 h.finishStatus(Response.json({mode:'test',reviewRequired:false,checkoutAvailable:false,portalAvailable:true,subscription:{plan:'monthly',status:'trialing',paidThroughMs:null,trialEndsAtMs:null,cancelAtPeriodEnd:false,reconciledAtMs:Date.UTC(2026,10,8)}}));await h.settled();
 assert.match(h.html(),/Trial confirmation needed/);assert.doesNotMatch(h.html(),/Payment needs review|Trial ended|Trial in progress/);assert.match(h.html(),/payment confirmation is pending/i);h.unmount();
});
test('late Checkout review immediately replaces pending claims and survives authoritative refresh failure',async()=>{
 const h=harness({checkoutReview:true,checkoutPending:true,portalAvailable:true,holdReviewStatus:true});
 const button=(label)=>[...h.html().matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(x=>x[2].replace(/<[^>]*>/g,'').includes(label));
 const reviewed=()=>{assert.match(h.html(),/Payment needs review/);assert.doesNotMatch(h.html(),/payment confirmation is pending|Active subscription|Trial in progress/);for(const label of ['Choose monthly','Choose annual'])assert.match(button(label)[1],/\sdisabled(?:=|\s|$)/);};
 h.render();let view=await h.settled();assert.match(h.html(),/payment confirmation is pending/);view.onAction('monthly');view=await h.settled();reviewed();
 assert.equal(h.calls.filter(x=>x.url==='/api/billing/status').length,2,'reconciles fresh authoritative status');assert.doesNotMatch(button('Manage subscription')[1],/\sdisabled(?:=|\s|$)/);
 view.onAction('annual');await h.settled();assert.equal(h.calls.filter(x=>x.url==='/api/billing/checkout').length,1);
 h.render().onRefresh();h.render();reviewed();h.finishStatus(new Response('',{status:503}));await h.settled();reviewed();
 h.render().onRefresh();h.render();h.finishStatus(Response.json({mode:'test',reviewRequired:true,checkoutAvailable:false,portalAvailable:true,subscription:null}));view=await h.settled();reviewed();assert.doesNotMatch(button('Manage subscription')[1],/\sdisabled(?:=|\s|$)/);
 view.onAction('portal');await h.settled();assert.deepEqual(h.links,['https://billing.stripe.com/p/session/A']);
 h.render().onRefresh();h.render();h.finishStatus(Response.json({mode:'test',reviewRequired:false,checkoutAvailable:true,portalAvailable:true,subscription:null}));await h.settled();reviewed();
 h.render().onAction('annual');await h.settled();assert.equal(h.calls.filter(x=>x.url==='/api/billing/checkout').length,1,'clear Customer status does not discard an uncertain Checkout review');
 h.render().onRefresh();h.render();h.finishStatus(new Response('',{status:403}));await h.settled();assert.match(h.html(),/Sign in with the business owner/);assert.doesNotMatch(h.html(),/Payment needs review/);h.unmount();
});
