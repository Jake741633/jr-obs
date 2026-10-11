import assert from "node:assert/strict";
import test from "node:test";
import { harness, lead, activity, customer, nodes, text } from "./helpers/lead-actions-harness.mjs";

const open = (h, kind) => { if (kind === "activity") h.activity("Call"); else { h.data.leads = [lead({ stage: "Lost", cancelledReason: "Keep cancellation" })]; h.outcome(); } };
const saveLabel = kind => kind === "activity" ? "Save lead activity" : "Save outcome reason";
const fieldLabel = kind => kind === "activity" ? "Lead activity note" : "Lead outcome reason";

test("explicit contact activity saves the exact channel, lead update then history without changing stage or follow-up date", () => {
  for (const channel of ["Call", "Text", "Email", "WhatsApp", "Site visit"]) {
    const h = harness(); h.activity(channel, "  Agreed a site visit  "); assert.equal(h.writes.length, 0); const save = h.button("Save lead activity").props.onClick; save(); save();
    assert.equal(h.writes.length, 2); assert.equal(h.writes[0].collection, "leads"); assert.equal(h.writes[1].collection, "activities");
    assert.equal(h.data.activities[0].type, channel); assert.equal(h.data.activities[0].summary, "Agreed a site visit"); assert.equal(h.data.activities[0].leadId, "lead-1"); assert.equal(h.data.leads[0].stage, "New Lead"); assert.equal(h.data.leads[0].followUpDate, "2026-10-10"); assert.equal(h.data.leads[0].nextAction, "Follow up"); assert.equal(h.data.leads[0].lastContactAt, "2026-10-11T12:00:00.000Z");
    assert.match(text(h.render()), /saved on this device/);
  }
});

test("internal notes preserve contact time and next action; contact on closed leads preserves their next action", () => {
  for (const stage of ["New Lead", "Accepted", "Lost", "Completed", "Cancelled"]) {
    const h = harness(); h.data.leads = [lead({ stage, lastContactAt: "previous-contact", completedAt: "previous-completion", nextAction: "Keep the agreed action" })]; h.activity("Note"); h.click("Save lead activity");
    assert.equal(h.data.leads[0].lastContactAt, "previous-contact"); assert.equal(h.data.leads[0].completedAt, "previous-completion"); assert.equal(h.data.leads[0].nextAction, "Keep the agreed action");
    if (stage !== "New Lead") { h.activity("Call"); h.click("Save lead activity"); assert.equal(h.data.leads[0].nextAction, "Keep the agreed action"); assert.equal(h.data.leads[0].stage, stage); }
  }
});

test("activity requires an explicit supported type and a nonblank description", () => {
  for (const [channel, summary] of [["", "Called customer"], ["Note", "   "]]) { const h = harness(); h.activity(channel, summary); h.click("Save lead activity"); assert.equal(h.writes.length, 0); assert.match(text(h.render()), /Choose the activity type and describe/); }
  const h = harness(); h.activity(""); h.edit("Lead activity type", "Stage change"); assert.equal(h.field("Lead activity type").props.value, ""); h.click("Save lead activity"); assert.equal(h.writes.length, 0);
});

test("outcomes save only the current Lost or Cancelled reason and its history", () => {
  for (const stage of ["Lost", "Cancelled"]) {
    const h = harness(); h.data.leads = [lead({ stage, lostReason: "Old loss", cancelledReason: "Old cancellation", lastContactAt: "previous-contact" })]; h.outcome("  Timing changed  "); h.click("Save outcome reason");
    assert.equal(h.data.leads[0][stage === "Lost" ? "lostReason" : "cancelledReason"], "Timing changed"); assert.equal(h.data.leads[0][stage === "Lost" ? "cancelledReason" : "lostReason"], stage === "Lost" ? "Old cancellation" : "Old loss"); assert.equal(h.data.leads[0].stage, stage); assert.equal(h.data.leads[0].lastContactAt, "previous-contact"); assert.equal(h.data.leads[0].nextAction, "Book a visit"); assert.equal(h.data.activities[0].summary, `${stage} reason: Timing changed`);
  }
});

