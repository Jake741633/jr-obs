import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as links from "../lib/invoiceLink.ts";
import * as settings from "../lib/businessSettings.ts";

const jsx = (type, props) => ({ type, props });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);
const invoice = (patch = {}) => ({ id: "i1", number: "INV-1", title: "Workshop lights", status: "Sent", customerId: "c1", dueDate: "2026-10-09", items: [{ id: "line", quantity: 2, unitPrice: 100 }], vatEnabled: true, vatRate: 20, amountPaid: 40, ...patch });
const cards = (view) => nodes(nodes(view).find((node) => node.props["aria-label"] === "Invoice records")).filter((node) => node.type === "Card");

function harness({ search = "", invoices: initial = [], ready: initialReady = true, prompt = null } = {}) {
  const slots = [], effects = [], layouts = [], frames = [], writes = [], prompts = [], alerts = [];
  let cursor = 0, invoices = initial, ready = initialReady, blurred = 0, promptEffect;
  const store = (items = []) => ({ items, isReady: ready, setItems() { throw new Error("Review navigation must not write related records"); } });
  const customers = [{ id: "c1", name: "Sample customer" }], builders = [{ id: "b1", companyName: "Example builder" }];
  function registerEffect(fn, deps, queue) {
    const i = cursor++; const previous = slots[i];
    if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) {
      const current = { deps, cleanup: previous?.cleanup, effect: true }; slots[i] = current;
      queue.push(() => { if (slots[i] !== current) return; current.cleanup?.(); current.cleanup = fn(); });
    }
  }
  const dependencies = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
      useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
      useMemo: (fn) => fn(),
      useEffect: (fn, deps) => registerEffect(fn, deps, effects), useLayoutEffect: (fn, deps) => registerEffect(fn, deps, layouts),
    },
    "lucide-react": {}, "../../components/ui/Button": { Button: "Button" }, "../../components/ui/Card": { Card: "Card" }, "../../components/ui/PageHeader": { PageHeader: "PageHeader" },
    "../../components/invoices/InvoicePreview": { InvoicePreview: "InvoicePreview" }, "../../components/ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" }, "../../components/crm/EntityEmptyState": { EntityEmptyState: "Empty" },
    "../../lib/businessSettings": settings, "../../lib/invoiceLink": links,
    "../../lib/cloud/coreBusinessCollections": { useInvoicesCollection: () => ({ ...store(invoices), setItems(update) { invoices = update(invoices); writes.push(invoices); } }) },
    "../../lib/storage": { useCloudLocalCollection: (key, initial = []) => store(key === "jr-os-customers" ? customers : key === "jr-os-builders" ? builders : initial), makeId() { throw new Error("Review must not create an identity"); } },
    "../../lib/workflow": { nextInvoiceNumber() { throw new Error("Review must not create an invoice"); } },
  };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/invoices/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module: mod, exports: mod.exports, Date, Intl, URLSearchParams,
    window: { location: { search }, requestAnimationFrame(fn) { frames.push(fn); return frames.length; }, cancelAnimationFrame(id) { frames[id - 1] = null; }, prompt(message) { prompts.push(message); promptEffect?.(); return prompt; }, alert(message) { alerts.push(message); } },
    require(name) { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  const render = () => { cursor = 0; const view = mod.exports.default(); layouts.splice(0).forEach((fn) => fn()); return view; };
  const first = render();
  const byLabel = (label) => nodes(render()).find((node) => node.type === "label" && nodes(node).some((child) => child.type === "span" && text(child) === label));
  return { first, render, writes, prompts, alerts, blurCount: () => blurred, saved: () => invoices,
    effects() { effects.splice(0).forEach((fn) => fn()); }, frames() { frames.splice(0).filter(Boolean).forEach((fn) => fn()); }, flush() { this.effects(); this.frames(); }, unmount() { slots.filter((slot) => slot?.effect).forEach((slot) => slot.cleanup?.()); },
    replace(value) { invoices = value; }, setReady(value) { ready = value; }, onPrompt(fn) { promptEffect = fn; },
    search(value) { nodes(byLabel("Find an invoice")).find((node) => node.type === "input").props.onChange({ target: { value } }); },
    enterSearch() { nodes(byLabel("Find an invoice")).find((node) => node.type === "input").props.onKeyDown({ key: "Enter", currentTarget: { blur() { blurred++; } } }); },
    filter(value) { nodes(byLabel("Invoice status filter")).find((node) => node.type === "select").props.onChange({ target: { value } }); },
    click(label) { const button = nodes(render()).find((node) => node.type === "button" && text(node).startsWith(label)); assert.ok(button, label); button.props.onClick(); },
    newInvoice() { const header = nodes(render()).find((node) => node.type === "PageHeader"); header.props.action.props.onClick(); },
    statusHandler(index = 0) { return nodes(cards(render())[index]).find((node) => node.type === "select").props.onChange; },
    paymentHandler(index = 0) { return nodes(cards(render())[index]).find((node) => node.type === "Button").props.onClick; },
  };
}

