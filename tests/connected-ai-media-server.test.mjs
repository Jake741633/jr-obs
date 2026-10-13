import assert from "node:assert/strict";
import test from "node:test";
import { createQuoteScopeHandler } from "../lib/server/quoteScope.mjs";

const env = { OPENAI_API_KEY: "secret-sentinel", JR_OS_AI_ORGANISATION_ID: "org-1", NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key" };
const mp4 = "data:audio/mp4;base64," + Buffer.from([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]).toString("base64");
const webm = "data:audio/webm;base64," + Buffer.from([26,69,223,163,0,0,0,0,0,0,0,0]).toString("base64");
const jpeg = "data:image/jpeg;base64,/9j/2Q==";
const draft = { title: "Site work", summary: "Work described on site.", scope: ["Check the requested socket locations."], questions: ["Confirm routes."], exclusions: ["Heating controls."] };
const response = (body, status=200) => new Response(JSON.stringify(body), { status });
const scopeResult = () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(draft) }] }] });
function request(body={operation:"transcribe", audio:mp4, consent:true}, headers={}) { return new Request("https://jr.example/api/ai/quote-scope", {method:"POST",headers:{origin:"https://jr.example",authorization:"Bearer user-token","x-jr-organisation":"org-1","content-type":"application/json",...headers},body:JSON.stringify(body)}); }
function harness(provider) {
  const calls=[]; let time=0; const profile={id:"user-1",organisation_id:"org-1",role:"owner",active:true};
  const handler=createQuoteScopeHandler({env,now:()=>time,fetchImpl:async(url,init)=>{
    if(url.endsWith("/auth/v1/user"))return response({id:"user-1"});
    if(url.includes("/rest/v1/profiles?")){calls.push({profile:true});return response([{...profile}]);}
    calls.push({url,init}); return provider ? provider(url,init) : response(url.endsWith("/transcriptions")?{text:"Two new sockets near the window.",languages:[{code:"en"}]}:scopeResult());
  }});
  return {handler,calls,profile,paid:()=>calls.filter(c=>c.url),advance:()=>{time+=60001;}};
}
test("prepared sound is sent as a bounded multipart file and only transcript text is returned", async()=>{
  for(const audio of [mp4,webm]){
    const h=harness(), r=await h.handler(request({operation:"transcribe",audio,consent:true}));
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{transcript:"Two new sockets near the window."});
    const paid=h.paid();assert.equal(paid.length,1);assert.equal(paid[0].url,"https://api.openai.com/v1/audio/transcriptions");
    assert.equal(paid[0].init.body.get("model"),"gpt-transcribe");assert.equal(paid[0].init.body.get("file").name,audio===mp4?"site-audio.mp4":"site-audio.webm");
    assert.equal(paid[0].init.body.get("file").size,audio===mp4?16:12);assert.equal(paid[0].init.headers["Content-Type"],undefined);
    assert.equal(paid[0].init.redirect,"error");assert.equal(r.headers.get("cache-control"),"no-store");assert.equal(h.calls.filter(c=>c.profile).length,3);
  }
});
test("transcription rejects unconsented, malformed, oversized, remote and extra inputs before spending",async()=>{
  const tooBig=Buffer.alloc(1500001);Buffer.from([0,0,0,16,102,116,121,112]).copy(tooBig);
  for(const body of [{operation:"transcribe",audio:mp4,consent:false},{operation:"transcribe",audio:"https://internal/audio",consent:true},{operation:"transcribe",audio:mp4,consent:true,notes:"hidden extra"},...['data:audio/mp4;base64,YWJj','data:audio/webm;base64,YWJj','data:video/mp4;base64,'+mp4.split(',')[1],mp4+'=', 'data:audio/mp4;base64,'+tooBig.toString('base64')].map(audio=>({operation:"transcribe",audio,consent:true}))]){
    const h=harness();assert.equal((await h.handler(request(body))).status,400);assert.equal(h.paid().length,0);
  }
  const h=harness();assert.equal((await h.handler(request({operation:"transcribe",audio:"x".repeat(2100001),consent:true},{"content-length":"1"}))).status,413);assert.equal(h.paid().length,0);
});
test("sampled frames retain ordered timestamps and stay separate from a single photograph",async()=>{
  const h=harness();const r=await h.handler(request({operation:"draft",notes:"Reviewed speech: add two sockets",consent:true,frames:[{dataUrl:jpeg,seconds:0},{dataUrl:jpeg,seconds:30},{dataUrl:jpeg,seconds:59.9}]}));
  assert.equal(r.status,200);const sent=JSON.parse(h.paid()[0].init.body);assert.equal(sent.input[0].content.filter(x=>x.type==='input_image').length,3);
  assert.match(JSON.stringify(sent.input[0].content),/30/);assert.match(sent.instructions,/sampled/i);assert.match(sent.instructions,/not.*full video/i);
  for(const extra of [{photo:jpeg,frames:[{dataUrl:jpeg,seconds:1}]},{frames:[]},{frames:Array(4).fill({dataUrl:jpeg,seconds:1})},{frames:[{dataUrl:jpeg,seconds:2},{dataUrl:jpeg,seconds:1}]},{frames:[{dataUrl:jpeg,seconds:61}]},{frames:[{dataUrl:jpeg,seconds:1,other:true}]},{frames:[{dataUrl:"https://internal/image",seconds:1}]}]){
    const bad=harness();assert.equal((await bad.handler(request({operation:"draft",notes:"Two sockets",consent:true,...extra}))).status,400);assert.equal(bad.paid().length,0);
  }
  const large=Buffer.alloc(250001);large[0]=255;large[1]=216;large[250000]=217;large[249999]=255;
  const bad=harness();assert.equal((await bad.handler(request({operation:"draft",notes:"",consent:true,frames:[{dataUrl:"data:image/jpeg;base64,"+large.toString("base64"),seconds:0}]}))).status,400);
});
test("empty, oversized and malformed transcripts fail closed and provider detail never escapes",async()=>{
  for(const payload of [{text:""},{text:"  "},{text:123},{text:"x".repeat(12001)},{text:"x".repeat(100001)},{}]){
    const h=harness(()=>response(payload)),r=await h.handler(request());assert.equal(r.status,502);assert.equal((await r.json()).code,"invalid_transcript");
  }
  for(const [status,code,expected] of [[429,"insufficient_quota",402],[429,"rate_limit_exceeded",429],[401,"invalid_api_key",503],[400,"invalid_audio",400],[500,"error",503]]){
    const h=harness(()=>response({error:{code,message:"secret-sentinel private recording"}},status)),r=await h.handler(request());assert.equal(r.status,expected);assert.doesNotMatch(await r.text(),/secret-sentinel|private recording/);
  }
});
test("transcription distinguishes credit, spend, usage and legacy quota errors with safe guidance", async()=>{
  for(const [code,expectedCode,guidance] of [["credit_balance_exhausted","billing_required",/API credit is exhausted/],["organization_spend_limit_exceeded","spend_limit_reached",/spend limit/],["project_spend_limit_exceeded","spend_limit_reached",/spend limit/],["organization_usage_limit_exceeded","usage_limit_reached",/usage limit/],["insufficient_quota","quota_required",/credit.*limits/i],[undefined,"quota_required",/credit.*limits/i]]){
    const h=harness(()=>response({error:{code,type:"insufficient_quota",message:"secret-sentinel private recording",details:{audio:"private provider payload"}}},429));
    const r=await h.handler(request()),actual=await r.json();
    assert.equal(r.status,402);assert.equal(actual.code,expectedCode);assert.match(actual.error,guidance);
    assert.deepEqual(Object.keys(actual).sort(),["code","error"]);assert.doesNotMatch(JSON.stringify(actual),/secret-sentinel|private recording|private provider payload/);
    if(expectedCode!=="billing_required")assert.doesNotMatch(actual.error,/exhausted/);
    assert.equal(h.paid().length,1);
  }
});
test("transcription billing failures do not retry automatically or impose a recovery cooldown",async()=>{
  for(const code of ["credit_balance_exhausted","organization_spend_limit_exceeded","project_spend_limit_exceeded","organization_usage_limit_exceeded","insufficient_quota"]){
    let recovered=false;
    const h=harness(()=>recovered?response({text:"Two sockets"}):response({error:{code,type:"insufficient_quota"}},429));
    assert.equal((await h.handler(request())).status,402);assert.equal(h.paid().length,1);
    recovered=true;
    const retry=await h.handler(request());assert.equal(retry.status,200);assert.deepEqual(await retry.json(),{transcript:"Two sockets"});assert.equal(h.paid().length,2);
  }
});
test("transcription transient rate limits retain the cooldown when quota type is generic",async()=>{
  let recovered=false;
  const h=harness(()=>recovered?response({text:"Two sockets"}):response({error:{code:"rate_limit_exceeded",type:"insufficient_quota"}},429));
  const limited=await h.handler(request());assert.equal(limited.status,429);assert.equal((await limited.json()).code,"rate_limited");
  recovered=true;
  assert.equal((await h.handler(request())).status,429);assert.equal(h.paid().length,1);
  h.advance();assert.equal((await h.handler(request())).status,200);assert.equal(h.paid().length,2);
});
test("speech and scope share concurrency and burst limits",async()=>{
  let release;const h=harness(()=>new Promise(resolve=>{release=()=>resolve(response({text:"Two sockets"}));}));
  const pending=h.handler(request());for(let i=0;i<100&&!release;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(release,"transcription provider started");
  assert.equal((await h.handler(request({operation:"draft",notes:"Two sockets",consent:true}))).status,429);assert.equal(h.paid().length,1);release();assert.equal((await pending).status,200);
  const burst=harness();for(let i=0;i<4;i++)assert.equal((await burst.handler(request(i%2?{operation:"draft",notes:"Two sockets",consent:true}:undefined))).status,200);
  assert.equal((await burst.handler(request())).status,429);burst.advance();assert.equal((await burst.handler(request())).status,200);
});
test("transcription rechecks membership after upload and before returning the answer",async()=>{
  for(const patch of [{active:false},{role:"office"},{organisation_id:"other"}]){
    const h=harness();let upload;const original=request();
    const pending=h.handler(new Request(original.url,{method:"POST",headers:original.headers,body:new ReadableStream({start(c){upload=c;}}),duplex:"half"}));
    while(!h.calls.some(c=>c.profile))await new Promise(resolve=>setImmediate(resolve));Object.assign(h.profile,patch);
    upload.enqueue(new TextEncoder().encode(JSON.stringify({operation:"transcribe",audio:mp4,consent:true})));upload.close();assert.equal((await pending).status,403);assert.equal(h.paid().length,0);
  }
  const h=harness(()=>{h.profile.active=false;return response({text:"Two sockets"});});assert.equal((await h.handler(request())).status,403);
});
