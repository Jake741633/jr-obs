import assert from "node:assert/strict";
import test from "node:test";
import { harness, lead, customer, builder, nodes, text } from "./helpers/lead-actions-harness.mjs";

test("capture writes the durable lead before its history, with cleaned required fields and exact value", () => {
  const h = harness(); h.capture(); h.edit("Customer/contact", "  Garage customer  "); h.edit("Estimated value", "123.45"); h.edit("Follow-up date", "2026-11-03"); const submit = h.form().props.onSubmit;
  submit({ preventDefault() {} }); submit({ preventDefault() {} });
  assert.equal(h.writes.length, 2); assert.equal(h.writes[0].collection, "leads"); assert.equal(h.writes[1].collection, "activities");
  const saved = h.data.leads[0]; assert.equal(saved.name, "Garage customer"); assert.equal(saved.stage, "New Lead"); assert.equal(saved.estimatedValue, 123.45); assert.equal(saved.followUpDate, "2026-11-03"); assert.equal(h.data.activities[0].leadId, saved.id);
  assert.equal(h.form(), undefined); assert.match(text(h.render()), /saved on this device/);
});

test("capture failure retains an editable draft, no history or success, and reuses prepared identities on retry", () => {
  const h = harness(); h.capture(); h.failures.add("leads:create"); const old = h.form().props.onSubmit; old({ preventDefault() {} }); old({ preventDefault() {} });
  assert.equal(h.writes.length, 0); assert.equal(h.attempts.length, 1); assert.match(text(h.render()), /draft is retained/); assert.equal(h.field("Work required").props.value, "Outside lights");
  const first = h.attempts[0].item; h.clock("2026-10-12T13:00:00Z"); h.failures.clear(); h.submit(); assert.equal(h.data.leads[0].id, first.id); assert.equal(h.data.leads[0].createdAt, first.createdAt); assert.equal(h.data.activities.length, 1);
});

test("editing after a failed capture saves corrected values and invalidates stale submit and edit callbacks", () => {
  const h = harness(); h.capture(); h.failures.add("leads:create"); h.submit(); const old = h.form().props.onSubmit, edit = h.field("Notes").props.onChange;
  h.edit("Work required", "Revised lighting"); old({ preventDefault() {} }); edit({ target: { value: "Stale note" } }); assert.equal(h.attempts.length, 1);
  h.failures.clear(); h.submit(); assert.equal(h.data.leads[0].workRequired, "Revised lighting"); assert.equal(h.data.leads[0].notes, "");
});

test("capture history failure keeps a page-level retry and never creates the lead twice or rewinds later changes", () => {
  const h = harness(); h.capture(); h.failures.add("activities:create"); h.submit(); const saved = h.data.leads[0];
  assert.equal(h.writes.length, 1); assert.equal(h.form(), undefined); assert.match(text(h.render()), /Retrying will only save the history/); assert.equal(h.button("New lead").props.disabled, true);
  h.data.leads = h.data.leads.map(item => item.id === saved.id ? { ...item, stage: "Completed", notes: "Newer note", completedAt: "later" } : item);
  h.edit("Filter by stage", "Lost"); h.ready.customers = false; assert.match(text(h.render()), /Finish saving lead history/); assert.equal(h.button("Retry lead history").props.disabled, true); h.click("Retry lead history"); assert.equal(h.writes.length, 1);
  h.ready.customers = true; h.failures.clear(); const retry = h.button("Retry lead history").props.onClick; retry(); retry(); assert.equal(h.writes.length, 2); assert.equal(h.data.leads.find(item => item.id === saved.id).stage, "Completed"); assert.equal(h.data.activities.length, 1);
});

test("capture requires valid required fields, finite non-negative money, known choices and real date-only days", () => {
  for (const [label, value] of [["Customer/contact", "   "], ["Work required", ""], ["Estimated value", ""], ["Estimated value", "-1"], ["Estimated value", "1.234"], ["Estimated value", "Infinity"], ["Estimated value", "1e3"], ["Estimated value", "9007199254740992"], ["Lead source", "Unknown"], ["Lead priority", "Unknown"], ["Follow-up date", "2026-02-30"], ["Follow-up date", "2026-10-11T10:00:00Z"]]) {
    const h = harness(); h.capture(); h.edit(label, value); h.submit(); assert.equal(h.writes.length, 0, `${label}: ${value}`); assert.ok(h.form());
  }
});

