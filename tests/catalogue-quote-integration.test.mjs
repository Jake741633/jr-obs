import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as helpers from "../lib/jobPackCatalogue.ts";
const raw=readFileSync(new URL("../app/quotes/page.tsx",import.meta.url),"utf8");
const ast=ts.createSourceFile("page.tsx",raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function action(name,context){
  let found;const walk=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node;ts.forEachChild(node,walk);};walk(ast);assert.ok(found,name);
  const code=ts.transpileModule(found.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return vm.runInNewContext(`${code}\n${name}`,{Error,...helpers,...context});
}
function harness(){
  const pack={id:"p1",name:"Socket",description:"Fit and test",labourDescription:"Install and test",labourHours:3,labourRate:50,materials:[{id:"l1",materialId:"m1",description:"Socket",quantity:2,unitCost:4,unitPrice:8}],notes:"Making good excluded",internalNotes:"PRIVATE HISTORICAL PRICE",testingRequirements:"Test circuit",certificatesRequired:"MWC"};
  const state={items:[],form:{title:"",notes:"",internalNotes:""},error:"",success:"",name:"",writes:[]};let seq=0;
  const ctx={jobPacks:{items:[pack],isReady:true,createItem(item){state.writes.push(item);return item;},setItems(){throw new Error("Use durable createItem");}},materials:{items:[{id:"m1",name:"Updated socket",tradeCost:77,sellPrice:99}],isReady:true},selectedJobPackId:"p1",setItems:fn=>state.items=fn(state.items),setForm:fn=>state.form=fn(state.form),setSavePackName:fn=>state.name=fn(state.name),setSelectedJobPackId(){},setError:value=>state.error=value,setSuccess:value=>state.success=value,makeId:prefix=>`${prefix}-${++seq}`,money:new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}),Date};
  return {state,ctx,pack,add:()=>action("addJobPack",ctx)(),save:()=>action("saveAsJobPack",{...ctx,items:state.items,form:state.form,savePackName:state.name,savePackCategory:"Custom"})()};
}
test("actual quote action keeps pack allowances, fixed labour and excludes internal benchmarks",()=>{
  const h=harness();h.add();assert.equal(h.state.items[0].quantity,1);assert.equal(h.state.items[0].labourHours,3);assert.equal(h.state.items[0].unitPrice,150);assert.equal(h.state.items[1].unitCost,4);assert.equal(h.state.items[1].unitPrice,8);assert.equal(h.state.items[1].description,"Socket");assert.match(h.state.form.notes,/Making good excluded/);assert.doesNotMatch(JSON.stringify(h.state.form),/PRIVATE HISTORICAL/);assert.equal(h.state.writes.length,0);
});
test("unready, ambiguous and invalid packs cannot change a quote draft",()=>{
  for(const change of [h=>h.ctx.jobPacks.isReady=false,h=>h.ctx.materials.isReady=false,h=>h.ctx.jobPacks.items.push({...h.pack}),h=>h.pack.labourRate=-1]){const h=harness();change(h);h.add();assert.equal(h.state.items.length,0);assert.equal(h.state.form.notes,"");assert.ok(h.state.error);}
});
test("saving imported quote as a pack preserves buying costs, hours and selling total",async()=>{
  const h=harness();h.add();await h.save();const saved=h.state.writes[0];assert.ok(saved);assert.equal(saved.labourHours,3);assert.equal(saved.labourRate,50);assert.equal(saved.materials[0].unitCost,4);assert.equal(saved.materials[0].unitPrice,8);assert.equal(helpers.jobPackTotals(saved,[]).total,166);
});
test("failed quote-to-pack save reports failure without a false success",async()=>{
  const h=harness();h.add();h.ctx.jobPacks.createItem=()=>{throw new Error("Storage is full");};await h.save();assert.match(h.state.error,/Storage is full/);assert.doesNotMatch(h.state.success,/saved as/);
});
test("non-cent-divisible fixed labour survives quote-to-pack-to-quote round trip",async()=>{
  const h=harness();h.add();h.state.items[0].unitPrice=350;h.state.items[0].labourHours=6;await h.save();
  const saved=h.state.writes[0];assert.equal(saved.labourHours,6);assert.equal(saved.labourRate,350/6);assert.equal(helpers.jobPackQuoteLines(saved,[],()=>"id")[0].unitPrice,350);
});

