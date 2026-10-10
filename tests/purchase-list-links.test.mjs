import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as links from "../lib/purchaseListLink.ts";
import * as inbox from "../lib/purchaseInbox.ts";

const jsx = (type, props) => ({ type, props });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);
const list = (patch = {}) => ({ id: "p1", number: "PO-1", title: "Cable order", jobId: "j1", items: [{ id: "line1", description: "Cable reel", quantity: 2, unitCost: 10, supplier: "CEF", stockCode: "C1", status: "Needed" }], notes: "Source note", ...patch });

function harness({ search = "", lists: initial = [], ready: initialReady = true, pricing: initialPricing = [], jobs: initialJobs = [], materials = [], role = "office", failCreateAt = [], failUpdateAt = [], failRemoveAt = [], confirm = true } = {}) {
  const state = [], effects = [], attempts = [], updates = [], removals = [], confirmations = []; let cursor = 0, mounted = false, lists = initial, ready = initialReady, writes = 0, ids = 0, pricing = initialPricing, jobs = initialJobs;
  function createItem(item) {
    if (!ready) throw new Error("Purchase records are not ready");
    if (lists.some((list) => list.id === item.id)) throw new Error("A collection record with this id already exists");
    writes++; attempts.push(item);
    if (failCreateAt.includes(attempts.length)) throw new Error("Purchase storage failed");
    lists = [item, ...lists]; return item;
  }
  function updateItem(id, update) {
    if (!ready) throw new Error("Purchase records are not ready");
    const index = lists.findIndex((record) => record.id === id); if (index < 0) throw new Error("Purchase list is no longer available");
    const item = update(lists[index]); if (item === lists[index]) return item;
    writes++; updates.push(item); if (failUpdateAt.includes(updates.length)) throw new Error("Purchase storage failed");
    lists = lists.map((record, i) => i === index ? item : record); return item;
  }
  function removeItem(id, validate) {
    if (!ready) throw new Error("Purchase records are not ready");
    const item = lists.find((record) => record.id === id); if (!item) throw new Error("Purchase list is no longer available");
    validate?.(item); writes++; removals.push(item); if (failRemoveAt.includes(removals.length)) throw new Error("Purchase storage failed");
    lists = lists.filter((record) => record.id !== id); return item;
  }
  const store = (items = []) => ({ items, isReady: ready, setItems() { writes++; throw new Error("Navigation must not write records"); }, remove() { writes++; throw new Error("Navigation must not delete records"); } });
  const deps = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useMemo: (fn) => fn(), useEffect: (fn) => { if (!mounted) effects.push(fn); }, useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; }, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; } },
    "next/link": { default: "Link" }, "lucide-react": {}, "../../components/ui/Button": { Button: "Button" }, "../../components/ui/Card": { Card: "Card" }, "../../components/ui/PageHeader": { PageHeader: "PageHeader" },
    "../../lib/cloud/coreBusinessCollections": { usePurchaseListsCollection: () => ({ ...store(lists), createItem, updateItem, removeItem }) }, "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ identity: { role } }) },
    "../../lib/storage": { useCloudLocalCollection: (key) => store(key === "jr-os-pricing-documents" ? pricing : key === "jr-os-jobs" ? jobs : materials), makeId: (prefix) => `${prefix}-${++ids}` }, "../../lib/purchaseListLink": links, "../../lib/purchaseInbox": inbox,
  };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/purchases/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module: mod, exports: mod.exports, Intl, Date, Error, window: { location: { search }, requestAnimationFrame(fn) { fn(); return 1; }, cancelAnimationFrame() {}, confirm(message) { confirmations.push(message); return confirm; } }, require(name) { assert.ok(name in deps, name); return deps[name]; } });
  const render = () => { cursor = 0; const view = mod.exports.default(); mounted = true; return view; };
  const first = render();
  const flush = () => effects.splice(0).forEach((fn) => fn());
  return { first, render, flush, writes: () => writes, lists: () => lists, attempts, updates, removals, confirmations, replace(value) { lists = value; }, replacePricing(value) { pricing = value; }, replaceJobs(value) { jobs = value; }, setReady(value) { ready = value; },
    line(number = "PO-1", description = "Cable reel") { const row = nodes(render()).find((n) => n.props["aria-label"] === `Edit ${description} in ${number}`); assert.ok(row); return row; },
    edit(field, value, number, description) { const label = nodes(this.line(number, description)).find((n) => n.type === "label" && text(n).startsWith(field)); assert.ok(label); nodes(label).find((n) => ["input", "select"].includes(n.type)).props.onChange({ target: { value } }); },
    saveHandler(number, description) { const button = nodes(this.line(number, description)).find((n) => n.type === "button" && text(n) === "Save line"); assert.ok(button); return button.props.onClick; },
    save(number, description) { this.saveHandler(number, description)(); },
    discard(number, description) { nodes(this.line(number, description)).find((n) => n.type === "button" && text(n) === "Use saved values").props.onClick(); },
    deleteHandler(number = "PO-1") { const button = nodes(render()).find((n) => n.type === "button" && n.props["aria-label"] === `Delete ${number}`); assert.ok(button); return button.props.onClick; },
    search(value) { nodes(render()).find((n) => n.type === "input" && n.props.type === "search").props.onChange({ target: { value } }); },
    filter(name) { const group = nodes(render()).find((n) => n.props["aria-label"] === "Purchase list filters"); const button = nodes(group).find((n) => n.type === "button" && text(n).startsWith(name)); assert.ok(button); button.props.onClick(); },
    scopeJob(value) { const label = nodes(render()).find((n) => n.type === "label" && text(n).startsWith("Purchase list job")); nodes(label).find((n) => n.type === "select").props.onChange({ target: { value } }); },
    more() { const button = nodes(render()).find((n) => n.type === "button" && text(n).startsWith("Show more purchase lists")); assert.ok(button); button.props.onClick(); },
    clearFilters() { nodes(render()).find((n) => n.type === "button" && text(n) === "Clear purchase filters").props.onClick(); },
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

const editingHarness = (options = {}) => { const h = harness({ lists: [list()], ...options }); h.flush(); return h; };

test("purchase line edits remain drafts until explicit durable save and counts retain saved values", () => {
  const h = editingHarness(); h.edit("Quantity", "3.5"); h.edit("Unit cost", "12"); h.edit("Status", "Delivered");
  assert.equal(h.writes(), 0); assert.equal(h.lists()[0].items[0].quantity, 2); assert.equal(h.lists()[0].items[0].status, "Needed");
  assert.match(text(h.render()), /1 unsaved line.*leaving loses unsaved line changes/); assert.match(text(h.line()), /Saved quantity 2 · Needed/);
  assert.match(text(renderedLists(h.render())), /£20\.00/); assert.doesNotMatch(text(renderedLists(h.render())), /£42\.00/);
  h.save(); assert.equal(h.writes(), 1); assert.equal(h.lists()[0].items[0].quantity, 3.5); assert.equal(h.lists()[0].items[0].unitCost, 12); assert.equal(h.lists()[0].items[0].status, "Delivered");
  assert.match(text(h.render()), /line saved on this device.*Check sync status.*no supplier order/); assert.match(text(renderedLists(h.render())), /£42\.00/); assert.doesNotMatch(text(h.render()), /unsaved line/); assert.doesNotMatch(text(h.line()), /Save line/);
});

test("failed line saves retain editable drafts and repeated success callbacks cannot write twice", () => {
  const h = editingHarness({ failUpdateAt: [1, 2] }); h.edit("Quantity", "4"); const save = h.saveHandler();
  save(); save(); assert.equal(h.lists()[0].items[0].quantity, 2); assert.equal(h.updates.length, 2); assert.match(text(h.render()), /save could not be confirmed.*draft is retained.*Leaving this page loses unsaved line changes.*storage failed/);
  assert.equal(nodes(h.line()).find((n) => n.type === "input").props.value, "4"); save(); save(); assert.equal(h.updates.length, 3); assert.equal(h.lists()[0].items[0].quantity, 4);
  assert.equal(new Set(h.updates.map((record) => record.items[0].id)).size, 1); assert.doesNotMatch(text(h.render()), /could not be confirmed/); assert.doesNotMatch(text(h.line()), /Save line/);
});

test("blank and invalid purchase drafts cannot change records and partial typing is retained", () => {
  for (const [field, values] of [["Quantity", ["", " ", "0", "-1", "NaN", "Infinity", "1e309"]], ["Unit cost", ["", " ", "-1", "NaN", "Infinity"]], ["Status", ["Dispatched", ""]]]) for (const value of values) {
    const h = editingHarness(); h.edit(field, value); assert.equal(h.writes(), 0); h.save(); assert.equal(h.writes(), 0); assert.match(text(h.render()), /Review this line.*draft is retained/);
    assert.deepEqual(h.lists(), [list()]); h.discard(); assert.doesNotMatch(text(h.render()), /unsaved line/); assert.doesNotMatch(text(h.line()), /Save line/);
  }
  const h = editingHarness(); h.edit("Quantity", ""); h.edit("Quantity", "5"); h.edit("Unit cost", "0"); h.save(); assert.equal(h.lists()[0].items[0].quantity, 5); assert.equal(h.lists()[0].items[0].unitCost, 0);
});

test("changed line identities, values and linked sources block stale drafts without overwriting saved records", () => {
  const changes = [
    (current) => { current.items[0].quantity = 8; },
    (current) => { current.items[0].description = "Replacement cable"; },
    (current) => { current.items[0].status = "Ordered"; },
    (current) => { current.jobId = "other-job"; },
    (current) => { current.pricingDocumentId = "other-quote"; },
    (current) => { current.items = []; },
    (current) => { current.items.push({ ...current.items[0] }); },
  ];
  for (const change of changes) {
    const h = editingHarness(); h.edit("Quantity", "4"); const save = h.saveHandler(); const revised = list(); change(revised); h.replace([revised]); save();
    assert.equal(h.writes(), 0); assert.deepEqual(h.lists(), [revised]); assert.match(text(h.render()), /save could not be confirmed.*linked source has changed/);
  }
  const h = editingHarness(); h.edit("Quantity", "4"); const save = h.saveHandler(); h.replace([]); save(); assert.equal(h.writes(), 0); assert.match(text(h.render()), /no longer available/);
});

test("purchase line saves preserve current list notes and unrelated lines", () => {
  const h = editingHarness(); h.edit("Quantity", "4"); const save = h.saveHandler(); const revised = list({ notes: "Updated office note", title: "Current title" });
  revised.items.push({ id: "other-line", description: "Fixings", quantity: 10, unitCost: 1, status: "Delivered" }); h.replace([revised]); save();
  assert.equal(h.lists()[0].notes, revised.notes); assert.equal(h.lists()[0].title, revised.title); assert.deepEqual(h.lists()[0].items[1], revised.items[1]); assert.equal(h.lists()[0].items[0].quantity, 4); assert.equal(h.writes(), 1);
});

test("new draft values and Use saved values invalidate older save callbacks", () => {
  const h = editingHarness(); h.edit("Quantity", "4"); const old = h.saveHandler(); h.edit("Quantity", "5"); old(); assert.equal(h.writes(), 0);
  const current = h.saveHandler(); h.discard(); current(); assert.equal(h.writes(), 0); assert.doesNotMatch(text(h.line()), /Save line/);
  h.edit("Quantity", "2"); h.save(); assert.equal(h.writes(), 0); assert.doesNotMatch(text(h.line()), /Save line/);
  h.edit("Quantity", "6"); const stale = h.saveHandler(); h.replace([list({ items: [{ ...list().items[0], quantity: 8 }] })]); h.discard(); stale(); assert.equal(h.writes(), 0);
  assert.equal(nodes(h.line()).find((n) => n.type === "input").props.value, 8); h.edit("Quantity", "9"); h.save(); assert.equal(h.lists()[0].items[0].quantity, 9);
});

test("purchase drafts remain separate by exact list and line identity across focus changes", () => {
  const first = list({ id: "a", number: "PO-1", items: [{ ...list().items[0], id: "b:c" }] }); const second = list({ id: "a:b", number: "PO-2", items: [{ ...list().items[0], id: "c" }] });
  const h = editingHarness({ lists: [first, second], search: "?list=a" }); h.edit("Quantity", "4"); h.clear(); h.edit("Quantity", "5", "PO-2"); assert.match(text(h.render()), /2 unsaved lines/);
  h.save("PO-1"); assert.equal(h.lists()[0].items[0].quantity, 4); assert.equal(h.lists()[1].items[0].quantity, 2); assert.match(text(h.render()), /1 unsaved line/); h.save("PO-2"); assert.equal(h.lists()[1].items[0].quantity, 5);
});

test("line saves reject duplicate parent identities and readiness loss while retaining the retry", () => {
  const h = editingHarness(); h.edit("Quantity", "4"); h.replace([list(), list({ title: "Duplicate identity" })]); h.save(); assert.equal(h.writes(), 0); assert.match(text(h.render()), /identity is ambiguous/);
  h.replace([list()]); const save = h.saveHandler(); h.setReady(false); save(); assert.equal(h.writes(), 0); h.setReady(true); assert.match(text(h.render()), /records are not ready/); h.save(); assert.equal(h.lists()[0].items[0].quantity, 4);
});

test("unsupported purchase statuses require an explicit correction before saving another line value", () => {
  const saved = list({ items: [{ ...list().items[0], status: "Dispatched" }] }); const h = editingHarness({ lists: [saved] }); h.edit("Quantity", "4"); h.save(); assert.equal(h.writes(), 0);
  h.edit("Status", "Ordered"); h.save(); assert.equal(h.lists()[0].items[0].status, "Ordered"); assert.equal(h.lists()[0].items[0].quantity, 4);
});

test("purchase deletion requires confirmation and failed persistence retains the exact saved list", () => {
  const cancel = editingHarness({ confirm: false }); cancel.deleteHandler()(); assert.equal(cancel.writes(), 0); assert.equal(cancel.confirmations.length, 1);
  const h = editingHarness({ failRemoveAt: [1], search: "?list=p1", lists: [list(), list({ id: "p2", number: "PO-2", title: "Other list" })] }); const remove = h.deleteHandler(); remove();
  assert.equal(h.lists().length, 2); assert.match(text(h.render()), /Deletion could not be confirmed.*Review the saved purchase list.*storage failed/); assert.match(h.confirmations[0], /Delete purchase list PO-1 “Cable order”/);
  remove(); remove(); assert.equal(h.removals.length, 2); assert.equal(h.confirmations.length, 2); assert.equal(h.lists().length, 1); assert.equal(h.lists()[0].id, "p2"); assert.match(text(h.render()), /deleted on this device.*Check sync status/);
  assert.equal(renderedLists(h.render()).length, 0); assert.match(text(h.render()), /selected purchase list is unavailable/); assert.doesNotMatch(text(renderedLists(h.render())), /Other list/);
});

test("purchase deletion refuses changed records, ambiguous ids, pending drafts and lost readiness", () => {
  const h = editingHarness(); const remove = h.deleteHandler(); const revised = list({ notes: "Changed record" }); h.replace([revised]); remove(); assert.equal(h.writes(), 0); assert.deepEqual(h.lists(), [revised]); assert.match(text(h.render()), /has changed/);
  const draft = editingHarness(); draft.edit("Quantity", "4"); draft.deleteHandler()(); assert.equal(draft.writes(), 0); assert.equal(draft.confirmations.length, 0); assert.match(text(draft.render()), /Save or discard/);
  const duplicate = editingHarness({ lists: [list(), list({ title: "Duplicate" })] }); duplicate.deleteHandler()(); assert.equal(duplicate.writes(), 0); assert.equal(duplicate.confirmations.length, 0);
  const pending = editingHarness(); const old = pending.deleteHandler(); pending.setReady(false); old(); assert.equal(pending.writes(), 0); pending.setReady(true); assert.match(text(pending.render()), /records are not ready/);
});

test("field-role purchase rendering hides pricing and deletion while quantity drafts preserve internal cost", () => {
  const h = editingHarness({ role: "electrician" }); assert.equal(nodes(h.render()).some((n) => n.props["aria-label"] === "Delete PO-1"), false); assert.doesNotMatch(text(h.line()), /Unit cost|£/);
  h.edit("Quantity", "4"); assert.doesNotMatch(text(h.line()), /Unit cost|£/); h.save(); assert.equal(h.lists()[0].items[0].unitCost, 10); assert.equal(h.lists()[0].items[0].quantity, 4);
});

test("drafts for removed lines remain visible and can be discarded without a record write", () => {
  const h = editingHarness(); h.edit("Quantity", "4"); const stale = h.saveHandler(); h.replace([list({ items: [] })]);
  h.deleteHandler()(); assert.equal(h.confirmations.length, 0); assert.match(text(h.render()), /1 unsaved line/);
  const clear = nodes(h.render()).find((n) => n.type === "button" && text(n) === "Discard all line drafts"); assert.ok(clear); clear.props.onClick(); stale();
  assert.equal(h.writes(), 0); assert.doesNotMatch(text(h.render()), /unsaved line/); h.deleteHandler()(); assert.equal(h.lists().length, 0);
});

const savedJob = (patch = {}) => ({ id: "j1", title: "Workshop", siteAddress: "10 High Street", status: "On Site", ...patch });
const inboxOptions = (patch = {}) => ({ jobId: "", filter: "All", query: "", includeCosts: true, ...patch });

test("purchase inbox filters classify whole saved lists without treating unsupported status as an order or receipt", () => {
  const needed = list(); const ordered = list({ id: "ordered", items: [{ ...list().items[0], status: "Ordered" }] });
  const delivered = list({ id: "delivered", items: [{ ...list().items[0], status: "Delivered" }] });
  const mixed = list({ id: "mixed", items: [...needed.items, { ...ordered.items[0], id: "ordered-line" }, { ...delivered.items[0], id: "delivered-line" }] });
  const unknown = list({ id: "unknown", items: [{ ...list().items[0], status: "Dispatched" }] }); const empty = list({ id: "empty", items: [] });
  const lists = [needed, ordered, delivered, mixed, unknown, empty]; const before = structuredClone(lists);
  for (const [filter, ids] of [["All", lists.map((record) => record.id)], ["Need ordering", ["p1", "mixed"]], ["Awaiting delivery", ["ordered", "mixed"]], ["Delivered", ["delivered"]], ["Review", ["unknown", "empty"]]]) {
    assert.deepEqual(inbox.filterPurchaseInbox(lists, [savedJob()], inboxOptions({ filter })).map((record) => record.id), ids);
  }
  assert.deepEqual(lists, before); assert.equal(inbox.filterPurchaseInbox(lists, [savedJob()], inboxOptions({ filter: "Awaiting delivery" }))[1].items.length, 3);
});

test("purchase search joins recorded job, list and supplier details with every word required and no price search", () => {
  const first = list({ notes: "collect tomorrow" }); const other = list({ id: "other", jobId: "j2", title: "Office order", items: [{ ...list().items[0], supplier: "TLC", unitCost: 2500 }] });
  const lists = [first, other], jobs = [savedJob(), savedJob({ id: "j2", title: "Office", siteAddress: "11 Low Street" })];
  for (const query of [" WORKSHOP  CEF c1 ", "high cable", "po-1 tomorrow"]) assert.deepEqual(inbox.filterPurchaseInbox(lists, jobs, inboxOptions({ query })).map((record) => record.id), ["p1"]);
  assert.deepEqual(inbox.filterPurchaseInbox(lists, jobs, inboxOptions({ query: "office tlc" })).map((record) => record.id), ["other"]);
  for (const query of ["workshop tlc", "2500"]) assert.equal(inbox.filterPurchaseInbox(lists, jobs, inboxOptions({ query })).length, 0);
});

test("purchase job scope uses only an exact unique saved job identity and retains global orphan review", () => {
  const lists = [list(), list({ id: "other", jobId: "other-job" }), list({ id: "orphan", jobId: "missing" }), list({ id: "stock", jobId: undefined })];
  const jobs = [savedJob(), savedJob({ id: "other-job" })];
  assert.deepEqual(inbox.filterPurchaseInbox(lists, jobs, inboxOptions({ jobId: "j1" })).map((record) => record.id), ["p1"]);
  assert.deepEqual(inbox.filterPurchaseInbox(lists, jobs, inboxOptions({ filter: "Review" })).map((record) => record.id), ["orphan"]);
  assert.equal(inbox.filterPurchaseInbox(lists, [savedJob({ id: "replacement" })], inboxOptions({ jobId: "j1" })).length, 0);
  assert.equal(inbox.filterPurchaseInbox(lists, [savedJob(), savedJob()], inboxOptions({ jobId: "j1" })).length, 0);
  assert.equal(inbox.purchaseLinkedJob(list(), [savedJob(), savedJob()]), undefined);
});

test("purchase review includes invalid lines and identities while restricted review avoids hidden cost inference", () => {
  for (const patch of [{ quantity: 0 }, { quantity: -1 }, { quantity: NaN }, { quantity: Infinity }, { description: " " }, { description: 3 }, { id: "" }, { id: 4 }, { unitCost: undefined }, { unitCost: NaN }, { unitCost: -1 }]) {
    const current = list({ items: [{ ...list().items[0], ...patch }] }); assert.equal(inbox.filterPurchaseInbox([current], [savedJob()], inboxOptions({ filter: "Review" })).length, 1);
  }
  const badCost = list({ items: [{ ...list().items[0], unitCost: NaN }] }); assert.equal(inbox.filterPurchaseInbox([badCost], [savedJob()], inboxOptions({ filter: "Review", includeCosts: false })).length, 0);
  const childDuplicate = list({ items: [list().items[0], { ...list().items[0] }] }); assert.equal(inbox.filterPurchaseInbox([childDuplicate], [savedJob()], inboxOptions({ filter: "Review" })).length, 1);
  assert.equal(inbox.filterPurchaseInbox([list(), list()], [savedJob()], inboxOptions({ filter: "Review" })).length, 2);
  for (const id of ["", undefined, 5]) assert.equal(inbox.filterPurchaseInbox([list({ id })], [savedJob()], inboxOptions({ filter: "Review" })).length, 1);
});

test("phone purchase lists reveal eight at a time and control changes reset the limit without changing records", () => {
  const lists = Array.from({ length: 19 }, (_, i) => list({ id: `p${i}`, number: `PO-${i}`, title: `Saved order ${i}` })); const h = editingHarness({ lists, jobs: [savedJob()] });
  assert.equal(renderedLists(h.render()).length, 8); assert.match(text(h.render()), /Show more purchase lists \(11 remaining\)/);
  const metric = nodes(h.render()).find((n) => n.type === "Card" && text(n).startsWith("Purchase lists")); assert.equal(text(metric), "Purchase lists19");
  h.more(); assert.equal(renderedLists(h.render()).length, 16); h.more(); assert.equal(renderedLists(h.render()).length, 19);
  h.filter("Need ordering"); assert.equal(renderedLists(h.render()).length, 8); h.more(); h.search("saved"); assert.equal(renderedLists(h.render()).length, 8); h.more(); h.scopeJob("j1"); assert.equal(renderedLists(h.render()).length, 8);
  const group = nodes(h.render()).find((n) => n.props["aria-label"] === "Purchase list filters"); assert.ok(nodes(group).filter((n) => n.type === "button").every((n) => n.props.className.includes("min-h-12"))); assert.equal(nodes(group).find((n) => n.type === "button" && text(n).startsWith("Need ordering")).props["aria-pressed"], true);
  h.clearFilters(); assert.equal(renderedLists(h.render()).length, 8); assert.equal(h.writes(), 0); assert.deepEqual(h.lists(), lists);
});

test("purchase filters combine search and job scope with clear empty feedback and counts before search", () => {
  const lists = [list(), list({ id: "other", number: "PO-2", jobId: "j2", items: [{ ...list().items[0], status: "Ordered", supplier: "TLC" }] })];
  const h = editingHarness({ lists, jobs: [savedJob(), savedJob({ id: "j2", title: "Office" })] }); h.scopeJob("j1"); h.search("TLC");
  assert.equal(renderedLists(h.render()).length, 0); assert.match(text(h.render()), /No purchase lists match these filters/); assert.doesNotMatch(text(h.render()), /No purchase lists yet/);
  const group = nodes(h.render()).find((n) => n.props["aria-label"] === "Purchase list filters"); assert.match(text(group), /All 1Need ordering 1Awaiting delivery 0/);
  h.clearFilters(); h.filter("Awaiting delivery"); assert.equal(renderedLists(h.render()).length, 1); assert.match(text(renderedLists(h.render())), /PO-2/); assert.equal(h.writes(), 0);
});

test("removed or ambiguous scoped purchase jobs stay unavailable and restoration uses the same identity", () => {
  const h = editingHarness({ jobs: [savedJob()] }); h.scopeJob("j1"); h.replaceJobs([savedJob({ id: "new-id" })]); assert.equal(renderedLists(h.render()).length, 0); assert.match(text(h.render()), /selected job is unavailable/);
  const option = nodes(h.render()).find((n) => n.type === "option" && n.props.value === "j1"); assert.match(text(option), /Selected job unavailable or ambiguous/);
  h.replaceJobs([savedJob(), savedJob()]); assert.equal(renderedLists(h.render()).length, 0); h.replaceJobs([savedJob()]); assert.equal(renderedLists(h.render()).length, 1); assert.equal(h.writes(), 0);
});

test("exact purchase links bypass browsing filters and new creation opens its saved list before Show all resets browsing", () => {
  const h = editingHarness({ search: "?list=p1", jobs: [savedJob()] }); assert.equal(nodes(h.render()).some((n) => n.props["aria-label"] === "Find purchase lists"), false); assert.equal(renderedLists(h.render()).length, 1); h.clear(); assert.equal(nodes(h.render()).some((n) => n.props["aria-label"] === "Find purchase lists"), true);
  const created = creationHarness({ lists: [list()] }); created.filter("Delivered"); created.search("absent"); assert.equal(renderedLists(created.render()).length, 0); created.create(); assert.equal(renderedLists(created.render()).length, 1); assert.match(text(created.render()), /Showing PO-0002/);
  created.clear(); assert.equal(renderedLists(created.render()).length, 2); assert.equal(nodes(created.render()).find((n) => n.type === "input" && n.props.type === "search").props.value, "");
});

test("phone purchase browsing retains hidden line drafts and uses saved status until successful persistence", () => {
  const h = editingHarness({ jobs: [savedJob()] }); h.edit("Status", "Ordered"); h.filter("Awaiting delivery"); assert.equal(renderedLists(h.render()).length, 0); assert.match(text(h.render()), /1 unsaved line/); assert.equal(h.writes(), 0);
  h.clearFilters(); assert.equal(nodes(h.line()).find((n) => n.type === "select").props.value, "Ordered"); h.save(); h.filter("Awaiting delivery"); assert.equal(renderedLists(h.render()).length, 1); assert.equal(h.writes(), 1);
});

test("purchase amount displays retain known values and never infer committed spend from an unsupported status", () => {
  const items = [{ ...list().items[0], id: "ordered", status: "Ordered" }, { ...list().items[0], id: "delivered", quantity: 3, unitCost: 5, status: "Delivered" }, { ...list().items[0], id: "unknown", quantity: 100, unitCost: 100, status: "Dispatched" }, { ...list().items[0], id: "invalid", unitCost: Infinity, status: "Ordered" }];
  const h = editingHarness({ lists: [list({ items })], jobs: [savedJob()] }); const card = nodes(h.render()).find((n) => n.type === "Card" && text(n).startsWith("Committed spend"));
  assert.match(text(card), /£35\.00.*Known amount · line values need review/); assert.match(text(renderedLists(h.render())), /Known total · line values need review.*Value needs review/); assert.doesNotMatch(text(h.render()), /NaN|Infinity/);
  assert.ok(nodes(h.render()).filter((node) => node.type === "input").every((node) => typeof node.props.value !== "number" || Number.isFinite(node.props.value)));
  assert.deepEqual(inbox.purchaseSavedTotal([{ ...list().items[0], quantity: Number.MAX_VALUE, unitCost: 2 }, { ...list().items[0], quantity: 1, unitCost: 1 }]), { amount: 1, needsReview: true });
});
