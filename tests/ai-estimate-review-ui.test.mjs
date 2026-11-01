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
const pure = Object.fromEntries(["aiCommandCentre", "assistantIdentity", "estimateCostReview", "quoteDraftLines", "quoteDraftAdditions", "quoteDraftCatalogue", "quoteDraftPricingReview", "materialSuppliers", "quoteEngine", "workflow", "businessSettings", "quoteTemplates", "purchaseListLink"].map(name => [name, loadLocalTs(new URL(`../lib/${name}.ts`, import.meta.url))]));
function harness(page, initialReady = true) {
  const slots = [], stores = {}, writes = [], attempts = [], effects = []; let cursor = 0, seq = 0, fixedLineId, fail = false, failAfterWrite = false, epoch = 1, session = {access_token:"test-session",user:{id:"u1"}};
  const identity = {mode:"local",isReady:true,identity:{userId:"u1",organisationId:"o1",role:"owner"}};
  const pack = { id:"p1", name:"Domestic socket", category:"Domestic", description:"Fit socket", notes:"", labourHours:2, labourRate:50, createdAt:"2026-01-01", updatedAt:"2026-01-01", materials:[{id:"l1", description:"Socket", quantity:2.333, unitPrice:9.875}] };
  function collection(key, defaults = []) {
    return stores[key] ??= { items:key === "jr-os-job-packs" ? [pack] : key === "jr-os-customers" ? [{id:"c1",name:"Customer",address:"Site"}] : defaults, isReady:initialReady,
      createItem(item) { attempts.push(item); if (fail) throw new Error("Storage full"); if(this.items.some(old=>old.id===item.id))throw new Error("Duplicate identity");writes.push(item); this.items = [item, ...this.items]; if(failAfterWrite)throw new Error("Save acknowledgement lost");return item; },
      setItems() { throw new Error("Must use durable record creation"); } };
  }
  const useState = initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; };
  const react = {useState,useRef:value=>useState({current:value})[0],useMemo(fn,deps){const i=cursor++;if(!slots[i]||deps.some((value,j)=>!Object.is(value,slots[i].deps[j])))slots[i]={deps,value:fn()};return slots[i].value;},useLayoutEffect(fn){const i=cursor++;effects.push(()=>{slots[i]?.cleanup?.();slots[i]={cleanup:fn()};});}};
  const storage = {useLocalStorageCollection:collection,makeId:prefix=>prefix==="ai-line"&&fixedLineId?fixedLineId:`${prefix}-${++seq}`};
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
  return {render,button,field,writes,attempts,stores,pack,identity,lineIdentity(value){fixedLineId=value;},assistant(){const found=nodes(render()).find(n=>n.type==="ConnectedQuoteAssistant");assert.ok(found);return found;},notes(value){nodes(render()).find(n=>n.type==="TextareaField").props.onChange({target:{value}});render();},fail(value=true){fail=value;},failAfterWrite(){failAfterWrite=true;},session(){epoch++;session=null;},unmount(){slots.forEach(slot=>slot?.cleanup?.());},generate(notes="Domestic socket installation"){render();const input=nodes(render()).find(n=>n.type==="TextareaField");input.props.onChange({target:{value:notes}});button(page==="materials"?"Suggest materials":"Create priced draft").props.onClick();render();},chooseCustomer(){const select=nodes(render()).find(n=>n.type==="select"&&nodes(n).some(o=>o.type==="option"&&o.props.value==="c1"));assert.ok(select);select.props.onChange({target:{value:"c1"}});render();}};
}
function lineField(h,index,label,value){const card=nodes(h.render()).find(n=>n.type==="article"&&n.props["aria-label"]===`Pricing line ${index}`);assert.ok(card,`line ${index}`);const field=nodes(card).find(n=>n.props.label===label);assert.ok(field,label);if(value!==undefined){field.props.onChange({target:{value}});h.render();}return field;}
const savedMaterial={id:"material-1",name:"Double socket",unit:"Each",tradeCost:4.123,sellPrice:9.875,supplier:"Wholesaler",stockCode:"001234",notes:"Private buying note"};
const savedRate={id:"extra-rate",name:"Additional electrician",unit:"Hour",costRate:21.123,chargeRate:76.875,active:true};
const extraPack={id:"extra-pack",name:"Garden light addition",category:"Domestic",description:"Fit garden light",labourDescription:"Light installation",labourHours:1.5,labourRate:55.555,materials:[{id:"extra-material",materialId:"material-1",description:"Light fixing",quantity:2.333,unitPrice:9.875}],otherAllowances:[{id:"parking",category:"Parking",description:"Parking",quantity:2,unitPrice:7.125,unitCost:4.125}],testingRequirements:"Test affected circuit",certificatesRequired:"Minor Works",notes:"Making good excluded",internalNotes:"Private benchmark"};
function additionsDraft(){const h=harness("quote-builder");h.render();h.pack.materials[0].unitCost=4.123;h.generate();h.chooseCustomer();return h;}
const totalReview=h=>{const result=nodes(h.render()).find(n=>n.props["aria-label"]==="Quote total review");assert.ok(result,"full quote total review");return result;};
test("quote-specific allowances and VAT total match the saved document without changing defaults or line prices",()=>{
 const h=additionsDraft();h.stores["jr-os-vat-settings"].items=[{...h.stores["jr-os-vat-settings"].items[0],registrationStatus:"VAT registered",defaultRate:20}];const defaults=structuredClone(h.stores["jr-os-quote-engine-settings"].items);
 lineField(h,1,"Quantity","2");lineField(h,1,"Unit price (£)","50");h.field("Quote contingency (%)","10");h.field("Quote travel cost (£)","8");h.field("Quote travel price (£)","20.25");h.field("Quote parking cost (£)","2");h.field("Quote parking price (£)","5.75");
 const view=text(totalReview(h));assert.match(view,/Before VAT.*£136.00/);assert.match(view,/VAT \(20%\).*£27.20/);assert.match(view,/Quote total.*£163.20/);assert.equal(h.writes.length,0);h.button("Save draft to Quotes").props.onClick();const saved=h.writes[0];assert.equal(saved.profitability.sellingPrice,136);assert.equal(pure.workflow.pricingDocumentNetTotal(saved),136);assert.equal(saved.vatEnabled,true);assert.equal(saved.vatRate,20);assert.equal(saved.pricingSettings.travelPrice,20.25);assert.equal(saved.pricingSettings.parkingPrice,5.75);assert.equal(saved.items[0].unitPrice,50);assert.equal(saved.items[0].unitCost,4.123);assert.deepEqual(structuredClone(h.stores["jr-os-quote-engine-settings"].items),defaults);
});
test("fractional-penny contingency display agrees with the saved quote engine calculation",()=>{
 const h=additionsDraft();lineField(h,1,"Quantity","1");lineField(h,1,"Unit cost (£)","0.1");lineField(h,1,"Unit price (£)","0.35");h.field("Quote contingency (%)","10");const view=text(totalReview(h));assert.match(view,/Contingency \(10%\).*£0.03/);assert.match(view,/Quote total.*£0.38/);h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes[0].profitability.sellingPrice,0.38499999999999995);assert.equal(h.writes[0].items[0].unitPrice,0.35);
});
test("cleared quote allowances stay unknown and cannot show totals or save until explicitly repaired",()=>{
 const h=additionsDraft();h.field("Quote travel cost (£)","");assert.equal(h.field("Quote travel cost (£)").props.value,"");assert.equal(h.button("Save draft to Quotes").props.disabled,true);assert.doesNotMatch(text(totalReview(h)),/Quote total£/);h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes.length,0);assert.match(text(h.render()),/travel buying|travel cost/i);
 h.field("Quote travel cost (£)","0");h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes[0].pricingSettings.travelCost,0);
});
test("invalid current business settings withhold clean totals and prevent saving the draft",()=>{
 for(const change of [h=>{const s=h.stores["jr-os-labour-cost-settings"];s.items=[{...s.items[0],billableHoursPerDay:0}];},h=>{const s=h.stores["jr-os-vat-settings"];s.items=[{...s.items[0],registrationStatus:"Unknown"}];},h=>{h.stores["jr-os-business-overheads"].items=[{id:"o",active:true,frequency:"Annual",amount:10},{id:"o",active:true,frequency:"Annual",amount:20}];}]){
  const h=additionsDraft();h.field("Quote notes & exclusions","Keep reviewed scope");change(h);h.render();assert.equal(h.button("Save draft to Quotes").props.disabled,true);assert.doesNotMatch(text(totalReview(h)),/Quote total£/);assert.doesNotMatch(text(h.render()),/Expected profit£/);h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes.length,0);assert.equal(h.field("Quote notes & exclusions").props.value,"Keep reviewed scope");assert.ok(nodes(totalReview(h)).some(n=>n.type==="Link"&&n.props.target==="_blank"));
 }
});
test("current overhead, labour and VAT refreshes update the displayed and saved review without repricing lines",()=>{
 const h=harness("quote-builder");h.render();h.pack.materials[0].unitCost=4.123;h.stores["jr-os-labour-rates"].items=[savedRate];h.stores["jr-os-business-overheads"].items=[{id:"o",active:true,frequency:"Annual",amount:1650}];h.generate();h.chooseCustomer();lineField(h,1,"Quantity","2");const price=lineField(h,1,"Unit price (£)").props.value;
 assert.match(text(h.render()),/£2.00 allocated business overhead/);h.stores["jr-os-business-overheads"].items=[{id:"o",active:true,frequency:"Annual",amount:3300}];h.render();assert.match(text(h.render()),/£4.00 allocated business overhead/);
 const settings=h.stores["jr-os-labour-cost-settings"];settings.items=[{...settings.items[0],billableHoursPerDay:15}];h.render();assert.match(text(h.render()),/£2.00 allocated business overhead/);const vat=h.stores["jr-os-vat-settings"];vat.items=[{...vat.items[0],registrationStatus:"VAT registered",defaultRate:20}];h.render();assert.match(text(totalReview(h)),/VAT \(20%\)/);
 h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes[0].profitability.overheadCost,2);assert.equal(h.writes[0].items[0].unitPrice,price);assert.equal(h.writes[0].vatEnabled,true);
});
test("consecutive quote allowance edits before render accumulate with exact numeric precision",()=>{
 const h=additionsDraft(),travel=h.field("Quote travel price (£)").props.onChange,parking=h.field("Quote parking price (£)").props.onChange;travel({target:{value:"123.456"}});parking({target:{value:"7.891"}});h.render();assert.equal(h.field("Quote travel price (£)").props.value,123.456);assert.equal(h.field("Quote parking price (£)").props.value,7.891);h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes[0].pricingSettings.travelPrice,123.456);assert.equal(h.writes[0].pricingSettings.parkingPrice,7.891);
});
test("stale quote allowance callbacks reject changed source, draft, owner, readiness and unmount",()=>{
 for(const change of [h=>h.notes("New requested work"),h=>h.generate(),h=>{h.stores["jr-os-jobs"].isReady=false;h.render();},h=>{h.identity.identity={...h.identity.identity,organisationId:"other"};h.render();},h=>{h.identity.isReady=false;h.render();},h=>h.session(),h=>h.unmount()]){
  const h=harness("quote-builder");h.identity.mode="cloud";h.render();h.pack.materials[0].unitCost=4.123;h.generate();h.chooseCustomer();const edit=h.field("Quote travel price (£)").props.onChange;change(h);edit({target:{value:"999"}});h.render();assert.equal(h.field("Quote travel price (£)").props.value,0);assert.equal(h.writes.length,0);
 }
 const h=additionsDraft(),edit=h.field("Quote travel price (£)").props.onChange;h.button("Save draft to Quotes").props.onClick();edit({target:{value:"999"}});h.render();assert.equal(h.writes.length,1);assert.equal(h.writes[0].pricingSettings.travelPrice,0);assert.ok(!nodes(h.render()).some(n=>n.props.label==="Quote travel price (£)"));
});
test("reviewed quote totals and saving include complete hidden lines after allowance edits",()=>{
 const h=additionsDraft();lineField(h,1,"Quantity","2");lineField(h,1,"Unit price (£)","50");h.button("Add blank material").props.onClick();h.render();nodes(h.render()).find(n=>n.props["aria-label"]==="Show lines needing review").props.onChange({target:{checked:true}});h.render();lineField(h,2,"Description","Extra fixings");lineField(h,2,"Unit cost (£)","1");lineField(h,2,"Unit price (£)","10");h.field("Quote contingency (%)","0");h.field("Quote travel price (£)","3");h.render();assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,1);assert.match(text(totalReview(h)),/Quote total.*£113.00/);h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes[0].items.length,2);assert.equal(h.writes[0].profitability.sellingPrice,113);
});
test("draft section links resolve to current focusable scope, lines and review targets",()=>{
 const h=additionsDraft(),tree=h.render(),nav=nodes(tree).find(n=>n.type==="nav"&&n.props["aria-label"]==="Quote draft sections");assert.ok(nav);const links=nodes(nav).filter(n=>n.type==="a");assert.equal(links.length,3);
 for(const link of links){assert.ok(link.props.href.startsWith("#"));const target=nodes(tree).find(n=>n.props.id===link.props.href.slice(1));assert.ok(target);assert.equal(target.props.tabIndex,-1);assert.match(link.props.className,/min-h-12/);}
 assert.ok(nodes(totalReview(h)).some(n=>n.type==="a"&&n.props.href==="#quote-draft-lines"));assert.equal(h.writes.length,0);
});
const searchableMaterial={...savedMaterial,manufacturer:"BG",category:"Accessories",supplier:"CEF",supplierUrl:"https://www.cef.co.uk/product?id=one",supplierOptions:[{id:"second",supplier:"Screwfix",stockCode:"002-Z5",supplierUrl:"https://www.screwfix.com/product?id=200"}]};
const optionIds=(h,label)=>nodes(h.field(label)).filter(n=>n.type==="option"&&n.props.value).map(n=>n.props.value);
test("draft material search finds secondary wholesaler codes and adds the explicitly chosen reference at exact saved prices",()=>{
 const h=additionsDraft();h.stores["jr-os-materials"].items=[searchableMaterial,{...savedMaterial,id:"other",name:"Garden light"}];const before=structuredClone(searchableMaterial);
 h.field("Search saved materials","SCREWFIX 002-z5 socket");h.render();assert.deepEqual(optionIds(h,"Saved material"),["material-1"]);h.field("Saved material","material-1");h.render();
 const preview=nodes(h.render()).find(n=>n.props["aria-label"]==="Selected material preview");assert.ok(preview);assert.equal(h.field("Selected stock code").props.value,"001234");assert.equal(h.field("Selected product link").props.value,"https://www.cef.co.uk/product?id=one");assert.equal(h.field("Selected stock code").props.readOnly,true);
 h.field("Quote wholesaler reference","second");h.render();assert.equal(h.field("Selected stock code").props.value,"002-Z5");assert.equal(h.field("Selected product link").props.value,"https://www.screwfix.com/product?id=200");assert.equal(h.writes.length,0);
 h.button("Add saved material").props.onClick();h.render();h.button("Save draft to Quotes").props.onClick();const line=h.writes[0].items[1];assert.equal(line.supplier,"Screwfix");assert.equal(line.stockCode,"002-Z5");assert.equal(line.materialId,"material-1");assert.equal(line.unitCost,4.123);assert.equal(line.unitPrice,9.875);assert.deepEqual(searchableMaterial,before);assert.doesNotMatch(JSON.stringify(h.writes[0]),/Private buying note|supplierOptions/);
});
test("saved product-link search stays local and empty results can be cleared without changing the quote",()=>{
 const h=additionsDraft();h.stores["jr-os-materials"].items=[searchableMaterial,{...searchableMaterial,id:"other",name:"Other product",supplierUrl:"https://www.cef.co.uk/product?id=two",supplierOptions:[]}];
 h.field("Search saved materials","https://www.cef.co.uk/product?id=one");h.render();assert.deepEqual(optionIds(h,"Saved material"),["material-1"]);h.field("Saved material","material-1");h.render();
 h.field("Search saved materials","unknown-code");h.render();assert.equal(h.field("Saved material").props.value,"");assert.equal(h.button("Add saved material").props.disabled,true);assert.match(text(h.render()),/No matching saved materials/);assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,1);assert.equal(h.button("Save draft to Quotes").props.disabled,false);
 h.button("Clear material search").props.onClick();h.render();assert.equal(h.field("Search saved materials").props.value,"");assert.equal(optionIds(h,"Saved material").length,2);assert.equal(h.writes.length,0);
});
test("material and job-pack searches exclude private fields and globally duplicated identities",()=>{
 const h=additionsDraft();h.stores["jr-os-materials"].items=[searchableMaterial,{...searchableMaterial,name:"Other hidden duplicate",supplier:"Other",stockCode:"other",supplierUrl:"",supplierOptions:[]}];h.field("Search saved materials","Double socket");h.render();assert.equal(optionIds(h,"Saved material").length,0);
 h.stores["jr-os-materials"].items=[searchableMaterial];h.field("Search saved materials","Private buying note");h.render();assert.equal(optionIds(h,"Saved material").length,0);
 h.stores["jr-os-job-packs"].items=[h.pack,extraPack];h.field("Search saved job packs","Private benchmark");h.render();assert.equal(optionIds(h,"Saved job pack").length,0);assert.equal(h.writes.length,0);
});
test("job-pack search narrows public work descriptions, clears a previous preview and retains existing lines",()=>{
 const h=additionsDraft();h.stores["jr-os-job-packs"].items=[h.pack,extraPack];h.field("Search saved job packs","garden fixing");h.render();assert.deepEqual(optionIds(h,"Saved job pack"),["extra-pack"]);h.field("Saved job pack","extra-pack");h.render();assert.ok(nodes(h.render()).some(n=>n.props["aria-label"]==="Selected job pack preview"));
 h.field("Search saved job packs","not-found");h.render();assert.equal(h.field("Saved job pack").props.value,"");assert.match(text(h.render()),/No matching saved job packs/);assert.equal(h.button("Add reviewed job pack").props.disabled,true);assert.ok(!nodes(h.render()).some(n=>n.props["aria-label"]==="Selected job pack preview"));
 h.button("Clear job pack search").props.onClick();h.render();assert.equal(optionIds(h,"Saved job pack").length,2);assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,1);assert.equal(h.writes.length,0);
});
test("search and clear preserve edited notes, held review lines, hidden priced lines and full-draft saving",()=>{
 const h=additionsDraft();lineField(h,1,"Unit price (£)","12.345");h.field("Quote notes & exclusions","Keep reviewed scope");h.button("Add blank material").props.onClick();h.render();nodes(h.render()).find(n=>n.props["aria-label"]==="Show lines needing review").props.onChange({target:{checked:true}});h.render();
 h.field("Search saved materials","no-result");h.render();h.field("Search saved job packs","no-result");h.render();h.button("Clear material search").props.onClick();h.render();h.button("Clear job pack search").props.onClick();h.render();assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,1);assert.equal(h.field("Quote notes & exclusions").props.value,"Keep reviewed scope");
 lineField(h,2,"Description","Fixings");lineField(h,2,"Unit cost (£)","0");lineField(h,2,"Unit price (£)","2.123");h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes[0].items.length,2);assert.equal(h.writes[0].items[0].unitPrice,12.345);assert.equal(h.writes[0].items[1].unitPrice,2.123);assert.equal(h.writes[0].notes,"Keep reviewed scope");
});
test("materials without a preferred reference remain addable without silently choosing another supplier",()=>{
 const h=additionsDraft();h.stores["jr-os-materials"].items=[{...searchableMaterial,supplier:"",stockCode:"",supplierUrl:""}];h.field("Saved material","material-1");h.render();assert.equal(h.field("Selected stock code").props.value,"");assert.equal(h.field("Quote wholesaler reference").props.value,"preferred");
 h.button("Add saved material").props.onClick();h.render();h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes[0].items[1].supplier,"");assert.equal(h.writes[0].items[1].stockCode,"");assert.equal(h.writes[0].items[1].unitPrice,9.875);
});
test("material add callbacks retire after query, record or supplier choices change away and back",()=>{
 for(const change of [h=>{h.field("Search saved materials","other");h.render();h.field("Search saved materials","");h.render();h.field("Saved material","material-1");h.render();},h=>{h.field("Saved material","");h.render();h.field("Saved material","material-1");h.render();},h=>{h.field("Quote wholesaler reference","second");h.render();h.field("Quote wholesaler reference","preferred");h.render();}]){
  const h=additionsDraft();h.stores["jr-os-materials"].items=[searchableMaterial];h.field("Saved material","material-1");const old=h.button("Add saved material").props.onClick;change(h);old();h.render();assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,1);h.button("Add saved material").props.onClick();h.render();assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,2);assert.equal(h.writes.length,0);
 }
});
test("material query and wholesaler changes reject an old add action even before the next render",()=>{
 for(const change of [h=>h.field("Search saved materials","new query"),h=>h.field("Quote wholesaler reference","second")]){
  const h=additionsDraft();h.stores["jr-os-materials"].items=[searchableMaterial];h.field("Saved material","material-1");const old=h.button("Add saved material").props.onClick;change(h);old();h.render();assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,1);assert.equal(h.writes.length,0);
 }
});
test("pack add callbacks retire after search/selection changes away and back",()=>{
 const h=additionsDraft();h.stores["jr-os-job-packs"].items=[h.pack,extraPack];h.field("Saved job pack","extra-pack");const old=h.button("Add reviewed job pack").props.onClick;h.field("Search saved job packs","other");h.render();h.field("Search saved job packs","");h.render();h.field("Saved job pack","extra-pack");h.render();old();h.render();assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,1);h.button("Add reviewed job pack").props.onClick();h.render();assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,4);assert.equal(h.writes.length,0);
});
test("removed or duplicated alternate supplier references cannot append a material after a refresh",()=>{
 for(const references of [[],[searchableMaterial.supplierOptions[0],searchableMaterial.supplierOptions[0]]]){
  const h=additionsDraft();h.stores["jr-os-materials"].items=[searchableMaterial];h.field("Saved material","material-1");h.render();h.field("Quote wholesaler reference","second");const old=h.button("Add saved material").props.onClick;h.stores["jr-os-materials"].items=[{...searchableMaterial,supplierOptions:references}];h.render();assert.equal(h.button("Add saved material").props.disabled,true);old();h.button("Add saved material").props.onClick();h.render();assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,1);assert.equal(h.writes.length,0);
 }
});
test("catalogue browsing leaves a current checked-media callback usable and new priced drafts clear search state",()=>{
 const h=additionsDraft(),old=h.assistant().props.onBuildDraft;h.field("Search saved materials","socket");h.render();h.field("Search saved job packs","Domestic");h.render();old("Domestic socket installation","Install a domestic socket\nConfirm access");h.render();assert.equal(h.field("Search saved materials").props.value,"");assert.equal(h.field("Search saved job packs").props.value,"");assert.equal(h.field("Saved material").props.value,"");assert.equal(h.writes.length,0);
});
test("a removed wholesaler stays unavailable until explicitly replaced and unsafe links never become preview actions",()=>{
 const h=additionsDraft();h.stores["jr-os-materials"].items=[searchableMaterial];h.field("Saved material","material-1");h.render();h.field("Quote wholesaler reference","second");h.render();h.stores["jr-os-materials"].items=[{...searchableMaterial,supplierOptions:[],supplierUrl:"javascript:private-code"}];h.render();
 assert.equal(h.field("Quote wholesaler reference").props.value,"second");assert.equal(h.button("Add saved material").props.disabled,true);h.field("Quote wholesaler reference","preferred");h.render();assert.equal(h.field("Selected stock code").props.value,"001234");assert.equal(h.field("Selected product link").props.value,"");assert.equal(h.button("Add saved material").props.disabled,false);
 h.button("Add saved material").props.onClick();h.render();h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes[0].items[1].supplier,"CEF");assert.equal(h.writes[0].items[1].stockCode,"001234");assert.doesNotMatch(JSON.stringify(h.writes[0]),/javascript|private-code/);
});
test("a retained material whose name becomes malformed renders review text rather than a raw object",()=>{
 const h=additionsDraft();h.stores["jr-os-materials"].items=[searchableMaterial];h.field("Saved material","material-1");h.render();h.stores["jr-os-materials"].items=[{...searchableMaterial,name:{private:"bad-name"}}];
 const preview=nodes(h.render()).find(n=>n.props["aria-label"]==="Selected material preview");assert.ok(preview);const heading=nodes(preview).find(n=>n.type==="p"&&n.props.className?.includes("font-semibold"));assert.equal(typeof heading.props.children,"string");assert.match(text(preview),/review|choose/i);assert.equal(h.button("Add saved material").props.disabled,true);assert.equal(h.writes.length,0);
});
test("saved labour adds exact rate and hourly time to an existing draft without changing the source",()=>{
 const h=additionsDraft();h.stores["jr-os-labour-rates"].items=[savedRate];const before=structuredClone(savedRate);h.field("Saved labour rate","extra-rate");h.button("Add saved labour").props.onClick();h.render();
 assert.equal(lineField(h,2,"Unit cost (£)").props.value,21.123);assert.equal(lineField(h,2,"Unit price (£)").props.value,76.875);assert.equal(h.field("Saved labour rate").props.value,"");assert.equal(h.writes.length,0);
 h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes[0].items.length,2);assert.equal(h.writes[0].items[1].labourHours,1);assert.equal(h.writes[0].items[1].labourRateId,"extra-rate");assert.deepEqual(savedRate,before);
});
test("blank labour needs explicit description, cost, price and time while day billing keeps its own hours",()=>{
 for(const useSavedDay of [false,true]){
  const h=additionsDraft();h.stores["jr-os-labour-rates"].items=[{...savedRate,unit:"Day"}];
  if(useSavedDay){h.field("Saved labour rate","extra-rate");h.button("Add saved labour").props.onClick();}else h.button("Add blank labour").props.onClick();h.render();
  assert.equal(h.button("Save draft to Quotes").props.disabled,true);assert.equal(lineField(h,2,"Time allowance (hours)").props.value,"");
  if(!useSavedDay){lineField(h,2,"Description","Extra labour");lineField(h,2,"Unit cost (£)","0");lineField(h,2,"Unit price (£)","125.875");}
  lineField(h,2,"Quantity","2");lineField(h,2,"Time allowance (hours)","3.5");h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes[0].items[1].labourHours,3.5);assert.equal(h.writes[0].items[1].quantity,2);assert.equal(h.writes[0].items[1].unitPrice,useSavedDay?76.875:125.875);
 }
});
test("pack preview and atomic addition keep complete lines in a held review list and save public scope only",()=>{
 const h=additionsDraft();h.stores["jr-os-job-packs"].items=[h.pack,extraPack];h.stores["jr-os-materials"].items=[savedMaterial];h.field("Quote notes & exclusions","Existing reviewed note");
 const filter=nodes(h.render()).find(n=>n.props["aria-label"]==="Show lines needing review");filter.props.onChange({target:{checked:true}});h.render();h.field("Saved job pack","extra-pack");
 const preview=nodes(h.render()).find(n=>n.props["aria-label"]==="Selected job pack preview");assert.ok(preview);assert.match(text(preview),/83.33/);assert.match(text(preview),/Making good excluded/);assert.match(text(preview),/Test affected circuit/);assert.doesNotMatch(text(preview),/Private benchmark/);assert.equal(h.writes.length,0);
 h.button("Add reviewed job pack").props.onClick();h.render();assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,3);assert.equal(h.field("Saved job pack").props.value,"");assert.equal(lineField(h,2,"Unit price (£)").props.value,83.33);assert.equal(lineField(h,3,"Quantity").props.value,2.333);assert.equal(lineField(h,3,"Unit cost (£)").props.value,4.123);
 assert.equal(h.button("Save draft to Quotes").props.disabled,true);lineField(h,2,"Unit cost (£)","21.123");h.button("Save draft to Quotes").props.onClick();const saved=h.writes[0];assert.equal(saved.items.length,4);assert.equal(saved.items[0].description,"Socket");assert.equal(saved.items[2].stockCode,"001234");assert.equal(saved.items[3].unitPrice,7.125);assert.equal(saved.items[3].unitCost,4.125);
 for(const value of ["Existing reviewed note","Garden light addition","Making good excluded","Minor Works","Test affected circuit"])assert.ok(saved.notes.includes(value));assert.doesNotMatch(JSON.stringify(saved),/Private benchmark|Private buying note/);
});
test("edited customer-facing draft notes are preserved and stale note callbacks cannot replace current changes",()=>{
 const h=additionsDraft(),old=h.field("Quote notes & exclusions").props.onChange;h.field("Quote notes & exclusions","Reviewed public scope");h.render();old({target:{value:"Old scope"}});h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes[0].notes,"Reviewed public scope");
});
test("pack preview refreshes when the source collection refreshes even if it retains a pack object",()=>{
 const h=additionsDraft(),pack={...extraPack};h.stores["jr-os-job-packs"].items=[pack];h.field("Saved job pack","extra-pack");h.render();pack.notes="Updated public exclusion";h.stores["jr-os-job-packs"].items=[pack];
 const preview=nodes(h.render()).find(n=>n.props["aria-label"]==="Selected job pack preview");assert.match(text(preview),/Updated public exclusion/);assert.doesNotMatch(text(preview),/Making good excluded/);
});
test("new line identities that collide with the draft cannot append or replace any existing line",()=>{
 const h=harness("quote-builder");h.render();h.lineIdentity("existing-line");h.pack.materials[0].unitCost=4.123;h.generate();h.chooseCustomer();h.field("Quote notes & exclusions","Keep reviewed note");h.button("Add blank labour").props.onClick();h.render();
 assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,1);assert.equal(h.field("Quote notes & exclusions").props.value,"Keep reviewed note");assert.match(text(h.render()),/identit.*duplicated/i);assert.equal(h.writes.length,0);
});
test("blank labour and material removal actions identify their category and remove only the requested allowance",()=>{
 const h=additionsDraft();h.button("Add blank labour").props.onClick();h.render();h.button("Add blank material").props.onClick();const tree=h.render();
 const labour=nodes(tree).find(n=>n.type==="article"&&n.props["aria-label"]==="Pricing line 2");assert.match(text(labour),/New labour allowance/);assert.doesNotMatch(text(labour),/New material allowance/);
 const remove=nodes(tree).find(n=>n.type==="button"&&n.props["aria-label"]==="Remove new labour allowance");assert.ok(remove,"screen readers must identify the labour removal action");remove.props.onClick();
 const remaining=nodes(h.render()).filter(n=>n.type==="article");assert.equal(remaining.length,2);assert.ok(nodes(remaining).some(n=>n.type==="button"&&n.props["aria-label"]==="Remove new material allowance"));assert.equal(h.writes.length,0);
});
for(const kind of ["labour","pack"]){
 const key=kind==="labour"?"jr-os-labour-rates":"jr-os-job-packs",label=kind==="labour"?"Saved labour rate":"Saved job pack",button=kind==="labour"?"Add saved labour":"Add reviewed job pack",source=kind==="labour"?savedRate:extraPack;
 test(`${kind} additions reject retained callbacks after source, selection, account or readiness changes`,()=>{
  for(const change of [h=>{h.stores[key].items=[{...source,name:"Refreshed source"}];h.render();},h=>{h.field(label,"");h.render();},h=>{h.stores[key].items=[];h.render();},h=>{h.stores[key].items=[source,{...source}];h.render();},h=>{h.stores[key].isReady=false;h.render();},h=>{h.identity.identity={...h.identity.identity,organisationId:"other"};h.render();},h=>{h.identity.isReady=false;h.render();},h=>h.session(),h=>h.unmount()]){
   const h=additionsDraft();h.identity.mode="cloud";h.render();h.stores[key].items=[source];h.field(label,source.id);const add=h.button(button).props.onClick;change(h);add();h.render();assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,1);assert.equal(h.writes.length,0);
  }
 });
 test(`${kind} additions reject synchronous repeats but permit a later deliberate addition`,()=>{
  const h=additionsDraft();h.stores[key].items=[source];h.field(label,source.id);const add=h.button(button).props.onClick;add();add();h.render();const added=kind==="labour"?1:3;assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,1+added);
  h.field(label,source.id);h.button(button).props.onClick();h.render();assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,1+added*2);assert.equal(h.writes.length,0);
 });
 test(`${kind} cannot append through an action retained after this draft is saved`,()=>{
  const h=additionsDraft();h.stores[key].items=[source];h.field(label,source.id);const add=h.button(button).props.onClick;h.button("Save draft to Quotes").props.onClick();assert.equal(h.writes.length,1);add();h.render();assert.equal(h.writes.length,1);assert.equal(h.writes[0].items.length,1);assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,0);
 });
}
test("ambiguous sources and malformed packs never append a partial draft or discard edited notes",()=>{
 for(const pack of [{...extraPack,materials:[null]},{...extraPack,notes:"Other allowances from original quote:\nParking £30"},{...extraPack,materials:[...extraPack.materials,...extraPack.materials]},{...extraPack,labourHours:0,materials:[],otherAllowances:[]}]){
  const h=additionsDraft();h.field("Quote notes & exclusions","Keep me");h.stores["jr-os-job-packs"].items=[pack];h.field("Saved job pack","extra-pack");const button=h.button("Add reviewed job pack");assert.equal(button.props.disabled,true);button.props.onClick();h.render();assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,1);assert.equal(h.field("Quote notes & exclusions").props.value,"Keep me");assert.equal(h.writes.length,0);
 }
 const h=additionsDraft();h.stores["jr-os-labour-rates"].items=[savedRate,{...savedRate}];h.field("Saved labour rate","extra-rate");h.button("Add saved labour").props.onClick();h.render();assert.equal(nodes(h.render()).filter(n=>n.type==="article").length,1);
});
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
