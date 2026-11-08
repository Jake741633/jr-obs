import assert from "node:assert/strict";
import test from "node:test";
import { certificate, certificateSaveHarness, compliance, text } from "./helpers/certificate-save-harness.mjs";

const plain = value => JSON.parse(JSON.stringify(value));

test("new certificate revisions are durable before reporting a device save", () => {
  const h = certificateSaveHarness([]); h.click("New certificate"); h.field("Description and testing summary", "New inspection"); h.save();
  assert.equal(h.data.durable.length, 1);
  assert.equal(h.data.durable[0].revisionHistory.length, 1);
  assert.equal(h.data.durable[0].description, "New inspection");
  assert.match(text(h.render()), /saved on this device/i);
  assert.match(text(h.render()), /sync status/i);
});

for (const creating of [false, true]) test(`failed ${creating ? "new" : "existing"} certificate saves retain edits and retry one stable revision`, () => {
  const h = certificateSaveHarness(creating ? [] : [certificate()]); h.click(creating ? "New certificate" : "Open");
  h.field("Description and testing summary", "Retained inspection"); const before = structuredClone(h.data.durable);
  h.fail("before"); assert.doesNotThrow(() => h.save());
  assert.deepEqual(h.data.durable, before);
  assert.equal(h.field("Description and testing summary").props.value, "Retained inspection");
  assert.match(text(h.render()), /could not be confirmed/i);
  assert.doesNotMatch(text(h.render()), /private-storage-secret|Previous versions remain available/);
  const attempted = h.attempts[0].record;
  h.fail(""); h.save();
  const saved = h.data.durable.find(record => record.id === attempted.id);
  assert.equal(saved.revisionHistory.length, creating ? 1 : 2);
  assert.equal(saved.revisionHistory.at(-1).id, attempted.revisionHistory.at(-1).id);
  assert.equal(saved.description, "Retained inspection");
});

for (const creating of [false, true]) test(`uncertain ${creating ? "new" : "existing"} certificate acknowledgements retry without an extra revision`, () => {
  const h = certificateSaveHarness(creating ? [] : [certificate()]); h.click(creating ? "New certificate" : "Open"); h.field("Description and testing summary", "Saved before acknowledgement failed");
  h.fail("after"); assert.doesNotThrow(() => h.save()); const persisted = structuredClone(h.data.durable);
  assert.equal(h.field("Description and testing summary").props.value, "Saved before acknowledgement failed");
  assert.match(text(h.render()), /could not be confirmed/i);
  h.fail(""); h.save();
  assert.deepEqual(h.data.durable, persisted);
  assert.equal(h.writes.length, 1);
  assert.match(text(h.render()), /saved on this device/i);
});

test("editing after an uncommitted failure never appends its failed candidate", () => {
  const h = certificateSaveHarness(); h.open(); h.field("Description and testing summary", "Failed inspection"); h.fail("before"); h.save();
  h.field("Description and testing summary", "Corrected inspection"); h.fail(""); h.save();
  assert.equal(h.data.durable[0].revisionHistory.length, 2);
  assert.equal(h.data.durable[0].revisionHistory.at(-1).snapshot.description, "Corrected inspection");
  assert.ok(!JSON.stringify(h.data.durable).includes("Failed inspection"));
});

test("editing after an uncertain committed save preserves that saved history", () => {
  const h = certificateSaveHarness(); h.open(); h.field("Description and testing summary", "Committed inspection"); h.fail("after"); h.save();
  h.field("Description and testing summary", "Follow-up inspection"); h.fail(""); h.save();
  assert.deepEqual(h.data.durable[0].revisionHistory.slice(1).map(revision => revision.snapshot.description), ["Committed inspection", "Follow-up inspection"]);
});

test("refreshed certificate history cannot be overwritten by an older editor", () => {
  const source = certificate(), h = certificateSaveHarness([source]); h.open(); h.field("Description and testing summary", "Retained edits");
  const newer = compliance.saveCertificateRevision({ ...source, description: "New saved inspection" }, "Office"); h.refresh([newer]); h.save();
  assert.deepEqual(plain(h.data.durable), plain([newer]));
  assert.equal(h.field("Description and testing summary").props.value, "Retained edits");
  assert.match(text(h.render()), /saved certificate.*changed/i);
  h.click("Use saved values"); assert.equal(h.field("Description and testing summary").props.value, "New saved inspection"); h.save();
  assert.equal(h.data.durable[0].revisionHistory.length, 3);
  assert.equal(h.data.durable[0].revisionHistory[1].savedBy, "Office");
});

test("source changes inside the durable updater also retain newer history", () => {
  const source = certificate(), h = certificateSaveHarness([source]); h.open(); h.field("Description and testing summary", "Retained edits");
  const newer = compliance.saveCertificateRevision({ ...source, description: "Updated immediately before persistence" }, "Office");
  h.beforeUpdate(() => { h.data.records = [newer]; h.data.durable = structuredClone([newer]); }); h.save();
  assert.deepEqual(plain(h.data.durable), plain([newer])); assert.equal(h.writes.length, 0);
  assert.equal(h.field("Description and testing summary").props.value, "Retained edits");
});

