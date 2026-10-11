import assert from "node:assert/strict";
import test from "node:test";
import { harness, customer, lead, quote, profile, nodes, text } from "./helpers/follow-up-actions-harness.mjs";

const saved = h => h.writes.map(write => `${write.collection}:${write.kind}`).join(",");
const alert = h => nodes(h.render()).filter(node => node.props.role === "alert").map(text).join(" ");
const syncEntry = (table, sourceId, collectionKey, state = "Conflict") => ({ id: "queue-1", table, sourceId, collectionKey, state, operation: "upsert", payload: {}, attemptCount: 1 });

test("opening and cancelling a follow-up writes nothing and requires an explicit actual contact method", () => {
  const h = harness(); h.open("");
  assert.equal(h.field("Contact method").props.value, ""); assert.equal(h.button("Confirm contact and save").props.disabled, true);
  h.click("Confirm contact and save"); assert.match(alert(h), /Choose how you actually contacted/); assert.equal(h.writes.length, 0); assert.equal(h.identities(), 0);
  h.edit("Contact method", "Unsupported"); assert.match(alert(h), /Choose how/); assert.equal(h.field("Contact method").props.value, "");
  h.edit("Contact method", "Email"); h.edit("Contact outcome", "Asked to call on Friday"); h.click("Close action");
  assert.equal(h.writes.length, 0); assert.equal(h.identities(), 0); assert.equal(h.field("Contact method"), undefined);
});

test("each explicit contact method saves the source and both histories with one shared timestamp", () => {
  for (const channel of ["Call", "Text", "Email", "WhatsApp", "Site visit"]) {
    const h = harness(); h.open(channel); h.edit("Contact outcome", "  Customer asked for details  ");
    const twice = h.button("Confirm contact and save").props.onClick; twice(); twice();
    assert.equal(saved(h), "leads:update,leadActivities:create,interactions:create", channel);
    assert.equal(h.data.leads[0].stage, "Contacted"); assert.equal(h.data.leads[0].followUpDate, "2026-10-13"); assert.equal(h.data.leads[0].notes, "Keep notes");
    const activity = h.data.leadActivities[0], interaction = h.data.interactions[0];
    assert.equal(activity.type, channel); assert.equal(interaction.type, channel); assert.equal(activity.completedAt, interaction.interactionAt); assert.equal(activity.completedAt, h.data.leads[0].lastContactAt);
    assert.match(interaction.outcome, /Customer asked for details Next follow-up: 2026-10-13/); assert.match(text(h.render()), /saved on this device/); assert.equal(h.button("Retry remaining history"), undefined);
  }
});

test("a failed source save retains the action and stable evidence without recording contact or success", () => {
  const h = harness(); h.failures.add("leads:update"); h.open("Text"); h.edit("Contact outcome", "Try next week"); h.click("Confirm contact and save");
  assert.equal(h.writes.length, 0); assert.equal(h.data.leads[0].stage, "New Lead"); assert.match(alert(h), /was not saved/); assert.equal(h.field("Contact outcome").props.value, "Try next week");
  const at = h.attempts[0].item.lastContactAt, ids = h.identities(); h.clock("2026-10-11T14:00:00Z"); h.failures.clear(); h.click("Confirm contact and save");
  assert.equal(h.identities(), ids); assert.equal(h.data.leads[0].lastContactAt, at); assert.equal(h.data.interactions[0].interactionAt, at); assert.equal(saved(h), "leads:update,leadActivities:create,interactions:create");
});

test("first-history failure survives queue disappearance and retries without replaying or reopening a later closed lead", () => {
  const h = harness(); h.failures.add("leadActivities:create"); h.open(); h.click("Confirm contact and save");
  assert.equal(saved(h), "leads:update"); assert.match(alert(h), /update is saved; remaining history/); assert.match(text(h.field("Follow-up queue")), /No follow-ups match/); assert.ok(h.button("Retry remaining history"));
  h.data.leads = [{ ...h.data.leads[0], stage: "Accepted", followUpDate: "2027-01-01", notes: "Later notes" }];
  h.clock("2026-10-12T12:00:00Z"); h.failures.clear(); h.click("Retry remaining history");
  assert.equal(saved(h), "leads:update,leadActivities:create,interactions:create"); assert.equal(h.data.leads[0].stage, "Accepted"); assert.equal(h.data.leads[0].followUpDate, "2027-01-01"); assert.equal(h.data.leads[0].notes, "Later notes");
  assert.equal(h.data.interactions[0].interactionAt, "2026-10-11T12:00:00.000Z");
});

