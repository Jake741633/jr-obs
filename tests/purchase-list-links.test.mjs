import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as links from "../lib/purchaseListLink.ts";

const jsx = (type, props) => ({ type, props });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);
const list = (patch = {}) => ({ id: "p1", number: "PO-1", title: "Cable order", jobId: "j1", items: [{ id: "line1", description: "Cable reel", quantity: 2, unitCost: 10, supplier: "CEF", stockCode: "C1", status: "Needed" }], notes: "Source note", ...patch });

function harness({ search = "", lists: initial = [], ready: initialReady = true, pricing: initialPricing = [], jobs: initialJobs = [], materials = [], role = "office", failCreateAt = [] } = {}) {
  const state = [], effects = [], attempts = []; let cursor = 0, mounted = false, lists = initial, ready = initialReady, writes = 0, ids = 0, pricing = initialPricing, jobs = initialJobs;
  function createItem(item) {
    if (!ready) throw new Error("Purchase records are not ready");
    if (lists.some((list) => list.id === item.id)) throw new Error("A collection record with this id already exists");
    writes++; attempts.push(item);
    if (failCreateAt.includes(attempts.length)) throw new Error("Purchase storage failed");
    lists = [item, ...lists]; return item;
  }
  const store = (items = []) => ({ items, isReady: ready, setItems() { writes++; throw new Error("Navigation must not write records"); }, remove() { writes++; throw new Error("Navigation must not delete records"); } });
  const deps = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useMemo: (fn) => fn(), useEffect: (fn) => { if (!mounted) effects.push(fn); }, useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; }, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; } },
    "next/link": { default: "Link" }, "lucide-react": {}, "../../components/ui/Button": { Button: "Button" }, "../../components/ui/Card": { Card: "Card" }, "../../components/ui/PageHeader": { PageHeader: "PageHeader" },
    "../../lib/cloud/coreBusinessCollections": { usePurchaseListsCollection: () => ({ ...store(lists), createItem }) }, "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ identity: { role } }) },
    "../../lib/storage": { useCloudLocalCollection: (key) => store(key === "jr-os-pricing-documents" ? pricing : key === "jr-os-jobs" ? jobs : materials), makeId: (prefix) => `${prefix}-${++ids}` }, "../../lib/purchaseListLink": links,
  };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/purchases/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module: mod, exports: mod.exports, Intl, Date, Error, window: { location: { search }, requestAnimationFrame(fn) { fn(); return 1; }, cancelAnimationFrame() {} }, require(name) { assert.ok(name in deps, name); return deps[name]; } });
  const render = () => { cursor = 0; const view = mod.exports.default(); mounted = true; return view; };
  const first = render();
  const flush = () => effects.splice(0).forEach((fn) => fn());
  return { first, render, flush, writes: () => writes, lists: () => lists, attempts, replace(value) { lists = value; }, replacePricing(value) { pricing = value; }, replaceJobs(value) { jobs = value; }, setReady(value) { ready = value; },
    choose(label, value) { const control = nodes(render()).find((n) => n.type === "select" && n.props["aria-label"] === label); assert.ok(control, label); control.props.onChange({ target: { value } }); },
    createHandler() { const button = nodes(render()).find((n) => n.type === "Button" && /^(Create|Retry) purchase list$/.test(text(n))); assert.ok(button); return button.props.onClick; },
    create() { this.createHandler()(); },
    clear() { const button = nodes(render()).find((n) => n.type === "button" && text(n) === "Show all purchase lists"); assert.ok(button); button.props.onClick(); } };
}
const renderedLists = (view) => nodes(nodes(view).find((n) => n.props?.["aria-label"] === "Purchase list records")).filter((n) => n.type === "Card");

test("purchase links accept one exact encoded saved identity and reject empty duplicate or oversized ids", () => {
  for (const id of ["p /?# +&action=create", "  literal id  ", "électricité", "x".repeat(300)]) {
    const url = new URL(links.purchaseListReviewHref(id), "https://jr.example"); assert.deepEqual(Array.from(url.searchParams), [["list", id]]); assert.equal(links.purchaseListFromLink(url.search).listId, id);
  }
  assert.equal(links.purchaseListFromLink("?action=create"), null);
  for (const query of ["?list=", "?list=%20", "?list=p1&list=p1", "?list=p1&list=p2", `?list=${"x".repeat(301)}`]) assert.equal(links.purchaseListFromLink(query).listId, null);
  assert.equal(links.purchaseListReviewHref("x".repeat(301)), "/purchases");
});

test("a purchase link shows only the exact list and its totals without creating or changing records", () => {
  const id = " p /?# +&action=create "; const saved = [list({ id }), list({ id: "other", number: "PO-2", title: "Other purchase", items: [{ id: "other-item", description: "Other material", quantity: 100, unitCost: 100, status: "Ordered" }] })];
  const before = structuredClone(saved); const h = harness({ lists: saved, search: `?list=${encodeURIComponent(id)}&action=create` });
  assert.match(text(h.first), /Loading purchase lists/); assert.doesNotMatch(text(h.first), /Cable order|Other purchase/); h.flush();
  assert.equal(renderedLists(h.render()).length, 1); assert.match(text(h.render()), /Showing PO-1 · Cable order/); assert.match(text(renderedLists(h.render())), /£20\.00.*Cable reel/);
  assert.doesNotMatch(text(h.render()), /Other purchase|Other material|£10,000/); assert.equal(h.writes(), 0); assert.deepEqual(saved, before);
});

