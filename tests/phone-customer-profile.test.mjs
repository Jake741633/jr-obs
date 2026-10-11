import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as identities from "../lib/assistantIdentity.ts";
import * as contactLinks from "../lib/contactLinks.ts";
import * as assistantLinks from "../lib/assistantJobLink.ts";
import { customer, nodes, text } from "./helpers/customer-page-harness.mjs";

const jsx = (type, props) => ({ type, props });
function load(path, dependencies) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module: mod, exports: mod.exports, Intl, Date, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return mod.exports;
}
const hooks = { customers: "useCustomersCollection", builders: "useBuildersCollection", jobs: "useJobsCollection", documents: "usePricingDocumentsCollection", invoices: "useInvoicesCollection", payments: "usePaymentsCollection", profiles: "useCustomerProfilesCollection", interactions: "useCustomerInteractionsCollection", leads: "useSalesLeadsCollection", variations: "useJobVariationsCollection", certificates: "useCertificatesCollection", jobDocuments: "useJobDocumentsCollection", reminders: "useAiRemindersCollection", jobTimeline: "useJobTimelineCollection", diaries: "useSiteDiariesCollection" };
const record = (id, patch = {}) => ({ id, customerId: "customer-1", title: id, type: "Quote", number: id, status: "Draft", siteAddress: "High Street", updatedAt: "2026-10-11T09:00:00Z", value: 100, amountPaid: 0, ...patch });
const history = (id, patch = {}) => ({ id, customerId: "customer-1", kind: "Job", title: `Visit ${id}`, detail: "Workshop rear entrance", occurredAt: "2026-10-11T09:00:00Z", href: `/jobs/${id}`, ...patch });
function harness() {
  let cursor = 0, blurred = 0, customerId = "customer-1", helperCalls = 0;
  const slots = [], ready = Object.fromEntries(Object.keys(hooks).map(key => [key, true]));
  const data = Object.fromEntries(Object.keys(hooks).map(key => [key, []])); data.customers = [customer()]; data.history = [];
  const failWrite = () => { throw new Error("Customer browsing must not save records or open a composer"); };
  const deps = {
    "react/jsx-runtime": { jsx, jsxs: jsx }, react: { useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === "function" ? value() : value; return [slots[i], next => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; } },
    "next/link": { default: "Link" }, "next/navigation": { useParams: () => ({ id: customerId }) }, "lucide-react": {},
    "../../../components/crm/CustomerQuickActions": { CustomerQuickActions: "QuickActions" }, "../../../components/ui/Card": { Card: "Card" }, "../../../components/ui/StatusBadge": { StatusBadge: "StatusBadge" },
    "../../../lib/cloud/coreBusinessCollections": Object.fromEntries(Object.entries(hooks).map(([key, hook]) => [hook, () => ({ items: data[key], isReady: ready[key], setItems: failWrite, createItem: failWrite, updateItem: failWrite, removeItem: failWrite })])),
    "../../../lib/crmPro": { buildCustomerIntelligence() { helperCalls++; return { totalSpend: 0, outstandingBalance: 0, lifetimeValue: 0, averagePaymentDays: null, repeatCustomerScore: 0, completedJobs: 0, acceptedQuotes: 0, builderRelationship: "None", referralSource: "None", reviewStatus: "Not requested" }; }, buildCustomerTimeline({ customer: selected }) { return data.history.filter(item => item.customerId === selected.id); } },
    "../../../lib/storage": { makeId: failWrite }, "../../../lib/workflow": { invoiceTotal: () => 100, pricingDocumentTotal: () => 100 },
    "../../../lib/assistantIdentity": identities, "../../../lib/contactLinks": contactLinks, "../../../lib/assistantJobLink": assistantLinks,
  };
  const page = load("../app/customers/[id]/page.tsx", deps).default;
  const render = () => { cursor = 0; return page(); };
  const section = label => nodes(render()).find(n => n.type === "section" && n.props["aria-label"] === label);
  const button = label => nodes(render()).find(n => n.type === "button" && text(n).startsWith(label));
  const search = () => nodes(render()).find(n => n.type === "input" && n.props.type === "search");
  return { data, ready, render, section, button, helperCalls: () => helperCalls, blurred: () => blurred,
    cards(label) { return nodes(section(label)).filter(n => n.type === "Card"); },
    click(label) { const control = button(label); assert.ok(control, label); control.props.onClick(); },
    search(value) { search().props.onChange({ target: { value } }); },
    kind(value) { nodes(render()).find(n => n.type === "select").props.onChange({ target: { value } }); },
    enter() { search().props.onKeyDown({ key: "Enter", preventDefault() {}, currentTarget: { blur() { blurred++; } } }); },
    route(value) { customerId = value; },
  };
}

