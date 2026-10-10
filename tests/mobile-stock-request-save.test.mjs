import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as mobileStock from "../lib/mobileStock.ts";
import * as usage from "../lib/jobMaterialsToday-core.mjs";
import * as links from "../lib/purchaseListLink.ts";

const stockItem = (patch = {}) => ({ id: "s1", materialId: "m1", description: "Cable reel", locationId: "van", quantity: 1, minimumQuantity: 3, unitCost: 12, unit: "Metre", stockCode: "C1", supplier: "CEF", notes: "", createdAt: "2026-01-01", updatedAt: "2026-01-01", ...patch });
const material = (patch = {}) => ({ id: "m1", name: "Cable reel", unit: "Metre", supplier: "CEF", stockCode: "C1", supplierUrl: "https://supplier.example/cable", tradeCost: 10, ...patch });
const job = (patch = {}) => ({ id: "j1", title: "Workshop", address: "Epsom", status: "First fix", ...patch });
const build = (patch = {}) => mobileStock.buildLowStockPurchaseList({ stockItems: [stockItem()], materials: [material()], existingLists: [], purchaseListId: "p1", number: "PR-0001", now: "2026-10-10T21:00:00.000Z", ...patch });
const jsx = (type, props) => ({ type, props });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);

function harness({ stocks = [stockItem()], materials = [material()], lists = [], jobs = [job()], ready = true, mode = "local", role = "owner", failAt = [] } = {}) {
  const state = [], attempts = [], effects = []; let cursor = 0, ids = 0;
  const store = (items = []) => ({ items, isReady: ready, setItems() { throw new Error("Request review must not use optimistic writes"); } });
  const deps = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useMemo: (fn) => fn(), useLayoutEffect: (fn) => effects.push(fn), useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; }, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; } },
    "next/link": { default: "Link" }, "lucide-react": {}, "../../../components/ui/Button": { Button: "Button" }, "../../../components/ui/Card": { Card: "Card" }, "../../../components/ui/PageHeader": { PageHeader: "PageHeader" }, "../../../components/ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" },
    "../../../lib/cloud/coreBusinessCollections": { useJobsCollection: () => store(jobs), useMaterialsCollection: () => store(materials), useStockItemsCollection: () => store(stocks), useStockLocationsCollection: () => store([{ id: "van", name: "Van" }]), useStockMovementsCollection: () => store(), useJobMaterialUsageCollection: () => store(), usePurchaseListsCollection: () => ({ ...store(lists), createItem(item) { if (!ready) throw new Error("Purchase records are loading"); if (lists.some((list) => list.id === item.id)) throw new Error("Duplicate purchase identity"); attempts.push(item); if (failAt.includes(attempts.length)) throw new Error("Purchase storage failed"); lists = [item, ...lists]; return item; } }) },
    "../../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ mode, identity: { role }, isReady: ready }) }, "../../../lib/jobMaterialsToday-core.mjs": usage, "../../../lib/mobileStock": mobileStock, "../../../lib/storage": { makeId: (prefix) => `${prefix}-${++ids}` }, "../../../lib/purchaseListLink": links,
  };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/field/materials/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module: mod, exports: mod.exports, Intl, Date, Error, require(name) { assert.ok(name in deps, name); return deps[name]; } });
  const render = () => { cursor = 0; const view = mod.exports.default(); effects.splice(0).forEach((fn) => fn()); return view; };
  const button = (name) => nodes(render()).find((node) => node.type === "Button" && text(node) === name);
  return { render, attempts, lists: () => lists, button,
    review() { const action = button("Review request") || button("Review current stock"); assert.ok(action); action.props.onClick(); },
    saveHandler() { const action = button("Save request") || button("Retry request save"); assert.ok(action); return action.props.onClick; }, save() { this.saveHandler()(); },
    discard() { button("Discard request").props.onClick(); },
    chooseJob(value) { const label = nodes(render()).find((node) => node.type === "label" && text(node).startsWith("Linked job")); nodes(label).find((node) => node.type === "select").props.onChange({ target: { value } }); },
    source(patch) { if ("stocks" in patch) stocks = patch.stocks; if ("materials" in patch) materials = patch.materials; if ("lists" in patch) lists = patch.lists; if ("jobs" in patch) jobs = patch.jobs; if ("ready" in patch) ready = patch.ready; if ("mode" in patch) mode = patch.mode; if ("role" in patch) role = patch.role; render(); },
    reviewTree() { return nodes(render()).find((node) => node.props["aria-label"] === "Unsaved replenishment request"); },
  };
}