test("missing removed restored and duplicate purchase identities never substitute another same-title list", () => {
  const selected = list(); const other = list({ id: "other", number: "PO-2" }); const h = harness({ lists: [other], search: "?list=p1" }); h.flush();
  assert.match(text(h.render()), /selected purchase list is unavailable/); assert.equal(renderedLists(h.render()).length, 0);
  h.replace([selected, other]); assert.equal(renderedLists(h.render()).length, 1);
  h.replace([other]); assert.equal(renderedLists(h.render()).length, 0);
  h.replace([selected, list({ title: "Conflicting same identity" }), other]); assert.equal(renderedLists(h.render()).length, 0); assert.match(text(h.render()), /identity is ambiguous/);
  h.replace([selected, other]); assert.equal(renderedLists(h.render()).length, 1); assert.equal(h.writes(), 0);
});

test("invalid purchase links expose no list records until Show all is explicitly chosen", () => {
  for (const search of ["?list=", "?list=p1&list=other", `?list=${"x".repeat(301)}`]) {
    const h = harness({ lists: [list(), list({ id: "other" })], search }); h.flush();
    assert.match(text(h.render()), /purchase-list link is invalid/); assert.equal(renderedLists(h.render()).length, 0);
    h.clear(); assert.equal(renderedLists(h.render()).length, 2); assert.doesNotMatch(text(h.render()), /purchase-list link is invalid/); assert.equal(h.writes(), 0);
  }
});

test("readiness and initial-link resolution prevent a broader flash and later clear is retained", () => {
  const h = harness({ ready: false, lists: [list(), list({ id: "other" })], search: "?list=p1" }); h.flush();
  assert.match(text(h.render()), /Loading purchase lists/); h.setReady(true); assert.equal(renderedLists(h.render()).length, 1);
  h.clear(); h.flush(); h.setReady(false); assert.match(text(h.render()), /Loading purchase lists/);
  h.setReady(true); assert.equal(renderedLists(h.render()).length, 2); assert.equal(h.writes(), 0);
});

test("reviewing a saved purchase list shows current quantities and delivered status after refresh", () => {
  const h = harness({ lists: [list()], search: "?list=p1" }); h.flush();
  h.replace([list({ items: [{ id: "line1", description: "Cable reel", quantity: 4, unitCost: 10, supplier: "CEF", stockCode: "C1", status: "Delivered" }] })]);
  const all = nodes(renderedLists(h.render())); assert.equal(all.find((n) => n.type === "input").props.value, 4); assert.equal(all.find((n) => n.type === "select").props.value, "Delivered");
  assert.match(text(renderedLists(h.render())), /£40\.00/); assert.ok(all.filter((n) => ["input", "select"].includes(n.type)).every((n) => n.props.className.includes("min-h-12")));
  assert.equal(h.writes(), 0);
});

test("an unsupported saved purchase status remains visible in the review control instead of appearing Needed", () => {
  for (const status of ["Dispatched", ""]) {
    const saved = list(); saved.items[0].status = status;
    const h = harness({ lists: [saved], search: "?list=p1" }); h.flush();
    const control = nodes(renderedLists(h.render())).find((n) => n.type === "select"); assert.equal(control.props.value, status);
    const current = nodes(control).find((n) => n.type === "option" && n.props.value === status); assert.ok(current);
    assert.match(text(current), /review/); if (!status) assert.match(text(current), /Status not recorded/); assert.equal(h.writes(), 0);
  }
});

const quote = (patch = {}) => ({ id: "q1", number: "Q-1", title: "Workshop price", type: "Quote", jobId: "j1", items: [{ id: "material-1", category: "Materials", description: "Cable", quantity: 2, unitCost: 10 }, { id: "labour", category: "Labour", description: "Install", quantity: 1, unitCost: 200 }], ...patch });
const creationHarness = (options = {}) => { const h = harness({ pricing: [quote()], jobs: [{ id: "j1", title: "Workshop" }], ...options }); h.flush(); h.choose("Pricing document", "q1"); return h; };

test("purchase creation reports device persistence only after the durable save and opens the saved list", () => {
  const source = quote(); const original = list({ id: "existing", title: "Existing list" });
  const h = creationHarness({ search: "?list=existing", lists: [original], pricing: [source], materials: [{ id: "material-library", name: "Cable", supplier: "CEF", stockCode: "CABLE", supplierUrl: "https://supplier.example/cable" }] });
  h.create(); assert.equal(h.lists().length, 2); assert.equal(h.writes(), 1); assert.deepEqual(h.lists()[1], original);
  const saved = h.lists()[0]; assert.equal(saved.pricingDocumentId, "q1"); assert.equal(saved.jobId, "j1"); assert.equal(saved.items.length, 1); assert.equal(saved.items[0].supplier, "CEF"); assert.equal(saved.items[0].quantity, 2); assert.equal(saved.items[0].status, "Needed");
  assert.match(text(h.render()), /saved on this device.*Check sync status.*No supplier order has been placed/);
  assert.equal(renderedLists(h.render()).length, 1); assert.doesNotMatch(text(renderedLists(h.render())), /Existing list/);
  assert.equal(nodes(h.render()).find((n) => n.props["aria-label"] === "Pricing document").props.value, ""); assert.deepEqual(source, quote());
});

