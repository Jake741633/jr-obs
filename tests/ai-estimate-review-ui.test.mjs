import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);
const pure = Object.fromEntries(["aiCommandCentre", "assistantIdentity", "estimateCostReview", "quoteEngine", "workflow", "businessSettings", "quoteTemplates"].map(name => [name, loadLocalTs(new URL(`../lib/${name}.ts`, import.meta.url))]));
function harness(page) {
  const slots = [], stores = {}, writes = []; let cursor = 0, seq = 0, fail = false;
  const pack = { id:"p1", name:"Domestic socket", category:"Domestic", description:"Fit socket", notes:"", labourHours:2, labourRate:50, createdAt:"2026-01-01", updatedAt:"2026-01-01", materials:[{id:"l1", description:"Socket", quantity:2.333, unitPrice:9.875}] };
  function collection(key, defaults = []) {
    return stores[key] ??= { items:key === "jr-os-job-packs" ? [pack] : key === "jr-os-customers" ? [{id:"c1",name:"Customer",address:"Site"}] : defaults, isReady:true,
      createItem(item) { if (fail) throw new Error("Storage full"); writes.push(item); this.items = [item, ...this.items]; return item; },
      setItems() { throw new Error("Must use durable record creation"); } };
  }
  const useState = initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; };
  const deps = { react:{useState}, "react/jsx-runtime":{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}, "lucide-react":new Proxy({}, {get:(_,name)=>name}), "next/link":{default:"Link"}, "../../../lib/storage":{useLocalStorageCollection:collection,makeId:prefix=>`${prefix}-${++seq}`} };
  const code = ts.transpileModule(readFileSync(new URL(`../app/ai/${page}/page.tsx`, import.meta.url), "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const mod = {exports:{}};
  vm.runInNewContext(code, {module:mod,exports:mod.exports,Date,Error,Intl,require:name=> {
    if (deps[name]) return deps[name];
    const base = name.split("/").at(-1);
    if (pure[base]) return pure[base];
    if (name.includes("/components/")) return new Proxy({}, {get:(_,key)=>key});
    throw new Error(`Unexpected dependency: ${name}`);
  }});
  const render = () => { cursor = 0; return mod.exports.default(); };
  const button = label => { const found = nodes(render()).find(n => n.type === "Button" && text(n).includes(label)); assert.ok(found,label); return found; };
  const field = (label, value) => { const found = nodes(render()).find(n => n.props.label === label) ?? nodes(render()).find(n => n.type === "label" && text(n).startsWith(label))?.props.children?.find?.(n => n?.type === "input" || n?.type === "select"); assert.ok(found,label); if (value !== undefined) found.props.onChange({target:{value}}); return found; };
  return {render,button,field,writes,stores,pack,fail(){fail=true;},generate(){render();const input=nodes(render()).find(n=>n.type==="TextareaField");input.props.onChange({target:{value:"Domestic socket installation"}});button(page==="materials"?"Suggest materials":"Create priced draft").props.onClick();render();},chooseCustomer(){const select=nodes(render()).find(n=>n.type==="select"&&nodes(n).some(o=>o.type==="option"&&o.props.value==="c1"));assert.ok(select);select.props.onChange({target:{value:"c1"}});render();}};
}

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
