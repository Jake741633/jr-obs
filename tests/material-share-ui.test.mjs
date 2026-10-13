import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";
import { nodes, text } from "./helpers/customer-page-harness.mjs";

const componentPath = new URL("../components/materials/MaterialShareActions.tsx", import.meta.url);
const helperPath = new URL("../lib/materialSharing.ts", import.meta.url);
const helper = existsSync(helperPath) ? await import(helperPath) : {};
const source = ts.transpileModule(existsSync(componentPath) ? readFileSync(componentPath, "utf8") : "export function MaterialShareActions() { return null; }", { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const item = { name: "Twin socket", supplier: "Screwfix", stockCode: "123AB", supplierUrl: "https://example.com/socket/123ab", tradeCost: 7, sellPrice: 12, notes: "Private customer details" };

function harness({ clipboard = true, share } = {}) {
  let cursor = 0, allowed = true;
  const slots = [], effects = [], copies = [], shares = [];
  const props = { material: { ...item }, enabled: true, contextKey: "org-1:material-1", canUse: () => allowed };
  let write = async value => { copies.push(value); };
  let nativeShare = share;
  const useState = initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; };
  const changed = (old, deps) => !old || !deps || deps.some((value, index) => !Object.is(value, old.deps?.[index]));
  const effect = (fn, deps) => { const i = cursor++, old = slots[i]; if (changed(old, deps)) { const next = { deps, cleanup: old?.cleanup }; slots[i] = next; effects.push(() => { next.cleanup?.(); next.cleanup = fn(); }); } };
  const navigator = {};
  if (clipboard) navigator.clipboard = { writeText: value => write(value) };
  if (share) navigator.share = data => { shares.push(data); return nativeShare(data); };
  const dependencies = { react: { useState, useRef: value => useState({ current: value })[0], useMemo(fn, deps) { const i = cursor++; if (changed(slots[i], deps)) slots[i] = { value: fn(), deps }; return slots[i].value; }, useLayoutEffect: effect }, "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }, "../../lib/materialSharing": helper };
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, navigator, Error, JSON, require: key => { assert.ok(key in dependencies, key); return dependencies[key]; } });
  function render() { cursor = 0; const tree = mod.exports.MaterialShareActions(props); effects.splice(0).forEach(fn => fn()); return tree; }
  function button(label) { const result = nodes(render()).find(node => node.type === "button" && text(node) === label); assert.ok(result, `Button exists: ${label}`); return result; }
  return { props, copies, shares, render, button, allowed(value) { allowed = value; }, write(fn) { write = fn; }, share(fn) { nativeShare = fn; }, unmount() { slots.forEach(slot => slot?.cleanup?.()); } };
}

test("copy actions need explicit clicks and copy only exact current code or valid product link", async () => {
  const h = harness(); h.render(); assert.equal(h.copies.length, 0);
  for (const label of ["Copy code", "Copy link", "Share"]) { const button = h.button(label); assert.equal(button.props.type, "button"); assert.match(button.props.className, /min-h-12/); }
  await h.button("Copy code").props.onClick(); await h.button("Copy link").props.onClick();
  assert.deepEqual(h.copies, [item.stockCode, item.supplierUrl]);
  assert.ok(nodes(h.render()).some(node => node.props?.role === "status"));
});

test("native share receives only visible product identity and does not claim recipient delivery", async () => {
  const h = harness({ share: async () => {} }); h.render(); assert.equal(h.shares.length, 0);
  await h.button("Share").props.onClick(); assert.equal(h.shares.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.shares[0])), { title: item.name, text: `Twin socket\nSupplier: Screwfix\nCode: 123AB\n${item.supplierUrl}` });
  assert.doesNotMatch(JSON.stringify(h.shares), /tradeCost|sellPrice|notes|Private/);
  assert.match(text(h.render()), /Share sheet completed/); assert.doesNotMatch(text(h.render()), /sent|delivered/i);
});

test("unsupported share and denied clipboard provide selectable read-only fallback", async () => {
  const h = harness({ clipboard: false }); await h.button("Share").props.onClick();
  const field = nodes(h.render()).find(node => node.type === "textarea"); assert.ok(field); assert.equal(field.props.readOnly, true); assert.equal(field.props.value, `Twin socket\nSupplier: Screwfix\nCode: 123AB\n${item.supplierUrl}`);
  assert.ok(field.props["aria-label"]); assert.match(text(h.render()), /select|copy/i);
  const denied = harness(); denied.write(async () => { throw new Error("Denied"); }); await denied.button("Copy code").props.onClick();
  assert.equal(nodes(denied.render()).find(node => node.type === "textarea").props.value, item.stockCode);
});

