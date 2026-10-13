import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { nodes, text } from "./helpers/customer-page-harness.mjs";
import * as sharing from "../lib/materialSharing.ts";
import * as identities from "../lib/assistantIdentity.ts";
import * as ownership from "../lib/supabase/sessionOwnership-core.mjs";

const source = ts.transpileModule(readFileSync(new URL("../app/materials/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const item = { id: "mat-1", name: "Twin socket", category: "Accessories", manufacturer: "Example", supplier: "Screwfix", stockCode: "123AB", supplierUrl: "https://example.com/socket/123ab", unit: "Each", tradeCost: 7, sellPrice: 12, favourite: false, notes: "Private customer details", createdAt: "2026-10-01T09:00:00Z", updatedAt: "2026-10-01T09:00:00Z" };

function harness() {
  let cursor = 0, epoch = 1, sequence = 0, identityCalls = 0, collectionCalls = 0;
  let session = { access_token: "token", user: { id: "user-1" } };
  const slots = [], effects = [], writes = [], network = [];
  const identityState = { mode: "cloud", isReady: true, identity: { organisationId: "org-1", userId: "user-1", role: "owner" } };
  const data = { items: [{ ...item }], isReady: true };
  const useState = initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; };
  const changed = (old, deps) => !old || !deps || deps.some((value, index) => !Object.is(value, old.deps?.[index]));
  const dependencies = {
    react: { useState, useRef: value => useState({ current: value })[0], useMemo(fn, deps) { const i = cursor++; if (changed(slots[i], deps)) slots[i] = { value: fn(), deps }; return slots[i].value; }, useLayoutEffect(fn, deps) { const i = cursor++, old = slots[i]; if (changed(old, deps)) { const next = { deps, cleanup: old?.cleanup }; slots[i] = next; effects.push(() => { next.cleanup?.(); next.cleanup = fn(); }); } } },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "next/link": { default: "Link" }, "lucide-react": {},
    "../../components/ui/Button": { Button: "Button" }, "../../components/ui/Card": { Card: "Card" }, "../../components/ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" }, "../../components/ui/PageHeader": { PageHeader: "PageHeader" }, "../../components/crm/EntityEmptyState": { EntityEmptyState: "Empty" },
    "../../components/materials/MaterialShareActions": { MaterialShareActions: "MaterialShareActions" },
    "../../lib/materialSharing": sharing, "../../lib/assistantIdentity": identities, "../../lib/supabase/sessionOwnership-core.mjs": ownership,
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => { identityCalls++; return identityState; } },
    "../../lib/cloud/coreBusinessCollections": { useMaterialsCollection: () => { collectionCalls++; return { ...data, setItems(updater) { data.items = updater(data.items); writes.push(data.items); }, remove() { throw new Error("Unexpected remove"); } }; } },
    "../../lib/supabase/client": { readSupabaseSession: () => session, readSupabaseSessionOwnershipEpoch: () => epoch, captureSupabaseSessionOwnership: () => ({ session, epoch }) },
    "../../lib/storage": { makeId: prefix => `${prefix}-${++sequence}` },
  };
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, Date, Intl, Error, JSON, window: { confirm() { throw new Error("Unexpected confirmation"); } }, fetch: (...args) => { network.push(args); throw new Error("Unexpected network request"); }, require: key => { assert.ok(key in dependencies, key); return dependencies[key]; } });
  function render() { cursor = 0; const tree = mod.exports.default(); effects.splice(0).forEach(fn => fn()); return tree; }
  function share() { const component = nodes(render()).find(node => node.type === "MaterialShareActions"); assert.ok(component, "Material product sharing is visible"); return component.props; }
  function field(label) { const node = nodes(render()).find(node => node.type === "InputField" && node.props.label === label); assert.ok(node, label); return node; }
  return { data, identityState, writes, network, render, share, field, calls: () => ({ identityCalls, collectionCalls }),
    session(next, advance = true) { session = next; if (advance) epoch++; },
    epoch() { epoch++; }, unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    openForm() { nodes(render()).find(node => node.type === "PageHeader").props.action.props.onClick(); render(); },
    fill(label, value) { field(label).props.onChange({ target: { value } }); render(); },
    submit() { const form = nodes(render()).find(node => node.type === "form" && nodes(node).some(child => child.type === "InputField")); assert.ok(form); form.props.onSubmit({ preventDefault() {} }); render(); },
  };
}

