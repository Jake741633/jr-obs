import assert from "node:assert/strict";
import * as permissions from "../../lib/cloud/permissions.ts";
import { queueTargetSyncState } from "../../lib/cloud/repository-core.mjs";
import { crm, contacts, identities, load, hookRuntime, jsx, nodes, text } from "./follow-up-harness.mjs";
export { nodes, text };
export const customer = (patch = {}) => ({ id: "customer-1", name: "Workshop customer", phone: "07700 900123", email: "customer@example.test", address: "Epsom", notes: "", createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z", ...patch });
export const builder = (patch = {}) => ({ id: "builder-1", companyName: "Workshop contractor", contactName: "Site manager", phone: "07700 900124", email: "builder@example.test", address: "Guildford", notes: "", createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z", ...patch });
export const lead = (patch = {}) => ({ id: "lead-1", name: "Workshop", company: "Contractor", phone: "07700 900123", email: "work@example.test", stage: "New Lead", source: "Referral", priority: "Normal", estimatedValue: 100, siteAddress: "Epsom High Street", workRequired: "Entrance lighting", nextAction: "Book a visit", followUpDate: "2026-10-10", notes: "Keep notes", createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z", ...patch });

export function harness(query = "") {
  const runtime = hookRuntime(), frames = new Map();
  const data = { leads: [lead()], activities: [], customers: [customer()], builders: [builder()], documents: [] }, ready = Object.fromEntries(Object.keys(data).map(key => [key, true]));
  let mode = "cloud", identityReady = true, identity = { organisationId: "org-1", userId: "user-1", role: "owner" }, clock = Date.parse("2026-10-11T12:00:00Z"), sequence = 0, frameId = 0, beforeUpdate;
  const writes = [], attempts = [], queue = [], failures = new Set(), navigator = { onLine: true };
  class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const scheduling = load("lib/scheduling.ts", {}, { Date: TestDate });
  function commit(kind, collection, item, next) {
    attempts.push({ kind, collection, item });
    if (failures.has(`${collection}:${kind}`)) throw new Error("Device storage or sync queue is full");
    data[collection] = next; writes.push({ kind, collection, item }); return item;
  }
  const store = collection => ({ items: data[collection], isReady: ready[collection], setItems() { assert.fail("Lead actions must save durably"); }, remove() { assert.fail("Unrelated deletion"); },
    createItem(item) { if (data[collection].some(record => record.id === item.id)) throw new Error("Identity already exists"); return commit("create", collection, item, [item, ...data[collection]]); },
    updateItem(id, update) { beforeUpdate?.(collection, id); const index = data[collection].findIndex(record => record.id === id); if (index < 0) throw new Error("Record no longer exists"); const current = data[collection][index], item = update(current); return item === current ? current : commit("update", collection, item, data[collection].map((record, i) => i === index ? item : record)); },
  });
  const identityModule = { useCloudIdentity: () => ({ mode, identity, isReady: identityReady }) };
  const actions = load("components/crm/LeadPipelineActions.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx }, react: runtime.hooks, "../ui/Button": { Button: "Button" }, "../ui/Card": { Card: "Card" }, "../ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" },
    "../../lib/assistantIdentity": identities, "../../lib/cloud/permissions": permissions, "../../lib/cloud/useCloudIdentity": identityModule,
    "../../lib/cloud/repository": { getSyncQueue: () => queue }, "../../lib/cloud/repository-core.mjs": { queueTargetSyncState }, "../../lib/crmPro": crm,
    "../../lib/scheduling": scheduling, "../../lib/storage": { makeId: prefix => `${prefix}_${++sequence}` },
  }, { Date: TestDate, navigator });
  const hooks = { leads: "useSalesLeadsCollection", activities: "useLeadActivitiesCollection", documents: "usePricingDocumentsCollection", customers: "useCustomersCollection", builders: "useBuildersCollection" };
  const page = load("app/leads/page.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx }, react: runtime.hooks, "lucide-react": {}, "next/link": { default: "Link" },
    "../../components/ui/Button": { Button: "Button" }, "../../components/ui/Card": { Card: "Card" }, "../../components/ui/PageHeader": { PageHeader: "PageHeader" }, "../../components/crm/LeadPipelineActions": actions,
    "../../lib/cloud/useCloudIdentity": identityModule, "../../lib/cloud/coreBusinessCollections": Object.fromEntries(Object.entries(hooks).map(([key, hook]) => [hook, () => store(key)])),
    "../../lib/crmPro": crm, "../../lib/contactLinks": contacts, "../../lib/assistantIdentity": identities, "../../lib/scheduling": scheduling, "../../lib/storage": { makeId() { assert.fail("Legacy write path"); } },
  }, { Date: TestDate, URLSearchParams, window: { location: { search: query }, requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); }, confirm() { assert.fail("Unrelated confirmation"); } } });
  const paint = () => runtime.render(page.default);
  const render = () => { let view = paint(); if (frames.size) { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); view = paint(); } return view; };
  const button = label => nodes(render()).flatMap(n => n.type === "PageHeader" ? [n, ...nodes(n.props.action)] : [n]).find(n => ["Button", "button"].includes(n.type) && text(n) === label);
  const field = label => nodes(render()).find(n => n.props["aria-label"] === label);
  const form = () => nodes(render()).find(n => n.type === "form");
  return { data, ready, writes, attempts, failures, queue, navigator, render, paint, button, field, form, unmount: runtime.unmount,
    click(label) { const control = button(label); assert.ok(control, label); control.props.onClick(); },
    edit(label, value) { const control = field(label); assert.ok(control, label); control.props.onChange({ target: { value } }); },
    submit() { const control = form(); assert.ok(control, "Lead form"); control.props.onSubmit({ preventDefault() {} }); },
    capture() { this.click("New lead"); this.edit("Customer/contact", "New enquiry"); this.edit("Work required", "Outside lights"); },
    stage(target = "Contacted") { this.edit("Stage for Workshop", target); },
    clock(value) { clock = Date.parse(value); }, beforeUpdate(fn) { beforeUpdate = fn; }, account(patch) { identity = { ...identity, ...patch }; render(); },
    mode(value) { mode = value; render(); }, signedOut() { identity = null; render(); }, identityReady(value) { identityReady = value; render(); },
  };
}
