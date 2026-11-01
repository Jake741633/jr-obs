import test from 'node:test';
import assert from 'node:assert/strict';
import * as jsx from 'react/jsx-runtime';
import {loadLocalTs} from './helpers/load-local-ts.mjs';
import {loadOwnerBillingStatus} from '../lib/billingStatusClient.mjs';
import {createOwnerBillingActions} from '../lib/billingActionsClient.mjs';
function harness({holdCheckout=false}={}){
 const slots=[],effects=[],calls=[],links=[];let cursor=0,finishCheckout;
 let session={access_token:'fixture-token',user:{id:'22222222-2222-4222-8222-222222222222'}};
 const identity={userId:session.user.id,organisationId:'11111111-1111-4111-8111-111111111111',role:'owner'};
 const useState=initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];};
 const changed=(old,deps)=>!old||deps.some((value,i)=>!Object.is(value,old.deps[i]));
 const react={useState,useRef:value=>useState({current:value})[0],useMemo(fn,deps){const i=cursor++;if(changed(slots[i],deps))slots[i]={deps,value:fn()};return slots[i].value;},useSyncExternalStore(subscribe,snapshot,serverSnapshot){cursor++;return serverSnapshot();},useEffect(fn,deps){const i=cursor++,old=slots[i];if(changed(old,deps)){const next={deps,fn,cleanup:old?.cleanup};slots[i]=next;effects.push(()=>{next.cleanup?.();next.cleanup=fn();});}}};
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  if(url==='/api/billing/status')return Response.json({mode:'test',checkoutAvailable:true,portalAvailable:false,subscription:null});
  assert.equal(url,'/api/billing/checkout');
  if(holdCheckout)return new Promise(resolve=>{finishCheckout=resolve;});
  return Response.json({mode:'test',sessionId:'cs_test_A',url:'https://checkout.stripe.com/c/pay/A'});
 };
 const Page=loadLocalTs(new URL('../app/settings/billing/page.tsx',import.meta.url),{
  react,'react/jsx-runtime':jsx,'lucide-react':{ArrowLeft:()=>null,CreditCard:()=>null,CalendarDays:()=>null,RefreshCw:()=>null,ShieldCheck:()=>null},'next/link':{default:()=>null},
  '../../../lib/cloud/useCloudIdentity':{useCloudIdentity:()=>({identity,isReady:true,mode:'cloud'})},
  '../../../lib/supabase/client':{captureSupabaseSessionOwnership:()=>({session,epoch:'one'})},
  '../../../lib/billingStatusClient.mjs':{loadOwnerBillingStatus:options=>loadOwnerBillingStatus({...options,fetchImpl})},
  '../../../lib/billingActionsClient.mjs':{createOwnerBillingActions:options=>createOwnerBillingActions({...options,fetchImpl})},
 },{AbortController,URLSearchParams,window:{location:{search:'',assign:url=>links.push(url)},addEventListener(){},removeEventListener(){}}}).default;
 const ownerElement=Page().props.children.at(-1);
 function render(){cursor=0;const panel=ownerElement.type(ownerElement.props);effects.splice(0).forEach(fn=>fn());return panel.props;}
 return {calls,links,render,async settled(){await new Promise(resolve=>setImmediate(resolve));return render();},replayEffects(){for(const slot of slots)if(slot?.fn){slot.cleanup?.();slot.cleanup=slot.fn();}},unmount(){for(const slot of slots)slot?.cleanup?.();},switchAccount(){session={access_token:'different',user:{id:'another-user'}};},finish(){finishCheckout(Response.json({mode:'test',sessionId:'cs_test_A',url:'https://checkout.stripe.com/c/pay/A'}));}};
}
test('actual phone page can start Checkout after a development effect cleanup/replay',async()=>{
 const h=harness();h.render();await h.settled();h.replayEffects();const view=await h.settled();assert.equal(view.result.state,'ready');view.onAction('monthly');await h.settled();
 assert.equal(h.calls.filter(x=>x.url==='/api/billing/checkout').length,1);assert.deepEqual(h.links,['https://checkout.stripe.com/c/pay/A']);h.unmount();
});
test('actual phone page locks duplicate actions and discards the old account on unmount',async()=>{
 const h=harness({holdCheckout:true});h.render();const view=await h.settled();view.onAction('monthly');view.onAction('annual');assert.equal(h.calls.filter(x=>x.url==='/api/billing/checkout').length,1);assert.equal(h.render().busy,'monthly');
 h.switchAccount();h.unmount();h.finish();await h.settled();assert.deepEqual(h.links,[]);
});