test("invoice links preserve one literal encoded saved identity and reject malformed scopes", () => {
  for (const id of ["i /?# +&action=create", "  literal id  ", "électricité", "x".repeat(300)]) {
    const url = new URL(links.invoiceReviewHref(id), "https://jr.example");
    assert.deepEqual(Array.from(url.searchParams), [["invoice", id]]); assert.equal(links.invoiceFromLink(url.search).invoiceId, id);
  }
  assert.equal(links.invoiceFromLink("?action=create&customerId=c1"), null);
  for (const search of ["?invoice=", "?invoice=%20", "?invoice=i1&invoice=i1", "?invoice=i1&invoice=other", `?invoice=${"x".repeat(301)}`]) assert.equal(links.invoiceFromLink(search).invoiceId, null);
  for (const id of [undefined, null, "", " ", "x".repeat(301)]) assert.equal(links.invoiceReviewHref(id), "/invoices");
});

test("invoice review selects the exact identity rather than the number title or search substring", () => {
  const id = " i /?# +&action=create "; const saved = [invoice({ id }), invoice({ id: "other", number: "INV-10", title: "Unrelated invoice" }), invoice({ id: "same-number", title: "Same-number copy" })];
  const before = structuredClone(saved); const h = harness({ invoices: saved, search: `?invoice=${encodeURIComponent(id)}` });
  assert.match(text(h.first), /Loading invoices/); assert.equal(cards(h.first).length, 0); h.flush();
  assert.equal(cards(h.render()).length, 1); assert.match(text(h.render()), /Showing INV-1 · Workshop lights.*exact saved invoice/);
  assert.doesNotMatch(text(cards(h.render())), /Unrelated invoice|Same-number copy/); assert.match(text(cards(h.render())), /£200\.00/);
  assert.equal(nodes(h.render()).some((node) => node.props["aria-label"] === "Find invoices"), false);
  assert.equal(h.writes.length, 0); assert.equal(h.prompts.length, 0); assert.deepEqual(saved, before);
});

test("invoice parameters take precedence over creation or mutation parameters", () => {
  for (const invoiceParameter of ["i1", "", "i1&invoice=other"]) {
    const h = harness({ invoices: [invoice()], search: `?invoice=${invoiceParameter}&action=create&customerId=c1&status=Paid&amountPaid=240` }); h.flush();
    assert.equal(nodes(h.render()).some((node) => node.type === "form"), false); assert.equal(h.writes.length, 0); assert.equal(h.prompts.length, 0);
    assert.equal(h.saved()[0].status, "Sent"); assert.equal(h.saved()[0].amountPaid, 40);
  }
});

test("customer quick-create links still prefill the form without saving an invoice", () => {
  const h = harness({ search: "?action=create&customerId=c1" }); h.flush();
  assert.equal(nodes(h.render()).filter((node) => node.type === "form").length, 1);
  assert.equal(nodes(h.render()).find((node) => node.type === "InputField" && node.props.label === "Invoice title").props.value, "Electrical works for Sample customer");
  assert.equal(h.writes.length, 0);
});

test("unavailable removed restored and duplicate invoice identities never substitute a reused number", () => {
  const other = invoice({ id: "other" }); const h = harness({ invoices: [other], search: "?invoice=i1" }); h.flush();
  assert.match(text(h.render()), /selected invoice is unavailable or its identity is ambiguous/); assert.equal(cards(h.render()).length, 0);
  h.replace([invoice(), other]); assert.equal(cards(h.render()).length, 1);
  h.replace([other]); assert.equal(cards(h.render()).length, 0);
  h.replace([invoice(), invoice({ title: "Conflicting identity", status: "Paid" }), other]); assert.equal(cards(h.render()).length, 0);
  h.replace([invoice({ number: "RENAMED", status: "Paid", amountPaid: 240 }), other]); assert.equal(cards(h.render()).length, 1);
  assert.match(text(h.render()), /Showing RENAMED/); assert.equal(nodes(cards(h.render())[0]).find((node) => node.type === "select").props.value, "Paid");
  assert.equal(h.writes.length, 0);
});