test("blank outcome reasons cannot erase evidence and unchanged reasons do not add duplicate history", () => {
  const h = harness(); h.data.leads = [lead({ stage: "Lost", lostReason: "Budget changed" })]; h.click("Edit outcome reason"); assert.equal(h.field("Lead outcome reason").props.value, "Budget changed"); h.edit("Lead outcome reason", "  "); h.click("Save outcome reason"); assert.equal(h.writes.length, 0);
  h.edit("Lead outcome reason", "  Budget changed  "); h.click("Save outcome reason"); assert.equal(h.writes.length, 0); assert.match(text(h.render()), /already saved/); assert.equal(h.field("Lead outcome reason"), undefined);
});

test("failed lead updates retain activity and outcome drafts, permit correction and invalidate stale callbacks", () => {
  for (const kind of ["activity", "outcome"]) {
    const h = harness(); open(h, kind); h.failures.add("leads:update"); h.click(saveLabel(kind)); assert.equal(h.writes.length, 0); assert.match(text(h.render()), /draft is retained/);
    const oldSave = h.button(saveLabel(kind)).props.onClick, oldEdit = h.field(fieldLabel(kind)).props.onChange; h.edit(fieldLabel(kind), "Corrected note"); oldSave(); oldEdit({ target: { value: "Old note" } }); assert.equal(h.attempts.length, 1);
    h.failures.clear(); h.click(saveLabel(kind)); assert.equal(h.writes.length, 2); assert.match(h.data.activities[0].summary, /Corrected note/); assert.doesNotMatch(h.data.activities[0].summary, /Old note/);
  }
});

test("unchanged activity and outcome retries preserve prepared timestamps after storage failure", () => {
  for (const kind of ["activity", "outcome"]) {
    const h = harness(); open(h, kind); h.failures.add("leads:update"); h.click(saveLabel(kind)); const at = h.attempts[0].item.updatedAt; h.clock("2026-10-12T15:00:00Z"); h.failures.clear(); h.click(saveLabel(kind)); assert.equal(h.data.activities[0].createdAt, at); assert.equal(h.data.leads[0].updatedAt, at);
  }
});

test("history failures retain a retry outside filters and loading without overwriting later contact or outcome changes", () => {
  for (const kind of ["activity", "outcome"]) {
    const h = harness(); open(h, kind); h.failures.add("activities:create"); h.click(saveLabel(kind)); const pending = h.attempts.find(item => item.collection === "activities").item;
    assert.equal(h.writes.length, 1); assert.equal(h.field(fieldLabel(kind)).props.disabled, true); assert.match(text(h.render()), /only save the history/);
    h.data.leads = [{ ...h.data.leads[0], stage: "Completed", lastContactAt: "new contact", completedAt: "new completion", nextAction: "Agreed work", lostReason: "New loss reason", notes: "New notes" }];
    h.edit("Filter by stage", "Lost"); h.ready.activities = false; h.render(); assert.equal(h.button("Retry lead history").props.disabled, true); h.click("Retry lead history"); assert.equal(h.writes.length, 1);
    h.ready.activities = true; h.failures.clear(); const retry = h.button("Retry lead history").props.onClick; retry(); retry(); assert.equal(h.writes.length, 2); assert.equal(h.data.activities[0].id, pending.id); assert.equal(h.data.activities[0].createdAt, pending.createdAt); assert.equal(h.data.leads[0].lostReason, "New loss reason"); assert.equal(h.data.leads[0].lastContactAt, "new contact"); assert.equal(h.data.leads[0].nextAction, "Agreed work"); assert.equal(h.data.leads[0].notes, "New notes");
  }
});

test("changed lead snapshots and outcomes block saving, including changes inside the durable updater", () => {
  for (const kind of ["activity", "outcome"]) for (const patch of [{ stage: "Completed" }, { createdAt: "replacement" }, { customerId: "customer-1" }, { nextAction: "Changed action" }, { lastContactAt: "New contact" }, ...(kind === "outcome" ? [{ lostReason: "Changed reason" }] : [])]) {
    const h = harness(); open(h, kind); h.data.leads = [{ ...h.data.leads[0], ...patch }]; h.click(saveLabel(kind)); assert.equal(h.writes.length, 0);
    const late = harness(); open(late, kind); late.beforeUpdate(() => { late.data.leads = [{ ...late.data.leads[0], ...patch }]; }); late.click(saveLabel(kind)); assert.equal(late.writes.length, 0);
  }
  const h = harness(); h.activity(); h.beforeUpdate(() => { h.data.leads = [{ ...h.data.leads[0], notes: "New unrelated notes" }]; }); h.click("Save lead activity"); assert.equal(h.data.leads[0].notes, "New unrelated notes");
});