test("low-stock requests use finite source quantities and costs with stable child identities without changing stock", () => {
  const stocks = [stockItem(), stockItem({ id: "s2", materialId: undefined, minimumQuantity: 0, quantity: 0, unitCost: 0 })], before = structuredClone(stocks);
  const list = build({ stockItems: stocks }); assert.deepEqual(stocks, before);
  assert.equal(list.items[0].quantity, 5); assert.equal(list.items[0].unitCost, 10); assert.equal(list.items[0].id, "p1-s1"); assert.equal(list.items[1].quantity, 1); assert.equal(list.items[1].unitCost, 0);
  assert.deepEqual(build({ stockItems: stocks }).items, list.items); assert.equal(build({ stockItems: [stockItem({ quantity: 4 })] }), null);
});

test("existing undelivered material and generated stock requests are excluded including unlinked stock", () => {
  for (const status of ["Needed", "Ordered", "Historical unknown"]) {
    assert.equal(build({ existingLists: [{ id: "old", items: [{ id: "other", materialId: "m1", status }] }] }), null);
    assert.equal(build({ stockItems: [stockItem({ materialId: undefined })], existingLists: [{ id: "old-with-dashes", items: [{ id: "old-with-dashes-s1", status }] }] }), null);
  }
  assert.equal(build({ stockItems: [stockItem({ materialId: undefined })], existingLists: [{ id: "old", items: [{ id: "old-s1", status: "Delivered" }] }] }).items.length, 1);
});

test("invalid quantities minimums costs identities descriptions and material links cannot create a replenishment list", () => {
  for (const quantity of [NaN, Infinity, -1]) assert.throws(() => build({ stockItems: [stockItem({ quantity })] }), /Review stock quantities/);
  for (const minimumQuantity of [NaN, Infinity, -1]) assert.throws(() => build({ stockItems: [stockItem({ minimumQuantity })] }), /Review stock quantities/);
  for (const tradeCost of [undefined, NaN, Infinity, -1]) assert.throws(() => build({ materials: [material({ tradeCost })] }), /unit costs/);
  assert.throws(() => build({ stockItems: [stockItem({ minimumQuantity: Number.MAX_VALUE })] }), /quantities and unit costs/);
  assert.throws(() => build({ materials: [material({ tradeCost: Number.MAX_VALUE })] }), /quantities and unit costs/);
  for (const patch of [{ id: " " }, { id: undefined }, { description: " " }, { unit: "" }, { unit: "Bag" }]) assert.throws(() => build({ stockItems: [stockItem(patch)] }), /identities, descriptions and units/);
  assert.throws(() => build({ materials: [material({ unit: "Pack" })] }), /units differ/);
  assert.throws(() => build({ stockItems: [stockItem({ id: "s1", materialId: undefined, quantity: 0, minimumQuantity: 0, unitCost: Number.MAX_VALUE }), stockItem({ id: "s2", materialId: undefined, quantity: 0, minimumQuantity: 0, unitCost: Number.MAX_VALUE })] }), /quantities and unit costs/);
  assert.throws(() => build({ stockItems: [stockItem(), stockItem()] }), /identities/);
  for (const materials of [[], [material(), material()]]) assert.throws(() => build({ materials }), /unavailable or ambiguous/);
});

