import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const jsx = (type, props) => ({ type, props });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);
const quote = (patch = {}) => ({ id: "q", number: "Q-1", title: "Works", type: "Quote", status: "Accepted", customerId: "c", jobId: "j", items: [{ id: "l", quantity: 1, unitPrice: 1000 }], vatEnabled: true, vatRate: 20, ...patch });
const requirement = (patch = {}) => ({ id: "r", pricingDocumentId: "q", mode: "Percentage", value: 20, dueRule: "On acceptance", ...patch });
const invoice = (patch = {}) => ({ id: "i", number: "INV-0042", title: "Renamed", status: "Sent", purpose: "Deposit", quoteId: "q", jobId: "j", customerId: "c", depositRequirementId: "r", items: [{ id: "il", quantity: 1, unitPrice: 200 }], vatEnabled: true, vatRate: 20, amountPaid: 0, ...patch });

function harness({ invoices = [], documents = [quote()], deposits = [requirement()], payments = [], customers = [{ id: "c", name: "Customer" }], builders = [], jobs = [{ id: "j", customerId: "c", startDate: "2099-01-01" }], planner = [], failure } = {}) {
  const slots = [], saved = [], effects = [], stores = new Map(); let cursor = 0, durableWrites = 0;
  for (const [key, items] of Object.entries({ invoices, "pricing-documents": documents, "deposit-requirements": deposits, payments, customers, builders, jobs, planner })) stores.set(`jr-os-${key}`, { items, isReady: true });
  const store = (key) => {
    if (!stores.has(key)) stores.set(key, { items: [], isReady: true });
    const value = stores.get(key);
    return { ...value, setItems(update) { const next = typeof update === "function" ? update(value.items) : update; saved.push(...next.filter((item) => !value.items.some((previous) => previous.id === item.id))); value.items = next; }, createItem(item) { if (failure) throw new Error(failure); value.items = [item, ...value.items]; saved.push(item); durableWrites++; return item; } };
  };
  const mocks = {
    react: { useLayoutEffect(effect) { effects.push(effect); }, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; }, useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; } },
    "react/jsx-runtime": { jsx, jsxs: jsx }, "lucide-react": {}, "next/link": { default: "Link" },
  };
  const cache = new Map(); let sequence = 0;
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} }; cache.set(file, mod);
    const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(code, { module: mod, exports: mod.exports, Date, Intl, URL, Set, Error, require(name) {
      if (name in mocks) return mocks[name];
      if (name.endsWith("/storage")) return { makeId: (prefix) => `${prefix}-${++sequence}`, useCloudLocalCollection: store, useLocalStorageCollection: store };
      if (name.endsWith("/cloud/coreBusinessCollections")) return { usePaymentsCollection: () => store("jr-os-payments") };
      if (name.includes("/ui/")) return { [name.split("/").at(-1)]: name.split("/").at(-1), InputField: "InputField", TextareaField: "TextareaField" };
      if (name.startsWith(".")) { const base = resolve(dirname(file), name); return load([base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`].find((path) => existsSync(path))); }
      return nativeRequire(name);
    } }, { filename: file });
    return mod.exports;
  }
  const page = load(resolve(root, "app/payments/page.tsx")).default;
  const dashboard = load(resolve(root, "components/PaymentControlDashboard.tsx")).PaymentControlDashboard;
  const render = () => { cursor = 0; const view = page(); effects.splice(0).forEach((effect) => effect()); return view; };
  return { saved, render, stores,
    change(label, value) { const view = render(); const field = nodes(view).find((node) => node.type === "InputField" && node.props.label === label); const wrapper = nodes(view).find((node) => node.type === "label" && nodes(node).some((child) => child.type === "span" && text(child) === label)); const control = field || nodes(wrapper).find((node) => node.type === "select"); assert.ok(control, label); control.props.onChange({ target: { value } }); },
    saveRequirement() { nodes(render()).filter((node) => node.type === "form")[1].props.onSubmit({ preventDefault() {} }); },
    depositAction() { return nodes(render()).find((node) => node.type === "Button" && text(node) === "Create deposit invoice").props.onClick; },
    durableWrites: () => durableWrites, click() { const button = nodes(render()).find((node) => node.type === "Button" && text(node) === "Create deposit invoice"); assert.ok(button); return button.props.onClick(); }, warning() { cursor = 0; const card = nodes(dashboard()).find((node) => node.type === "Card" && text(node).startsWith("Deposits needed before work")); return Number(text(card).replace("Deposits needed before work", "")); } };
}

test("deposit creation durably saves explicit linkage and VAT once using the next unused number", () => {
  const h = harness({ invoices: [invoice({ quoteId: "other", jobId: "other", number: "INV-0042" })] }); h.click();
  assert.equal(h.saved.length, 1); assert.equal(h.durableWrites(), 1); const saved = h.saved[0];
  assert.equal(saved.number, "INV-0043"); assert.equal(saved.purpose, "Deposit"); assert.equal(saved.quoteId, "q"); assert.equal(saved.depositRequirementId, "r"); assert.equal(saved.customerId, "c"); assert.equal(saved.jobId, "j");
  assert.equal(saved.vatEnabled, true); assert.equal(saved.vatRate, 20); assert.equal(saved.items[0].unitPrice, 200);
  h.click(); assert.equal(h.saved.length, 1);
});

test("deposit creation blocks renamed deposits, active finals and uncertain historical links", () => {
  for (const existing of [invoice(), invoice({ purpose: "Final" }), invoice({ purpose: undefined, title: "Works" }), invoice({ purpose: undefined, quoteId: undefined })]) {
    const h = harness({ invoices: [existing] }); h.click(); assert.equal(h.saved.length, 0); assert.match(text(h.render()), /already|review|final/i);
  }
  const cancelled = harness({ invoices: [invoice({ status: "Cancelled" })] }); cancelled.click(); assert.equal(cancelled.saved.length, 1);
});

test("deposit creation validates accepted source scope requirements and reports durable failure", () => {
  for (const options of [{ documents: [quote({ status: "Draft" })] }, { customers: [] }, { jobs: [{ id: "j", customerId: "other" }] }, { deposits: [requirement({ value: 101 })] }, { deposits: [requirement({ dueRule: "Specified date", dueDate: "" })] }, { deposits: [requirement(), requirement({ id: "r2" })] }]) {
    const h = harness(options); const button = nodes(h.render()).find((node) => node.type === "Button" && text(node) === "Create deposit invoice"); if (button) button.props.onClick(); assert.equal(h.saved.length, 0);
  }
  const h = harness({ failure: "Device storage full" }); h.click(); assert.equal(h.saved.length, 0); assert.match(text(h.render()), /Device storage full/);
});

test("deposit warning uses attributable recorded cash once and ignores cancellations and title inference", () => {
  assert.equal(harness({ invoices: [invoice({ amountPaid: 240 })] }).warning(), 0);
  assert.equal(harness({ invoices: [invoice({ amountPaid: 120 })], payments: [{ invoiceId: "i", type: "Deposit", amount: 120 }] }).warning(), 1);
  assert.equal(harness({ invoices: [invoice({ status: "Cancelled", amountPaid: 240 })] }).warning(), 1);
  assert.equal(harness({ invoices: [invoice({ purpose: undefined, title: "Deposit - Works", amountPaid: 240 })] }).warning(), 1);
  assert.equal(harness({ invoices: [invoice({ customerId: "other", amountPaid: 240 })] }).warning(), 1);
  assert.equal(harness({ invoices: [invoice({ depositRequirementId: undefined, amountPaid: 240 })] }).warning(), 1);
  assert.equal(harness({ invoices: [invoice({ amountPaid: 120 }), invoice({ amountPaid: 120 })] }).warning(), 1);
});


test("deposit save rechecks the current source and repeated clicks cannot create another invoice", () => {
  const h = harness(); const action = h.depositAction(); action(); action(); assert.equal(h.saved.length, 1);
  const changed = harness(); const staleAction = changed.depositAction(); changed.stores.get("jr-os-pricing-documents").items = [quote({ status: "Draft" })]; changed.render(); staleAction(); assert.equal(changed.saved.length, 0);
});

test("saving deposit requirements rejects invalid percentages dates and nonaccepted sources", () => {
  for (const [label, value] of [["Percentage", "101"], ["Percentage", "0"], ["Percentage", "NaN"], ["Due", "Specified date"]]) {
    const h = harness({ deposits: [] }); h.change("Accepted quote or estimate", "q"); h.change(label, value); h.saveRequirement(); assert.equal(h.stores.get("jr-os-deposit-requirements").items.length, 0);
  }
  const h = harness({ deposits: [] }); h.change("Accepted quote or estimate", "q"); h.change("Due", "Specified date"); h.change("Deposit due date", "2026-02-30"); h.saveRequirement(); assert.equal(h.stores.get("jr-os-deposit-requirements").items.length, 0);
});


test("builder-owned accepted quotes retain their billing party and matching job", () => {
  const h = harness({ documents: [quote({ customerId: undefined, builderId: "b" })], customers: [], builders: [{ id: "b", companyName: "Builder" }], jobs: [{ id: "j", builderId: "b" }] });
  h.click(); assert.equal(h.saved.length, 1); assert.equal(h.saved[0].builderId, "b"); assert.equal(h.saved[0].customerId, undefined); assert.equal(h.saved[0].jobId, "j");
});


test("a deposit issued before job conversion still satisfies its exact quote requirement", () => {
  assert.equal(harness({ invoices: [invoice({ jobId: undefined, amountPaid: 240 })] }).warning(), 0);
  assert.equal(harness({ invoices: [invoice({ jobId: "other-job", amountPaid: 240 })] }).warning(), 1);
});

test("unlinked planner visits never create a deposit work deadline for an unconverted quote", () => {
  assert.equal(harness({ documents: [quote({ jobId: undefined })], jobs: [], planner: [{ id: "unrelated", date: "2099-01-01", status: "Scheduled" }] }).warning(), 0);
});

test("deposit warnings compare required and received payable pennies", () => {
  for (const [net, percentage, paid] of [[10.004, 50, 5], [10.02, 50, 10.01 / 2], [0.001, 20, 0]]) {
    assert.equal(harness({ documents: [quote({ vatEnabled: false, vatRate: 0, items: [{ quantity: 1, unitPrice: net }] })], deposits: [requirement({ value: percentage })], invoices: [invoice({ amountPaid: paid, vatEnabled: false, vatRate: 0 })] }).warning(), 0);
  }
  assert.equal(harness({ invoices: [invoice({ amountPaid: 239.99 })] }).warning(), 1);
});