test("invalid invoice links expose no invoices until Show all is explicitly chosen", () => {
  for (const search of ["?invoice=", "?invoice=i1&invoice=other", `?invoice=${"x".repeat(301)}`]) {
    const h = harness({ invoices: [invoice(), invoice({ id: "other" })], search }); h.flush();
    assert.match(text(h.render()), /invoice link is invalid/); assert.equal(cards(h.render()).length, 0);
    h.click("Show all invoices"); assert.equal(cards(h.render()).length, 2); assert.doesNotMatch(text(h.render()), /invoice link is invalid/); assert.equal(h.writes.length, 0);
  }
});

test("readiness and initial-link resolution prevent broad flashes and clearing is not reversed", () => {
  const h = harness({ invoices: [invoice(), invoice({ id: "other" })], ready: false, search: "?invoice=i1" });
  h.flush(); assert.match(text(h.render()), /Loading invoices/); assert.equal(nodes(h.render()).some((node) => node.type === "input"), false);
  h.setReady(true); h.render(); h.effects(); assert.match(text(h.render()), /Loading invoices/); h.frames(); assert.equal(cards(h.render()).length, 1);
  h.click("Show all invoices"); h.render(); h.flush(); assert.equal(cards(h.render()).length, 2);
  h.setReady(false); assert.match(text(h.render()), /Loading invoices/); h.setReady(true); h.render(); h.flush(); assert.equal(cards(h.render()).length, 2); assert.equal(h.writes.length, 0);
});

test("phone search status filtering and reset combine without broadening exact review links", () => {
  const saved = [invoice(), invoice({ id: "paid", number: "INV-2", status: "Paid", title: "Kitchen" }), invoice({ id: "builder", number: "INV-3", status: "Paid", customerId: undefined, builderId: "b1", title: "Office" })];
  const h = harness({ invoices: saved, search: "?invoice=i1" }); h.flush(); h.click("Show all invoices");
  h.filter("Paid"); assert.equal(cards(h.render()).length, 2); h.search(" EXAMPLE BUILDER "); assert.equal(cards(h.render()).length, 1); assert.match(text(cards(h.render())), /Office/);
  h.search("does not exist"); assert.equal(cards(h.render()).length, 0); assert.equal(nodes(h.render()).find((node) => node.type === "Empty").props.title, "No matching invoices");
  h.click("Clear invoice filters"); assert.equal(cards(h.render()).length, 3); h.search("undefined"); assert.equal(cards(h.render()).length, 0);
  assert.equal(h.writes.length, 0);
});

test("eight-card phone paging resets on search status and clear without changing loaded records", () => {
  const saved = Array.from({ length: 19 }, (_, index) => invoice({ id: `i${index}`, number: `INV-${index}` })); const before = structuredClone(saved); const h = harness({ invoices: saved }); h.flush();
  assert.equal(cards(h.render()).length, 8); assert.match(text(h.render()), /Showing 8 of 19 matching invoices/);
  h.click("Show more invoices"); assert.equal(cards(h.render()).length, 16); h.click("Show more invoices"); assert.equal(cards(h.render()).length, 19);
  h.search("Workshop"); assert.equal(cards(h.render()).length, 8); h.click("Show more invoices"); h.filter("Sent"); assert.equal(cards(h.render()).length, 8);
  h.click("Show more invoices"); h.click("Clear invoice filters"); assert.equal(cards(h.render()).length, 8); assert.equal(h.writes.length, 0); assert.deepEqual(saved, before);
});

test("phone invoice browsing controls are labelled 48px and Enter dismisses the keyboard", () => {
  const h = harness({ invoices: [invoice()] }); h.flush();
  const search = nodes(h.render()).find((node) => node.type === "input"); assert.equal(search.props.type, "search"); assert.match(search.props.className, /min-h-12.*text-base/); assert.equal(search.props.autoCapitalize, "none"); assert.equal(search.props.spellCheck, false);
  for (const select of nodes(h.render()).filter((node) => node.type === "select")) assert.match(select.props.className, /min-h-12.*text-base/);
  h.enterSearch(); assert.equal(h.blurCount(), 1);
  for (const button of nodes(cards(h.render())).filter((node) => node.type === "Button")) assert.match(button.props.className, /min-h-12/);
  assert.match(text(h.render()), /saved invoice paid amounts, not the payment ledger/); assert.match(text(cards(h.render())), /Saved invoice balance/);
});

test("browsing and filter changes retain an unsaved creation form", () => {
  const h = harness({ invoices: [invoice()] }); h.flush(); h.newInvoice();
  nodes(h.render()).find((node) => node.type === "InputField" && node.props.label === "Invoice title").props.onChange({ target: { value: "Unsaved draft" } });
  h.filter("Paid"); h.search("absent"); h.click("Clear invoice filters");
  assert.equal(nodes(h.render()).find((node) => node.type === "InputField" && node.props.label === "Invoice title").props.value, "Unsaved draft"); assert.equal(h.writes.length, 0);
});

