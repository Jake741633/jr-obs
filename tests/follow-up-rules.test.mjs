import assert from "node:assert/strict";
import test from "node:test";
import * as permissions from "../lib/cloud/permissions.ts";
import { queueTargetSyncState } from "../lib/cloud/repository-core.mjs";
import { crm, rules, load, hookRuntime, jsx, nodes, text } from "./helpers/follow-up-harness.mjs";

const saved = (patch = {}) => ({ ...crm.defaultCrmFollowUpSettings, id: "saved-rules", updatedAt: "2026-10-10T10:00:00Z", ...patch });
function harness(initial = []) {
  const runtime = hookRuntime(), data = { items: initial, ready: true }, attempts = [], writes = [], failures = new Set(), queue = [];
  let identity = { organisationId: "org-1", userId: "user-1", role: "owner" }, mode = "cloud", identityReady = true, beforeUpdate;
  function commit(kind, item, next) { attempts.push({ kind, item }); if (failures.has(kind)) throw new Error("Storage or sync queue is full"); data.items = next; writes.push({ kind, item }); return item; }
  const dependencies = {
    "react/jsx-runtime": { jsx, jsxs: jsx }, react: runtime.hooks, "lucide-react": {}, "../ui/Button": { Button: "Button" }, "../ui/FormField": { InputField: "InputField" },
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ identity, mode, isReady: identityReady }) }, "../../lib/cloud/permissions": permissions,
    "../../lib/cloud/repository": { getSyncQueue: () => queue }, "../../lib/cloud/repository-core.mjs": { queueTargetSyncState }, "../../lib/crmFollowUpSettings": rules,
  };
  const component = load("components/crm/FollowUpRules.tsx", dependencies, { navigator: { onLine: true } }).FollowUpRules;
  const render = () => runtime.render(component, { store: { items: data.items, isReady: data.ready, setItems() { assert.fail("Rules must use durable writes"); },
    createItem(item) { if (data.items.some(record => record.id === item.id)) throw new Error("Identity exists"); return commit("create", item, [item, ...data.items]); },
    updateItem(id, update) { beforeUpdate?.(); const index = data.items.findIndex(record => record.id === id); if (index < 0) throw new Error("Record unavailable"); const item = update(data.items[index]); return commit("update", item, data.items.map((record, i) => i === index ? item : record)); },
  } });
  const button = label => nodes(render()).find(n => n.type === "Button" && text(n) === label);
  const field = label => nodes(render()).find(n => n.type === "InputField" && n.props.label === label);
  return { data, attempts, writes, failures, queue, render, button, unmount: runtime.unmount,
    field(label, value) { const control = field(label); assert.ok(control, label); if (value !== undefined) control.props.onChange({ target: { value } }); return control; },
    click(label) { const control = button(label); assert.ok(control, label); control.props.onClick(); },
    account(patch) { identity = { ...identity, ...patch }; render(); }, mode(value) { mode = value; render(); }, signedOut() { identity = null; render(); }, loadingIdentity() { identityReady = false; render(); }, beforeUpdate(fn) { beforeUpdate = fn; },
  };
}

test("rule drafts do not alter defaults or saved values until a durable save succeeds", () => {
  const h = harness(); assert.match(text(h.render()), /Default rules apply/); h.field("No response (days)", "7"); assert.equal(h.data.items.length, 0); assert.equal(h.attempts.length, 0);
  h.failures.add("create"); h.click("Save and recalculate"); assert.equal(h.field("No response (days)").props.value, "7"); assert.equal(h.data.items.length, 0); assert.match(text(h.render()), /could not be saved.*edits are retained/);
  const first = h.attempts[0].item; h.field("Quote ageing (days)", "5"); h.failures.clear(); const repeat = h.button("Save and recalculate").props.onClick; repeat(); repeat();
  assert.equal(h.writes.length, 1); assert.equal(h.data.items[0].id, first.id); assert.equal(h.data.items[0].noResponseDays, 7); assert.equal(h.data.items[0].quoteAgeDays, 5); assert.match(text(h.render()), /saved on this device.*Check sync/);
  assert.equal(h.button("Save and recalculate").props.disabled, true);
});