test("phone request review is read-only and shows the exact linked job supplier and proposed quantities", () => {
  const h = harness(); h.chooseJob("j1"); h.review();
  assert.equal(h.attempts.length, 0); assert.equal(h.lists().length, 0); assert.match(text(h.reviewTree()), /PR-0001.*Unsaved request.*Workshop.*Cable reel.*CEF.*C1.*5 metre requested.*£10\.00.*Needed/);
  for (const name of ["Save request", "Review current stock", "Discard request"]) assert.match(h.button(name).props.className, /min-h-12/);
  assert.match(text(h.reviewTree()), /Leaving this page loses/); assert.equal(nodes(h.render()).find((node) => node.props.role === "status") !== undefined, true);
});

test("failed request saves retain the review and stable identities then confirm one device save on retry", () => {
  const h = harness({ failAt: [1, 2] }); h.chooseJob("j1"); h.review(); const firstCallback = h.saveHandler(); firstCallback(); h.save();
  assert.equal(h.lists().length, 0); assert.match(text(h.render()), /save could not be confirmed.*Leaving this page loses/); assert.ok(h.reviewTree());
  assert.equal(h.attempts[0], h.attempts[1]); const retryCallback = h.saveHandler(); retryCallback(); retryCallback(); firstCallback();
  assert.equal(h.attempts.length, 3); assert.equal(h.lists().length, 1); assert.equal(h.attempts[2], h.attempts[0]); assert.equal(h.reviewTree(), undefined);
  assert.match(text(h.render()), /saved on this device.*Check sync status.*No supplier order has been placed/);
  assert.equal(nodes(h.render()).find((node) => node.type === "Link" && text(node) === "Review saved request").props.href, "/purchases?list=purchase-1");
});

test("changed stock materials or open requests block an older review before a write", () => {
  for (const patch of [
    { stocks: [stockItem({ quantity: 2 })] },
    { stocks: [stockItem({ locationId: "store" })] },
    { stocks: [stockItem(), stockItem({ id: "s2", materialId: undefined })] },
    { materials: [material({ supplier: "New supplier" })] },
    { lists: [{ id: "other", number: "PO-1", items: [{ id: "line", materialId: "m1", status: "Ordered" }] }] },
  ]) {
    const h = harness(); h.review(); const callback = h.saveHandler(); h.source(patch); callback();
    assert.equal(h.attempts.length, 0); assert.ok(h.reviewTree()); assert.match(text(h.render()), /Review current stock before saving/);
  }
});

test("reviewing refreshed stock preserves request identities and invalidates callbacks from the older review", () => {
  const h = harness({ failAt: [1] }); h.review(); h.save(); const original = h.attempts[0], old = h.saveHandler();
  h.source({ stocks: [stockItem({ quantity: 2 })], materials: [material({ tradeCost: 11 })] }); h.review(); old(); assert.equal(h.attempts.length, 1);
  assert.match(text(h.reviewTree()), /4 metre requested.*£11\.00/); h.save();
  assert.equal(h.attempts[1].id, original.id); assert.equal(h.attempts[1].createdAt, original.createdAt); assert.equal(h.attempts[1].items[0].id, original.items[0].id); assert.equal(h.attempts[1].items[0].quantity, 4); assert.equal(h.attempts[1].items[0].unitCost, 11);
});

test("missing ambiguous or changed linked jobs cannot be silently replaced during a request save", () => {
  for (const jobs of [[], [job({ id: "new" })], [job(), job({ title: "Other job" })], [job({ title: "Changed workshop" })]]) {
    const h = harness(); h.chooseJob("j1"); h.review(); const callback = h.saveHandler(); h.source({ jobs }); callback(); assert.equal(h.attempts.length, 0); assert.match(text(h.render()), /linked job has changed or is unavailable/);
  }
  const h = harness({ jobs: [job(), job({ id: "j2", title: "Other site" })] }); h.chooseJob("j1"); h.review(); h.chooseJob("j2"); h.save(); assert.equal(h.lists()[0].jobId, "j1");
});