test("unsupported stages and stale outcome-opening controls cannot attribute a reason to the wrong stage", () => {
  const h = harness(); h.data.leads = [lead({ stage: "Lost" })]; const old = h.button("Edit outcome reason").props.onClick; h.data.leads = [lead({ stage: "Cancelled" })]; h.render(); old(); assert.equal(h.button("Save outcome reason"), undefined); assert.equal(h.writes.length, 0);
  h.data.leads = [lead({ stage: "Unsupported" })]; h.click("Log activity"); assert.equal(h.field("Lead activity note"), undefined); assert.match(text(h.render()), /unsupported saved stage/);
});

test("activity and outcome history retries reject removed replaced ambiguous or relinked leads", () => {
  for (const kind of ["activity", "outcome"]) for (const change of ["delete", "replace", "duplicate", "relink"]) {
    const h = harness(); open(h, kind); h.failures.add("activities:create"); h.click(saveLabel(kind)); const saved = h.data.leads[0];
    h.data.leads = change === "delete" ? [] : change === "duplicate" ? [saved, { ...saved }] : [{ ...saved, ...(change === "replace" ? { createdAt: "replacement" } : { customerId: "customer-1" }) }]; h.failures.clear(); h.click("Retry lead history"); assert.equal(h.writes.length, 1); assert.equal(h.data.activities.length, 0);
  }
});

test("history identity collisions are checked before changing the lead; exact retry evidence is never duplicated", () => {
  const h = harness(); h.activity(); h.data.activities = [activity({ id: "activity_1", summary: "Another entry" })]; h.click("Save lead activity"); assert.equal(h.writes.length, 0);
  for (const kind of ["activity", "outcome"]) {
    const h = harness(); open(h, kind); h.failures.add("activities:create"); h.click(saveLabel(kind)); const pending = h.attempts.find(item => item.collection === "activities").item; h.data.activities = [{ ...pending }]; h.failures.clear(); h.click("Retry lead history"); assert.equal(h.writes.length, 1); assert.equal(h.data.activities.length, 1); assert.equal(h.button("Retry lead history"), undefined);
  }
});

test("contact changes and fresh failed/conflicting sync invalidate activity and outcome saves", () => {
  for (const kind of ["activity", "outcome"]) for (const change of ["contact", "Failed", "Conflict"]) {
    const h = harness(); if (kind === "outcome") h.data.leads = [lead({ stage: "Lost", customerId: "customer-1" })]; else h.data.leads = [lead({ customerId: "customer-1" })];
    if (kind === "activity") h.activity(); else h.outcome();
    if (change === "contact") h.data.customers = [customer({ phone: "different" })]; else h.beforeUpdate(() => h.queue.push({ table: "cloud_collections", collectionKey: "jr-os-leads", sourceId: "lead-1", state: change }));
    h.click(saveLabel(kind)); assert.equal(h.writes.length, 0);
  }
});

test("account changes loading permission changes and unmount reject retained activity and outcome callbacks", () => {
  for (const kind of ["activity", "outcome"]) for (const change of ["loading", "identity", "role", "account", "unmount"]) {
    const h = harness(); open(h, kind); const save = h.button(saveLabel(kind)).props.onClick, edit = h.field(fieldLabel(kind)).props.onChange;
    if (change === "loading") { h.ready.leads = false; h.render(); } else if (change === "identity") h.identityReady(false); else if (change === "role") h.account({ role: "electrician" }); else if (change === "account") h.account({ organisationId: "org-2" }); else h.unmount();
    save(); edit({ target: { value: "Private old notes" } }); assert.equal(h.writes.length, 0);
    if (change === "account") { assert.equal(h.field(fieldLabel(kind)), undefined); h.account({ organisationId: "org-1" }); assert.equal(h.field(fieldLabel(kind)), undefined); }
  }
});