test("failed rule updates preserve drafts and current unrelated record metadata", () => {
  const h = harness([saved({ officeNote: "Original" })]); h.field("High value threshold (£)", "1234.56"); h.failures.add("update"); h.click("Save and recalculate");
  assert.equal(h.data.items[0].highValueThreshold, 1000); assert.equal(h.field("High value threshold (£)").props.value, "1234.56");
  h.data.items = [{ ...h.data.items[0], officeNote: "Newer metadata" }]; h.failures.clear(); h.click("Save and recalculate");
  assert.equal(h.data.items[0].highValueThreshold, 1234.56); assert.equal(h.data.items[0].officeNote, "Newer metadata"); assert.equal(h.data.items[0].id, "saved-rules");
  h.field("No response (days)", "4"); h.click("Save and recalculate"); assert.equal(h.writes.length, 2); assert.equal(h.data.items[0].noResponseDays, 4);
  h.data.items = [{ ...h.data.items[0], noResponseDays: 12 }]; assert.equal(h.field("No response (days)").props.value, "12");
});

test("rules reject blank fractional unbounded and nonfinite values instead of clamping or saving NaN", () => {
  for (const label of ["Quote ageing (days)", "No response (days)", "Lost opportunity window"]) for (const value of ["", " ", "0", "-1", "1.5", "1e2", "Infinity", "NaN", "3651", "999999999999999999999999"]) {
    const h = harness(); h.field(label, value); h.click("Save and recalculate"); assert.equal(h.attempts.length, 0, `${label}: ${value}`); assert.equal(h.field(label).props.value, value);
  }
  for (const value of ["", "-1", "1.234", "Infinity", "1e9", "99999999999999999999999"]) { const h = harness(); h.field("High value threshold (£)", value); h.click("Save and recalculate"); assert.equal(h.attempts.length, 0, value); }
  const h = harness(); h.field("High value threshold (£)", "0"); h.field("Lost opportunity window", "3650"); h.click("Save and recalculate"); assert.equal(h.data.items[0].highValueThreshold, 0); assert.equal(h.data.items[0].lostOpportunityDays, 3650);
});

test("saved-rule changes require Use saved values including changes just before the storage callback", () => {
  for (const boundary of ["render", "storage"]) for (const patch of [{ noResponseDays: 9 }, { updatedAt: "replacement" }]) {
    const h = harness([saved()]); h.field("No response (days)", "7"); const save = h.button("Save and recalculate").props.onClick;
    const change = () => { h.data.items = [saved(patch)]; };
    if (boundary === "render") { change(); h.render(); h.click("Save and recalculate"); } else { h.beforeUpdate(change); save(); }
    assert.equal(h.writes.length, 0); assert.equal(h.field("No response (days)").props.value, "7"); assert.match(text(h.render()), /saved rules changed/);
    h.beforeUpdate(); h.click("Use saved values"); assert.equal(h.field("No response (days)").props.value, String(patch.noResponseDays ?? 2)); h.field("No response (days)", "8"); h.click("Save and recalculate"); assert.equal(h.data.items[0].noResponseDays, 8);
  }
});

test("ambiguous missing and newly created singleton identities never replace the settings collection", () => {
  for (const items of [[saved(), saved({ id: "other" })], [saved(), saved()], [saved({ id: " " })]]) { const h = harness(items); assert.equal(h.button("Save and recalculate"), undefined); assert.match(text(h.render()), /review|Review/); assert.equal(h.writes.length, 0); }
  for (const items of [[], [saved({ id: "other" })], [saved(), saved()]]) {
    const h = harness([saved()]); h.field("No response (days)", "8"); const callback = h.button("Save and recalculate").props.onClick; h.data.items = items; h.render(); callback(); assert.equal(h.writes.length, 0);
  }
  const h = harness(); h.field("No response (days)", "8"); h.data.items = [saved()]; h.click("Save and recalculate"); assert.equal(h.writes.length, 0); assert.match(text(h.render()), /saved since this draft/); h.click("Use saved values"); assert.equal(h.field("No response (days)").props.value, "2");
});