test("materials sharing uses one account snapshot and only product fields for office and field roles", () => {
  for (const role of ["owner", "admin", "office", "electrician"]) {
    const h = harness(); h.identityState.identity.role = role;
    const before = h.calls(); const tree = h.render(), after = h.calls(); assert.equal(after.identityCalls - before.identityCalls, 1); assert.equal(after.collectionCalls - before.collectionCalls, 1);
    const props = nodes(tree).find(node => node.type === "MaterialShareActions")?.props; assert.ok(props, "Sharing exists outside the office-price branch");
    assert.equal(props.enabled, true); assert.equal(props.canUse(), true);
    assert.deepEqual(JSON.parse(JSON.stringify(props.material)), { name: item.name, supplier: item.supplier, stockCode: item.stockCode, supplierUrl: item.supplierUrl });
    assert.doesNotMatch(JSON.stringify(props.material), /tradeCost|sellPrice|notes|Private/);
    if (role === "electrician") assert.doesNotMatch(text(tree), /Trade cost|Selling price|Markup|Quick update|Recent price history/);
    assert.equal(h.writes.length, 0); assert.equal(h.network.length, 0);
  }
});

test("retained material sharing guards reject account, session, source, readiness and unmount changes", () => {
  const changes = [
    h => { h.identityState.identity = { ...h.identityState.identity, organisationId: "org-2" }; h.render(); },
    h => { h.identityState.identity = { ...h.identityState.identity, userId: "user-2" }; h.render(); },
    h => { h.identityState.identity = { ...h.identityState.identity, role: "customer" }; h.render(); },
    h => { h.identityState.isReady = false; h.render(); },
    h => { h.data.isReady = false; h.render(); },
    h => { h.data.items = []; h.render(); },
    h => { h.data.items = [{ ...item, createdAt: "2026-10-02T09:00:00Z" }]; h.render(); },
    ...["name", "supplier", "stockCode", "supplierUrl"].map(key => h => { h.data.items = [{ ...item, [key]: "Changed" }]; h.render(); }),
    h => { h.data.items.push({ ...item, name: "Hidden duplicate" }); h.render(); },
    h => h.session(null),
    h => h.session({ access_token: "token", user: { id: "user-1" }, is_password_recovery: true }, false),
    h => h.session({ access_token: "replacement", user: { id: "user-1" } }, false),
    h => h.session({ access_token: "token", user: { id: "user-2" } }, false),
    h => h.epoch(), h => h.unmount(),
  ];
  for (const change of changes) { const h = harness(), canUse = h.share().canUse; assert.equal(canUse(), true); change(h); assert.equal(canUse(), false); assert.equal(h.writes.length, 0); assert.equal(h.network.length, 0); }
});

test("source readiness and account round trips cannot revive retained sharing guards", () => {
  for (const change of [h => { h.identityState.identity.organisationId = "other"; h.render(); h.identityState.identity.organisationId = "org-1"; h.render(); }, h => { h.data.isReady = false; h.render(); h.data.isReady = true; h.render(); }, h => { h.data.items = [{ ...item, stockCode: "OTHER" }]; h.render(); h.data.items = [{ ...item }]; h.render(); }]) {
    const h = harness(), canUse = h.share().canUse; change(h); assert.equal(canUse(), false); assert.equal(h.share().canUse(), true);
  }
});

