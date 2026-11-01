import assert from "node:assert/strict";
import test from "node:test";
import {loadLocalTs} from "./helpers/load-local-ts.mjs";
import {nodes,text} from "./helpers/customer-page-harness.mjs";
import * as permissions from "../lib/cloud/permissions.ts";
import * as ownership from "../lib/supabase/sessionOwnership-core.mjs";
function harness(){
 const slots=[];let cursor=0,path="/ai/quote-builder",epoch=1,session={access_token:"token",user:{id:"u1"}};
 const state={mode:"cloud",isReady:true,identity:{userId:"u1",organisationId:"o1",role:"owner",email:"owner@example.test"}};
 const react={Fragment:"Fragment",useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==="function"?initial():initial;return[slots[i],value=>{slots[i]=value;}];}};
 const mod=loadLocalTs(new URL("../components/CloudAccessGuard.tsx",import.meta.url),{react,"react/jsx-runtime":{jsx:(type,props,key)=>({type,props,key}),jsxs:(type,props,key)=>({type,props,key})},"next/link":{default:"Link"},"next/navigation":{usePathname:()=>path},"lucide-react":{},"../lib/cloud/permissions":permissions,"../lib/cloud/useCloudIdentity":{useCloudIdentity:()=>state},"./supabase/client":{captureSupabaseSessionOwnership:()=>({session,epoch})},"./supabase/sessionOwnership-core.mjs":ownership});
 const child={type:"QuotePage",props:{children:"PRIVATE UNSAVED WORK"}};
 return{state,child,render(){cursor=0;return mod.CloudAccessGuard({children:child});},loading(){state.identity=null;state.isReady=false;},office(patch={}){state.identity={userId:"u1",organisationId:"o1",role:"owner",email:"owner@example.test",...patch};state.isReady=true;},session(){epoch++;session={access_token:"other",user:{id:"u2"}};},path(value){path=value;}};
}
test("quote route keeps the same workspace beneath a hidden inert boundary during same-owner verification",()=>{
 const h=harness(),ready=h.render(),first=nodes(ready).find(n=>n.type==="Fragment"&&n.props.children===h.child);assert.ok(first);
 h.loading();const loading=h.render(),inactive=nodes(loading).find(n=>n.props.hidden&&n.props.inert);assert.ok(inactive);assert.ok(nodes(inactive).includes(h.child));
 assert.equal(nodes(loading).find(n=>n.type==="Fragment"&&n.props.children===h.child).key,first.key);assert.match(text(loading),/Checking secure account access/);
 h.office();const resumed=h.render();assert.equal(nodes(resumed).find(n=>n.type==="Fragment"&&n.props.children===h.child).key,first.key);assert.equal(nodes(resumed).find(n=>n.props.inert===false)?.props.hidden,false);
});
test("initial loading, revoked roles, verification failure and replaced sessions never retain the quote subtree",()=>{
 for(const change of [h=>{h.loading();h.render();h.state.isReady=true;},h=>h.office({role:"customer"}),h=>{h.loading();h.session();}]){const h=harness();h.render();change(h);assert.ok(!nodes(h.render()).includes(h.child));}
 const initial=harness();initial.loading();assert.ok(!nodes(initial.render()).includes(initial.child));
});
test("a different organisation or email gets a new workspace and other routes keep their existing loading boundary",()=>{
 const h=harness(),first=nodes(h.render()).find(n=>n.type==="Fragment"&&n.props.children===h.child).key;h.office({organisationId:"other"});assert.notEqual(nodes(h.render()).find(n=>n.type==="Fragment"&&n.props.children===h.child).key,first);
 h.office({email:"changed@example.test"});assert.notEqual(nodes(h.render()).find(n=>n.type==="Fragment"&&n.props.children===h.child).key,first);
 h.path("/jobs");h.office();h.render();h.loading();assert.ok(!nodes(h.render()).includes(h.child));
});
