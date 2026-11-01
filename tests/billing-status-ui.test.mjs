import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadLocalTs} from './helpers/load-local-ts.mjs';
const icon=()=>React.createElement('svg',{'aria-hidden':true});
const deps={'react/jsx-runtime':jsx,react:React,'lucide-react':{CreditCard:icon,CalendarDays:icon,ShieldCheck:icon,RefreshCw:icon,ArrowLeft:icon},'next/link':{default:props=>React.createElement('a',props)}};
function panel(result){const {BillingStatusPanel}=loadLocalTs(new URL('../components/billing/BillingStatusPanel.tsx',import.meta.url),deps);return renderToStaticMarkup(React.createElement(BillingStatusPanel,{result,onRefresh(){}}));}
test('phone billing screen shows approved prices and clear inactive actions without a payment form',()=>{
 const html=panel({state:'unavailable'});assert.match(html,/£29/);assert.match(html,/£290/);assert.match(html,/£19/);assert.match(html,/setup in progress/i);assert.doesNotMatch(html,/<form|card number|sk_live|cus_/i);assert.match(html,/<button[^>]*disabled/);
});
test('server-reported coverage distinguishes scheduled ending, failed payment and expired coverage',()=>{
 const data={mode:'test',checkoutAvailable:false,subscription:{plan:'monthly',status:'active',paidThroughMs:Date.UTC(2030,0,2),trialEndsAtMs:null,cancelAtPeriodEnd:true,reconciledAtMs:Date.UTC(2026,10,1)}};
 assert.match(panel({state:'ready',data}),/Ends on/);assert.match(panel({state:'ready',data}),/Stripe sandbox/);
 assert.match(panel({state:'ready',data:{...data,subscription:{...data.subscription,status:'past_due'}}}),/Payment needs attention/);
 assert.match(panel({state:'ready',data:{...data,subscription:{...data.subscription,paidThroughMs:1}}}),/Paid period ended/);
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
