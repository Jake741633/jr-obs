import assert from "node:assert/strict";
import test from "node:test";
import { harness, record, text } from "./helpers/testing-page-harness.mjs";

test("testing save keeps evidence editable and reports an unconfirmed durable write", async () => {
  const h = await harness(); h.field("Active job", "job-1"); h.field("General testing notes", "Measured on site"); h.failures.add("create"); h.submit();
  assert.equal(h.data.persisted.length, 0); assert.equal(h.field("General testing notes").props.value, "Measured on site");
  assert.match(text(h.render()), /save could not be confirmed/i); assert.doesNotMatch(text(h.render()), /You can leave and resume it later/);
  const first = h.attempts[0].item; h.failures.clear(); h.submit();
  assert.equal(h.data.persisted.length, 1); assert.equal(h.data.persisted[0].id, first.id); assert.equal(h.data.persisted[0].createdAt, first.createdAt); assert.equal(h.data.persisted[0].generalNotes, "Measured on site");
});

test("failed testing updates retain the saved evidence and retry without adding records", async () => {
  const original = record(), h = await harness([original]); h.resume(); h.field("General testing notes", "Reviewed results"); h.failures.add("update"); h.submit();
  assert.deepEqual(h.data.persisted, [original]); assert.equal(h.field("General testing notes").props.value, "Reviewed results"); assert.match(text(h.render()), /save could not be confirmed/i);
  h.failures.clear(); h.submit(); assert.equal(h.data.persisted.length, 1); assert.equal(h.data.persisted[0].generalNotes, "Reviewed results");
});

for (const action of ["Mark certificate-ready", "Prepare for linked certificate"]) test(`${action} waits for durable evidence before promoting status`, async () => {
  const h = await harness([record()]); h.resume(); h.failures.add("update"); h.click(action);
  assert.equal(h.data.persisted[0].status, "Draft"); assert.equal(h.field("Status").props.value, "Draft"); assert.match(text(h.render()), /save could not be confirmed/i);
  h.failures.clear(); h.click(action); assert.equal(h.data.persisted[0].status, "Ready for certificate");
});

test("testing edits reject a refreshed source instead of overwriting newer readings", async () => {
  const original = record(), h = await harness([original]); h.resume(); h.field("General testing notes", "My draft"); const save = h.submitHandler();
  const newer = record({ generalNotes: "Newer saved evidence", circuits: [{ ...original.circuits[0], zs: "0.9" }] }); h.data.records = [newer]; h.data.persisted = structuredClone([newer]);
  save({ preventDefault() {} }); assert.deepEqual(h.data.persisted, [newer]); assert.deepEqual(h.data.records, [newer]); assert.equal(h.writes.length, 0); assert.equal(h.field("General testing notes").props.value, "My draft");
  assert.match(text(h.render()), /changed|review/i);
  h.resume(); h.field("General testing notes", "Reviewed merged note"); h.submit(); assert.equal(h.data.persisted[0].circuits[0].zs, "0.9");
});

test("a missing resumed testing record is never recreated by an old edit", async () => {
  const h = await harness([record()]); h.resume(); h.field("General testing notes", "Keep draft"); h.data.records = []; h.data.persisted = []; h.submit();
  assert.equal(h.attempts.length, 0); assert.equal(h.data.records.length, 0); assert.equal(h.field("General testing notes").props.value, "Keep draft");
});

test("an exact testing candidate saved before acknowledgement is recovered without a second write", async () => {
  const h = await harness(); h.field("Active job", "job-1"); h.field("General testing notes", "Keep one record"); h.loseAcknowledgement(); h.submit();
  assert.equal(h.writes.length, 1); assert.match(text(h.render()), /save could not be confirmed/i);
  const saved = h.data.persisted[0]; h.submit(); assert.equal(h.writes.length, 1); assert.equal(h.data.persisted.length, 1); assert.deepEqual(h.data.persisted[0], saved);
});

test("edited evidence after an uncertain acknowledgement updates the same exact saved candidate", async () => {
  const h = await harness(); h.field("Active job", "job-1"); h.field("General testing notes", "First reading"); h.loseAcknowledgement(); h.submit();
  const saved = h.data.persisted[0]; h.field("General testing notes", "Reviewed reading"); h.submit();
  assert.equal(h.data.persisted.length, 1); assert.equal(h.data.persisted[0].id, saved.id); assert.equal(h.data.persisted[0].createdAt, saved.createdAt); assert.equal(h.data.persisted[0].generalNotes, "Reviewed reading");
});

test("a repeated successful testing callback does not add a second write or replace success feedback", async () => {
  const h = await harness(); h.field("Active job", "job-1"); const save = h.submitHandler(); save({ preventDefault() {} }); save({ preventDefault() {} });
  assert.equal(h.attempts.length, 1); assert.equal(h.data.persisted.length, 1); assert.match(text(h.render()), /Testing draft saved locally/); assert.doesNotMatch(text(h.render()), /could not be confirmed/);
});

test("retired testing callbacks cannot save older form values or write after unmount", async () => {
  const h = await harness([record()]); h.resume(); const old = h.submitHandler(); h.field("General testing notes", "Latest draft"); h.render(); old({ preventDefault() {} }); assert.equal(h.attempts.length, 0);
  const current = h.submitHandler(); h.unmount(); current({ preventDefault() {} }); assert.equal(h.attempts.length, 0);
});

test("testing save still requires a current active job and a ready collection", async () => {
  const h = await harness([record()]); h.resume(); h.data.jobs = []; h.submit(); assert.equal(h.attempts.length, 0);
  const loading = await harness([record()]); loading.resume(); const old = loading.submitHandler(); loading.data.ready = false; loading.render(); old({ preventDefault() {} }); assert.equal(loading.attempts.length, 0);
});

test("duplicate saved testing identities stop edits without changing evidence", async () => {
  const h = await harness([record()]); h.resume(); const duplicate = record({ generalNotes: "Other record" }); h.data.records = [record(), duplicate]; h.data.persisted = structuredClone(h.data.records); h.submit(); assert.equal(h.attempts.length, 0); assert.deepEqual(h.data.records, h.data.persisted);
});

test("retired testing actions recheck refreshed jobs and operator attribution", async () => {
  for (const change of [h => { h.data.jobs = []; }, h => { h.data.jobs = [{ ...h.data.jobs[0], customerId: "customer-2" }]; }, h => { h.data.team = [{ ...h.data.team[0], name: "Reviewed inspector" }]; }]) {
    const h = await harness([record()]); h.resume(); const old = h.submitHandler(); change(h); h.render(); old({ preventDefault() {} }); assert.equal(h.attempts.length, 0);
  }
});

test("an older Resume control cannot replace newly entered testing notes", async () => {
  const h = await harness([record()]); h.resume(); const old = h.button("Resume").props.onClick; h.field("General testing notes", "Keep current draft"); h.render(); old(); assert.equal(h.field("General testing notes").props.value, "Keep current draft");
});

for (const status of ["Ready for certificate", "Complete"]) test(`ordinary testing save cannot mark missing evidence ${status}`, async () => {
  const h = await harness(); h.field("Active job", "job-1"); h.field("Status", status); h.submit();
  assert.equal(h.attempts.length, 0); assert.equal(h.data.persisted.length, 0); assert.equal(h.field("Status").props.value, status); assert.match(text(h.render()), /Complete the missing fields/i);
  const complete = await harness([record()]); complete.resume(); complete.field("Status", status); complete.submit(); assert.equal(complete.data.persisted[0].status, status);
});