test("customer profile reveals independent groups of four records while retaining full counts", () => {
  const h = harness(); for (const name of ["jobs", "documents", "invoices"]) h.data[name] = Array.from({ length: 11 }, (_, i) => record(`${name}-${i}`));
  for (const label of ["Customer jobs", "Customer quotes and estimates", "Customer invoices"]) assert.equal(h.cards(label).length, 4);
  assert.match(text(h.render()), /Jobs \(11\)/); assert.match(text(h.render()), /Estimates and quotes \(11\)/); assert.match(text(h.render()), /Invoices \(11\)/);
  h.click("Show more jobs"); assert.equal(h.cards("Customer jobs").length, 8); assert.equal(h.cards("Customer invoices").length, 4);
  h.click("Show more jobs"); assert.equal(h.cards("Customer jobs").length, 11); assert.equal(h.button("Show more jobs"), undefined);
  h.click("Show more quotes and estimates"); h.click("Show more invoices"); assert.equal(h.cards("Customer quotes and estimates").length, 8); assert.equal(h.cards("Customer invoices").length, 8);
});

test("customer history filters words across visible activity and types with eight-card reveal", () => {
  const h = harness(); h.data.history = Array.from({ length: 21 }, (_, i) => history(`h-${i}`, { kind: i < 12 ? "Invoice" : "Job", title: i < 12 ? `Invoice ${i}` : `Visit ${i}`, status: i < 12 ? "Sent" : "Scheduled", value: 98765 }));
  assert.equal(h.cards("Customer history").length, 8); h.click("Show more history"); assert.equal(h.cards("Customer history").length, 16);
  h.search(" REAR  SENT "); assert.match(text(h.section("Customer history")), /Showing 8 of 12 matching activities/); assert.equal(h.cards("Customer history").length, 8);
  h.click("Show more history"); assert.equal(h.cards("Customer history").length, 12); h.kind("Job"); assert.match(text(h.section("Customer history")), /No matching activity/);
  h.click("Clear history filters"); assert.equal(h.cards("Customer history").length, 8); assert.match(text(h.section("Customer history")), /of 21 matching activities/);
  h.search("98765"); assert.match(text(h.section("Customer history")), /Showing 0 of 0/); h.enter(); assert.equal(h.blurred(), 1);
});

test("customer profile changes reset browsing and never show another customer's history or records", () => {
  const h = harness(); h.data.customers.push(customer({ id: "customer-2", name: "Other customer" }));
  h.data.jobs = Array.from({ length: 10 }, (_, i) => record(`j-${i}`)); h.data.documents = [record("own-quote"), record("other-quote", { customerId: "customer-2" })];
  h.data.history = [history("own-history"), history("other-history", { customerId: "customer-2", detail: "Other customer's event" })];
  h.click("Show more jobs"); h.search("Workshop"); h.kind("Job"); h.route("customer-2");
  assert.match(text(h.render()), /Other customer/); assert.doesNotMatch(text(h.section("Customer history")), /own-history/);
  assert.equal(nodes(h.render()).find(n => n.type === "input").props.value, ""); assert.equal(nodes(h.render()).find(n => n.type === "select").props.value, "All");
  assert.doesNotMatch(text(h.section("Customer quotes and estimates")), /own-quote/); assert.match(text(h.section("Customer quotes and estimates")), /other-quote/);
  h.route("customer-1"); const returned = h.render();
  assert.equal(nodes(returned).find(n => n.type === "input").props.value, ""); assert.equal(nodes(returned).find(n => n.type === "select").props.value, "All"); assert.equal(h.cards("Customer jobs").length, 4);
});