test("sharing denies unknown/cloud customer accounts, missing or mismatched sessions, and ambiguous IDs", () => {
  for (const setup of [h => { h.identityState.identity.role = "customer"; }, h => { h.identityState.identity.role = "unknown"; }, h => { h.identityState.identity = null; }, h => h.session(null), h => h.session({ access_token: "token", user: { id: "user-2" } }), h => { h.data.items[0].id = " "; }, h => { h.data.items.push({ ...item, name: "Unrelated hidden duplicate" }); }]) {
    const h = harness(); setup(h); const props = h.share(); assert.equal(props.enabled, false); assert.equal(props.canUse(), false);
  }
  const local = harness(); local.identityState.mode = "local"; local.identityState.identity = null; local.session(null); assert.equal(local.share().enabled, true); assert.equal(local.share().canUse(), true);
});

test("sharing context changes with every account field, ownership epoch and material identity", () => {
  for (const change of [h => { h.identityState.identity.customerSourceId = "customer-source"; }, h => h.epoch(), h => { h.data.items = [{ ...item, id: "mat-2" }]; }]) {
    const h = harness(), key = h.share().contextKey; assert.equal(typeof key, "string"); change(h); assert.notEqual(h.share().contextKey, key);
  }
});

test("material supplier anchors never expose unsafe raw URLs for office or electrician roles", () => {
  for (const role of ["owner", "electrician"]) for (const url of ["javascript:alert(1)", "https://user:pass@example.com/p", "https://example.com\n/p", "https:///example.com/p"]) {
    const h = harness(); h.identityState.identity.role = role; h.data.items[0].supplierUrl = url;
    assert.ok(!nodes(h.render()).some(node => node.type === "a" && node.props.href === url), url);
  }
  const h = harness(); h.data.items[0].supplierUrl = " https://example.com/p "; assert.ok(nodes(h.render()).some(node => node.type === "a" && node.props.href === "https://example.com/p"));
});

test("material stock code and product link support native paste without clipboard access", () => {
  const h = harness(); h.openForm();
  for (const label of ["Stock code", "Supplier link"]) { const props = h.field(label).props; assert.ok(props.maxLength > 0); assert.equal(props.autoCapitalize, "none"); assert.equal(props.spellCheck, false); assert.match(props.placeholder, /paste/i); }
  const lookup = nodes(h.render()).find(node => node.type === "input" && node.props["aria-label"] === "Supplier stock code lookup"); assert.ok(lookup); assert.equal(lookup.props.maxLength, 128); assert.equal(lookup.props.autoCapitalize, "none");
  assert.equal(h.writes.length, 0); assert.equal(h.network.length, 0);
});

test("invalid pasted product URLs block saving while safe links save sanitized and prices remain unchanged", () => {
  for (const url of ["javascript:alert(1)", "https://user:pass@example.com/p", "https://example.com\n/p", "https:///example.com/p"]) {
    const h = harness(); h.openForm(); h.fill("Material name", "New item"); h.fill("Supplier link", url); h.submit(); assert.equal(h.writes.length, 0); assert.match(text(h.render()), /valid.*http|http.*valid/i);
  }
  const h = harness(); h.openForm(); h.fill("Material name", "New item"); h.fill("Supplier link", " https://example.com/p "); h.fill("Stock code", " CODE "); h.fill("Trade cost (£)", "4"); h.fill("Selling price (£)", "8"); h.submit();
  assert.equal(h.writes.length, 1); assert.equal(h.data.items[0].supplierUrl, "https://example.com/p"); assert.equal(h.data.items[0].stockCode, "CODE"); assert.equal(h.data.items[0].tradeCost, 4); assert.equal(h.data.items[0].sellPrice, 8);
});

test("starter catalogue navigation is explicit and browsing does not import material records", () => {
  const h = harness(); const link = nodes(h.render()).find(node => node.type === "Link" && node.props.href === "/starter-library"); assert.ok(link); assert.match(text(link), /starter materials/i); assert.equal(h.writes.length, 0); assert.equal(h.network.length, 0);
});
