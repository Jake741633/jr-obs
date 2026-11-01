import assert from "node:assert/strict";
import * as permissions from "../../lib/cloud/permissions.ts";
import { queueTargetSyncState } from "../../lib/cloud/repository-core.mjs";
import { crm, pipeline, rules, identities, contacts, load, hookRuntime, jsx, nodes, text } from "./follow-up-harness.mjs";
export { nodes, text };
export const customer = (patch = {}) => ({ id: "customer-1", name: "Workshop customer", phone: "07700 900123", email: "customer@example.test", createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z", ...patch });
export const lead = (patch = {}) => ({ id: "lead-1", customerId: "customer-1", name: "Workshop enquiry", phone: "07700 900123", email: "customer@example.test", stage: "New Lead", workRequired: "Entrance lighting", nextAction: "Book a visit", priority: "Normal", estimatedValue: 100, followUpDate: "2026-10-10", notes: "Keep notes", createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z", ...patch });
export const quote = (patch = {}) => ({ id: "quote-1", customerId: "customer-1", title: "Workshop quote", number: "Q-1", type: "Quote", status: "Sent", notes: "Keep quote notes", items: [{ quantity: 1, unitPrice: 100 }], createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z", ...patch });
export const profile = (patch = {}) => ({ id: "profile-1", customerId: "customer-1", nextFollowUpDate: "2026-10-10", followUpReason: "Annual lighting check", reviewStatus: "Received", portalNote: "Keep portal note", createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z", ...patch });

export function harness() {
  const runtime = hookRuntime(), data = { leads: [lead()], leadActivities: [], documents: [], customers: [customer()], profiles: [], interactions: [], settingsStore: [] };
  const ready = Object.fromEntries(Object.keys(data).map(key => [key, true]));
  let mode = "cloud", identityReady = true, identity = { organisationId: "org-1", userId: "user-1", role: "owner" }, clock = Date.parse("2026-10-11T12:00:00Z"), sequence = 0, beforeUpdate;
  const writes = [], attempts = [], queue = [], failures = new Set(), navigator = { onLine: true };
  class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const engine = { ...crm, buildFollowUpCentre(input) { return crm.buildFollowUpCentre({ ...input, now: new TestDate() }); } };
  const scheduling = load("lib/scheduling.ts", {}, { Date: TestDate });
  function commit(kind, collection, item, next) {
    attempts.push({ kind, collection, item });
    if (failures.has(`${collection}:${kind}`)) throw new Error("Device storage or sync queue is full");
    data[collection] = next; writes.push({ kind, collection, item }); return item;
  }
  const store = collection => ({ items: data[collection], isReady: ready[collection], setItems() { assert.fail("Follow-ups must save durably"); },
    createItem(item) { if (data[collection].some(record => record.id === item.id)) throw new Error("Identity already exists"); return commit("create", collection, item, [item, ...data[collection]]); },
    updateItem(id, update) { beforeUpdate?.(collection, id); const index = data[collection].findIndex(record => record.id === id); if (index < 0) throw new Error("Record no longer exists"); const current = data[collection][index], item = update(current); return item === current ? current : commit("update", collection, item, data[collection].map((record, i) => i === index ? item : record)); },
  });
  const identityModule = { useCloudIdentity: () => ({ mode, identity, isReady: identityReady }) };
  const actions = load("components/crm/FollowUpActions.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx }, react: runtime.hooks, "../ui/Button": { Button: "Button" }, "../ui/Card": { Card: "Card" },
    "../../lib/assistantIdentity": identities, "../../lib/cloud/permissions": permissions, "../../lib/cloud/useCloudIdentity": identityModule,
    "../../lib/cloud/repository": { getSyncQueue: () => queue }, "../../lib/cloud/repository-core.mjs": { queueTargetSyncState }, "../../lib/crmPro": engine,
    "../../lib/crmFollowUpSettings": rules, "../../lib/scheduling": scheduling, "../../lib/storage": { makeId: prefix => `${prefix}_${++sequence}` },
  }, { Date: TestDate, navigator });
  const hooks = { leads: "useSalesLeadsCollection", leadActivities: "useLeadActivitiesCollection", documents: "usePricingDocumentsCollection", customers: "useCustomersCollection", profiles: "useCustomerProfilesCollection", interactions: "useCustomerInteractionsCollection", settingsStore: "useCrmFollowUpSettingsCollection" };
  const page = load("app/crm/follow-ups/page.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx }, react: runtime.hooks, "lucide-react": {}, "next/link": { default: "Link" },
    "../../../components/ui/Button": { Button: "Button" }, "../../../components/ui/Card": { Card: "Card" }, "../../../components/ui/PageHeader": { PageHeader: "PageHeader" },
    "../../../components/crm/FollowUpRules": { FollowUpRules: "Rules" }, "../../../components/crm/FollowUpActions": actions,
    "../../../lib/cloud/useCloudIdentity": identityModule, "../../../lib/cloud/coreBusinessCollections": Object.fromEntries(Object.entries(hooks).map(([key, hook]) => [hook, () => store(key)])),
    "../../../lib/crmPro": engine, "../../../lib/leadPipeline": pipeline, "../../../lib/crmFollowUpSettings": rules, "../../../lib/contactLinks": contacts,
  }, { Date: TestDate });
  const render = () => runtime.render(page.default);
  const button = label => nodes(render()).find(n => ["button", "Button"].includes(n.type) && text(n) === label);
  const field = label => nodes(render()).find(n => n.props["aria-label"] === label);
  return { data, ready, writes, attempts, failures, queue, navigator, render, button, field, unmount: runtime.unmount, identities: () => sequence,
    click(label) { const control = button(label); assert.ok(control, label); control.props.onClick(); },
    edit(label, value) { const control = field(label); assert.ok(control, label); control.props.onChange({ target: { value } }); },
    open(channel = "Email") { this.click("Log contact"); if (channel) this.edit("Contact method", channel); },
    clock(value) { clock = Date.parse(value); }, beforeUpdate(fn) { beforeUpdate = fn; }, account(patch) { identity = { ...identity, ...patch }; render(); },
    mode(value) { mode = value; render(); }, signedOut() { identity = null; render(); }, identityReady(value) { identityReady = value; render(); },
  };
}