test("missing or duplicate invoice identities disable edits and reject even retained handlers", () => {
  for (const invoices of [[invoice(), invoice({ status: "Paid" })], [invoice({ id: "" })], [invoice({ id: " " })], [invoice({ id: undefined })]]) {
    const h = harness({ invoices, prompt: "100" }); h.flush();
    assert.match(text(cards(h.render())), /identity missing or ambiguous/);
    assert.equal(nodes(cards(h.render())[0]).find((node) => node.type === "select").props.disabled, true);
    assert.equal(nodes(cards(h.render())[0]).find((node) => node.type === "Button").props.disabled, true);
    h.statusHandler()({ target: { value: "Paid" } }); h.paymentHandler()();
    assert.equal(h.writes.length, 0); assert.equal(h.prompts.length, 0); assert.match(text(h.render()), /Review its current saved record/);
  }
});

test("changed removed ambiguous or unready invoices invalidate previously rendered update handlers", () => {
  for (const change of ["changed", "removed", "duplicate", "unready"]) {
    const h = harness({ invoices: [invoice()], prompt: "100" }); h.flush(); const status = h.statusHandler(), payment = h.paymentHandler();
    if (change === "changed") h.replace([invoice({ amountPaid: 100 })]);
    if (change === "removed") h.replace([]);
    if (change === "duplicate") h.replace([invoice(), invoice({ status: "Paid" })]);
    if (change === "unready") h.setReady(false);
    h.render(); status({ target: { value: "Paid" } }); payment(); assert.equal(h.writes.length, 0); assert.equal(h.prompts.length, 0);
  }
});

test("status filters cannot make a duplicate invoice identity appear safe to update", () => {
  const h = harness({ invoices: [invoice(), invoice({ status: "Paid" })], prompt: "100" }); h.flush(); h.filter("Sent");
  assert.equal(cards(h.render()).length, 1); assert.match(text(cards(h.render())), /identity missing or ambiguous/);
  h.statusHandler()({ target: { value: "Paid" } }); h.paymentHandler()(); assert.equal(h.writes.length, 0); assert.equal(h.prompts.length, 0);
});

test("record refresh during the existing payment prompt also blocks a stale update", () => {
  const h = harness({ invoices: [invoice()], prompt: "100" }); h.flush();
  h.onPrompt(() => { h.replace([invoice({ amountPaid: 120 })]); h.render(); }); h.paymentHandler()();
  assert.equal(h.prompts.length, 1); assert.equal(h.writes.length, 0); assert.equal(h.saved()[0].amountPaid, 120);
});

test("leaving the invoice page invalidates retained status and payment callbacks", () => {
  const h = harness({ invoices: [invoice()], prompt: "100" }); h.flush(); const status = h.statusHandler(), payment = h.paymentHandler();
  h.unmount(); status({ target: { value: "Paid" } }); payment(); assert.equal(h.writes.length, 0); assert.equal(h.prompts.length, 0);
  const duringPrompt = harness({ invoices: [invoice()], prompt: "100" }); duringPrompt.flush(); duringPrompt.onPrompt(() => duringPrompt.unmount()); duringPrompt.paymentHandler()();
  assert.equal(duringPrompt.prompts.length, 1); assert.equal(duringPrompt.writes.length, 0);
});

test("valid current invoice updates retain the existing saved amount and status policy", () => {
  const h = harness({ invoices: [invoice()], prompt: "100" }); h.flush();
  h.paymentHandler()(); assert.equal(h.saved()[0].amountPaid, 100); assert.equal(h.saved()[0].status, "Part paid"); assert.equal(h.writes.length, 1);
  h.statusHandler()({ target: { value: "Paid" } }); assert.equal(h.saved()[0].amountPaid, 240); assert.equal(h.saved()[0].status, "Paid"); assert.equal(h.writes.length, 2);
  h.statusHandler()({ target: { value: "Unknown" } }); assert.equal(h.writes.length, 2);
});

test("unknown historical statuses remain visible without being changed by viewing or filtering", () => {
  const h = harness({ invoices: [invoice({ status: "Imported" })] }); h.flush();
  assert.match(text(cards(h.render())), /Imported · review/); h.filter("Sent"); assert.equal(cards(h.render()).length, 0);
  h.click("Clear invoice filters"); assert.equal(cards(h.render()).length, 1); assert.equal(h.writes.length, 0);
});