test("one open lead action prevents competing stage capture history or deletion actions even through retained controls", () => {
  const h = harness(); const startStage = h.field("Stage for Workshop").props.onChange, startDelete = h.button("Delete opportunity").props.onClick, startCapture = h.button("New lead").props.onClick;
  h.activity(); startStage({ target: { value: "Contacted" } }); startDelete(); startCapture(); assert.equal(h.button("Confirm stage change"), undefined); assert.equal(h.button("Delete lead and history"), undefined); assert.equal(h.form(), undefined); assert.equal(h.field("Lead activity note").props.value, "Spoke about outside lights"); assert.equal(h.writes.length, 0);
});

test("deletion review includes exactly this opportunity's history and confirmation deletes the lead first", () => {
  const h = harness(); h.data.leads.push(lead({ id: "other-lead" })); h.data.activities = [activity(), activity({ id: "activity-2", type: "Call" }), activity({ id: "other-activity", leadId: "other-lead" })];
  h.click("Delete opportunity"); assert.equal(h.writes.length, 0); assert.match(text(h.render()), /2 history entries remaining/); assert.match(text(h.render()), /cannot be undone here/); const save = h.button("Delete lead and history").props.onClick; save(); save();
  assert.equal(h.writes.length, 3); assert.equal(h.writes[0].collection, "leads"); assert.equal(h.data.leads.length, 1); assert.equal(h.data.leads[0].id, "other-lead"); assert.equal(h.data.activities.length, 1); assert.equal(h.data.activities[0].id, "other-activity"); assert.match(text(h.render()), /reviewed history deleted on this device/);
});

test("discarding deletion retains all records and invalidates its confirmation", () => {
  const h = harness(); h.data.activities = [activity()]; h.click("Delete opportunity"); const confirm = h.button("Delete lead and history").props.onClick; h.click("Discard lead action"); confirm(); assert.equal(h.writes.length, 0); assert.equal(h.data.leads.length, 1); assert.equal(h.data.activities.length, 1);
});

test("lead deletion failure retains all history and permits one successful retry", () => {
  const h = harness(); h.data.activities = [activity()]; h.click("Delete opportunity"); h.failures.add("leads:delete"); const stale = h.button("Delete lead and history").props.onClick; stale(); stale(); assert.equal(h.attempts.length, 1); assert.equal(h.writes.length, 0); assert.equal(h.data.activities.length, 1); assert.match(text(h.render()), /opportunity was not deleted/);
  h.failures.clear(); h.click("Delete lead and history"); assert.equal(h.writes.length, 2); assert.equal(h.data.leads.length, 0); assert.equal(h.data.activities.length, 0);
});

test("partial history cleanup retains progress outside missing cards, filters and loading without repeating deletions", () => {
  const h = harness(); h.data.activities = [activity(), activity({ id: "activity-2" }), activity({ id: "activity-3" })]; h.click("Delete opportunity"); h.failures.add("activities:delete:activity-2"); h.click("Delete lead and history");
  assert.equal(h.writes.length, 2); assert.equal(h.data.leads.length, 0); assert.equal(h.data.activities.length, 2); assert.match(text(h.render()), /2 history entries remaining/); assert.match(text(h.render()), /Completed deletions will not be repeated/);
  h.edit("Filter by stage", "Completed"); h.ready.activities = false; h.render(); assert.equal(h.button("Delete remaining reviewed history").props.disabled, true); h.click("Delete remaining reviewed history"); assert.equal(h.writes.length, 2);
  h.ready.activities = true; h.failures.clear(); const retry = h.button("Delete remaining reviewed history").props.onClick; retry(); retry(); assert.equal(h.writes.length, 4); assert.equal(h.data.activities.length, 0); assert.equal(h.writes.filter(item => item.item.id === "lead-1").length, 1); assert.equal(h.writes.filter(item => item.item.id === "activity-1").length, 1);
});

test("linked work prevents deletion at opening and when linked inside the durable deletion callback", () => {
  for (const key of ["jobId", "quoteId", "surveyId", "plannerEntryId"]) {
    const h = harness(); h.data.leads = [lead({ [key]: "saved work" })]; h.click("Delete opportunity"); assert.equal(h.button("Delete lead and history"), undefined); assert.match(text(h.render()), /linked to work/);
    const late = harness(); late.data.activities = [activity()]; late.click("Delete opportunity"); late.beforeDelete((collection) => { if (collection === "leads") late.data.leads = [{ ...late.data.leads[0], [key]: "new work" }]; }); late.click("Delete lead and history"); assert.equal(late.writes.length, 0); assert.equal(late.data.activities.length, 1);
  }
});

