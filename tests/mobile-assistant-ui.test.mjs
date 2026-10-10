import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as permissions from "../lib/cloud/permissions.ts";
import * as assistantSignals from "../lib/assistantSignals-core.mjs";
import * as paymentHelpers from "../lib/payments.ts";
import manifest from "../app/manifest.ts";

const owner = { organisationId: "org-a", userId: "owner-a", role: "owner" };
const jsx = (type, props, key) => ({ type, props, key });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);
function compile(path, dependencies, window) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports: mod.exports, module: mod, window,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/link") return { default: "Link" };
      if (name === "lucide-react") return {};
      if (name.endsWith("/permissions")) return permissions;
      if (name.endsWith("/Card")) return { Card: "Card" };
      assert.ok(name in dependencies, name); return dependencies[name];
    },
  });
  return mod.exports;
}
function harness() {
  let snapshot = { identity: owner, mode: "cloud", isReady: true }, ready = true, paymentsReady = true, tasksReady = true;
  let active, cursor;
  const state = new Map(), reads = [], clocks = [];
  const hooks = Object.fromEntries(["Jobs", "PricingDocuments", "Invoices", "Payments", "Planner", "PurchaseLists", "AiReminders", "Certificates", "JobTasks"].map((name) => [`use${name}Collection`, () => { reads.push(snapshot.identity?.organisationId); return { items: [], isReady: ready && (name !== "Payments" || paymentsReady) && (name !== "JobTasks" || tasksReady) }; }]));
  const components = compile("../components/ai/AssistantBriefing.tsx", {
    react: {
      useState(initial) { const index = cursor++; if (!(index in active)) active[index] = typeof initial === "function" ? initial() : initial; const own = active; return [own[index], (value) => { own[index] = typeof value === "function" ? value(own[index]) : value; }]; },
      useMemo: (fn) => fn(), useEffect: () => {},
    },
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => snapshot },
    "./AssistantQuestions": { AssistantQuestions: "AssistantQuestions" },
    "../../lib/cloud/coreBusinessCollections": hooks,
    "../../lib/assistantBriefing": {
      buildAssistantBriefing: (_, now) => { clocks.push(now); return { today: "2026-10-10", actions: Array.from({ length: 10 }, (_, i) => ({ id: `${snapshot.identity.organisationId}:${i}`, title: `${snapshot.identity.organisationId} invoice ${i}`, category: "Money", priority: "Now", reason: "Outstanding payment", nextStep: "Review", href: `/invoices?invoice=${i}`, actionLabel: "Review invoice", evidence: ["Saved amount"] })) }; },
      filterAssistantActions: (actions, focus, query) => actions.filter((item) => (focus === "All" || item.category === focus) && item.title.includes(query)),
    },
  });
  function expand(node, path = "root") {
    if (Array.isArray(node)) return node.map((child, i) => expand(child, `${path}/${i}`));
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") { const key = `${path}/${node.type.name}/${node.key || ""}`; if (!state.has(key)) state.set(key, []); active = state.get(key); cursor = 0; return expand(node.type(node.props), key); }
    return { ...node, props: { ...node.props, children: expand(node.props?.children, `${path}/children`) } };
  }
  const render = () => expand(jsx(components.AssistantBriefing, {}));
  return { reads, render, setSnapshot(value) { snapshot = { ...snapshot, ...value }; }, setReady(value) { ready = value; }, setPaymentsReady(value) { paymentsReady = value; }, setTasksReady(value) { tasksReady = value; }, search(query) { nodes(render()).find((n) => n.type === "input").props.onChange({ target: { value: query } }); }, click(label) { const button = nodes(render()).find((n) => n.type === "button" && text(n).startsWith(label)); assert.ok(button, label); button.props.onClick(); } };
}

test("assistant denies unauthorized or unresolved accounts before reading business collections", () => {
  for (const identity of [null, { ...owner, role: "electrician" }, { ...owner, role: "customer" }]) {
    const h = harness(); h.setSnapshot({ identity });
    assert.match(text(h.render()), /JR AI is available to office accounts/);
    assert.equal(h.reads.length, 0);
  }
  const h = harness(); h.setSnapshot({ isReady: false });
  assert.match(text(h.render()), /Checking your workspace/); assert.equal(h.reads.length, 0);
});

test("office, owner and admin can review the briefing with no mutation controls", () => {
  for (const role of ["owner", "admin", "office"]) {
    const h = harness(); h.setSnapshot({ identity: { ...owner, role } });
    const view = h.render(); assert.match(text(view), /org-a invoice/);
    assert.equal(h.reads.length, 9);
    assert.ok(nodes(view).filter((n) => n.type === "Link").every((n) => permissions.canAccessPath(role, permissions.internalPathForAccess(n.props.href))));
  }
});

test("loading sources suppress stale or incomplete recommendations", () => {
  const h = harness(); h.setReady(false);
  assert.match(text(h.render()), /Gathering your jobs/);
  assert.doesNotMatch(text(h.render()), /org-a invoice|No priority actions/);
});