test("a request number collision requires a fresh review while preserving record identities", () => {
  const h = harness({ failAt: [1] }); h.review(); h.save(); const original = h.attempts[0];
  h.source({ lists: [{ id: "other", number: "PR-0001", items: [] }, { id: "next", number: "PR-0003", items: [] }] }); h.save();
  assert.equal(h.attempts.length, 1); assert.match(text(h.render()), /number is now in use/); h.review(); assert.match(text(h.reviewTree()), /PR-0004/); h.save(); assert.equal(h.lists()[0].id, original.id); assert.equal(h.lists()[0].number, "PR-0004");
});

test("saved identity collisions cannot overwrite a purchase while an exact saved retry is recognised without another write", () => {
  for (const ambiguous of [false, true]) {
    const h = harness({ failAt: [1] }); h.review(); h.save(); const expected = h.attempts[0]; h.source({ lists: ambiguous ? [expected, expected] : [{ ...expected, title: "Different record" }] }); h.save(); assert.equal(h.attempts.length, 1); assert.match(text(h.render()), /different or ambiguous saved record/); assert.ok(h.reviewTree());
  }
  const h = harness({ failAt: [1] }); h.review(); h.save(); h.source({ lists: [h.attempts[0]] }); h.save(); assert.equal(h.attempts.length, 1); assert.equal(h.reviewTree(), undefined); assert.match(text(h.render()), /saved on this device/);
});

test("discarding a review never writes and invalidates its older save callback", () => {
  const h = harness(); h.review(); const old = h.saveHandler(); h.discard(); old(); assert.equal(h.attempts.length, 0); assert.equal(h.lists().length, 0); assert.equal(h.reviewTree(), undefined); assert.match(text(h.render()), /Saved purchase lists were left unchanged/);
  h.review(); old(); assert.equal(h.attempts.length, 0); h.save(); assert.equal(h.lists().length, 1);
});

test("readiness and current cloud electrician permissions protect retained callbacks while local field mode remains available", () => {
  for (const patch of [{ ready: false }, { mode: "cloud", role: "electrician" }, { mode: "migration", role: "electrician" }]) {
    const h = harness(); const review = h.button("Review request").props.onClick; h.review(); const save = h.saveHandler(); h.source(patch); review(); save(); assert.equal(h.attempts.length, 0);
  }
  for (const mode of ["cloud", "migration"]) { const h = harness({ mode, role: "electrician" }); assert.equal(h.button("Review request"), undefined); assert.equal(h.reviewTree(), undefined); assert.equal(h.attempts.length, 0); }
  const h = harness({ role: "electrician" }); h.review(); h.save(); assert.equal(h.lists().length, 1);
});

test("repeated requests cannot duplicate unlinked stock until its earlier replenishment line is delivered", () => {
  const h = harness({ stocks: [stockItem({ materialId: undefined })] }); h.review(); const oldSave = h.saveHandler(); h.save(); h.review(); oldSave(); assert.equal(h.reviewTree(), undefined); assert.equal(h.lists().length, 1); assert.equal(h.attempts.length, 1); assert.match(text(h.render()), /No new low-stock lines/);
  const saved = h.lists()[0]; h.source({ lists: [{ ...saved, items: saved.items.map((item) => ({ ...item, status: "Delivered" })) }] }); h.review(); h.save(); assert.equal(h.lists().length, 2); assert.notEqual(h.lists()[0].id, saved.id);
});

test("invalid saved sources retain an existing review and cannot claim a saved request", () => {
  const h = harness(); h.review(); h.source({ materials: [material({ tradeCost: NaN })] }); h.save(); assert.equal(h.attempts.length, 0); assert.ok(h.reviewTree()); assert.match(text(h.render()), /save could not be confirmed.*unit costs/); h.review(); assert.ok(h.reviewTree()); assert.match(text(h.render()), /review could not be prepared/);
});
