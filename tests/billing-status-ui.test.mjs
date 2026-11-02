import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadLocalTs} from './helpers/load-local-ts.mjs';
const icon=()=>React.createElement('svg',{'aria-hidden':true});
const deps={'react/jsx-runtime':jsx,react:React,'lucide-react':{CreditCard:icon,CalendarDays:icon,ShieldCheck:icon,RefreshCw:icon,ArrowLeft:icon},'next/link':{default:props=>React.createElement('a',props)}};
function panel(result,props={}){const {BillingStatusPanel}=loadLocalTs(new URL('../components/billing/BillingStatusPanel.tsx',import.meta.url),deps);return renderToStaticMarkup(React.createElement(BillingStatusPanel,{result,onRefresh(){},onAction(){},...props}));}
test('phone billing screen shows approved prices and clear inactive actions without a payment form',()=>{
 const html=panel({state:'unavailable'});assert.match(html,/£29/);assert.match(html,/£290/);assert.match(html,/£19/);assert.match(html,/setup in progress/i);assert.doesNotMatch(html,/<form|card number|sk_live|cus_/i);assert.match(html,/<button[^>]*disabled/);
});
test('large phone actions follow server capabilities and disable together during a request',()=>{
 const data={mode:'test',reviewRequired:false,checkoutAvailable:true,portalAvailable:false,subscription:null};
 const button=(html,label)=>[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(x=>x[2].replace(/<[^>]*>/g,'').includes(label));
 let html=panel({state:'ready',data});assert.ok(button(html,'Choose monthly'));assert.doesNotMatch(button(html,'Choose monthly')[1],/\sdisabled(?:=|\s|$)/);assert.doesNotMatch(button(html,'Choose annual')[1],/\sdisabled(?:=|\s|$)/);assert.match(button(html,'Manage subscription')[1],/\sdisabled(?:=|\s|$)/);
 html=panel({state:'ready',data:{...data,checkoutAvailable:false,portalAvailable:true}});assert.match(button(html,'Choose monthly')[1],/\sdisabled(?:=|\s|$)/);assert.doesNotMatch(button(html,'Manage subscription')[1],/\sdisabled(?:=|\s|$)/);
 html=panel({state:'ready',data},{busy:'monthly',actionMessage:'Opening secure Stripe checkout…'});for(const label of ['Choose monthly','Choose annual','Manage subscription','Refresh billing status'])assert.match(button(html,label)[1],/\sdisabled(?:=|\s|$)/);assert.match(html,/Opening secure Stripe checkout/);
});
test('returning from Checkout shows pending confirmation without claiming payment or access',()=>{
 const html=panel({state:'ready',data:{mode:'test',reviewRequired:false,checkoutAvailable:false,portalAvailable:false,subscription:null}},{checkoutPending:true});assert.match(html,/payment confirmation is pending/i);assert.doesNotMatch(html,/Active subscription/);
});
test('server-reported coverage distinguishes scheduled ending, failed payment and expired coverage',()=>{
 const data={mode:'test',reviewRequired:false,checkoutAvailable:false,subscription:{plan:'monthly',status:'active',paidThroughMs:Date.UTC(2030,0,2),trialEndsAtMs:null,cancelAtPeriodEnd:true,reconciledAtMs:Date.UTC(2026,10,1)}};
 assert.match(panel({state:'ready',data}),/Ends on/);assert.match(panel({state:'ready',data}),/Stripe sandbox/);
 assert.match(panel({state:'ready',data:{...data,subscription:{...data.subscription,status:'past_due'}}}),/Payment needs attention/);
 assert.match(panel({state:'ready',data:{...data,subscription:{...data.subscription,paidThroughMs:1}}}),/Paid period ended/);
});
test('payment review supersedes active, trial and redirect claims while keeping billing management',()=>{
 const button=(html,label)=>[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(x=>x[2].replace(/<[^>]*>/g,'').includes(label));
 for(const status of ['active','trialing']){
  const data={mode:'test',reviewRequired:true,checkoutAvailable:true,portalAvailable:true,subscription:{plan:'monthly',status,paidThroughMs:Date.UTC(2030,0,2),trialEndsAtMs:Date.UTC(2030,0,2),cancelAtPeriodEnd:false,reconciledAtMs:Date.UTC(2026,10,1)}};
  const html=panel({state:'ready',data},{checkoutPending:true});assert.match(html,/Payment needs review/);assert.doesNotMatch(html,/Active subscription|Trial in progress|payment confirmation is pending|Paid through|Trial ends/);
  for(const label of ['Choose monthly','Choose annual'])assert.match(button(html,label)[1],/\sdisabled(?:=|\s|$)/);
  assert.doesNotMatch(button(html,'Manage subscription')[1],/\sdisabled(?:=|\s|$)/);
 }
});
test('only a current normal owner identity sees plan or billing controls on the actual page',()=>{
 let identity={userId:'u1',organisationId:'o1',role:'owner'},ready=true,session={access_token:'fixture',user:{id:'u1'}};
 const Page=loadLocalTs(new URL('../app/settings/billing/page.tsx',import.meta.url),{...deps,'../../../lib/cloud/useCloudIdentity':{useCloudIdentity:()=>({identity,isReady:ready,mode:'cloud'})},'../../../lib/supabase/client':{captureSupabaseSessionOwnership:()=>({session,epoch:'one'})}}).default;
 const html=()=>renderToStaticMarkup(React.createElement(Page));assert.match(html(),/£29/);
 identity={...identity,role:'admin'};assert.doesNotMatch(html(),/£29/);assert.match(html(),/business owner/i);
 identity={...identity,role:'owner'};session={...session,is_password_recovery:true};assert.doesNotMatch(html(),/£29/);
 session={access_token:'fixture',user:{id:'different'}};assert.doesNotMatch(html(),/£29/);
 ready=false;assert.doesNotMatch(html(),/£29/);
});
