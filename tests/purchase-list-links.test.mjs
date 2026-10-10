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

function harness({ search = "", lists: initial = [], ready: initialReady = true } = {}) {
  const state = [], effects = []; let cursor = 0, mounted = false, lists = initial, ready = initialReady, writes = 0;
  const store = (items = []) => ({ items, isReady: ready, setItems() { writes++; throw new Error("Navigation must not write records"); }, remove() { writes++; throw new Error("Navigation must not delete records"); } });
  const deps = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useMemo: (fn) => fn(), useEffect: (fn) => { if (!mounted) effects.push(fn); }, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; } },
    "next/link": { default: "Link" }, "lucide-react": {}, "../../components/ui/Button": { Button: "Button" }, "../../components/ui/Card": { Card: "Card" }, "../../components/ui/PageHeader": { PageHeader: "PageHeader" },
    "../../lib/cloud/coreBusinessCollections": { usePurchaseListsCollection: () => store(lists) }, "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ identity: { role: "office" } }) },
    "../../lib/storage": { useCloudLocalCollection: () => store(), makeId() { throw new Error("Navigation cannot create identities"); } }, "../../lib/purchaseListLink": links,
  };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/purchases/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module: mod, exports: mod.exports, Intl, Date, window: { location: { search }, requestAnimationFrame(fn) { fn(); return 1; }, cancelAnimationFrame() {} }, require(name) { assert.ok(name in deps, name); return deps[name]; } });
  const render = () => { cursor = 0; const view = mod.exports.default(); mounted = true; return view; };
  const first = render();
  const flush = () => effects.splice(0).forEach((fn) => fn());
  return { first, render, flush, writes: () => writes, replace(value) { lists = value; }, setReady(value) { ready = value; },
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