test("deletion rejects changed missing duplicate and replaced lead evidence", () => {
  for (const change of ["delete", "duplicate", "notes", "createdAt", "updatedAt", "lostReason", "customerId"]) {
    const h = harness(); h.data.activities = [activity()]; h.click("Delete opportunity"); const current = h.data.leads[0]; h.data.leads = change === "delete" ? [] : change === "duplicate" ? [current, { ...current }] : [{ ...current, [change]: "Changed" }]; h.click("Delete lead and history"); assert.equal(h.writes.length, 0, change); assert.equal(h.data.activities.length, 1);
  }
});

test("initial deletion checks the entire history including global duplicates, missing ids and new or changed evidence", () => {
  for (const records of [[activity({ id: " " })], [activity(), activity()], [activity(), activity({ leadId: "other-lead" })]]) {
    const h = harness(); h.data.activities = records; h.click("Delete opportunity"); assert.equal(h.button("Delete lead and history"), undefined); assert.equal(h.writes.length, 0);
  }
  for (const change of ["new", "edit", "missing", "relink"]) {
    const h = harness(); h.data.activities = [activity()]; h.click("Delete opportunity"); h.data.activities = change === "new" ? [activity(), activity({ id: "new" })] : change === "edit" ? [activity({ summary: "Changed" })] : change === "relink" ? [activity({ leadId: "other-lead" })] : []; h.click("Delete lead and history"); assert.equal(h.writes.length, 0, change);
  }
});

test("each history removal rechecks its stored payload before deleting it", () => {
  const h = harness(); h.data.activities = [activity()]; h.click("Delete opportunity"); h.beforeDelete(collection => { if (collection === "activities") h.data.activities = [activity({ summary: "New evidence before paint" })]; }); h.click("Delete lead and history"); assert.equal(h.writes.length, 1); assert.equal(h.data.activities[0].summary, "New evidence before paint"); assert.match(text(h.render()), /history entry changed before deletion/);
});

test("history changed in place after review is not silently accepted as the reviewed evidence", () => {
  const h = harness(); const original = activity(); h.data.activities = [original]; h.click("Delete opportunity"); original.summary = "New evidence"; h.click("Delete lead and history"); assert.equal(h.writes.length, 0); assert.equal(h.data.activities[0].summary, "New evidence");
});

test("restored leads stop partial cleanup even if the restored payload is identical", () => {
  for (const patch of [{}, { createdAt: "replacement" }, { notes: "Restored" }]) {
    const h = harness(); h.data.activities = [activity()]; h.click("Delete opportunity"); h.failures.add("activities:delete"); h.click("Delete lead and history"); h.data.leads = [lead(patch)]; h.failures.clear(); h.click("Delete remaining reviewed history"); h.click("Refresh history for review"); assert.equal(h.writes.length, 1); assert.equal(h.data.activities.length, 1); assert.match(text(h.render()), /identity is present/);
  }
});

test("new or changed history after partial deletion requires an explicit fresh review and another confirmation", () => {
  for (const change of ["new", "edit", "restored"]) {
    const h = harness(); h.data.activities = [activity(), activity({ id: "activity-2" })]; h.click("Delete opportunity"); h.failures.add("activities:delete:activity-2"); h.click("Delete lead and history");
    h.data.activities = change === "new" ? [...h.data.activities, activity({ id: "new", summary: "New evidence" })] : change === "edit" ? [activity({ id: "activity-2", summary: "Changed evidence" })] : [...h.data.activities, activity()]; h.failures.clear(); h.click("Delete remaining reviewed history"); assert.equal(h.writes.length, 2);
    const stale = h.button("Delete remaining reviewed history").props.onClick; h.click("Refresh history for review"); stale(); assert.equal(h.writes.length, 2); assert.match(text(h.render()), /Review the entries and confirm deletion/); h.click("Delete remaining reviewed history"); assert.equal(h.data.activities.length, 0); assert.equal(h.writes.filter(item => item.collection === "leads").length, 1);
  }
});