test("saving and reusing mixed or Other-only quotes preserves real allowances and customer notes", () => {
  for (const otherOnly of [false, true]) {
    const h = harness(); if (!otherOnly) h.add();
    h.state.name = "Site access pack"; h.state.form.notes = "Customer supplied access details";
    h.state.items.push({ id: "parking", category: "Other", description: "Parking", quantity: 2, unitPrice: 7.5, unitCost: 0 }, { id: "permit", category: "Other", description: "Permit", quantity: 1, unitPrice: 12 });
    const original = h.state.items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    h.save(); const saved = h.state.writes[0]; assert.ok(saved); assert.equal(saved.otherAllowances.length, 2); assert.equal(saved.notes, "Customer supplied access details");
    h.ctx.jobPacks.items = [{ ...saved, id: "p1" }]; h.state.items = []; h.state.form.notes = ""; h.add();
    assert.equal(h.state.items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0), original);
    const other = h.state.items.filter(line => line.category === "Other"); assert.equal(other.length, 2); assert.equal(other[0].unitCost, 0); assert.equal(other[1].unitCost, undefined);
    assert.doesNotMatch(h.state.form.notes, /Other allowances from original quote|£/);
  }
});

test("legacy note-only charges require reconciliation before pack reuse or saving", () => {
  const legacy = "Access notes\n\nOther allowances from original quote:\n- Parking: 1 × £15.00";
  const h = harness(); h.pack.notes = legacy; h.add(); assert.equal(h.state.items.length, 0); assert.match(h.state.error, /review|reconcil|Other charges/i);
  for (const hasStructured of [false, true]) {
    const quote = harness(); quote.add(); quote.state.form.notes = legacy;
    if (hasStructured) quote.state.items.push({ id: "parking", category: "Other", description: "Parking", quantity: 1, unitPrice: 15 });
    quote.save(); assert.equal(quote.state.writes.length, 0); assert.match(quote.state.error, /review|reconcil|Other charges/i);
  }
});

test("invalid Other quote amounts cannot create a reusable pack", () => {
  for (const patch of [{ quantity: 0 }, { quantity: -1 }, { unitPrice: NaN }, { unitCost: -1 }, { description: " " }]) {
    const h = harness(); h.state.name = "Access";
    h.state.items = [{ id: "parking", category: "Other", description: "Parking", quantity: 1, unitPrice: 15, ...patch }];
    h.save(); assert.equal(h.state.writes.length, 0); assert.match(h.state.error, /amounts/i);
  }
});

test("all supported allowance categories survive alongside adjacent material and allowance lines", () => {
  const h = harness(); h.add();
  const categories = ["Parking", "Travel", "Other", "Plant Hire", "Contingency", "Parking"];
  h.state.items.push(...categories.map((category, index) => ({ id: `allowance-${index}`, category, description: `${category} ${index}`, quantity: 2, unitPrice: index + 1 })));
  h.save(); const saved = h.state.writes[0]; assert.ok(saved);
  assert.deepEqual(Array.from(saved.otherAllowances, line => line.category), categories);
  h.ctx.jobPacks.items = [{ ...saved, id: "p1" }]; h.state.items = []; h.add();
  assert.deepEqual(Array.from(h.state.items.slice(2), line => line.category), categories);
  assert.equal(h.state.items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0), 208);
});

test("unsupported quote categories block pack saving before any line can be dropped", () => {
  const h = harness(); h.add(); h.state.items.push({ id: "unknown", category: "Unknown", description: "Charge", quantity: 1, unitPrice: 5 });
  h.save(); assert.equal(h.state.writes.length, 0); assert.match(h.state.error, /category|categories|unsupported/i);
});