test("cancelled native share does not copy, send again or report success", async () => {
  const h = harness({ share: async () => { throw Object.assign(new Error("Cancelled"), { name: "AbortError" }); } });
  await h.button("Share").props.onClick(); assert.equal(h.shares.length, 1); assert.equal(h.copies.length, 0);
  assert.match(text(h.render()), /cancelled/i); assert.doesNotMatch(text(h.render()), /completed|sent|copied/i);
  assert.ok(!nodes(h.render()).some(node => node.type === "textarea"));
});

test("denied native share offers manual fallback without automatic clipboard writes", async () => {
  const h = harness({ share: async () => { throw Object.assign(new Error("Denied"), { name: "NotAllowedError" }); } });
  await h.button("Share").props.onClick(); assert.equal(h.copies.length, 0);
  assert.equal(nodes(h.render()).find(node => node.type === "textarea").props.value, `Twin socket\nSupplier: Screwfix\nCode: 123AB\n${item.supplierUrl}`);
});

test("double taps launch one operation and stale completion cannot alter newer record feedback", async () => {
  const h = harness(); let finish; h.write(value => { h.copies.push(value); return new Promise(resolve => { finish = resolve; }); });
  const click = h.button("Copy code").props.onClick, pending = click(); await click(); assert.equal(h.copies.length, 1);
  h.props.material = { ...item, name: "New product", stockCode: "NEW" }; h.props.contextKey = "org-1:material-2"; h.render(); finish(); await pending;
  assert.doesNotMatch(text(h.render()), /copied/i);
});

test("old handlers fail closed after product, context, readiness, live permission or unmount changes", async () => {
  for (const change of [h => { h.props.material = { ...item, stockCode: "NEW" }; h.render(); }, h => { h.props.contextKey = "org-2:material-1"; h.render(); }, h => { h.props.contextKey = "other"; h.render(); h.props.contextKey = "org-1:material-1"; h.render(); }, h => { h.props.enabled = false; h.render(); }, h => h.allowed(false), h => h.unmount()]) {
    const h = harness({ share: async () => {} }), clicks = ["Copy code", "Copy link", "Share"].map(label => h.button(label).props.onClick);
    change(h); for (const click of clicks) await click(); assert.equal(h.copies.length, 0); assert.equal(h.shares.length, 0);
  }
});

test("invalid links, blank codes and not-ready records cannot be copied", async () => {
  const h = harness(); h.props.material = { ...item, stockCode: " ", supplierUrl: "javascript:alert(1)" };
  assert.equal(h.button("Copy code").props.disabled, true); assert.equal(h.button("Copy link").props.disabled, true);
  await h.button("Copy code").props.onClick(); await h.button("Copy link").props.onClick(); assert.equal(h.copies.length, 0);
  h.props.enabled = false; assert.equal(h.button("Share").props.disabled, true); await h.button("Share").props.onClick(); assert.equal(h.copies.length, 0);
});

test("a supplied readiness guard must affirm true and errors fail closed", async () => {
  for (const guard of [() => undefined, () => null, () => { throw new Error("Not ready"); }]) {
    const h = harness(); h.props.canUse = guard;
    await h.button("Copy code").props.onClick(); assert.equal(h.copies.length, 0);
  }
});

test("native-share double taps are blocked and stale rejected share cannot expose old fallback", async () => {
  let fail;
  const h = harness({ share: () => new Promise((resolve, reject) => { fail = reject; }) });
  const click = h.button("Share").props.onClick, pending = click(); await click(); assert.equal(h.shares.length, 1);
  h.props.contextKey = "org-2:material-2"; h.props.material = { ...item, name: "Other item", stockCode: "OTHER" }; h.render();
  fail(Object.assign(new Error("Denied"), { name: "NotAllowedError" })); await pending;
  assert.equal(h.copies.length, 0); assert.ok(!nodes(h.render()).some(node => node.type === "textarea")); assert.doesNotMatch(text(h.render()), /unavailable|123AB|completed/i);
});

test("unsupported native share copies the safe product text once when clipboard works", async () => {
  const h = harness(); await h.button("Share").props.onClick();
  assert.deepEqual(h.copies, [`Twin socket\nSupplier: Screwfix\nCode: 123AB\n${item.supplierUrl}`]);
  assert.match(text(h.render()), /details copied/); assert.doesNotMatch(text(h.render()), /sent|delivered/i);
});