test("focus, search and progressive reveal work; changing account clears previous search state", () => {
  const h = harness();
  assert.equal(nodes(h.render()).filter((n) => n.type === "details").length, 8);
  h.click("Show more actions"); assert.equal(nodes(h.render()).filter((n) => n.type === "details").length, 10);
  h.search("invoice 9"); assert.equal(nodes(h.render()).filter((n) => n.type === "details").length, 1);
  h.click("Site"); assert.match(text(h.render()), /No matching actions/);
  h.setSnapshot({ identity: { ...owner, organisationId: "org-b" } });
  assert.equal(nodes(h.render()).find((n) => n.type === "input").props.value, "");
  assert.equal(nodes(h.render()).filter((n) => n.type === "details").length, 8);
  assert.doesNotMatch(text(h.render()), /org-a/); assert.match(text(h.render()), /org-b/);
  h.setSnapshot({ isReady: false }); assert.doesNotMatch(text(h.render()), /org-b/);
});

function quickActions(snapshot, pathname = "/") {
  const effects = [], calls = [];
  const dialog = { showModal: () => calls.push("open"), close: () => calls.push("close") };
  const components = compile("../components/mobile/MobileQuickActions.tsx", {
    react: { useRef: () => ({ current: dialog }), useEffect: (fn) => effects.push(fn) },
    "next/navigation": { usePathname: () => pathname },
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => snapshot },
  });
  const wrapper = components.MobileQuickActions();
  return { view: wrapper ? wrapper.type(wrapper.props) : null, key: wrapper?.key, calls, effects };
}

test("quick actions follow account roles and disappear during account checks", () => {
  for (const snapshot of [{ identity: null, isReady: true, mode: "cloud" }, { identity: owner, isReady: false, mode: "cloud" }, { identity: { ...owner, role: "customer" }, isReady: true, mode: "cloud" }]) assert.equal(quickActions(snapshot).view, null);
  for (const role of ["owner", "admin", "office", "electrician"]) {
    const q = quickActions({ identity: { ...owner, role }, isReady: true, mode: "cloud" });
    const links = nodes(q.view).filter((n) => n.type === "Link");
    assert.ok(links.length > 1); assert.ok(links.every((n) => permissions.canAccessPath(role, n.props.href)));
    if (role === "electrician") assert.ok(links.every((n) => n.props.href.startsWith("/field/") || n.props.href === "/menu"));
  }
});

test("the quick sheet opens modally, closes on navigation and remounts for a different account", () => {
  const snapshot = { identity: owner, isReady: true, mode: "cloud" };
  const q = quickActions(snapshot);
  nodes(q.view).find((n) => n.props?.["aria-label"] === "Quick actions").props.onClick();
  nodes(q.view).find((n) => n.type === "Link").props.onClick();
  q.effects.forEach((fn) => fn());
  assert.deepEqual(q.calls, ["open", "close", "close"]);
  assert.equal(nodes(q.view).find((n) => n.type === "dialog").props["aria-labelledby"], "quick-actions-title");
  assert.notEqual(q.key, quickActions({ ...snapshot, identity: { ...owner, userId: "another-user" } }).key);
});

test("installed app shortcuts have same-origin guarded destinations and usable icons", () => {
  const shortcuts = manifest().shortcuts;
  assert.deepEqual(shortcuts.map((item) => item.url), ["/app", "/ai/assistant", "/quotes/mobile"]);
  for (const shortcut of shortcuts) { assert.ok(permissions.internalPathForAccess(shortcut.url)); assert.ok(shortcut.icons[0].src.startsWith("/icons/")); }
  assert.equal(permissions.canAccessPath("electrician", "/ai/assistant"), false);
});

test("assistant waits for ledger readiness before showing payment recommendations", () => {
  const h = harness(); h.setPaymentsReady(false);
  assert.match(text(h.render()), /Gathering your jobs/);
  assert.doesNotMatch(text(h.render()), /org-a invoice/);
  h.setPaymentsReady(true);
  assert.match(text(h.render()), /org-a invoice/);
});

test("Today's Assistant displays ledger-aware per-invoice amounts and their total", () => {
  const mod = compile("../components/ai/TodaysAssistant.tsx", {
    react: { useState: (initial) => [initial, () => {}] },
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ identity: owner, mode: "cloud" }) },
    "../../lib/assistantSignals-core.mjs": assistantSignals,
    "../../lib/payments": paymentHelpers,
    "../ui/Button": { Button: "Button" }, "../ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" },
  });
  const snapshot = { today: "2026-10-10", todaysJobs: [], todaysPlanner: [], quoteFollowUps: [], dueReminders: [], customerFollowUps: [], urgentActions: [], overdueInvoices: [{ id: "i1", number: "INV-1", amountPaid: 40, items: [{ quantity: 2, unitPrice: 100 }], vatEnabled: true, vatRate: 20 }], payments: [{ invoiceId: "i1", type: "Payment", amount: 100 }] };
  const view = mod.TodaysAssistant({ snapshot, customers: [], onAddReminder() {}, onToggleReminder() {} });
  assert.equal((text(view).match(/£140\.00/g) || []).length, 2);
  assert.doesNotMatch(text(view), /£200\.00|£100\.00/);
});


test("assistant waits for task readiness before mounting questions or showing priorities", () => {
  const h = harness(); h.setTasksReady(false);
  assert.match(text(h.render()), /Gathering your jobs/);
  assert.equal(nodes(h.render()).some((n) => n.type === "AssistantQuestions"), false);
  h.setTasksReady(true);
  const view = h.render();
  assert.equal(nodes(view).some((n) => n.type === "AssistantQuestions"), true);
  assert.ok(nodes(view).find((n) => n.type === "AssistantQuestions").props.records.tasks);
  h.click("Tasks"); assert.match(text(h.render()), /No matching actions/);
});