test("customer detail requires ready sources and one exact nonblank saved identity", () => {
  for (const state of ["loading", "missing", "duplicate", "blank"]) {
    const h = harness(); if (state === "loading") h.ready.jobs = false; if (state === "missing") h.data.customers = []; if (state === "duplicate") h.data.customers.push(customer({ name: "Other person" })); if (state === "blank") { h.route(" "); h.data.customers = [customer({ id: " " })]; }
    const view = h.render(); assert.equal(nodes(view).find(n => n.type === "QuickActions"), undefined); assert.equal(h.helperCalls(), 0); assert.match(text(view), state === "loading" ? /Loading customer CRM/ : /Customer unavailable/);
  }
});

test("phone section shortcuts and overview disclosure retain exact job quote invoice and JR AI links", () => {
  const h = harness(), id = "saved /?#+ &"; h.data.jobs = [record(id)]; h.data.documents = [record(id)]; h.data.invoices = [record(id)];
  const view = h.render(), nav = nodes(view).find(n => n.type === "nav");
  for (const link of nodes(nav).filter(n => n.type === "a")) { assert.ok(nodes(view).some(n => `#${n.props.id}` === link.props.href)); assert.match(link.props.className, /min-h-12/); }
  const details = nodes(view).find(n => n.type === "details"); assert.equal(details.props.open, undefined); assert.match(text(details), /Customer overview and relationship metrics/);
  assert.ok(nodes(view).some(n => n.props.href === `/jobs/${encodeURIComponent(id)}`)); assert.ok(nodes(view).some(n => n.props.href === `/quotes/${encodeURIComponent(id)}`)); assert.ok(nodes(view).some(n => n.props.href === `/invoices?invoice=${encodeURIComponent(id)}`)); assert.ok(nodes(view).some(n => n.props.href === assistantLinks.assistantJobBriefingHref(id)));
});

test("customer dock contacts share validated call text and email links without message headers", () => {
  const component = load("../components/crm/CustomerQuickActions.tsx", { "react/jsx-runtime": { jsx, jsxs: jsx }, "next/link": { default: "Link" }, "lucide-react": {}, "../../lib/contactLinks": contactLinks }).CustomerQuickActions;
  const actions = saved => nodes(component({ customer: saved, onMarkComplete() { assert.fail(); }, onRequestReview() { assert.fail(); } })).filter(n => typeof n.type === "function" && n.props.label).map(n => n.type(n.props));
  const normal = actions(customer({ phone: "+44 7700 900123", email: "customer+work@example.test" }));
  const get = (list, label) => list.find(n => text(n) === label);
  assert.equal(get(normal, "Call").props.href, "tel:+447700900123"); assert.equal(get(normal, "Text").props.href, "sms:+447700900123"); assert.equal(get(normal, "Email").props.href, "mailto:customer%2Bwork@example.test");
  const invalid = actions(customer({ phone: "07700 900123?body=Injected", email: "customer@example.test?bcc=other@example.test" }));
  for (const label of ["Call", "Text", "Email", "Review"]) { assert.equal(get(invalid, label).type, "button"); assert.equal(get(invalid, label).props.disabled, true); }
  const page = harness(); page.data.customers = [customer({ phone: "07700 900123 ext 4", email: "unsupported" })]; const view = page.render(); assert.match(text(view), /Review phone format to call or text/); assert.match(text(view), /Review email format to compose/);
  nodes(view).find(n => n.type === "QuickActions").props.onRequestReview(); // Invalid contacts cannot prepare or log a review request.
});
