import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as helpers from "../lib/jobPackCatalogue.ts";
import * as ownership from "../lib/supabase/sessionOwnership-core.mjs";
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);
const mat = { id: "starter-mat-1", name: "Cable", tradeCost: 1, sellPrice: 2, unit: "Metre" };
const pack = { id: "starter-pack-1", name: "Socket", category: "Small works", description: "One socket", labourHours: 3, labourRate: 50, materials: [{ id: "line-1", materialId: mat.id, description: "Cable", quantity: 5, unitCost: 1, unitPrice: 2 }] };
const path = new URL("../components/catalogue/StarterCatalogue.tsx", import.meta.url);
const source = existsSync(path) ? ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText : "";
function harness() {
  assert.ok(source, "StarterCatalogue exists");
  const slots = [], effects = [], writes = []; let cursor = 0, epoch = 1, session = { access_token: "token", user: { id: "user-1" } }, fail = "", wait;
  const state = { mode: "cloud", isReady: true, identity: { organisationId: "org-1", userId: "user-1", role: "owner" } };
  const props = { identityState: state, materials: { items: [], isReady: true, createItem: item => save("materials", item) }, packs: { items: [], isReady: true, createItem: item => save("packs", item) } };
  function save(kind, item) { if (kind === fail) throw new Error("Storage full"); if (props[kind].items.some(old => old.id === item.id)) throw new Error("Duplicate write"); writes.push({ kind, item }); props[kind].items = [...props[kind].items, item]; return wait ? wait() : item; }
  const useState = value => { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === "function" ? value() : value; return [slots[i], next => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; };
  const deps = {
    react: { useState, useRef: value => useState({ current: value })[0], useMemo(fn, values) { const i = cursor++; if (!slots[i] || values.some((v,j) => !Object.is(v,slots[i].values[j]))) slots[i] = { values, result: fn() }; return slots[i].result; }, useLayoutEffect(fn) { const i=cursor++, old=slots[i]; slots[i]={ cleanup: old?.cleanup }; effects.push(()=>{ slots[i].cleanup?.(); slots[i].cleanup=fn(); }); } },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "../ui/Button": { Button: "Button" }, "../ui/Card": { Card: "Card" }, "../jobs/JobPackBreakdown": { JobPackBreakdown: "Breakdown" },
    "../../lib/starterData": { starterMaterials: [mat], starterJobPacks: [pack] }, "../../lib/jobPackCatalogue": helpers,
    "../../lib/supabase/client": { captureSupabaseSessionOwnership: () => ({ session, epoch }), readSupabaseSession: () => session, readSupabaseSessionOwnershipEpoch: () => epoch },
    "../../lib/supabase/sessionOwnership-core.mjs": ownership,
  };
  const mod={exports:{}}; vm.runInNewContext(source,{module:mod,exports:mod.exports,structuredClone,Date,Error,require:name=>{assert.ok(name in deps,name);return deps[name];}});
  const render=()=>{cursor=0;const tree=mod.exports.StarterCatalogue(props);effects.splice(0).forEach(fn=>fn());return tree;};
  const button=label=>{const found=nodes(render()).find(n=>n.type==="Button"&&text(n).includes(label));assert.ok(found,label);return found;};
  return { props,state,writes,render,button, agree(){nodes(render()).find(n=>n.type==="input"&&n.props.type==="checkbox").props.onChange({target:{checked:true}});render();}, fail(value){fail=value;}, wait(fn){wait=fn;}, session(){epoch++;session=null;}, unmount(){slots.forEach(s=>s?.cleanup?.());} };
}

test("catalogue import needs explicit allowance review and never writes on render", async()=>{
  const h=harness();const b=h.button("Add missing job packs");assert.equal(b.props.disabled,true);await b.props.onClick();assert.equal(h.writes.length,0);
  h.agree();await h.button("Add missing job packs").props.onClick();assert.deepEqual(h.writes.map(w=>w.kind),["materials","packs"]);assert.match(text(h.render()),/Added 1 materials and 1 job packs/);
  await h.button("Add missing job packs").props.onClick();assert.equal(h.writes.length,2);
});
test("existing edited catalogue records are preserved and partial failures retry only missing entries", async()=>{
  const h=harness();h.agree();h.fail("packs");await h.button("Add missing job packs").props.onClick();assert.equal(h.writes.length,1);assert.match(text(h.render()),/Storage full/);
  h.props.materials.items[0].tradeCost=99;h.fail("");await h.button("Add missing job packs").props.onClick();assert.equal(h.writes.length,2);assert.equal(h.props.materials.items[0].tradeCost,99);
});
test("signed-out, loading and restricted identities cannot import through retained callbacks", async()=>{
  for(const change of [h=>{h.state.identity=null;},h=>{h.state.isReady=false;},h=>{h.state.identity.role="electrician";},h=>{h.props.packs.isReady=false;},h=>h.session()]){
    const h=harness();h.agree();const click=h.button("Add missing job packs").props.onClick;change(h);h.render();await click();assert.equal(h.writes.length,0);
  }
});
test("an account switch during import prevents pack writes and hides earlier feedback", async()=>{
  const h=harness();h.agree();let finish;h.wait(()=>new Promise(resolve=>{finish=resolve;}));const pending=h.button("Add missing job packs").props.onClick();
  h.state.identity={...h.state.identity,organisationId:"org-2"};h.render();finish();await pending;assert.equal(h.writes.length,1);assert.doesNotMatch(text(h.render()),/Added 1/);
});
test("double taps and unmounted handlers cannot duplicate catalogue writes", async()=>{
  const h=harness();h.agree();let finish;h.wait(()=>new Promise(resolve=>{finish=resolve;}));const click=h.button("Add missing job packs").props.onClick;const pending=click();await click();assert.equal(h.writes.length,1);h.unmount();finish();await pending;await click();assert.equal(h.writes.length,1);
});
