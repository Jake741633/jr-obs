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

function harness({ stocks = [stockItem()], materials = [material()], lists = [], jobs = [job()], locations = [{ id: "van", name: "Van" }, { id: "store", name: "Store" }], ready = true, mode = "local", role = "owner", failAt = [], allowStockWrites = false } = {}) {
  const state = [], attempts = [], effects = []; let cursor = 0, ids = 0, optimisticWrites = 0, movements = [];
  const store = (items = []) => ({ items, isReady: ready, setItems() { optimisticWrites++; throw new Error("Read-only review must not use optimistic writes"); } });
  const deps = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useMemo: (fn) => fn(), useLayoutEffect: (fn) => effects.push(fn), useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; }, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; } },
    "next/link": { default: "Link" }, "lucide-react": {}, "../../../components/ui/Button": { Button: "Button" }, "../../../components/ui/Card": { Card: "Card" }, "../../../components/ui/PageHeader": { PageHeader: "PageHeader" }, "../../../components/ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" },
    "../../../lib/cloud/coreBusinessCollections": { useJobsCollection: () => store(jobs), useMaterialsCollection: () => store(materials), useStockItemsCollection: () => ({ ...store(stocks), setItems(next) { optimisticWrites++; if (!allowStockWrites) throw new Error("Code lookup must not change stock"); stocks = typeof next === "function" ? next(stocks) : next; } }), useStockLocationsCollection: () => store(locations), useStockMovementsCollection: () => ({ ...store(), setItems(next) { optimisticWrites++; if (!allowStockWrites) throw new Error("Code lookup must not write movements"); movements = typeof next === "function" ? next(movements) : next; } }), useJobMaterialUsageCollection: () => store(), usePurchaseListsCollection: () => ({ ...store(lists), createItem(item) { if (!ready) throw new Error("Purchase records are loading"); if (lists.some((list) => list.id === item.id)) throw new Error("Duplicate purchase identity"); attempts.push(item); if (failAt.includes(attempts.length)) throw new Error("Purchase storage failed"); lists = [item, ...lists]; return item; } }) },
    "../../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ mode, identity: { role }, isReady: ready }) }, "../../../lib/jobMaterialsToday-core.mjs": usage, "../../../lib/mobileStock": mobileStock, "../../../lib/storage": { makeId: (prefix) => `${prefix}-${++ids}` }, "../../../lib/purchaseListLink": links,
  };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/field/materials/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module: mod, exports: mod.exports, Intl, Date, Error, require(name) { assert.ok(name in deps, name); return deps[name]; } });
  const render = () => { cursor = 0; const view = mod.exports.default(); effects.splice(0).forEach((fn) => fn()); return view; };
  const button = (name) => nodes(render()).find((node) => node.type === "Button" && text(node) === name);
  return { render, attempts, lists: () => lists, button, stocks: () => stocks, movements: () => movements, writes: () => optimisticWrites,
    review() { const action = button("Review request") || button("Review current stock"); assert.ok(action); action.props.onClick(); },
    saveHandler() { const action = button("Save request") || button("Retry request save"); assert.ok(action); return action.props.onClick; }, save() { this.saveHandler()(); },
    discard() { button("Discard request").props.onClick(); },
    chooseJob(value) { const label = nodes(render()).find((node) => node.type === "label" && text(node).startsWith("Linked job")); nodes(label).find((node) => node.type === "select").props.onChange({ target: { value } }); },
    source(patch) { if ("stocks" in patch) stocks = patch.stocks; if ("materials" in patch) materials = patch.materials; if ("lists" in patch) lists = patch.lists; if ("jobs" in patch) jobs = patch.jobs; if ("locations" in patch) locations = patch.locations; if ("ready" in patch) ready = patch.ready; if ("mode" in patch) mode = patch.mode; if ("role" in patch) role = patch.role; render(); },
    reviewTree() { return nodes(render()).find((node) => node.props["aria-label"] === "Unsaved replenishment request"); },
    code(value) { nodes(render()).find((node) => node.type === "InputField" && node.props.label === "Scan code").props.onChange({ target: { value } }); },
    find() { button("Find item").props.onClick(); },
    enterCode() { nodes(render()).find((node) => node.type === "InputField" && node.props.label === "Scan code").props.onKeyDown({ key: "Enter", preventDefault() {} }); },
    scanTree() { return nodes(render()).find((node) => node.props["aria-label"] === "Stock code matches"); },
    choiceHandler(index = 0) { const action = nodes(this.scanTree()).filter((node) => node.type === "Button" && text(node) === "Use stock item")[index]; assert.ok(action); return action.props.onClick; },
    chooseScan(index = 0) { this.choiceHandler(index)(); },
    selectedStock() { const label = nodes(render()).find((node) => node.type === "label" && text(node).startsWith("Stock item")); return nodes(label).find((node) => node.type === "select")?.props.value; },
    quantity(value) { nodes(render()).find((node) => node.type === "InputField" && node.props.label === "Quantity used").props.onChange({ target: { value } }); },
    useHandler() { return nodes(render()).find((node) => node.type === "form").props.onSubmit; },
    moreScan() { nodes(this.scanTree()).find((node) => node.type === "Button" && text(node).startsWith("Show more stock matches")).props.onClick(); },
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

test("stock code lookup keeps all exact saved matches across locations without mutating or guessing partial codes", () => {
  const stocks = [stockItem(), stockItem({ id: "s2", locationId: "store" })], materials = [material({ stockCode: "CAT-1" })], before = JSON.stringify({ stocks, materials });
  for (const code of [" c1 ", "CAT-1", "M1"]) assert.deepEqual(mobileStock.stockScanMatches(stocks, materials, code).map((item) => item.id), ["s1", "s2"]);
  assert.deepEqual(mobileStock.stockScanMatches(stocks, materials, "s2").map((item) => item.id), ["s2"]); for (const code of ["", " ", "C", "c1 extra"]) assert.equal(mobileStock.stockScanMatches(stocks, materials, code).length, 0); assert.equal(JSON.stringify({ stocks, materials }), before);
});

test("ambiguous catalogue identities cannot supply guessed code aliases while stock-owned codes stay reviewable", () => {
  const stocks = [stockItem()], materials = [material({ stockCode: "ALIAS-A" }), material({ stockCode: "ALIAS-B" })];
  for (const code of ["m1", "ALIAS-A", "ALIAS-B"]) assert.equal(mobileStock.stockScanMatches(stocks, materials, code).length, 0); assert.equal(mobileStock.stockScanMatches(stocks, materials, "C1").length, 1);
  assert.equal(mobileStock.stockItemIdentityIndex([stockItem(), stockItem()]).get("s1"), undefined); assert.equal(mobileStock.stockItemIdentityIndex([stockItem({ id: " " })]).size, 0);
});

test("stock usage refuses ambiguous identities nonfinite quantities and unsupported units before changing any records", () => {
  const use = (stocks, quantity) => mobileStock.applyStockUsage({ stockItems: stocks, usage: { stockItemId: "s1", quantity }, movementId: "move", now: "2026-10-10" });
  for (const quantity of [undefined, NaN, Infinity, 0, -1]) assert.equal(use([stockItem()], quantity), null);
  for (const patch of [{ quantity: NaN }, { quantity: Infinity }, { quantity: -1 }, { unit: "Bag" }, { id: "" }]) assert.equal(use([stockItem(patch)], 1), null);
  const duplicates = [stockItem(), stockItem()], before = structuredClone(duplicates); assert.equal(use(duplicates, 1), null); assert.deepEqual(duplicates, before);
  const valid = [stockItem({ quantity: 1.5 })], result = use(valid, 2); assert.equal(result.updatedItem.quantity, 0); assert.equal(result.shortage, 0.5); assert.equal(result.movement.quantity, 2); assert.equal(valid[0].quantity, 1.5);
});

test("one unique phone code match opens its saved quantity and identity without a stock write or keyboard form submission", () => {
  const id = " s /?# ", h = harness({ stocks: [stockItem({ id })] }); h.code("c1"); h.enterCode(); assert.equal(h.selectedStock(), id); assert.match(text(h.scanTree()), /1 stock record.*Van.*1 Metre.*Record:  s \/\?# .*Selected stock record/); assert.match(text(h.render()), /lookup has not changed stock/); assert.equal(h.writes(), 0); assert.equal(h.attempts.length, 0); assert.match(h.button("Find item").props.className, /min-h-12/);
});

test("several phone matches require an exact stock-line choice with location and saved quantity visible", () => {
  const h = harness({ stocks: [stockItem(), stockItem({ id: "s2", locationId: "store", quantity: 7 })] }); h.code("C1"); h.find(); assert.equal(h.selectedStock(), ""); assert.match(text(h.scanTree()), /Van.*1 Metre.*Store.*7 Metre/); const choices = nodes(h.scanTree()).filter((node) => node.type === "Button"); assert.equal(choices.length, 2); for (const action of choices) assert.match(action.props.className, /min-h-12/); h.chooseScan(1); assert.equal(h.selectedStock(), "s2"); assert.match(text(h.scanTree()), /Selected stock record/); assert.equal(h.writes(), 0);
});

test("missing or duplicate stock identities cannot be selected even when only one copy matches the code", () => {
  for (const stocks of [[stockItem(), stockItem({ stockCode: "OTHER", materialId: undefined })], [stockItem({ id: "", quantity: NaN })]]) {
    const h = harness({ stocks }); h.code("C1"); h.find(); assert.equal(h.selectedStock(), ""); assert.equal(nodes(h.scanTree()).filter((node) => node.type === "Button").length, 0); assert.match(text(h.scanTree()), /identity is missing or ambiguous/); assert.equal(h.writes(), 0); if (!stocks[0].id) assert.match(text(h.scanTree()), /Quantity needs review/);
  }
});

test("blank or unmatched lookups clear the previous stock choice and cannot reuse an older deduction callback", () => {
  const h = harness(); h.code("C1"); h.find(); const old = h.useHandler(); h.code("missing"); old({ preventDefault() {} }); h.find(); assert.equal(h.selectedStock(), ""); assert.match(text(h.scanTree()), /No matching stock records/); assert.match(text(h.render()), /No stock item matched/); h.code(" "); h.find(); assert.equal(h.scanTree(), undefined); assert.match(text(h.render()), /Enter a supplier stock code/); assert.equal(h.writes(), 0);
});

test("older choice callbacks cannot select changed removed duplicated or no-longer-matching stock records", () => {
  for (const patch of [{ stocks: [stockItem({ quantity: 2 }), stockItem({ id: "s2" })] }, { stocks: [stockItem({ id: "s2" })] }, { stocks: [stockItem(), stockItem(), stockItem({ id: "s2" })] }, { materials: [material({ stockCode: "CHANGED" })] }]) {
    const h = harness({ stocks: [stockItem(), stockItem({ id: "s2" })], materials: [material({ stockCode: "CATALOGUE" })] }); h.code("CATALOGUE"); h.find(); const old = h.choiceHandler(); h.source(patch); old(); assert.equal(h.selectedStock(), ""); assert.match(text(h.render()), /result has changed|identity is unavailable\/ambiguous/); assert.equal(h.writes(), 0);
  }
});

test("editing or re-running the same lookup invalidates old result callbacks without discarding other usage fields", () => {
  const h = harness({ stocks: [stockItem(), stockItem({ id: "s2" })] }); h.chooseJob("j1"); h.quantity("2.5"); h.code("C1"); h.find(); const old = h.choiceHandler(); h.code("OTHER"); old(); assert.equal(h.selectedStock(), ""); h.code("C1"); old(); assert.equal(h.selectedStock(), ""); h.find(); old(); assert.equal(h.selectedStock(), ""); h.chooseScan(1); assert.equal(h.selectedStock(), "s2"); assert.equal(nodes(h.render()).find((node) => node.type === "InputField" && node.props.label === "Quantity used").props.value, "2.5"); assert.equal(nodes(nodes(h.render()).find((node) => node.type === "label" && text(node).startsWith("Linked job"))).find((node) => node.type === "select").props.value, "j1"); assert.equal(h.writes(), 0);
});

test("a selected scan result stays on its identity and blocks deduction after source changes or name reuse", () => {
  for (const stocks of [[stockItem({ quantity: 2 })], [stockItem({ id: "replacement" })], [stockItem(), stockItem({ description: "Conflicting same ID" })]]) {
    const h = harness(); h.code("C1"); h.find(); const use = h.useHandler(); h.source({ stocks }); assert.match(text(h.render()), /selected scan result has changed or is unavailable/); use({ preventDefault() {} }); assert.equal(h.writes(), 0); assert.equal(h.button("Deduct stock").props.disabled, true);
    h.source({ stocks: [stockItem()] }); assert.match(text(h.scanTree()), /Selected stock record/); assert.equal(h.selectedStock(), "s1");
  }
});

test("phone lookup reveals four records at a time and remains read-only in cloud field sessions", () => {
  const stocks = Array.from({ length: 9 }, (_, i) => stockItem({ id: `s${i}` })), h = harness({ stocks, mode: "cloud", role: "electrician", locations: [{ id: "van", name: "First label" }, { id: "van", name: "Wrong label" }] }); h.code("C1"); h.find(); assert.equal(nodes(h.scanTree()).filter((node) => node.type === "Button" && text(node) === "Use stock item").length, 4); assert.match(text(h.scanTree()), /Location unavailable/); assert.doesNotMatch(text(h.scanTree()), /First label|Wrong label|£/); h.moreScan(); assert.equal(nodes(h.scanTree()).filter((node) => node.type === "Button" && text(node) === "Use stock item").length, 8); h.moreScan(); assert.equal(nodes(h.scanTree()).filter((node) => node.type === "Button" && text(node) === "Use stock item").length, 9); h.find(); assert.equal(nodes(h.scanTree()).filter((node) => node.type === "Button" && text(node) === "Use stock item").length, 4); h.chooseScan(); assert.equal(h.button("Deduct stock"), undefined); assert.equal(h.button("Review request"), undefined); assert.equal(h.writes(), 0); assert.equal(h.attempts.length, 0);
});

test("completed stock use cannot replay an old form callback and current readiness still blocks deductions", () => {
  const h = harness({ stocks: [stockItem({ quantity: 5 })], allowStockWrites: true }); h.code("C1"); h.find(); h.quantity("2"); const use = h.useHandler(); use({ preventDefault() {} }); use({ preventDefault() {} }); assert.equal(h.stocks()[0].quantity, 3); assert.equal(h.movements().length, 1); assert.equal(h.movements()[0].quantity, 2); assert.equal(h.writes(), 2); assert.equal(h.selectedStock(), "");
  for (const patch of [{ ready: false }, { mode: "cloud", role: "electrician" }, { mode: "migration", role: "electrician" }]) { const blocked = harness(); blocked.code("C1"); blocked.find(); const old = blocked.useHandler(); blocked.source(patch); old({ preventDefault() {} }); assert.equal(blocked.writes(), 0); }
  for (const jobs of [[], [job(), job({ title: "Conflicting job" })]]) { const blocked = harness(); blocked.chooseJob("j1"); blocked.code("C1"); blocked.find(); const old = blocked.useHandler(); blocked.source({ jobs }); old({ preventDefault() {} }); assert.equal(blocked.writes(), 0); assert.match(text(blocked.render()), /linked job is unavailable or ambiguous/); }
});
