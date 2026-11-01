import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";
import * as ownership from "../lib/supabase/sessionOwnership-core.mjs";
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);
const reorderProperties = value => Array.isArray(value) ? value.map(reorderProperties) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorderProperties(item)])) : value;
const pure = Object.fromEntries(["aiCommandCentre", "assistantIdentity", "estimateCostReview", "quoteDraftLines", "quoteEngine", "workflow", "businessSettings", "quoteTemplates", "purchaseListLink"].map(name => [name, loadLocalTs(new URL(`../lib/${name}.ts`, import.meta.url))]));
function harness(page, initialReady = true) {
  const slots = [], stores = {}, writes = [], attempts = [], effects = []; let cursor = 0, seq = 0, fail = false, failAfterWrite = false, epoch = 1, session = {access_token:"test-session",user:{id:"u1"}};
  const identity = {mode:"local",isReady:true,identity:{userId:"u1",organisationId:"o1",role:"owner"}};
  const pack = { id:"p1", name:"Domestic socket", category:"Domestic", description:"Fit socket", notes:"", labourHours:2, labourRate:50, createdAt:"2026-01-01", updatedAt:"2026-01-01", materials:[{id:"l1", description:"Socket", quantity:2.333, unitPrice:9.875}] };
  function collection(key, defaults = []) {
    return stores[key] ??= { items:key === "jr-os-job-packs" ? [pack] : key === "jr-os-customers" ? [{id:"c1",name:"Customer",address:"Site"}] : defaults, isReady:initialReady,
      createItem(item) { attempts.push(item); if (fail) throw new Error("Storage full"); if(this.items.some(old=>old.id===item.id))throw new Error("Duplicate identity");writes.push(item); this.items = [item, ...this.items]; if(failAfterWrite)throw new Error("Save acknowledgement lost");return item; },
      setItems() { throw new Error("Must use durable record creation"); } };
  }
  const useState = initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; };
  const react = {useState,useRef:value=>useState({current:value})[0],useMemo(fn,deps){const i=cursor++;if(!slots[i]||deps.some((value,j)=>!Object.is(value,slots[i].deps[j])))slots[i]={deps,value:fn()};return slots[i].value;},useLayoutEffect(fn){const i=cursor++;effects.push(()=>{slots[i]?.cleanup?.();slots[i]={cleanup:fn()};});}};
  const storage = {useLocalStorageCollection:collection,makeId:prefix=>`${prefix}-${++seq}`};
  const deps = { react, "react/jsx-runtime":{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}, "lucide-react":new Proxy({}, {get:(_,name)=>name}), "next/link":{default:"Link"}, "../../../lib/storage":storage };
  const guardPath = new URL("../lib/useEstimateSave.ts", import.meta.url);
  if (existsSync(guardPath)) deps["../../../lib/useEstimateSave"] = loadLocalTs(guardPath, {react,"./storage":storage,"./cloud/useCloudIdentity":{useCloudIdentity:()=>identity},"./supabase/client":{captureSupabaseSessionOwnership:()=>({session,epoch}),readSupabaseSession:()=>session,readSupabaseSessionOwnershipEpoch:()=>epoch},"./supabase/sessionOwnership-core.mjs":ownership});
  const code = ts.transpileModule(readFileSync(new URL(`../app/ai/${page}/page.tsx`, import.meta.url), "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const mod = {exports:{}};
  vm.runInNewContext(code, {module:mod,exports:mod.exports,Date,Error,Intl,structuredClone,require:name=> {
    if (deps[name]) return deps[name];
    const base = name.split("/").at(-1);
    if (pure[base]) return pure[base];
    if (name.includes("/components/")) return new Proxy({}, {get:(_,key)=>key});
    throw new Error(`Unexpected dependency: ${name}`);
  }});
  const render = () => { cursor = 0; const tree=mod.exports.default();effects.splice(0).forEach(fn=>fn());return tree; };
  const button = label => { const found = nodes(render()).find(n => n.type === "Button" && text(n).includes(label)); assert.ok(found,label); return found; };
  const field = (label, value) => { const found = nodes(render()).find(n => n.props.label === label) ?? nodes(render()).find(n => n.type === "label" && text(n).startsWith(label))?.props.children?.find?.(n => n?.type === "input" || n?.type === "select"); assert.ok(found,label); if (value !== undefined) found.props.onChange({target:{value}}); return found; };
  return {render,button,field,writes,attempts,stores,pack,identity,assistant(){const found=nodes(render()).find(n=>n.type==="ConnectedQuoteAssistant");assert.ok(found);return found;},notes(value){nodes(render()).find(n=>n.type==="TextareaField").props.onChange({target:{value}});render();},fail(value=true){fail=value;},failAfterWrite(){failAfterWrite=true;},session(){epoch++;session=null;},unmount(){slots.forEach(slot=>slot?.cleanup?.());},generate(notes="Domestic socket installation"){render();const input=nodes(render()).find(n=>n.type==="TextareaField");input.props.onChange({target:{value:notes}});button(page==="materials"?"Suggest materials":"Create priced draft").props.onClick();render();},chooseCustomer(){const select=nodes(render()).find(n=>n.type==="select"&&nodes(n).some(o=>o.type==="option"&&o.props.value==="c1"));assert.ok(select);select.props.onChange({target:{value:"c1"}});render();}};
}
function lineField(h,index,label,value){const card=nodes(h.render()).find(n=>n.type==="article"&&n.props["aria-label"]===`Pricing line ${index}`);assert.ok(card,`line ${index}`);const field=nodes(card).find(n=>n.props.label===label);assert.ok(field,label);if(value!==undefined){field.props.onChange({target:{value}});h.render();}return field;}
const savedMaterial={id:"material-1",name:"Double socket",unit:"Each",tradeCost:4.123,sellPrice:9.875,supplier:"Wholesaler",stockCode:"001234",notes:"Private buying note"};
test("saved materials can be added to an open quote with exact prices and no source or record mutation",()=>{
 const h=harness("quote-builder");h.render();h.stores["jr-os-materials"].items=[savedMaterial];h.generate();const before=structuredClone(savedMaterial);
 h.field("Saved material","material-1");h.button("Add saved material").props.onClick();h.render();
 assert.match(lineField(h,2,"Description").props.value,/Double socket/);assert.equal(lineField(h,2,"Unit cost (£)").props.value,4.123);assert.equal(lineField(h,2,"Unit price (£)").props.value,9.875);
 assert.equal(h.writes.length,0);assert.deepEqual(savedMaterial,before);assert.equal(h.field("Saved material").props.value,"");
});
test("adding and completing a blank allowance in a review filter keeps it visible and saves the full draft",()=>{
 const h=harness("quote-builder");h.render();h.pack.materials[0].unitCost=4.123;h.generate();h.chooseCustomer();h.button("Add blank material").props.onClick();h.render();
 const toggle=()=>nodes(h.render()).find(n=>n.type==="input"&&n.props.type==="checkbox"&&n.props["aria-label"]==="Show lines needing review");assert.ok(toggle());toggle().props.onChange({target:{checked:true}});h.render();
 assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,1);assert.equal(h.button("Save draft to Quotes").props.disabled,true);
 lineField(h,2,"Description","Extra fixing material");lineField(h,2,"Unit cost (£)","0");lineField(h,2,"Unit price (£)","12.345");
 assert.ok(nodes(h.render()).some(n=>n.type==="article"&&n.props["aria-label"]==="Pricing line 2"));assert.match(text(h.render()),/0 lines need review/);assert.equal(h.button("Save draft to Quotes").props.disabled,false);
 h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes.length,1);assert.equal(h.writes[0].items.length,2);assert.equal(h.writes[0].items[0].unitCost,4.123);assert.equal(h.writes[0].items[1].unitPrice,12.345);
});
test("descriptions and line amounts are editable and a blank description blocks saving",()=>{
 const h=harness("quote-builder");h.render();h.pack.materials[0].unitCost=4.123;h.generate();h.chooseCustomer();lineField(h,1,"Quantity","2");lineField(h,1,"Unit price (£)","9.875");
 assert.match(text(h.render()),/Line selling amount.*£19.75/);lineField(h,1,"Description"," ");assert.equal(h.button("Save draft to Quotes").props.disabled,true);h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes.length,0);
 lineField(h,1,"Description","Reviewed socket allowance");h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes[0].items[0].description,"Reviewed socket allowance");assert.equal(h.pack.materials[0].description,"Socket");
});
test("hourly quantity edits update saved labour hours and overhead without altering the hourly rate",()=>{
 const h=harness("quote-builder");h.render();h.pack.materials[0].unitCost=4.123;h.stores["jr-os-labour-rates"].items=[{id:"r1",name:"Electrician",unit:"Hour",costRate:20,chargeRate:75,active:true}];h.stores["jr-os-business-overheads"].items=[{id:"overhead",active:true,frequency:"Annual",amount:1650}];h.generate();h.chooseCustomer();
 const price=lineField(h,1,"Unit price (£)").props.value;lineField(h,1,"Quantity","");assert.equal(h.button("Save draft to Quotes").props.disabled,true);lineField(h,1,"Quantity","3.5");h.button("Save draft to Quotes").props.onClick();
 const labour=h.writes[0].items.find(i=>i.category==="Labour");assert.equal(labour.labourHours,3.5);assert.equal(labour.quantity,3.5);assert.equal(labour.unitPrice,price);assert.equal(h.writes[0].profitability.overheadCost,3.5);
});
test("day billing has an independent reviewed hours allowance and missing hours block profit and saving",()=>{
 const h=harness("quote-builder");h.render();h.pack.materials[0].unitCost=4.123;h.stores["jr-os-labour-rates"].items=[{id:"r1",name:"Electrician",unit:"Day",costRate:100,chargeRate:300,active:true}];h.stores["jr-os-business-overheads"].items=[{id:"overhead",active:true,frequency:"Annual",amount:1650}];h.generate();h.chooseCustomer();
 lineField(h,1,"Quantity","1");assert.equal(lineField(h,1,"Time allowance (hours)").props.value,2);lineField(h,1,"Time allowance (hours)","");assert.equal(h.button("Save draft to Quotes").props.disabled,true);assert.doesNotMatch(text(h.render()),/Expected profit£/);
 lineField(h,1,"Time allowance (hours)","4");h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes[0].items.find(i=>i.category==="Labour").quantity,1);assert.equal(h.writes[0].profitability.overheadCost,4);
});
test("old material-add actions reject source refreshes, changed selection and lost ownership",()=>{
 for(const change of [h=>{h.stores["jr-os-materials"].items=[{...savedMaterial,sellPrice:200}];h.render();},h=>{h.field("Saved material","");h.render();},h=>{h.identity.identity={...h.identity.identity,organisationId:"other"};h.render();},h=>h.session(),h=>h.unmount()]){
  const h=harness("quote-builder");h.identity.mode="cloud";h.render();h.stores["jr-os-materials"].items=[savedMaterial];h.generate();h.field("Saved material","material-1");const add=h.button("Add saved material").props.onClick;change(h);add();h.render();assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,1);assert.equal(h.writes.length,0);
 }
});
test("ambiguous material sources cannot be added and double taps do not replace or duplicate a new allowance",()=>{
 const h=harness("quote-builder");h.render();h.stores["jr-os-materials"].items=[savedMaterial,{...savedMaterial,name:"Duplicate"}];h.generate();h.field("Saved material","material-1");h.button("Add saved material").props.onClick();assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,1);
 const add=h.button("Add blank material").props.onClick;add();add();h.render();assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,2);assert.equal(h.writes.length,0);
});
test("a loaded quote page keeps its media subtree hidden and inert while collections refresh",()=>{
 const h=harness("quote-builder");h.generate();h.stores["jr-os-jobs"].isReady=false;const loading=h.render();
 const main=nodes(loading).find(n=>n.type==="main");assert.ok(main);assert.equal(main.props.hidden,true);assert.equal(main.props.inert,true);assert.ok(nodes(main).some(n=>n.type==="ConnectedQuoteAssistant"));
 assert.match(text(loading),/Preparing AI Quote Builder/);h.stores["jr-os-jobs"].isReady=true;const ready=h.render();assert.equal(nodes(ready).find(n=>n.type==="main").props.hidden,false);assert.equal(h.field("Job notes").props.value,"Domestic socket installation");assert.equal(h.writes.length,0);
 const initial=harness("quote-builder",false);assert.ok(!nodes(initial.render()).some(n=>n.type==="ConnectedQuoteAssistant"));
});