test("customer and builder capture links resolve exact identities and replace contact fields deliberately", () => {
  for (const [kind, record, label] of [["customer", customer({ id: " /?#& " }), "Link customer"], ["builder", builder({ id: " /?#& " }), "Link builder / contractor"]]) {
    const h = harness(`?action=create&${kind}Id=${encodeURIComponent(record.id)}`); h.data[`${kind}s`] = [record]; h.render(); assert.equal(h.field(label).props.value, record.id); h.edit("Work required", "Sockets"); h.submit(); assert.equal(h.data.leads[0][`${kind}Id`], record.id); assert.equal(h.data.leads[0].email, record.email);
  }
  const h = harness(); h.capture(); h.edit("Link customer", "customer-1"); h.edit("Link builder / contractor", "builder-1"); h.submit(); assert.equal(h.data.leads[0].customerId, undefined); assert.equal(h.data.leads[0].builderId, "builder-1"); assert.equal(h.data.leads[0].company, "Workshop contractor");
});

test("missing ambiguous blank or conflicting contact deep links need an explicit choice before capture", () => {
  for (const query of ["customerId=missing", "customerId=", "builderId=missing", "customerId=customer-1&builderId=builder-1", "customerId=duplicate"]) {
    const h = harness(`?action=create&${query}`); h.data.customers.push(customer({ id: "duplicate" }), customer({ id: "duplicate" })); h.render(); h.edit("Customer/contact", "Unlinked customer"); h.edit("Work required", "Sockets"); h.submit(); assert.equal(h.writes.length, 0);
    assert.equal(nodes(h.field("Link customer")).filter(n => n.type === "option" && n.props.value === "duplicate").length, 0);
    h.click("Continue without a linked contact"); h.submit(); assert.equal(h.writes.length, 2); assert.equal(h.data.leads[0].customerId, undefined); assert.equal(h.data.leads[0].builderId, undefined);
  }
});

test("capture refuses changed replaced deleted or ambiguous selected contacts", () => {
  for (const kind of ["customer", "builder"]) for (const change of ["name", "createdAt", "delete", "duplicate"]) {
    const h = harness(); h.capture(); h.edit(kind === "customer" ? "Link customer" : "Link builder / contractor", `${kind}-1`);
    const collection = `${kind}s`, original = h.data[collection][0];
    h.data[collection] = change === "delete" ? [] : change === "duplicate" ? [original, { ...original }] : [{ ...original, [change === "name" ? (kind === "customer" ? "name" : "contactName") : change]: "Changed" }];
    h.submit(); assert.equal(h.writes.length, 0, `${kind}:${change}`); assert.match(text(h.render()), /retained/);
  }
});

test("stage selector arrows swipes and drops only open review; confirmation saves stage before history", () => {
  for (const action of ["selector", "next", "previous", "swipe", "drop"]) {
    const h = harness(); if (action === "previous") h.data.leads = [lead({ stage: "Survey Booked" })];
    if (action === "selector") h.stage();
    if (action === "next" || action === "previous") h.field(action === "next" ? "Next lead stage" : "Previous lead stage").props.onClick();
    if (action === "swipe") { const card = nodes(h.render()).find(n => n.type === "article" && n.props.onTouchStart); card.props.onTouchStart({ touches: [{ clientX: 200, clientY: 0 }] }); card.props.onTouchEnd({ changedTouches: [{ clientX: 70, clientY: 2 }] }); }
    if (action === "drop") { nodes(h.render()).find(n => n.type === "article" && n.props.onDragStart).props.onDragStart(); nodes(h.render()).find(n => n.props["data-pipeline-stage"] === "Contacted").props.onDrop(); }
    assert.equal(h.writes.length, 0); assert.match(text(h.render()), /Review stage change/); const confirm = h.button("Confirm stage change").props.onClick; confirm(); confirm();
    assert.equal(h.writes.length, 2, action); assert.equal(h.data.leads[0].stage, "Contacted"); assert.equal(h.data.leads[0].lastContactAt, "2026-10-11T12:00:00.000Z"); assert.equal(h.writes[0].collection, "leads"); assert.equal(h.data.activities[0].type, "Stage change");
  }
});

test("a deleted selected contact can be explicitly unlinked without discarding captured work", () => {
  const h = harness(); h.capture(); h.edit("Link customer", "customer-1"); h.edit("Notes", "Keep my site notes"); h.data.customers = []; h.submit(); assert.equal(h.writes.length, 0);
  h.click("Continue without a linked contact"); h.submit(); assert.equal(h.data.leads[0].customerId, undefined); assert.equal(h.data.leads[0].notes, "Keep my site notes"); assert.equal(h.data.leads[0].workRequired, "Outside lights");
});

test("short vertical and interactive-control gestures never propose stage changes", () => {
  for (const [x, y, interactive] of [[170, 0, false], [70, 200, false], [70, 0, true]]) {
    const h = harness(), card = nodes(h.render()).find(n => n.type === "article" && n.props.onTouchStart); card.props.onTouchStart({ target: { closest: () => interactive ? {} : null }, touches: [{ clientX: 200, clientY: 0 }] }); card.props.onTouchEnd({ changedTouches: [{ clientX: x, clientY: y }] }); assert.equal(h.button("Confirm stage change"), undefined); assert.equal(h.writes.length, 0);
  }
});

