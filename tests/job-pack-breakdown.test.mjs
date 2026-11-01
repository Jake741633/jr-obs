import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as helpers from "../lib/jobPackCatalogue.ts";
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);
const path = new URL("../components/jobs/JobPackBreakdown.tsx", import.meta.url);
const material = { id: "mat", name: "Cable", stockCode: "001-A", supplier: "CEF", supplierUrl: "https://www.cef.co.uk/product", unit: "Metre", tradeCost: 1, sellPrice: 2 };
const pack = { labourHours: 2, labourRate: 50, materials: [{ id: "line", materialId: "mat", description: "Cable", quantity: 5, unitPrice: 2 }], notes: "Making good excluded", internalNotes: "Historical benchmark, not a verified bill of materials", testingRequirements: "Verify design", certificatesRequired: "EIC" };
function render(materials = [material], canUseMaterial, selectedPack = pack) {
  assert.ok(existsSync(path), "JobPackBreakdown exists"); const mod = { exports: {} };
  const deps = { "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }, "../../lib/jobPackCatalogue": helpers, "../materials/MaterialShareActions": { MaterialShareActions: "Share" } };
  vm.runInNewContext(ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:mod,exports:mod.exports,require:key=>{assert.ok(key in deps,key);return deps[key];}});
  return mod.exports.JobPackBreakdown({pack:selectedPack,materials,canUseMaterial,contextKey:"account"});
}
test("pack breakdown shows quantities and separate buying, selling, labour and guide totals",()=>{
  const view=render();assert.match(text(view),/Estimated buying cost.*£5.00/);assert.match(text(view),/Materials selling allowance.*£10.00/);assert.match(text(view),/Guide job total.*£110.00/);assert.match(text(view),/5 Metre/);assert.match(text(view),/Historical benchmark/);assert.match(text(view),/Verify design/);
});
test("unknown or duplicate library costs never appear as free materials",()=>{
  for(const library of [[],[material,material]]){const view=render(library);assert.match(text(view),/Incomplete/);assert.match(text(view),/Cost not recorded/);assert.equal(nodes(view).filter(n=>n.type==="Share").length,0);}
});
test("supplier actions only appear for unique linked records and consult live parent guard",()=>{
  let current=true;const view=render([material],()=>current),action=nodes(view).find(n=>n.type==="Share");assert.ok(action);assert.equal(action.props.material.stockCode,"001-A");assert.equal(action.props.canUse(),true);current=false;assert.equal(action.props.canUse(),false);
});
test("internal benchmarks are displayed separately from customer-copyable exclusions",()=>{
  const view=render(),paragraphs=nodes(view).filter(n=>n.type==="p");
  assert.ok(paragraphs.some(p=>/Internal pricing notes:.*Historical benchmark/.test(text(p))));
  assert.ok(paragraphs.some(p=>/Scope notes & exclusions:.*Making good excluded/.test(text(p))));
});
test("parking and permit charges have their own subtotal and plain charge details", () => {
  const view = render([material], () => true, { ...pack, otherAllowances: [
    { id: "parking", description: "Parking", category: "Parking", quantity: 2, unitPrice: 15, unitCost: 10 },
    { id: "permit", description: "Permit", quantity: 1, unitPrice: 25 },
  ] });
  assert.match(text(view), /Other charges.*£55.00/);
  assert.match(text(view), /Guide job total.*£165.00/);
  const charges = nodes(view).find(node => node.type === "section" && node.props["aria-label"] === "Other charges");
  assert.ok(charges);
  assert.match(text(charges), /Parking.*2.*£15.00.*£30.00/);
  assert.match(text(charges), /Permit.*£25.00/);
  assert.match(text(charges), /Category Parking/);
  assert.equal(nodes(charges).filter(node => node.type === "Share").length, 0);
});
test("legacy other allowance notes withhold the guide total and explain verification", () => {
  const view = render([material], undefined, { ...pack, notes: "Making good excluded\nOther allowances from original quote:\nParking £30" });
  assert.match(text(view), /Guide job total.*Review legacy charges/);
  assert.doesNotMatch(text(view), /Guide job total£110.00/);
  assert.match(text(view), /original quote/); assert.match(text(view), /Other charges/);
  assert.match(text(view), /remove.*heading.*Notes/i);
});
test("malformed saved charges show invalid amounts without crashing", () => {
  for (const otherAllowances of [{}, [null, "Parking", { id: "c1" }]]) {
    const view = render([material], undefined, { ...pack, otherAllowances });
    assert.match(text(view), /Guide job total.*Check invalid amounts/);
  }
});