const reviewedLighting = "Kitchen lighting\nReviewed photos and requested work\nProposed scope\n- Install six LED downlights\nQuestions to confirm\n- Confirm cable route\nExclusions\n- Replace sockets excluded";
test("reviewed media scope builds current saved labour and materials immediately without saving", () => {
  const h = harness("quote-builder"); h.generate();
  Object.assign(h.pack, {name:"Install four LED downlights",description:"Install four downlights",labourHours:3,materials:[{id:"lights",description:"LED downlight",quantity:4,unitCost:5,unitPrice:9.875}]});
  h.stores["jr-os-labour-rates"].items=[{id:"r1",name:"Electrician",unit:"Hour",costRate:20,chargeRate:50,active:true}]; h.render();
  const panel = h.assistant(); assert.equal(typeof panel.props.onBuildDraft,"function");
  panel.props.onBuildDraft("Domestic socket installation",reviewedLighting); const tree=h.render();
  assert.equal(h.field("Job notes").props.value,reviewedLighting);
  const labour=nodes(tree).find(n=>n.props["aria-label"]==="Labour pricing lines"), materials=nodes(tree).find(n=>n.props["aria-label"]==="Materials pricing lines");
  assert.ok(labour); assert.ok(materials); assert.match(text(labour),/Electrician/); assert.match(text(materials),/LED downlight/); assert.doesNotMatch(text(materials),/Socket/);
  assert.equal(nodes(materials).find(n=>n.props.label==="Quantity").props.value,4); assert.equal(nodes(labour).find(n=>n.props.label==="Quantity").props.value,3);
  assert.match(text(tree),/6 downlights.*allows 4/); assert.equal(h.writes.length,0); assert.equal(h.attempts.length,0);
});
test("reviewed-media callbacks cannot replace a newer draft after notes or target changes",()=>{
  for(const kind of ["notes","target","readiness","session","unmount"]){
    const h=harness("quote-builder");h.identity.mode="cloud";h.generate(); const callback=h.assistant().props.onBuildDraft; assert.equal(typeof callback,"function");
    if(kind==="notes")h.notes("Latest note text");
    if(kind==="target")h.chooseCustomer();
    if(kind==="readiness"){h.stores["jr-os-jobs"].isReady=false;h.render();}
    if(kind==="session")h.session();
    if(kind==="unmount")h.unmount();
    callback("Domestic socket installation",reviewedLighting); if(kind==="readiness")h.stores["jr-os-jobs"].isReady=true;h.render();
    assert.equal(h.writes.length,0); assert.notEqual(h.field("Job notes").props.value,reviewedLighting);
  }
});
test("notes-only media handoff clears the old estimate, while a stale handoff retains newer work",()=>{
  const h=harness("quote-builder");h.generate();h.assistant().props.onApply("Domestic socket installation",reviewedLighting);
  assert.equal(h.field("Job notes").props.value,reviewedLighting);assert.match(text(h.render()),/Your draft will appear here/);assert.equal(h.writes.length,0);
  const old=harness("quote-builder");old.generate();const apply=old.assistant().props.onApply;old.notes("Newest socket scope");old.button("Create priced draft").props.onClick();old.render();
  apply("Domestic socket installation",reviewedLighting);assert.equal(old.field("Job notes").props.value,"Newest socket scope");assert.match(text(old.render()),/Draft pricing lines/);
});
test("invoice evidence refresh invalidates an old media draft callback and a current callback can build",()=>{
 const h=harness("quote-builder");h.generate();const old=h.assistant().props.onBuildDraft;
 h.stores["jr-os-invoices"].items=[{id:"paid",status:"Paid",jobId:"job-1",total:500}];h.render();old("Domestic socket installation",reviewedLighting);
 assert.equal(h.field("Job notes").props.value,"Domestic socket installation");assert.equal(h.writes.length,0);
 h.assistant().props.onBuildDraft("Domestic socket installation",reviewedLighting);h.render();assert.equal(h.field("Job notes").props.value,reviewedLighting);assert.equal(h.writes.length,0);
});
test("media draft review explains missing saved labour and materials with direct setup links",()=>{
  const h=harness("quote-builder");h.render();h.stores["jr-os-job-packs"].items=[];h.notes("Install a specialist unit");
  const callback=h.assistant().props.onBuildDraft;assert.equal(typeof callback,"function");callback("Install a specialist unit","Proposed scope\n- Install a specialist unit");
  const tree=h.render();assert.match(text(tree),/No priced labour line/);assert.match(text(tree),/No matching material lines/);assert.equal(h.writes.length,0);
  assert.ok(nodes(tree).some(n=>n.type==="Link"&&n.props.href==="/labour-costs"));assert.ok(existsSync(new URL("../app/labour-costs/page.tsx",import.meta.url)));assert.ok(nodes(tree).some(n=>n.type==="Link"&&n.props.href==="/starter-library"));
});