test("second-history failure retries only the missing customer history and retains edits through loading and invalid rules", () => {
  const h = harness(); h.failures.add("interactions:create"); h.open("WhatsApp"); h.edit("Contact outcome", "Details sent"); h.click("Confirm contact and save");
  assert.equal(saved(h), "leads:update,leadActivities:create"); const old = h.button("Retry remaining history").props.onClick;
  h.ready.profiles = false; assert.equal(h.button("Retry remaining history").props.disabled, true); assert.match(text(h.render()), /Your action is retained/); old(); assert.equal(h.writes.length, 2);
  h.ready.profiles = true; h.data.settingsStore = [{ id: "bad", noResponseDays: -1 }]; assert.match(text(h.render()), /queue is paused/); assert.ok(h.button("Retry remaining history"));
  h.failures.clear(); h.click("Retry remaining history"); old(); assert.equal(saved(h), "leads:update,leadActivities:create,interactions:create"); assert.equal(h.data.interactions[0].type, "WhatsApp"); assert.match(h.data.interactions[0].outcome, /Details sent/);
});

test("quote contact updates only the exact quote and appends customer history", () => {
  const h = harness(); h.data.leads = []; h.data.documents = [quote(), quote({ id: "quote-other", status: "Accepted" })];
  h.open(); h.click("Confirm contact and save"); assert.equal(saved(h), "documents:update,interactions:create"); assert.equal(h.data.documents[0].nextFollowUpDate, "2026-10-13"); assert.equal(h.data.documents[0].notes, "Keep quote notes"); assert.equal(h.data.documents[1].nextFollowUpDate, undefined);
});

test("a surfaced lead linked to a quote still updates the lead, never the quote", () => {
  const h = harness(); h.data.leads = [lead({ quoteId: "quote-1", stage: "Follow-up Due" })]; h.data.documents = [quote({ status: "Accepted" })];
  h.open(); h.click("Confirm contact and save"); assert.equal(saved(h), "leads:update,leadActivities:create,interactions:create"); assert.equal(h.data.documents[0].status, "Accepted"); assert.equal(h.data.documents[0].lastFollowUpAt, undefined);
});

test("reminder contact clears exactly one profile and preserves review, portal and other reminder records", () => {
  const h = harness(); h.data.leads = []; h.data.profiles = [profile(), profile({ id: "other-profile", nextFollowUpDate: "2026-12-01" })];
  h.open("Site visit"); assert.match(text(h.render()), /clears its date/); h.click("Confirm contact and save");
  assert.equal(saved(h), "profiles:update,interactions:create"); assert.equal(h.data.profiles[0].nextFollowUpDate, ""); assert.equal(h.data.profiles[0].reviewStatus, "Received"); assert.equal(h.data.profiles[0].portalNote, "Keep portal note"); assert.equal(h.data.profiles[1].nextFollowUpDate, "2026-12-01");
  assert.match(h.data.interactions[0].outcome, /no next date set/); assert.doesNotMatch(h.data.interactions[0].outcome, /Next follow-up:/);
});

test("lost re-engagement stays lost, finishes once, and does not invent a next follow-up date", () => {
  const h = harness(); h.data.leads = [lead({ stage: "Lost" })]; h.open(); h.click("Confirm contact and save");
  assert.equal(h.data.leads[0].stage, "Lost"); assert.equal(h.data.leads[0].followUpDate, ""); assert.ok(h.data.leads[0].lostFollowUpCompletedAt); assert.match(h.data.interactions[0].outcome, /no next date set/); assert.match(text(h.field("Follow-up queue")), /No follow-ups match/);
});