for (const duplicate of [false, true]) test(`${duplicate ? "duplicate" : "deleted"} certificate identities cannot be overwritten or recreated by retained edits`, () => {
  const source = certificate(), h = certificateSaveHarness([source]); h.open(); h.field("Description and testing summary", "Retain these edits");
  const current = duplicate ? [source, { ...source, description: "Duplicate source" }] : []; h.refresh(current); h.save();
  assert.deepEqual(plain(h.data.durable), plain(current)); assert.equal(h.writes.length, 0);
  assert.equal(h.field("Description and testing summary").props.value, "Retain these edits");
  assert.match(text(h.render()), /unavailable|ambiguous/i);
});

test("an uncertain candidate cannot replace a newer saved revision on retry", () => {
  const h = certificateSaveHarness(); h.open(); h.field("Description and testing summary", "Committed candidate"); h.fail("after"); h.save();
  const newer = compliance.saveCertificateRevision({ ...h.data.durable[0], description: "Newer office revision" }, "Office"); h.refresh([newer]); h.fail(""); h.save();
  assert.deepEqual(plain(h.data.durable), plain([newer])); assert.equal(h.writes.length, 1);
  assert.equal(h.field("Description and testing summary").props.value, "Committed candidate");
});

test("retired form submissions and collection APIs cannot save certificate revisions", () => {
  const h = certificateSaveHarness(); h.open(); const original = plain(h.data.records), closedSubmit = h.saveHandler(); h.click("Close"); h.open(); closedSubmit({ preventDefault() {} }); assert.deepEqual(plain(h.data.records), original);
  const oldApiSubmit = h.saveHandler(); h.retireApi(); oldApiSubmit({ preventDefault() {} }); assert.deepEqual(plain(h.data.records), original);
  const unmountedSubmit = h.saveHandler(); h.unmount(); unmountedSubmit({ preventDefault() {} }); assert.deepEqual(plain(h.data.records), original);
  assert.equal(h.writes.length, 0);
});

test("a retained submit cannot save before certificate records are ready", () => {
  const h = certificateSaveHarness(); h.open(); const submit = h.saveHandler(); h.data.ready = false; h.render(); submit({ preventDefault() {} });
  assert.equal(h.writes.length, 0);
  assert.equal(h.data.records[0].revisionHistory.length, 1);
});

test("a reloaded collection keeps edits accessible while requiring source review before saving", () => {
  const h = certificateSaveHarness(); h.open(); h.retireApi();
  h.field("Description and testing summary", "Edits after collection reload");
  assert.equal(h.field("Description and testing summary").props.value, "Edits after collection reload");
  h.save(); assert.equal(h.writes.length, 0);
  assert.match(text(h.render()), /saved values/i);
  h.click("Use saved values"); h.save(); assert.equal(h.data.durable[0].revisionHistory.length, 2);
});

for (const [failure, label] of [["unsaved", "unsaved"], ["before", "uncommitted"], ["after", "uncertain committed"]]) test(`a new ${label} certificate can be explicitly reviewed after a collection reload without losing its draft`, () => {
  const h = certificateSaveHarness([]); h.click("New certificate"); h.field("Number", "CUSTOM-77"); h.field("Description and testing summary", "Retained new inspection");
  if (failure !== "unsaved") { h.fail(failure); h.save(); }
  const candidate = h.attempts[0]?.record, beforeReload = h.saveHandler(), before = plain(h.data.durable);
  h.reloadApi(); h.fail(""); beforeReload({ preventDefault() {} }); h.save();
  assert.deepEqual(plain(h.data.durable), before);
  h.click("Review draft in current workspace");
  assert.deepEqual(plain(h.data.durable), before, "reviewing the workspace must not save");
  assert.equal(h.field("Number").props.value, "CUSTOM-77");
  assert.equal(h.field("Description and testing summary").props.value, "Retained new inspection");
  h.save();
  assert.equal(h.data.durable.length, 1);
  assert.equal(h.data.durable[0].number, "CUSTOM-77");
  assert.equal(h.data.durable[0].revisionHistory.length, 1);
  if (candidate) {
    assert.equal(h.data.durable[0].id, candidate.id);
    assert.equal(h.data.durable[0].revisionHistory[0].id, candidate.revisionHistory[0].id);
  }
  assert.equal(h.writes.length, 1);
});

test("reviewing a new uncertain draft cannot adopt a changed or duplicate saved candidate", () => {
  for (const duplicate of [false, true]) {
    const h = certificateSaveHarness([]); h.click("New certificate"); h.field("Description and testing summary", "Retained uncertain draft"); h.fail("after"); h.save();
    const candidate = h.data.durable[0];
    const current = duplicate ? [candidate, { ...candidate }] : [compliance.saveCertificateRevision({ ...candidate, description: "Newer inspection" }, "Office")];
    h.refresh(current); h.reloadApi(); h.fail(""); h.save(); h.click("Review draft in current workspace"); h.save();
    assert.deepEqual(plain(h.data.durable), plain(current));
    assert.equal(h.writes.length, 1);
    assert.equal(h.field("Description and testing summary").props.value, "Retained uncertain draft");
  }
});

test("a retired workspace-review action cannot rebind a new draft to a later collection API", () => {
  const h = certificateSaveHarness([]); h.click("New certificate"); h.field("Description and testing summary", "Retained draft"); h.reloadApi(); h.save();
  const review = h.button("Review draft in current workspace"); assert.ok(review);
  h.reloadApi(); review.props.onClick(); h.save();
  assert.equal(h.data.durable.length, 0);
  assert.equal(h.writes.length, 0);
  h.click("Review draft in current workspace"); h.save();
  assert.equal(h.data.durable[0].description, "Retained draft");
});
