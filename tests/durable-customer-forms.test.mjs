import assert from "node:assert/strict";
import test from "node:test";
import { harness, nodes, text, customer } from "./helpers/customer-page-harness.mjs";

const submit = fn => fn({ preventDefault() {} });

test("failed customer creation retains editable details and retries one stable identity", () => {
  const h = harness(); h.openForm(); h.fill(); h.field("Notes", "Door at rear"); h.failures.add("create"); h.submit();
  assert.equal(h.data.customers.length, 0); assert.equal(h.field("Customer name").props.value, "New customer");
  assert.match(text(h.render()), /save could not be confirmed.*draft is still here/);
  const first = h.attempts[0].item; h.field("Customer name", "  Reviewed customer  "); h.failures.clear(); const repeat = h.submitHandler(); submit(repeat); submit(repeat);
  assert.equal(h.form(), undefined); assert.equal(h.writes.length, 1); const saved = h.data.customers[0];
  assert.equal(saved.id, first.id); assert.equal(saved.createdAt, first.createdAt); assert.equal(saved.name, "Reviewed customer"); assert.equal(saved.notes, "Door at rear");
  assert.match(text(h.render()), /Customer saved on this device.*Check sync status/);
});

test("older create edit and close callbacks cannot replace or submit another customer draft", () => {
  const h = harness([customer()]); const staleEdit = h.button("Edit Example customer").props.onClick;
  const open = nodes(h.render()).find(n => n.type === "PageHeader").props.action.props.onClick;
  h.openForm(); h.fill(); const old = h.submitHandler(); const close = nodes(h.render()).find(n => n.type === "PageHeader").props.action.props.onClick;
  h.field("Notes", "Keep my draft"); submit(old); staleEdit(); open(); close();
  assert.equal(h.field("Notes").props.value, "Keep my draft"); assert.equal(h.writes.length, 0);
  const closed = h.submitHandler(); h.openForm(); submit(closed); h.openForm(); h.fill("Next customer"); submit(closed);
  assert.equal(h.writes.length, 0); h.submit(); assert.equal(h.data.customers[0].name, "Next customer");
});

test("customer creation validates required contact and trims fields without inventing contact formats", () => {
  for (const [name, phone, email] of [[" ", "07700 900123", ""], ["Customer", " ", " "]]) {
    const h = harness(); h.openForm(); h.field("Customer name", name); h.field("Phone", phone); h.field("Email", email); h.submit(); assert.equal(h.attempts.length, 0); assert.ok(h.form());
  }
  const h = harness(); h.openForm(); h.field("Customer name", " Customer "); h.field("Email", " customer@example.test "); h.field("Address", " 1 High Street "); h.submit();
  assert.equal(h.data.customers[0].email, "customer@example.test"); assert.equal(h.data.customers[0].address, "1 High Street");
  // Existing nonstandard contacts remain recordable for manual review.
  const phone = harness(); phone.openForm(); phone.fill(); phone.field("Phone", "07700 900123 ext 4"); phone.submit(); assert.equal(phone.writes.length, 1);
});

test("customer saves wait only for their required source and reject stale account callbacks", () => {
  const waiting = harness(); waiting.openForm(); waiting.fill(); waiting.data.ready = false; const old = waiting.submitHandler(); submit(old);
  assert.equal(waiting.writes.length, 0); assert.match(text(waiting.render()), /finish loading.*draft is still here/); waiting.data.ready = true; waiting.data.jobsReady = false; waiting.submit(); assert.equal(waiting.writes.length, 1);
  for (const change of [h => h.account({ role: "electrician" }), h => h.account({ role: "customer" }), h => h.account({ role: "unknown" }), h => h.account({ organisationId: "org-2" }), h => h.account({ userId: "user-2" }), h => h.mode("local"), h => h.signedOut(), h => h.identityLoading(), h => h.unmount(), h => { h.account({ organisationId: "org-2" }); h.account({ organisationId: "org-1" }); }]) {
    for (const edit of [false, true]) {
      const h = harness([customer()]); if (edit) h.click("Edit Example customer"); else { h.openForm(); h.fill(); }
      const callback = h.submitHandler(); change(h); submit(callback); assert.equal(h.attempts.length, 0);
    }
  }
});

test("customer writes apply owner admin office and local permissions without exposing office deletion", () => {
  for (const role of ["owner", "admin", "office"]) {
    const h = harness([customer()]); h.account({ role }); h.openForm(); h.fill(); h.submit(); assert.equal(h.writes.length, 1);
    assert.equal(Boolean(h.button("Delete Example customer")), role !== "office");
  }
  for (const role of ["electrician", "customer", "unknown"]) {
    const h = harness([customer()]); h.account({ role }); assert.equal(nodes(h.render()).find(n => n.type === "PageHeader").props.action, undefined); assert.equal(h.button("Edit Example customer"), undefined); assert.equal(h.button("Delete Example customer"), undefined);
  }
  const local = harness(); local.mode("local"); local.signedOut(); local.openForm(); local.fill(); local.submit(); assert.equal(local.writes.length, 1);
});