test("stage failure retains the proposal and stable history time without writing history prematurely", () => {
  const h = harness(); h.stage("Completed"); h.failures.add("leads:update"); h.click("Confirm stage change"); const first = h.attempts[0].item;
  assert.equal(h.data.leads[0].stage, "New Lead"); assert.equal(h.writes.length, 0); assert.match(text(h.render()), /draft is retained/);
  h.clock("2026-10-12T15:00:00Z"); h.failures.clear(); h.click("Confirm stage change"); assert.equal(h.data.leads[0].completedAt, first.completedAt); assert.equal(h.data.activities[0].createdAt, first.updatedAt);
});

test("stage history retries do not repeat updates or regress newer stage contact completion or notes", () => {
  const h = harness(); h.stage(); h.failures.add("activities:create"); h.click("Confirm stage change"); const first = h.attempts.find(item => item.collection === "activities").item;
  h.data.leads = [{ ...h.data.leads[0], stage: "Completed", lastContactAt: "newer-contact", completedAt: "newer-completion", notes: "Newer notes" }];
  h.edit("Filter by stage", "Lost"); h.clock("2026-10-12T15:00:00Z"); h.failures.clear(); h.click("Retry lead history");
  assert.equal(h.writes.filter(item => item.kind === "update").length, 1); assert.equal(h.data.leads[0].lastContactAt, "newer-contact"); assert.equal(h.data.leads[0].completedAt, "newer-completion"); assert.equal(h.data.leads[0].notes, "Newer notes"); assert.equal(h.data.leads[0].stage, "Completed"); assert.equal(h.data.activities[0].id, first.id); assert.equal(h.data.activities[0].createdAt, first.createdAt);
});

test("all supported stage side effects preserve unrelated fields including newer notes in the storage updater", () => {
  for (const target of ["Survey Booked", "Follow-up Due", "Accepted", "Lost", "Completed", "Cancelled"]) {
    const h = harness(); h.stage(target); h.beforeUpdate(() => { h.data.leads = [{ ...h.data.leads[0], notes: "Changed before paint" }]; }); h.click("Confirm stage change");
    assert.equal(h.data.leads[0].stage, target); assert.equal(h.data.leads[0].notes, "Changed before paint"); assert.equal(h.data.leads[0].nextAction, target === "Accepted" ? "Book work" : target === "Follow-up Due" ? "Contact customer today" : "Book a visit");
  }
});

test("legacy stages are deliberately normalized but unsupported stages cannot be silently moved", () => {
  const h = harness(); h.data.leads = [lead({ stage: "Won" })]; h.stage("Completed"); h.click("Confirm stage change"); assert.match(h.data.activities[0].summary, /Accepted → Completed/);
  const unknown = harness(); unknown.data.leads = [lead({ stage: "Imported unknown" })]; unknown.stage(); assert.equal(unknown.writes.length, 0); assert.equal(unknown.button("Confirm stage change"), undefined); assert.match(text(unknown.render()), /unsupported saved stage/);
});

test("stage review rejects stale cards, changed source fields, removed or ambiguous identities", () => {
  const h = harness(); const old = h.field("Stage for Workshop").props.onChange; h.data.leads = [lead({ stage: "Completed" })]; h.render(); old({ target: { value: "Contacted" } }); assert.equal(h.button("Confirm stage change"), undefined);
  for (const patch of [{ stage: "Lost" }, { createdAt: "replacement" }, { customerId: "customer-1" }, { lastContactAt: "new contact" }, { nextAction: "New decision" }, { completedAt: "new completion" }, { quoteId: "new quote" }, { followUpDate: "2026-12-01" }]) {
    const current = harness(); current.stage(); current.data.leads = [lead(patch)]; current.click("Confirm stage change"); assert.equal(current.writes.length, 0);
  }
  for (const data of [[], [lead(), lead()]]) { const current = harness(); current.stage(); current.data.leads = data; current.click("Confirm stage change"); assert.equal(current.writes.length, 0); }
});

test("the storage updater rechecks changes and sync conflicts arriving before the next React frame", () => {
  for (const change of ["stage", "contact", "sync"]) {
    const h = harness(); h.stage(); h.beforeUpdate(() => { if (change === "sync") h.queue.push({ table: "cloud_collections", sourceId: "lead-1", collectionKey: "jr-os-leads", state: "Conflict" }); else h.data.leads = [{ ...h.data.leads[0], [change === "stage" ? "stage" : "lastContactAt"]: "Changed before paint" }]; });
    h.click("Confirm stage change"); assert.equal(h.writes.length, 0, change);
  }
});