test("postponement is reviewed, saves durably for every source, and never creates contact history", () => {
  for (const source of ["leads", "documents", "profiles"]) {
    const h = harness(); h.data.leads = []; h.data[source] = [{ leads: lead, documents: quote, profiles: profile }[source]()];
    h.click("Postpone"); h.edit("Postpone for", "14"); assert.match(text(h.render()), /25 Oct 2026/); assert.equal(h.writes.length, 0); assert.equal(h.identities(), 0);
    h.failures.add(`${source}:update`); h.click("Save postponement"); assert.equal(h.writes.length, 0); assert.equal(h.field("Postpone for").props.value, 14); assert.match(alert(h), /was not saved/);
    h.failures.clear(); const twice = h.button("Save postponement").props.onClick; twice(); twice();
    assert.equal(saved(h), `${source}:update`); assert.equal(h.data[source][0][source === "leads" ? "followUpDate" : "nextFollowUpDate"], "2026-10-25"); assert.equal(h.identities(), 0); assert.match(text(h.field("Follow-up queue")), /No follow-ups match/);
  }
});

test("only listed whole postponement periods can be chosen", () => {
  for (const value of ["0", "-1", "2.5", "NaN", "Infinity", "36500"]) {
    const h = harness(); h.click("Postpone"); h.edit("Postpone for", value); assert.equal(h.field("Postpone for").props.value, 3); assert.match(alert(h), /Choose one of/); assert.equal(h.writes.length, 0);
  }
});

test("missing, duplicate and blank source/customer identities block both follow-up actions", () => {
  const variants = [
    h => { h.data.leads.push(lead()); }, h => { h.data.leads = [lead({ id: " " })]; },
    h => { h.data.customers = []; }, h => { h.data.customers.push(customer()); },
    h => { h.data.leads = []; h.data.documents = [quote(), quote()]; },
    h => { h.data.leads = []; h.data.documents = [quote({ customerId: "" })]; },
    h => { h.data.leads = []; h.data.profiles = [profile(), profile({ customerId: "other" })]; },
  ];
  for (const configure of variants) for (const label of ["Log contact", "Postpone"]) {
    const h = harness(); configure(h); h.click(label); assert.match(alert(h), /missing|ambiguous|identity/); assert.equal(h.writes.length, 0); assert.equal(h.field("Contact method"), undefined);
  }
});

test("unsupported raw stages cannot be normalized into a legitimate contact update", () => {
  const h = harness(); h.data.leads = [lead({ stage: "Unexpected" })]; h.open(""); assert.match(alert(h), /unsupported saved stage/); assert.equal(h.writes.length, 0);
});

test("changed and closed source records, replaced customers, contact edits and changed rules block stale drafts", () => {
  const variants = [
    h => { h.data.leads = [lead({ stage: "Accepted" })]; }, h => { h.data.leads = [lead({ followUpDate: "2026-12-01" })]; },
    h => { h.data.leads = [lead({ createdAt: "2026-10-02T12:00:00Z" })]; }, h => { h.data.leads = [lead({ customerId: "other" })]; h.data.customers.push(customer({ id: "other" })); },
    h => { h.data.customers = [customer({ createdAt: "2026-10-02T12:00:00Z" })]; }, h => { h.data.customers = [customer({ email: "new@example.test" })]; },
    h => { h.data.leads = [lead({ nextAction: "New action" })]; }, h => { h.data.leads = []; },
    h => { h.data.settingsStore = [{ id: "new-rules", quoteAgeDays: 3, noResponseDays: 7, lostOpportunityDays: 60, highValueThreshold: 1000, updatedAt: "" }]; },
  ];
  for (const change of variants) {
    const h = harness(); h.open(); change(h); h.click("Confirm contact and save"); assert.equal(h.writes.length, 0); assert.match(alert(h), /changed|replaced|missing|unavailable/);
  }
});