test("local quote review separates included work, survey questions and exclusions without creating records", () => {
  const h = harness("quote-builder");
  h.generate("Hallway\nReplacement faceplate\nProposed scope\n- Replace one double socket\nQuestions to confirm\n- Is an EICR needed?\nExclusions\n- Full rewire excluded");
  const region = label => { const found = nodes(h.render()).find(node => node.props["aria-label"] === label); assert.ok(found, label); return text(found); };
  assert.match(region("Included work"), /Replace one double socket/);
  assert.doesNotMatch(region("Included work"), /EICR|rewire|Questions|Exclusions/);
  assert.match(region("Questions to confirm"), /Is an EICR needed\?/);
  assert.match(region("Exclusions"), /Full rewire excluded/);
  assert.match(region("Saved pack matches"), /Domestic socket/);
  assert.match(region("Saved pack matches"), /socket.*supplied work/);
  assert.match(text(h.render()), /Local estimate/);
  assert.equal(h.writes.length, 0);
  assert.equal(h.field("Unit cost (£)").props.value, "");
  assert.equal(h.button("Save draft to Quotes").props.disabled, true);
});

test("local quote review makes mismatched saved point quantities visible without scaling prices", () => {
  const h = harness("quote-builder");
  Object.assign(h.pack, { name: "Install four LED downlights", description: "Install four downlights", materials: [{ id: "lights", description: "LED downlight", quantity: 4, unitCost: 5, unitPrice: 9.875 }] });
  h.generate("Install six LED downlights");
  const questions = nodes(h.render()).find(node => node.props["aria-label"] === "Questions to confirm");
  assert.ok(questions, "quantity review must be visible");
  assert.match(text(questions), /6 downlights.*allows 4/);
  assert.equal(h.field("Quantity").props.value, 4);
  assert.equal(h.field("Unit price (£)").props.value, 9.875);
  assert.equal(h.writes.length, 0);
});