test("failed purchase creation keeps the selected source and stable parent and line identities through retries", () => {
  const h = creationHarness({ failCreateAt: [1, 2] }); h.create();
  assert.equal(h.lists().length, 0); assert.match(text(h.render()), /save could not be confirmed.*selections are retained.*Leaving this page loses the unsaved retry.*Purchase storage failed/);
  assert.equal(nodes(h.render()).find((n) => n.props["aria-label"] === "Pricing document").props.value, "q1"); assert.match(text(h.render()), /Retry purchase list/);
  h.create(); h.create(); assert.equal(h.lists().length, 1);
  assert.equal(new Set(h.attempts.map((record) => record.id)).size, 1); assert.equal(new Set(h.attempts.map((record) => record.items[0].id)).size, 1); assert.equal(new Set(h.attempts.map((record) => record.createdAt)).size, 1);
  assert.doesNotMatch(text(h.render()), /save could not be confirmed/);
});

test("repeated or stale purchase creation callbacks cannot duplicate a saved list or submit a changed selection", () => {
  const h = creationHarness({ pricing: [quote(), quote({ id: "q2", number: "Q-2" })] }); const old = h.createHandler(); old(); old();
  assert.equal(h.lists().length, 1); h.choose("Pricing document", "q2"); old(); assert.equal(h.lists().length, 1);
  h.create(); assert.equal(h.lists().length, 2); assert.notEqual(h.lists()[0].id, h.lists()[1].id);
  const other = creationHarness({ jobs: [{ id: "j1", title: "Workshop" }, { id: "j2", title: "Other" }] }); const previous = other.createHandler(); other.choose("Purchase job", "j2"); previous(); assert.equal(other.writes(), 0); other.create(); assert.equal(other.lists()[0].jobId, "j2");
});

test("purchase retries use reviewed current source values while retaining the unsaved identities", () => {
  const h = creationHarness({ failCreateAt: [1] }); h.create(); const first = h.attempts[0];
  const revised = quote(); revised.items[0].quantity = 5; revised.items[0].unitCost = 12; h.replacePricing([revised]); h.create();
  assert.equal(h.lists()[0].id, first.id); assert.equal(h.lists()[0].items[0].id, first.items[0].id); assert.equal(h.lists()[0].items[0].quantity, 5); assert.equal(h.lists()[0].items[0].unitCost, 12);
});

test("a pending purchase id collision is not overwritten or reported as a successful creation", () => {
  const h = creationHarness({ failCreateAt: [1] }); h.create(); const existing = list({ id: h.attempts[0].id, title: "Different saved record" }); h.replace([existing]); h.create();
  assert.deepEqual(h.lists(), [existing]); assert.match(text(h.render()), /save could not be confirmed.*already exists/); assert.equal(h.attempts.length, 1);
});

test("purchase creation rejects invalid source lines and unavailable selected records before any save", () => {
  for (const patch of [{ quantity: 0 }, { quantity: -1 }, { quantity: NaN }, { quantity: Infinity }, { unitCost: -1 }, { unitCost: NaN }, { unitCost: Infinity }, { description: " " }]) {
    const source = quote(); Object.assign(source.items[0], patch); const h = creationHarness({ pricing: [source] }); h.create(); assert.equal(h.writes(), 0); assert.match(text(h.render()), /Review the source material descriptions, quantities and unit costs/);
  }
  const missing = creationHarness(); missing.replacePricing([]); missing.create(); assert.equal(missing.writes(), 0); assert.match(text(missing.render()), /Choose a quote or estimate/);
  const jobGone = creationHarness(); jobGone.replaceJobs([]); jobGone.create(); assert.equal(jobGone.writes(), 0); assert.match(text(jobGone.render()), /linked job is unavailable/);
});

test("purchase creation handles readiness loss and keeps field roles outside the creation controls", () => {
  const h = creationHarness(); const create = h.createHandler(); h.setReady(false); create(); assert.equal(h.writes(), 0); h.setReady(true);
  assert.match(text(h.render()), /save could not be confirmed/); assert.equal(nodes(h.render()).find((n) => n.props["aria-label"] === "Pricing document").props.value, "q1"); h.create(); assert.equal(h.lists().length, 1);
  const field = harness({ role: "electrician", pricing: [quote()], jobs: [{ id: "j1", title: "Workshop" }] }); field.flush(); assert.equal(nodes(field.render()).some((n) => n.type === "Button"), false); assert.equal(field.writes(), 0);
});
