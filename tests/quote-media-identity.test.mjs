import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";
import * as ownership from "../lib/supabase/sessionOwnership-core.mjs";
const path=new URL("../lib/useQuoteMediaIdentity.ts",import.meta.url);
function harness(){
 const slots=[];let cursor=0,epoch=1,session={access_token:"token",user:{id:"u1"}};
 const state={mode:"cloud",isReady:true,identity:{organisationId:"o1",userId:"u1",role:"owner"}};
 const original={...state.identity};
 const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==="function"?initial():initial;return[slots[i],next=>{slots[i]=next;}];}};
 const hook=existsSync(path)?loadLocalTs(path,{react,"./supabase/client":{captureSupabaseSessionOwnership:()=>({session,epoch})},"./supabase/sessionOwnership-core.mjs":ownership}).useQuoteMediaIdentity:undefined;
 return {state,render(target="job-1",track=true){assert.equal(typeof hook,"function");cursor=0;return hook(state,target,track);},loading(){state.isReady=false;state.identity=null;},office(patch={}){state.isReady=true;state.identity={...original,...patch};},session(){epoch++;session={access_token:"changed-token",user:{id:"u1"}};},recover(){session={...session,is_password_recovery:true};}};
}
test("a verified office binding survives temporary identity loading for the same exact owner and target",()=>{
 const h=harness(),first=h.render();assert.ok(first);h.loading();assert.equal(h.render(),first);h.office();assert.equal(h.render(),first);
 assert.equal(first.userId,"u1");assert.equal(first.organisationId,"o1");
});
test("initial loading, local mode, recovery and unverified roles cannot create a media owner",()=>{
 for(const change of [h=>h.loading(),h=>{h.state.mode="local";},h=>h.office({role:"customer"}),h=>h.office({role:"electrician"}),h=>h.recover(),h=>h.office({userId:"other"})]){const h=harness();change(h);assert.equal(h.render(),null);}
});
test("failed or changed account verification permanently retires the earlier local-media binding",()=>{
 for(const change of [h=>{h.state.isReady=true;h.state.identity=null;},h=>h.office({organisationId:"other"}),h=>h.office({role:"office"}),h=>h.office({role:"customer"}),h=>{h.state.mode="local";}]){
  const h=harness(),first=h.render();change(h);assert.notEqual(h.render(),first);h.state.mode="cloud";h.office();assert.notEqual(h.render(),first);
 }
});
test("target changes and session replacement cannot revive the previous binding even after switching back",()=>{
 const h=harness(),first=h.render();assert.notEqual(h.render("job-2"),first);assert.notEqual(h.render("job-1"),first);
 const s=harness(),old=s.render();s.session();s.loading();assert.equal(s.render(),null);s.office();assert.notEqual(s.render(),old);
});
test("changing cloud mode during loading retires the cached account binding",()=>{
 const h=harness(),old=h.render();h.loading();h.state.mode="migration";assert.equal(h.render(),null);h.state.mode="cloud";h.office();assert.notEqual(h.render(),old);
});
test("disabled local-media tracking retires its binding and cannot restore it when enabled again",()=>{
 const h=harness(),old=h.render();assert.equal(h.render("job-1",false),null);assert.notEqual(h.render(),old);
});