test("invalid saved values can be repaired deliberately while the identity is preserved", () => {
  for (const patch of [{ noResponseDays: NaN }, { quoteAgeDays: Infinity }, { lostOpportunityDays: 0 }, { highValueThreshold: -5 }, { noResponseDays: "7" }]) {
    const h = harness([saved(patch)]); assert.match(text(h.render()), /saved values need review/);
    for (const [label, value] of [["Quote ageing (days)", "3"], ["No response (days)", "2"], ["Lost opportunity window", "60"], ["High value threshold (£)", "1000"]]) h.field(label, value);
    h.click("Save and recalculate"); assert.equal(h.writes.length, 1); assert.equal(h.data.items[0].id, "saved-rules"); assert.equal(rules.followUpRulesError(h.data.items[0]), "");
  }
});

test("rule saves inspect fresh sync state and distinguish blocked conflicts from pending or offline work", () => {
  for (const existing of [true, false]) for (const state of ["Failed", "Conflict", "Pending", "Offline"]) {
    const h = harness(existing ? [saved()] : []); h.field("No response (days)", "8"); const callback = h.button("Save and recalculate").props.onClick;
    h.queue.push({ table: "cloud_collections", collectionKey: "jr-os-crm-follow-up-settings", sourceId: existing ? "saved-rules" : crm.defaultCrmFollowUpSettings.id, state }); callback();
    assert.equal(h.writes.length, ["Failed", "Conflict"].includes(state) ? 0 : 1);
    if (!h.writes.length) { h.queue.length = 0; h.click("Save and recalculate"); assert.equal(h.writes.length, 1); }
  }
});

test("older save edit and discard callbacks cannot overwrite a newer rule draft", () => {
  const h = harness([saved()]); const oldSave = h.button("Save and recalculate").props.onClick, oldEdit = h.field("No response (days)").props.onChange;
  h.field("No response (days)", "8"); const oldDiscard = h.button("Use saved values").props.onClick; h.field("Quote ageing (days)", "9"); oldSave(); oldEdit({ target: { value: "99" } }); oldDiscard();
  assert.equal(h.writes.length, 0); assert.equal(h.field("Quote ageing (days)").props.value, "9"); assert.equal(h.field("No response (days)").props.value, "8");
  h.click("Use saved values"); oldSave(); assert.equal(h.writes.length, 0); h.click("Save and recalculate"); assert.equal(h.writes.length, 1);
});

test("rule permissions and account readiness guard stale callbacks and reset account drafts", () => {
  const changes = [h => h.account({ role: "electrician" }), h => h.account({ role: "customer" }), h => h.account({ role: "unknown" }), h => h.account({ organisationId: "org-2" }), h => h.account({ userId: "user-2" }), h => h.account({ customerSourceId: "other" }), h => h.signedOut(), h => h.mode("local"), h => h.loadingIdentity(), h => h.unmount(), h => { h.data.ready = false; h.render(); }, h => { h.account({ organisationId: "org-2" }); h.account({ organisationId: "org-1" }); }];
  for (const change of changes) { const h = harness([saved()]); h.field("No response (days)", "8"); const callback = h.button("Save and recalculate").props.onClick; change(h); callback(); assert.equal(h.writes.length, 0); }
  for (const role of ["owner", "admin", "office"]) { const h = harness(); h.account({ role }); h.field("No response (days)", "8"); h.click("Save and recalculate"); assert.equal(h.writes.length, 1); }
  for (const role of ["electrician", "customer", "unknown"]) { const h = harness(); h.account({ role }); assert.equal(h.field("No response (days)").props.disabled, true); h.click("Save and recalculate"); assert.equal(h.writes.length, 0); }
  const h = harness(); h.mode("local"); h.signedOut(); h.click("Save and recalculate"); assert.equal(h.writes.length, 1);
});

test("loading retains edits, while switching away and back starts with saved account values", () => {
  const h = harness([saved()]); h.field("No response (days)", "8"); h.data.ready = false; assert.equal(h.button("Save and recalculate"), undefined); h.data.ready = true; assert.equal(h.field("No response (days)").props.value, "8");
  h.account({ organisationId: "org-2" }); assert.equal(h.field("No response (days)").props.value, "2"); h.field("No response (days)", "9"); h.account({ organisationId: "org-1" }); assert.equal(h.field("No response (days)").props.value, "2");
});