test("history retries reject removed replaced relinked and ambiguous leads for capture and stage", () => {
  for (const kind of ["capture", "stage"]) for (const change of ["delete", "replace", "relink", "duplicate"]) {
    const h = harness(); h.failures.add("activities:create"); if (kind === "capture") { h.capture(); h.submit(); } else { h.stage(); h.click("Confirm stage change"); }
    const saved = h.data.leads[0]; h.data.leads = change === "delete" ? [] : change === "duplicate" ? [saved, { ...saved }] : [{ ...saved, ...(change === "replace" ? { createdAt: "replacement" } : { customerId: "customer-1" }) }];
    h.failures.clear(); h.click("Retry lead history"); assert.equal(h.writes.length, 1, `${kind}:${change}`); assert.equal(h.data.activities.length, 0);
  }
});

test("history retries accept exact existing evidence once and reject mismatched or duplicate evidence", () => {
  for (const change of ["same", "different", "duplicate"]) {
    const h = harness(); h.stage(); h.failures.add("activities:create"); h.click("Confirm stage change"); const evidence = h.attempts.find(item => item.collection === "activities").item;
    h.data.activities = change === "same" ? [{ ...evidence }] : change === "different" ? [{ ...evidence, summary: "Other activity" }] : [evidence, { ...evidence }]; h.failures.clear(); h.click("Retry lead history");
    assert.equal(h.writes.length, 1); assert.equal(Boolean(h.button("Retry lead history")), change !== "same");
  }
});

test("failed and conflicting lead contact and history sync block writes; pending offline saves remain usable", () => {
  for (const state of ["Failed", "Conflict"]) for (const kind of ["lead", "contact", "history"]) {
    const h = harness(); if (kind === "contact") h.data.leads = [lead({ customerId: "customer-1" })]; h.stage();
    if (kind === "history") { h.failures.add("activities:create"); h.click("Confirm stage change"); const id = h.attempts.find(item => item.collection === "activities").item.id; h.queue.push({ table: "cloud_collections", collectionKey: "jr-os-lead-activities", sourceId: id, state }); h.failures.clear(); h.click("Retry lead history"); assert.equal(h.writes.length, 1); }
    else { h.queue.push(kind === "lead" ? { table: "cloud_collections", collectionKey: "jr-os-leads", sourceId: "lead-1", state } : { table: "customers", sourceId: "customer-1", state }); h.click("Confirm stage change"); assert.equal(h.writes.length, 0); }
  }
  const h = harness(); h.navigator.onLine = false; h.queue.push({ table: "cloud_collections", collectionKey: "jr-os-leads", sourceId: "lead-1", state: "Pending" }); h.stage(); h.click("Confirm stage change"); assert.equal(h.writes.length, 2);
});

test("loading permissions account changes and unmount invalidate already-rendered actions and preserve no cross-account draft", () => {
  for (const kind of ["capture", "stage"]) for (const change of ["loading", "identity-loading", "role", "account", "signed-out", "unmount"]) {
    const h = harness(); let save;
    if (kind === "capture") { h.capture(); save = h.form().props.onSubmit; } else { h.stage(); save = h.button("Confirm stage change").props.onClick; }
    if (change === "loading") { h.ready.activities = false; h.render(); }
    if (change === "identity-loading") h.identityReady(false);
    if (change === "role") h.account({ role: "operative" });
    if (change === "account") h.account({ organisationId: "org-2" });
    if (change === "signed-out") h.signedOut();
    if (change === "unmount") h.unmount();
    save({ preventDefault() {} }); assert.equal(h.writes.length, 0, `${kind}:${change}`);
    if (["role", "account", "signed-out"].includes(change)) { assert.equal(h.form(), undefined); assert.equal(h.button("Confirm stage change"), undefined); }
  }
});

test("local office access works while unknown and absent cloud roles cannot capture or change stages", () => {
  for (const role of [undefined, "unknown", "customer", "engineer"]) { const h = harness(); h.account({ role }); assert.equal(h.button("New lead").props.disabled, true); h.click("New lead"); h.stage(); assert.equal(h.form(), undefined); assert.equal(h.writes.length, 0); }
  const local = harness(); local.signedOut(); local.mode("local"); local.capture(); local.submit(); assert.equal(local.writes.length, 2);
});

test("discarded and superseded action callbacks cannot write or reopen a discarded draft", () => {
  const h = harness(); h.capture(); const submit = h.form().props.onSubmit, edit = h.field("Notes").props.onChange; h.click("Discard lead action"); submit({ preventDefault() {} }); edit({ target: { value: "Old private notes" } }); assert.equal(h.form(), undefined); assert.equal(h.writes.length, 0);
  h.stage(); const confirm = h.button("Confirm stage change").props.onClick; h.click("Discard lead action"); h.stage("Lost"); confirm(); assert.equal(h.writes.length, 0); h.click("Confirm stage change"); assert.equal(h.data.leads[0].stage, "Lost");
});