test("old card callbacks cannot silently log newly changed details and source changes before durable update are rechecked", () => {
  const h = harness(), oldCard = h.button("Log contact").props.onClick; h.data.leads = [lead({ workRequired: "Different work" })]; h.render(); oldCard(); assert.match(alert(h), /changed/); assert.equal(h.field("Contact method"), undefined);
  for (const source of ["leads", "documents", "profiles"]) {
    const t = harness(); t.data.leads = []; t.data[source] = [{ leads: lead, documents: quote, profiles: profile }[source]()]; t.open();
    t.beforeUpdate(() => { const record = t.data[source][0]; t.data[source] = [{ ...record, ...(source === "leads" ? { stage: "Completed" } : source === "documents" ? { status: "Accepted" } : { nextFollowUpDate: "2026-12-01" }) }]; });
    t.click("Confirm contact and save"); assert.equal(t.writes.length, 0); assert.match(alert(t), /changed before the save/);
  }
});

test("unrelated latest metadata survives the durable updater", () => {
  const h = harness(); h.open(); h.beforeUpdate(() => { h.data.leads = [{ ...h.data.leads[0], notes: "Saved elsewhere", extra: "Preserve this" }]; }); h.click("Confirm contact and save");
  assert.equal(h.data.leads[0].notes, "Saved elsewhere"); assert.equal(h.data.leads[0].extra, "Preserve this"); assert.equal(h.writes.length, 3);
});

test("replaced or relinked records and customers block remaining history without replaying the saved source", () => {
  for (const change of [h => { h.data.leads = []; }, h => { h.data.leads[0] = { ...h.data.leads[0], createdAt: "new" }; }, h => { h.data.leads[0] = { ...h.data.leads[0], customerId: "other" }; h.data.customers.push(customer({ id: "other" })); }, h => { h.data.customers = [customer({ createdAt: "new" })]; }, h => { h.data.customers.push(customer()); }]) {
    const h = harness(); h.failures.add("interactions:create"); h.open(); h.click("Confirm contact and save"); change(h); h.failures.clear(); h.click("Retry remaining history"); assert.equal(h.writes.length, 2); assert.match(alert(h), /replaced|missing|ambiguous|relinked/);
  }
});

test("history identity collisions and missing refreshed evidence prevent completion and never overwrite history", () => {
  for (const change of [h => { h.data.leadActivities = []; }, h => { h.data.leadActivities = [{ ...h.data.leadActivities[0], summary: "Different evidence" }]; }, h => { h.data.leadActivities = [h.data.leadActivities[0], h.data.leadActivities[0]]; }, h => { h.data.interactions = [{ ...h.attempts.at(-1).item, customerId: "other" }]; }]) {
    const h = harness(); h.failures.add("interactions:create"); h.open(); h.click("Confirm contact and save"); change(h); h.failures.clear(); h.click("Retry remaining history"); assert.equal(h.writes.length, 2); assert.match(alert(h), /history|evidence/); assert.ok(h.button("Retry remaining history"));
  }
});

test("matching evidence already present on retry is acknowledged without creating a duplicate", () => {
  const h = harness(); h.failures.add("interactions:create"); h.open(); h.click("Confirm contact and save"); const pending = h.attempts.at(-1).item;
  h.data.interactions = [{ ...pending }]; h.failures.clear(); h.click("Retry remaining history"); assert.equal(h.writes.length, 2); assert.equal(h.data.interactions.length, 1); assert.equal(h.button("Retry remaining history"), undefined);
});

test("account changes, revoked roles, loading and old unmounted callbacks cannot save", () => {
  for (const change of [h => h.account({ organisationId: "org-2" }), h => h.account({ userId: "user-2" }), h => h.account({ customerSourceId: "other" }), h => h.account({ role: "electrician" }), h => h.signedOut(), h => h.identityReady(false), h => { h.ready.leads = false; h.render(); }, h => h.unmount()]) {
    const h = harness(); h.open(); const stale = h.button("Confirm contact and save").props.onClick; change(h); stale(); assert.equal(h.writes.length, 0);
  }
  for (const role of ["customer", "electrician", "unexpected", undefined]) {
    const h = harness(); h.account({ role }); assert.equal(h.button("Log contact").props.disabled, true); h.click("Log contact"); assert.equal(h.field("Contact method"), undefined); assert.equal(h.writes.length, 0);
  }
});