test("materials page keeps unknown cost blank, blocks save, and accepts an explicit reviewed zero", () => {
  const h=harness("materials");h.generate();assert.equal(h.field("Buying cost each (£)").props.value,"");assert.match(text(h.render()),/cost.*review/i);
  h.button("Save selected").props.onClick();assert.equal(h.writes.length,0);
  h.field("Buying cost each (£)","0");h.button("Save selected").props.onClick();assert.equal(h.writes.length,1);assert.equal(h.writes[0].items[0].unitCost,0);assert.equal(h.writes[0].items[0].quantity,2.333);
});
test("materials page cannot silently omit invalid selected quantities or claim a failed save succeeded", () => {
  const h=harness("materials");h.generate();h.field("Buying cost each (£)","4.123");h.field("Quantity","0");h.button("Save selected").props.onClick();assert.equal(h.writes.length,0);
  h.field("Quantity","2.333");h.fail();h.button("Save selected").props.onClick();assert.equal(h.writes.length,0);assert.match(text(h.render()),/Storage full/);assert.equal(h.field("Buying cost each (£)").props.value,4.123);
});
test("quote builder withholds profit and saving until costs are filled, while retaining exact pack price", () => {
  const h=harness("quote-builder");h.generate();h.chooseCustomer();assert.equal(h.field("Unit cost (£)").props.value,"");assert.doesNotMatch(text(h.render()),/Expected profit£/);
  h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes.length,0);
  h.field("Unit cost (£)","4.123");assert.match(text(h.render()),/Entered for this estimate/);h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes.length,1);assert.equal(h.writes[0].items[0].unitCost,4.123);assert.equal(h.writes[0].items[0].unitPrice,9.875);assert.ok(Number.isFinite(h.writes[0].profitability.expectedProfit));
});
test("clearing a quote cost restores review status; zero remains valid; failed save retains draft", () => {
  const h=harness("quote-builder");h.generate();h.chooseCustomer();h.field("Unit cost (£)","0");assert.match(text(h.render()),/Expected profit/);h.field("Unit cost (£)","");h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes.length,0);
  h.field("Unit cost (£)","0");h.fail();h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes.length,0);assert.match(text(h.render()),/Storage full/);assert.equal(h.field("Unit cost (£)").props.value,0);
});
test("empty or invalid selling amounts cannot become a free quote line on save", () => {
  for (const price of ["", "-1", "Infinity"]) {
    const h=harness("quote-builder");h.generate();h.chooseCustomer();h.field("Unit cost (£)","4");h.field("Unit price (£)",price);
    assert.equal(h.button("Save draft to Quotes").props.disabled,true);h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes.length,0);assert.match(text(h.render()),/Costs need review/);
  }
});
test("a duplicate customer cannot receive the saved quote", () => {
  const h=harness("quote-builder");h.generate();h.chooseCustomer();h.field("Unit cost (£)","4");const customers=h.stores["jr-os-customers"];customers.items.push({...customers.items[0]});h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes.length,0);assert.match(text(h.render()),/missing or duplicated/);
});