test("refreshing remaining history cannot adopt ambiguous entries or delete a record relinked to another lead", () => {
  const h = harness(); h.data.activities = [activity(), activity({ id: "activity-2" })]; h.click("Delete opportunity"); h.failures.add("activities:delete"); h.click("Delete lead and history"); h.data.activities = [activity(), activity()]; h.click("Refresh history for review"); assert.match(text(h.render()), /ambiguous identity/); assert.equal(h.writes.length, 1);
  h.data.activities = [activity({ leadId: "other-lead" }), activity({ id: "activity-2" })]; h.click("Refresh history for review"); h.failures.clear(); h.click("Delete remaining reviewed history"); assert.equal(h.data.activities.length, 1); assert.equal(h.data.activities[0].leadId, "other-lead");
});

test("deletion is restricted to owners/admins while office staff can still save activity", () => {
  for (const role of ["office", "electrician", "customer", undefined, "unknown"]) { const h = harness(); h.account({ role }); assert.equal(h.button("Delete opportunity").props.disabled, true); h.click("Delete opportunity"); assert.equal(h.button("Delete lead and history"), undefined); assert.equal(h.writes.length, 0); if (role === "office") { h.activity(); h.click("Save lead activity"); assert.equal(h.writes.length, 2); } }
  for (const role of ["owner", "admin"]) { const h = harness(); h.account({ role }); h.click("Delete opportunity"); h.click("Delete lead and history"); assert.equal(h.writes.length, 1); }
  const h = harness(); h.signedOut(); h.mode("local"); h.click("Delete opportunity"); h.click("Delete lead and history"); assert.equal(h.writes.length, 1);
});

test("loading and account or permission changes invalidate deletion and partial-cleanup callbacks", () => {
  for (const partial of [false, true]) for (const change of ["loading", "identity", "role", "account", "unmount"]) {
    const h = harness(); h.data.activities = [activity()]; h.click("Delete opportunity"); if (partial) { h.failures.add("activities:delete"); h.click("Delete lead and history"); h.failures.clear(); }
    const save = h.button(partial ? "Delete remaining reviewed history" : "Delete lead and history").props.onClick;
    if (change === "loading") { h.ready.activities = false; h.render(); } else if (change === "identity") h.identityReady(false); else if (change === "role") h.account({ role: "office" }); else if (change === "account") h.account({ userId: "other-user" }); else h.unmount();
    save(); assert.equal(h.writes.length, partial ? 1 : 0, `${partial}:${change}`); assert.equal(h.data.activities.length, 1);
  }
});

test("fresh failed/conflicting sync blocks lead and history deletion, while pending offline deletion stays durable", () => {
  for (const state of ["Failed", "Conflict"]) for (const target of ["lead", "history"]) {
    const h = harness(); h.data.activities = [activity()]; h.click("Delete opportunity"); h.beforeDelete(() => h.queue.push({ table: "cloud_collections", collectionKey: target === "lead" ? "jr-os-leads" : "jr-os-lead-activities", sourceId: target === "lead" ? "lead-1" : "activity-1", state })); h.click("Delete lead and history"); assert.equal(h.writes.length, 0);
  }
  const h = harness(); h.navigator.onLine = false; h.data.activities = [activity()]; h.queue.push({ table: "cloud_collections", collectionKey: "jr-os-leads", sourceId: "lead-1", state: "Pending" }); h.click("Delete opportunity"); h.click("Delete lead and history"); assert.equal(h.writes.length, 2);
});

test("phone activity outcome and deletion controls offer 48px actions and multiline text", () => {
  const h = harness(); h.activity(); assert.match(h.field("Lead activity type").props.className, /min-h-12/); assert.match(h.field("Lead activity note").props.className, /text-base/); assert.equal(h.field("Lead activity note").type, "textarea"); assert.match(h.button("Save lead activity").props.className, /min-h-12/);
  h.click("Discard lead action"); h.data.leads = [lead({ stage: "Lost" })]; h.click("Edit outcome reason"); assert.equal(h.field("Lead outcome reason").type, "textarea"); h.click("Discard lead action"); h.click("Delete opportunity"); assert.equal(h.button("Delete lead and history").props.variant, "danger"); assert.ok(nodes(h.render()).some(n => n.type === "details" && text(n).includes("Review history to delete")));
});
