import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as helpers from "../lib/jobPackCatalogue.ts";
import * as identities from "../lib/assistantIdentity.ts";
import * as ownership from "../lib/supabase/sessionOwnership-core.mjs";
const nodes=tree=>Array.isArray(tree)?tree.flatMap(nodes):tree&&typeof tree==="object"?[tree,...nodes(tree.props?.children)]:[];
const text=tree=>Array.isArray(tree)?tree.map(text).join(""):tree==null||typeof tree==="boolean"?"":typeof tree==="object"?text(tree.props?.children):String(tree);
const source=ts.transpileModule(readFileSync(new URL("../app/job-packs/page.tsx",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function harness(){
  const slots=[],effects=[],writes=[];let cursor=0,seq=0,fail=false,session={access_token:"token",user:{id:"u1"}},epoch=1;
  const identity={mode:"cloud",isReady:true,identity:{organisationId:"o1",userId:"u1",role:"owner"}};
  const pack={id:"p1",name:"Socket job",category:"Custom",description:"Fit socket",labourDescription:"Install and test",labourHours:3,labourRate:50,materials:[{id:"l1",materialId:"m1",description:"Socket",quantity:2,unitCost:5,unitPrice:10}],testingRequirements:"Test",certificatesRequired:"MWC",notes:"Making good excluded",internalNotes:"Private benchmark",createdAt:"then",updatedAt:"then"};
  const library={items:[{id:"m1",name:"Socket",tradeCost:6,sellPrice:12,stockCode:"AA1",supplier:"CEF",supplierUrl:"https://www.cef.co.uk/product",unit:"Each"}],isReady:true};
  const packs={items:[pack],isReady:true,createItem(item){if(fail)throw new Error("Storage full");writes.push(item);packs.items=[item,...packs.items];return item;},updateItem(id,fn){if(fail)throw new Error("Storage full");const old=packs.items.find(i=>i.id===id),item=fn(old);writes.push(item);packs.items=packs.items.map(i=>i.id===id?item:i);return item;},removeItem(id,validate){const old=packs.items.find(i=>i.id===id);validate?.(old);if(fail)throw new Error("Storage full");packs.items=packs.items.filter(i=>i.id!==id);},setItems(){throw new Error("Must use durable writes");}};
  const useState=value=>{const i=cursor++;if(!(i in slots))slots[i]=typeof value==="function"?value():value;return[slots[i],next=>{slots[i]=typeof next==="function"?next(slots[i]):next;}];};
  const deps={react:{useState,useRef:v=>useState({current:v})[0],useMemo(fn,d){const i=cursor++;if(!slots[i]||d.some((v,j)=>!Object.is(v,slots[i].d[j])))slots[i]={d,value:fn()};return slots[i].value;},useLayoutEffect(fn){const i=cursor++,old=slots[i];slots[i]={cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}},"react/jsx-runtime":{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},"lucide-react":new Proxy({},{get:(_,key)=>String(key)}),"next/link":{default:"Link"},
    "../../components/ui/Button":{Button:"Button"},"../../components/ui/Card":{Card:"Card"},"../../components/ui/FormField":{InputField:"InputField",TextareaField:"TextareaField"},"../../components/ui/PageHeader":{PageHeader:"PageHeader"},"../../components/crm/EntityEmptyState":{EntityEmptyState:"Empty"},"../../components/catalogue/StarterCatalogue":{StarterCatalogue:"Catalogue"},"../../components/jobs/JobPackBreakdown":{JobPackBreakdown:"Breakdown"},
    "../../lib/cloud/coreBusinessCollections":{useJobPacksCollection:()=>packs,useMaterialsCollection:()=>library},"../../lib/storage":{makeId:prefix=>`${prefix}-${++seq}`},"../../lib/cloud/useCloudIdentity":{useCloudIdentity:()=>identity},"../../lib/assistantIdentity":identities,"../../lib/jobPackCatalogue":helpers,
    "../../lib/supabase/client":{captureSupabaseSessionOwnership:()=>({session,epoch}),readSupabaseSession:()=>session,readSupabaseSessionOwnershipEpoch:()=>epoch},"../../lib/supabase/sessionOwnership-core.mjs":ownership};
  const mod={exports:{}};vm.runInNewContext(source,{module:mod,exports:mod.exports,Date,Error,structuredClone,window:{confirm:()=>true},require:key=>{assert.ok(key in deps,key);return deps[key];}});
  const render=()=>{cursor=0;const tree=mod.exports.default();effects.splice(0).forEach(fn=>fn());return tree;};const button=label=>{const b=nodes(render()).find(n=>n.type==="Button"&&text(n)===label);assert.ok(b,label);return b;};
  return{packs,library,identity,writes,render,button,edit(){button("Edit").props.onClick();render();},field(label,value){const f=nodes(render()).find(n=>n.props.label===label);assert.ok(f,label);if(value!==undefined)f.props.onChange({target:{value}});return f;},submit(){const f=nodes(render()).find(n=>n.type==="form");assert.ok(f);return f.props.onSubmit({preventDefault(){}});},fail(){fail=true;},session(){epoch++;session=null;},unmount(){slots.forEach(s=>s?.cleanup?.());}};
}
test("Job Packs exposes the catalogue and separated cost breakdown without writes",()=>{const h=harness(),view=h.render();assert.ok(nodes(view).some(n=>n.type==="Catalogue"));assert.ok(nodes(view).some(n=>n.type==="Breakdown"));assert.equal(h.writes.length,0);});
test("pack editor saves quantities, buying/selling allowances and private notes separately",()=>{const h=harness();h.edit();h.field("Quantity · Socket","3");h.field("Buying cost each (£) · Socket","7");h.field("Selling price each (£) · Socket","11");h.field("Internal pricing notes","New private benchmark");h.submit();assert.equal(h.writes.length,1);assert.equal(h.writes[0].materials[0].quantity,3);assert.equal(h.writes[0].materials[0].unitCost,7);assert.equal(h.writes[0].materials[0].unitPrice,11);assert.equal(h.writes[0].internalNotes,"New private benchmark");assert.equal(h.writes[0].notes,"Making good excluded");});
test("failed persistence keeps the draft and invalid quantities cannot be saved",()=>{const h=harness();h.edit();h.field("Quantity · Socket","0");h.submit();assert.equal(h.writes.length,0);h.field("Quantity · Socket","3");h.fail();h.submit();assert.equal(h.writes.length,0);assert.equal(h.field("Quantity · Socket").props.value,3);assert.match(text(h.render()),/Storage full/);});
test("changing the stored pack while editing cannot overwrite the newer record",()=>{const h=harness();h.edit();h.packs.items=[{...h.packs.items[0],notes:"Newer scope"}];h.render();h.submit();assert.equal(h.writes.length,0);assert.equal(h.packs.items[0].notes,"Newer scope");assert.match(text(h.render()),/changed/);});
test("pack supplier actions fail closed for removed, duplicate or changed material records",()=>{const h=harness(),view=h.render(),card=nodes(view).find(n=>n.type==="Breakdown");assert.ok(card);const material=h.library.items[0];assert.equal(card.props.canUseMaterial(material),true);h.library.items=[{...material,stockCode:"CHANGED"}];h.render();assert.equal(card.props.canUseMaterial(material),false);h.library.items=[material,material];h.render();assert.equal(card.props.canUseMaterial(material),false);h.library.items=[];h.render();assert.equal(card.props.canUseMaterial(material),false);});
test("old pack callbacks cannot act after account, session or readiness changes",()=>{for(const change of[h=>{h.identity.identity={...h.identity.identity,organisationId:"other"};},h=>h.session(),h=>{h.packs.isReady=false;}]){const h=harness();h.edit();const submit=nodes(h.render()).find(n=>n.type==="form").props.onSubmit;change(h);h.render();submit({preventDefault(){}});assert.equal(h.writes.length,0);}});
test("same-owner readiness refresh resumes the draft without reviving old save callbacks",()=>{
  const h=harness();h.edit();h.field("Quantity · Socket","19");const submit=nodes(h.render()).find(n=>n.type==="form").props.onSubmit,member=h.identity.identity;
  h.identity.identity=null;h.identity.isReady=false;assert.equal(nodes(h.render()).filter(n=>n.type==="form").length,0);
  h.identity.identity=member;h.identity.isReady=true;h.render();assert.equal(h.field("Quantity · Socket").props.value,19);
  submit({preventDefault(){}});assert.equal(h.writes.length,0);h.submit();assert.equal(h.writes[0].materials[0].quantity,19);
});
test("derived labour rates retain fixed amounts when editing unrelated pack notes",()=>{
  const h=harness();h.packs.items=[{...h.packs.items[0],labourHours:6,labourRate:350/6}];h.edit();
  const rate=h.field("Charge rate (£/hour)");assert.equal(rate.props.step,"any");h.field("Internal pricing notes","Reviewed scope");h.submit();assert.equal(helpers.jobPackTotals(h.writes[0],h.library.items).labour,350);
});
test("imported fractional hours, quantities and material prices stay editable without rounding snapshots",()=>{
  const h=harness();h.packs.items=[{...h.packs.items[0],labourHours:6.1,labourRate:350/6.1,materials:[{...h.packs.items[0].materials[0],quantity:2.333,unitCost:1.183,unitPrice:1.416}]}];h.edit();
  for(const label of ["Labour hours","Quantity · Socket","Buying cost each (£) · Socket","Selling price each (£) · Socket"])assert.equal(h.field(label).props.step,"any",label);
  h.field("Internal pricing notes","Scope reviewed");h.submit();assert.equal(h.writes[0].materials[0].unitPrice,1.416);assert.equal(h.writes[0].materials[0].unitCost,1.183);assert.equal(h.writes[0].materials[0].quantity,2.333);assert.equal(h.writes[0].labourHours,6.1);assert.equal(helpers.jobPackTotals(h.writes[0],h.library.items).labour,350);
});
const packCards = view => nodes(view).filter(node => node.type === "Breakdown").map(node => node.props.pack);
const searchPacks = (h, value) => {
  const input = nodes(h.render()).find(node => node.type === "input" && node.props.placeholder === "Search job packs");
  assert.ok(input, "saved-pack search"); input.props.onChange({ target: { value } });
};
const categoryFilter = h => {
  const select = nodes(h.render()).find(node => node.type === "select" && node.props["aria-label"] === "Filter job packs by category");
  assert.ok(select, "labelled saved-pack category filter"); return select;
};
test("saved-pack search matches every case-insensitive word across name, category, scope and material descriptions", () => {
  const h = harness(), pack = { ...h.packs.items[0], name: "Kitchen job", description: "Fit outlet" };
  h.packs.items = [pack, { ...pack, id: "p2", name: "Other job", description: "Fit light", materials: [] }];
  searchPacks(h, "  SOCKET   CUSTOM KITCHEN FIT  ");
  assert.deepEqual(packCards(h.render()).map(item => item.id), ["p1"]);
  searchPacks(h, "CUSTOM socket impossible");
  assert.equal(packCards(h.render()).length, 0);
  searchPacks(h, "  \t  ");
  assert.equal(packCards(h.render()).length, 2);
  assert.equal(h.writes.length, 0);
});
test("category filter uses usable saved categories and combines with search; clear restores the catalogue", () => {
  const h = harness(), pack = h.packs.items[0];
  h.packs.items = [pack, { ...pack, id: "p2", category: "Lighting", name: "Socket lighting" }, { ...pack, id: "duplicate", category: "Hidden category" }, { ...pack, id: "duplicate", category: "Hidden category" }, { ...pack, id: "", category: "Blank ID category" }];
  const filter = categoryFilter(h);
  assert.deepEqual(nodes(filter).filter(node => node.type === "option").map(text), ["All categories", "Custom", "Lighting"]);
  assert.match(text(h.render()), /Showing 2 of 2 matching job packs · 2 saved/);
  filter.props.onChange({ target: { value: "Lighting" } }); searchPacks(h, "SOCKET");
  assert.deepEqual(packCards(h.render()).map(item => item.id), ["p2"]);
  assert.match(text(h.render()), /Showing 1 of 1 matching job packs · 2 saved/);
  h.button("Clear filters").props.onClick();
  assert.equal(categoryFilter(h).props.value, "");
  assert.equal(packCards(h.render()).length, 2);
  assert.match(text(h.render()), /missing or duplicate IDs/);
  assert.equal(h.writes.length, 0);
});
test("saved-pack cards start at eight, expand by eight and reset when either filter changes", () => {
  const h = harness(), pack = h.packs.items[0];
  h.packs.items = Array.from({ length: 19 }, (_, index) => ({ ...pack, id: `p${index}`, name: `Socket ${index}`, category: index < 12 ? "Lighting" : "Custom" }));
  assert.equal(packCards(h.render()).length, 8);
  assert.match(text(h.render()), /Showing 8 of 19 matching job packs · 19 saved/);
  h.button("Show more").props.onClick(); assert.equal(packCards(h.render()).length, 16);
  h.button("Show more").props.onClick(); assert.equal(packCards(h.render()).length, 19);
  assert.equal(nodes(h.render()).some(node => node.type === "Button" && text(node) === "Show more"), false);
  searchPacks(h, "socket"); assert.equal(packCards(h.render()).length, 8);
  h.button("Show more").props.onClick(); assert.equal(packCards(h.render()).length, 16);
  categoryFilter(h).props.onChange({ target: { value: "Lighting" } }); assert.equal(packCards(h.render()).length, 8);
  h.button("Show more").props.onClick(); assert.equal(packCards(h.render()).length, 12);
  h.button("Clear filters").props.onClick(); assert.equal(packCards(h.render()).length, 8);
  assert.equal(h.writes.length, 0);
});
test("saved-pack browsing remains gated to ready office or local accounts", () => {
  for (const disable of [h => { h.identity.identity.role = "engineer"; }, h => { h.packs.isReady = false; }]) {
    const h = harness(); disable(h);
    assert.equal(packCards(h.render()).length, 0);
    const filter = categoryFilter(h);
    assert.equal(filter.props.disabled, true);
    assert.deepEqual(nodes(filter).filter(node => node.type === "option").map(text), ["All categories"]);
    assert.doesNotMatch(text(h.render()), /matching job packs/);
  }
  const h = harness(); h.identity.mode = "local"; h.identity.identity = null;
  assert.equal(packCards(h.render()).length, 1);
});