for (const page of ["materials", "quote-builder"]) {
  const saveLabel=page==="materials"?"Save selected":"Save draft to Quotes", costLabel=page==="materials"?"Buying cost each (£)":"Unit cost (£)";
  const ready=(mode="local")=>{const h=harness(page);h.identity.mode=mode;h.generate();if(page==="quote-builder")h.chooseCustomer();h.field(costLabel,"4.123");return h;};
  test(`${page}: repeated taps create one record and offer its exact saved link`,()=>{
    const h=ready(), save=h.button(saveLabel).props.onClick;save();save();assert.equal(h.writes.length,1);h.render();save();assert.equal(h.writes.length,1);assert.ok(!nodes(h.render()).some(node=>node.type==="Button"&&text(node).includes(saveLabel)&&!node.props.disabled));
    const expected=page==="materials"?`/purchases?list=${encodeURIComponent(h.writes[0].id)}`:`/quotes/${encodeURIComponent(h.writes[0].id)}`;
    assert.ok(nodes(h.render()).some(node=>node.type==="Link"&&node.props.href===expected));
  });
  test(`${page}: failed saves retry with the same record and line identities`,()=>{
    const h=ready();h.fail();h.button(saveLabel).props.onClick();assert.equal(h.writes.length,0);const first=h.attempts[0];h.fail(false);h.button(saveLabel).props.onClick();assert.equal(h.writes.length,1);assert.deepEqual(JSON.parse(JSON.stringify(h.writes[0])),JSON.parse(JSON.stringify(first)));
  });
  test(`${page}: an equivalent collection refresh preserves the exact failed payload`,()=>{
    const h=ready();h.fail();h.button(saveLabel).props.onClick();const first=h.attempts[0],oldSave=h.button(saveLabel).props.onClick;
    for(const store of Object.values(h.stores))store.items=reorderProperties(structuredClone(store.items));
    h.render();h.fail(false);oldSave();assert.equal(h.writes.length,0);h.button(saveLabel).props.onClick();assert.equal(h.writes.length,1);assert.deepEqual(JSON.parse(JSON.stringify(h.writes[0])),JSON.parse(JSON.stringify(first)));
  });
  test(`${page}: an acknowledgement failure recognises the exact saved record without another write`,()=>{
    const h=ready();h.failAfterWrite();h.button(saveLabel).props.onClick();assert.equal(h.writes.length,1);h.button(saveLabel).props.onClick();assert.equal(h.writes.length,1);assert.equal(h.attempts.length,1);assert.ok(!nodes(h.render()).some(node=>node.type==="Button"&&text(node).includes(saveLabel)&&!node.props.disabled));
  });
  test(`${page}: recovery accepts the same JSON record after nested property reordering`,()=>{
    const h=ready();h.failAfterWrite();h.button(saveLabel).props.onClick();const store=h.stores[page==="materials"?"jr-os-purchase-lists":"jr-os-pricing-documents"];store.items=store.items.map(reorderProperties);
    h.button(saveLabel).props.onClick();assert.equal(h.writes.length,1);assert.equal(h.attempts.length,1);assert.match(text(h.render()),/Recovered the previously saved version/);assert.doesNotMatch(text(h.render()),/changed or duplicate record/);
  });
  test(`${page}: an older save callback cannot save prices changed in a newer render`,()=>{
    const h=ready(), save=h.button(saveLabel).props.onClick;h.field(costLabel,"7");h.render();save();assert.equal(h.writes.length,0);h.button(saveLabel).props.onClick();assert.equal(h.writes[0].items[0].unitCost,7);
  });
  test(`${page}: generating again invalidates the old save and creates a separate deliberate draft`,()=>{
    const h=ready(), save=h.button(saveLabel).props.onClick;save();assert.equal(h.writes.length,1);h.generate();h.field(costLabel,"6");h.render();save();assert.equal(h.writes.length,1);h.button(saveLabel).props.onClick();assert.equal(h.writes.length,2);assert.notEqual(h.writes[0].id,h.writes[1].id);
  });
  test(`${page}: retained saves stop on account, readiness, session and unmount changes`,()=>{
    for(const change of[h=>{h.identity.identity={...h.identity.identity,organisationId:"other"};h.render();},h=>{h.stores["jr-os-jobs"].isReady=false;h.render();},h=>h.session(),h=>h.unmount()]){
      const h=ready("cloud");h.render();assert.equal(h.button(saveLabel).props.disabled,false);const save=h.button(saveLabel).props.onClick;change(h);save();assert.equal(h.writes.length,0);
    }
  });
  test(`${page}: a current office session can save and a readiness refresh does not revive old callbacks`,()=>{
    const h=ready("cloud"),old=h.button(saveLabel).props.onClick;h.stores["jr-os-jobs"].isReady=false;h.render();h.stores["jr-os-jobs"].isReady=true;h.render();old();assert.equal(h.writes.length,0);h.button(saveLabel).props.onClick();assert.equal(h.writes.length,1);
  });
  test(`${page}: editing after a genuine failure keeps the same identity and saves the reviewed amounts`,()=>{
    const h=ready();h.fail();h.button(saveLabel).props.onClick();const id=h.attempts[0].id;h.field(costLabel,"8");h.fail(false);h.button(saveLabel).props.onClick();assert.equal(h.writes[0].id,id);assert.equal(h.writes[0].items[0].unitCost,8);
  });
  test(`${page}: a changed or duplicated saved identity is never treated as this draft's successful save`,()=>{
    for(const duplicate of [false,true]){const h=ready();h.fail();h.button(saveLabel).props.onClick();const attempted=h.attempts[0],store=h.stores[page==="materials"?"jr-os-purchase-lists":"jr-os-pricing-documents"];store.items=duplicate?[attempted,attempted]:[{...attempted,title:"Different record"}];h.fail(false);h.button(saveLabel).props.onClick();assert.equal(h.writes.length,0);assert.match(text(h.render()),/changed or duplicate record/);}
  });
  test(`${page}: recovering a saved version does not imply later draft edits were applied`,()=>{
    const h=ready();h.failAfterWrite();h.button(saveLabel).props.onClick();h.field(costLabel,"8");h.button(saveLabel).props.onClick();assert.equal(h.writes.length,1);assert.equal(h.writes[0].items[0].unitCost,4.123);assert.match(text(h.render()),/later draft edits were not saved/i);assert.ok(!nodes(h.render()).some(node=>node.props.label===costLabel));
  });
}