test("failed customer edits retain drafts and preserve newer unrelated metadata on retry", () => {
  const saved = customer({ sourceLeadId: "lead-1" }), h = harness([saved]); h.click("Edit Example customer"); h.field("Phone", "07700 900456"); h.failures.add("update"); h.submit();
  assert.equal(h.data.customers[0], saved); assert.equal(h.field("Phone").props.value, "07700 900456");
  h.data.customers = [{ ...saved, sourceLeadId: "lead-2", updatedAt: "2026-10-11T10:00:00Z" }]; h.failures.clear(); const repeat = h.submitHandler(); submit(repeat); submit(repeat);
  assert.equal(h.writes.length, 1); assert.equal(h.data.customers[0].phone, "07700 900456"); assert.equal(h.data.customers[0].sourceLeadId, "lead-2"); assert.equal(h.data.customers[0].createdAt, saved.createdAt);
});

test("changed customer details or replaced identity require explicit saved-value review", () => {
  for (const patch of [{ name: "Changed name" }, { phone: "07700 900456" }, { email: "new@example.test" }, { address: "New address" }, { notes: "Updated notes" }, { createdAt: "2026-10-11T09:00:00Z" }]) {
    const saved = customer(), h = harness([saved]); h.click("Edit Example customer"); h.field("Notes", "My draft"); const old = h.submitHandler();
    h.data.customers = [{ ...saved, ...patch }]; submit(old); // Update must inspect the current repository record, even before a render.
    assert.equal(h.attempts.length, 0); assert.equal(h.field("Notes").props.value, "My draft"); assert.match(text(h.render()), /editable details have changed/);
    h.click("Use saved values"); assert.equal(h.field("Notes").props.value, patch.notes ?? saved.notes); h.submit(); assert.equal(h.writes.length, 1);
  }
});

test("missing duplicate and blank customer identities cannot open or save an edit", () => {
  for (const records of [[], [customer(), customer({ name: "Duplicate" })]]) {
    const h = harness([customer()]), old = h.button("Edit Example customer").props.onClick; h.data.customers = records; h.render(); old(); assert.equal(h.form(), undefined);
    const edited = harness([customer()]); edited.click("Edit Example customer"); const submitOld = edited.submitHandler(); edited.data.customers = records; edited.render(); submit(submitOld); assert.equal(edited.attempts.length, 0); assert.ok(edited.form());
  }
  const blank = harness([customer({ id: " " })]); assert.equal(blank.button("Edit Example customer").props.disabled, true); blank.click("Edit Example customer"); assert.equal(blank.form(), undefined);
});

test("failed customer deletion keeps the record and successful repeated callbacks delete only once", () => {
  const saved = customer(), h = harness([saved]); h.confirm(false); h.click("Delete Example customer"); assert.equal(h.attempts.length, 0);
  h.confirm(true); h.failures.add("delete"); h.click("Delete Example customer"); assert.equal(h.data.customers[0], saved); assert.match(text(h.render()), /Deletion could not be confirmed/);
  h.failures.clear(); const repeat = h.button("Delete Example customer").props.onClick; repeat(); repeat(); assert.equal(h.writes.length, 1); assert.equal(h.data.customers.length, 0); assert.equal(h.confirmations.length, 3);
  assert.match(text(h.render()), /Customer deleted on this device.*Check sync status/);
});

test("customer deletion requires loaded unlinked jobs and rechecks after confirmation", () => {
  for (const change of [h => { h.data.jobsReady = false; }, h => { h.data.jobs = [{ id: "j1", customerId: "customer-1" }]; }]) {
    const h = harness([customer()]); change(h); h.click("Delete Example customer"); assert.equal(h.attempts.length, 0); assert.equal(h.confirmations.length, 0);
    const late = harness([customer()]); late.confirm(true, () => { change(late); late.render(); }); late.click("Delete Example customer"); assert.equal(late.attempts.length, 0);
  }
  const unrelated = harness([customer()]); unrelated.data.jobs = [{ id: "j1", customerId: "another-customer" }]; unrelated.click("Delete Example customer"); assert.equal(unrelated.writes.length, 1);
});

test("customer deletion rejects stale details identity permission and account changes", () => {
  for (const change of [h => { h.data.customers = [{ ...h.data.customers[0], notes: "Changed during confirmation" }]; }, h => { h.data.customers = []; h.render(); }, h => { h.data.customers = [h.data.customers[0], { ...h.data.customers[0] }]; h.render(); }, h => { h.data.ready = false; h.render(); }, h => h.account({ role: "office" }), h => h.account({ organisationId: "org-2" }), h => h.identityLoading(), h => h.unmount(), h => { h.account({ userId: "other" }); h.account({ userId: "user-1" }); }]) {
    const h = harness([customer()]); h.confirm(true, () => change(h)); h.click("Delete Example customer"); assert.equal(h.attempts.length, 0);
  }
  const edit = harness([customer()]); edit.click("Edit Example customer"); edit.click("Delete Example customer"); assert.equal(edit.attempts.length, 0); assert.equal(edit.confirmations.length, 0);
});