test("edited, cancelled and superseded action callbacks cannot write", () => {
  const h = harness(); h.open(); const old = h.button("Confirm contact and save").props.onClick;
  h.edit("Contact method", "Text"); old(); assert.equal(h.writes.length, 0); const cancelled = h.button("Confirm contact and save").props.onClick;
  h.click("Close action"); h.open("Site visit"); cancelled(); assert.equal(h.writes.length, 0); h.click("Confirm contact and save"); assert.equal(h.data.interactions[0].type, "Site visit");
});

test("fresh failed or conflicting sync blocks the exact source and intended history targets", () => {
  for (const status of ["Failed", "Conflict"]) for (const [collection, table, sourceId, key] of [["leads", "cloud_collections", "lead-1", "jr-os-leads"], ["documents", "pricing_documents", "quote-1", undefined], ["profiles", "cloud_collections", "profile-1", "jr-os-customer-profiles"], ["leads", "cloud_collections", "activity_1", "jr-os-lead-activities"], ["leads", "cloud_collections", "interaction_2", "jr-os-customer-interactions"]]) {
    const h = harness(); h.data.leads = []; h.data[collection] = [{ leads: lead, documents: quote, profiles: profile }[collection]()]; h.open(); h.queue.push(syncEntry(table, sourceId, key, status)); h.click("Confirm contact and save"); assert.equal(h.writes.length, 0, `${status} ${key}`); assert.match(alert(h), /failed or conflicting sync/);
  }
});

test("failed history sync pauses a partial retry while pending offline and local saves remain usable", () => {
  const h = harness(); h.failures.add("interactions:create"); h.open(); h.click("Confirm contact and save"); h.failures.clear(); h.queue.push(syncEntry("cloud_collections", h.data.leadActivities[0].id, "jr-os-lead-activities")); h.click("Retry remaining history"); assert.equal(h.writes.length, 2);
  h.queue.length = 0; h.click("Retry remaining history"); assert.equal(h.writes.length, 3);
  for (const local of [false, true]) {
    const t = harness(); if (local) { t.signedOut(); t.mode("local"); } t.navigator.onLine = false; t.queue.push(syncEntry("cloud_collections", "lead-1", "jr-os-leads", local ? "Conflict" : "Pending")); t.open(); t.click("Confirm contact and save"); assert.equal(t.writes.length, 3);
  }
});

test("an unlinked lead still records lead history and site visits need no composer contact", () => {
  const h = harness(); h.data.leads = [lead({ customerId: undefined, phone: "invalid", email: "invalid" })]; h.data.customers = []; h.open("Site visit"); h.click("Confirm contact and save");
  assert.equal(saved(h), "leads:update,leadActivities:create"); assert.equal(h.data.leadActivities[0].type, "Site visit");
});

test("dates use the action's local calendar across DST and stale overnight drafts require review", () => {
  const previous = process.env.TZ; process.env.TZ = "Pacific/Auckland";
  try {
    const h = harness(); h.clock("2026-10-11T12:30:00Z"); h.click("Postpone"); h.edit("Postpone for", "1"); assert.match(text(h.render()), /13 Oct 2026/); h.click("Save postponement"); assert.equal(h.data.leads[0].followUpDate, "2026-10-13");
    const overnight = harness(); overnight.open(); overnight.clock("2026-10-12T12:00:00Z"); overnight.click("Confirm contact and save"); assert.equal(overnight.writes.length, 0); assert.match(alert(overnight), /calendar day changed/);
    process.env.TZ = "Europe/London";
    const dst = harness(); dst.clock("2026-10-24T23:30:00Z"); dst.click("Postpone"); dst.edit("Postpone for", "1"); dst.click("Save postponement"); assert.equal(dst.data.leads[0].followUpDate, "2026-10-26");
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
