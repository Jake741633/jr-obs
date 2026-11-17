import assert from "node:assert/strict";
import { File } from "node:buffer";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as policy from "../lib/cloud/migrationStoragePolicy-core.mjs";
import * as rolePolicy from "../lib/cloud/roleProjectionCache-core.mjs";
import * as creators from "../lib/cloud/recordCreatorMetadata-core.mjs";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";

function module(path, dependencies, globals) {
  const mod = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module: mod, exports: mod.exports, Error, URL, ...globals, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return mod.exports;
}
const context = { organisationId: "org", userId: "user", role: "owner" };
const identity = loadLocalTs(new URL("../lib/assistantIdentity.ts", import.meta.url));
const collections = loadLocalTs(new URL("../lib/cloud/collections.ts", import.meta.url));
function harness() {
  const values = new Map(), operations = []; let intercept = () => {};
  const storage = {
    get length() { return values.size; }, key(index) { return [...values.keys()][index] ?? null; }, getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { const operation = { type: "set", key, value: String(value) }; operations.push(operation); intercept(operation); values.set(key, String(value)); },
    removeItem(key) { const operation = { type: "remove", key }; operations.push(operation); intercept(operation); values.delete(key); },
  };
  const globals = { window: { localStorage: storage }, navigator: { onLine: false } };
  const adapter = module("../lib/cloud/adapter.ts", { "./client": {}, "./collections": collections, "./config": { effectiveCloudMode: () => "local" }, "./recordCreatorMetadata-core.mjs": creators, "./repository": {}, "./roleProjectionCache-core.mjs": rolePolicy }, globals);
  const app = module("../lib/appData.ts", { "./cloud/adapter": adapter, "./cloud/migrationStoragePolicy-core.mjs": policy }, globals);
  const key = (base, owner = context) => policy.backupStorageScope(base) === "organisation" ? adapter.organisationStorageKey(base, owner.organisationId) : adapter.accountStorageKey(base, owner.organisationId, owner.userId, owner.role, owner.customerSourceId);
  return { values, operations, key, app, intercept(fn) { intercept = fn; },
    restore(data, owner = context, resolve = async () => owner) { return app.importJrOsBackup(new File([JSON.stringify({ app: "JR OS", version: 1, organisationId: "org", data })], "synthetic-backup.json"), owner, resolve); },
    async customers() { return adapter.createCollectionRepository({ storageKey: "jr-os-customers", table: "customers", organisationId: context.organisationId, userId: context.userId, cacheUserId: context.userId, cacheRole: context.role }).list(); },
  };
}
const oldCustomers = '[ { "id": "old-customer", "name": "Existing customer" } ]';
const newCustomers = [{ id: "new-customer", name: "Restored customer" }];

for (const payload of [{ invalid: "object" }, null, "not-json", "[null]", '"text"', [null], ["text"], [42], [[]], [{ id: { invalid: "identity" } }]]) {
  test(`invalid customer backup cannot replace the real collection consumer: ${JSON.stringify(payload)}`, async () => {
    const h = harness(); h.values.set(h.key("jr-os-customers"), oldCustomers); let failure;
    try { await h.restore({ "jr-os-customers": payload }); } catch (error) { failure = error; }
    assert.equal(h.operations.length, 0, "invalid backup must perform no writes");
    const records = await h.customers(); assert.doesNotThrow(() => identity.savedIdentityIndex(records)); assert.equal(records.length, 1); assert.equal(records[0].id, "old-customer");
    assert.match(failure?.message ?? "", /valid|review|record|section/i);
  });
}
test("all backup sections validate before any destination is written", async () => {
  const h = harness(); h.values.set(h.key("jr-os-customers"), oldCustomers);
  await assert.rejects(h.restore({ "jr-os-customers": newCustomers, "jr-os-jobs": [null] }), /valid|record|section/i);
  assert.equal(h.operations.length, 0); assert.equal(h.values.get(h.key("jr-os-customers")), oldCustomers);
});
test("invalid top-level backup data cannot be reported as a successful empty restore", async () => {
  for (const data of [[], [newCustomers], "[]", null]) {
    const h = harness(); await assert.rejects(h.restore(data), /valid JR OS backup/i); assert.equal(h.operations.length, 0);
  }
});
test("current and serialized legacy backups retain collection and separate AI profile formats", async () => {
  const h = harness(); const legacyJobs = ' [ { "id": "job", "customerId": "new-customer" } ] ';
  assert.equal(await h.restore({ "jr-os-customers": newCustomers, "jr-os-jobs": legacyJobs, "jr-os-ai-profile": { businessName: "Restored business", preferredSuppliers: ["CEF"] }, "jr-os-quote-engine-settings": [{ materialMarkupPercent: 20 }] }), 4);
  assert.equal(h.values.get(h.key("jr-os-jobs")), legacyJobs);
  assert.deepEqual(JSON.parse(h.values.get(h.key("jr-os-ai-profile"))), { businessName: "Restored business", preferredSuppliers: ["CEF"] });
  assert.equal((await h.customers())[0].id, "new-customer");
  assert.deepEqual(JSON.parse(JSON.stringify(h.app.exportJrOsData(context).data["jr-os-customers"])), newCustomers);
});
test("serialized legacy AI profiles retain their validated original bytes", async () => {
  const h = harness(); const previous = ' { "businessName": "Legacy business", "learningEnabled": false } ';
  assert.equal(await h.restore({ "jr-os-ai-profile": previous }), 1); assert.equal(h.values.get(h.key("jr-os-ai-profile")), previous);
});
for (const payload of [[], null, "broken", { preferredSuppliers: 5 }, { defaultLabourRate: null }, { learningEnabled: "yes" }, { quoteStyle: "unsupported" }]) {
  test(`invalid AI profile cannot overwrite organisation settings: ${JSON.stringify(payload)}`, async () => {
    const h = harness(); const previous = '{"businessName":"Existing business"}'; h.values.set(h.key("jr-os-ai-profile"), previous);
    await assert.rejects(h.restore({ "jr-os-ai-profile": payload }), /valid|profile|section/i);
    assert.equal(h.operations.length, 0); assert.equal(h.values.get(h.key("jr-os-ai-profile")), previous);
  });
}
test("quota failure on a later section restores exact prior bytes in reverse write order", async () => {
  const h = harness(); const oldJobs = '[{"id":"old-job","customerId":"old-customer"}]';
  h.values.set(h.key("jr-os-customers"), oldCustomers); h.values.set(h.key("jr-os-jobs"), oldJobs);
  h.intercept(operation => { if (operation.key === h.key("jr-os-invoices")) throw new Error("Synthetic quota exceeded"); });
  await assert.rejects(h.restore({ "jr-os-customers": newCustomers, "jr-os-jobs": [{ id: "new-job", customerId: "new-customer" }], "jr-os-invoices": [] }), /recover|restor|quota/i);
  assert.equal(h.values.get(h.key("jr-os-customers")), oldCustomers); assert.equal(h.values.get(h.key("jr-os-jobs")), oldJobs); assert.equal(h.values.has(h.key("jr-os-invoices")), false);
  assert.deepEqual(h.operations.slice(-2).map(item => item.key), [h.key("jr-os-jobs"), h.key("jr-os-customers")]);
});
test("second-write failure removes an originally absent first destination", async () => {
  const h = harness(); h.intercept(operation => { if (operation.key === h.key("jr-os-jobs")) throw new Error("Synthetic quota exceeded"); });
  await assert.rejects(h.restore({ "jr-os-customers": newCustomers, "jr-os-jobs": [] }), /recover|restor|quota/i);
  assert.equal(h.values.has(h.key("jr-os-customers")), false); assert.equal(h.operations.at(-1).type, "remove");
});
test("second-write quota failure recovers the existing customer and job relationship", async () => {
  const h = harness(); const oldJobs = '[{"id":"old-job","customerId":"old-customer"}]';
  h.values.set(h.key("jr-os-customers"), oldCustomers); h.values.set(h.key("jr-os-jobs"), oldJobs);
  h.intercept(operation => { if (operation.key === h.key("jr-os-jobs")) throw new Error("Synthetic quota exceeded"); });
  await assert.rejects(h.restore({ "jr-os-customers": newCustomers, "jr-os-jobs": [{ id: "new-job", customerId: "new-customer" }] }), /recover|restor/i);
  assert.equal(h.values.get(h.key("jr-os-customers")), oldCustomers); assert.equal(h.values.get(h.key("jr-os-jobs")), oldJobs);
});
test("rollback storage failure is reported explicitly while other completed sections still recover", async () => {
  const h = harness(); h.values.set(h.key("jr-os-customers"), oldCustomers);
  h.intercept(operation => { if (operation.key === h.key("jr-os-invoices")) throw new Error("Synthetic quota exceeded"); if (operation.type === "remove" && operation.key === h.key("jr-os-jobs")) throw new Error("Synthetic recovery failure"); });
  await assert.rejects(h.restore({ "jr-os-customers": newCustomers, "jr-os-jobs": [], "jr-os-invoices": [] }), /recovery is incomplete/i);
  assert.equal(h.values.get(h.key("jr-os-customers")), oldCustomers); assert.equal(h.values.get(h.key("jr-os-jobs")), "[]");
});
test("rollback preserves an intervening change and reports incomplete recovery", async () => {
  const h = harness(); h.values.set(h.key("jr-os-customers"), oldCustomers); const intervening = '[{"id":"intervening-customer"}]';
  h.intercept(operation => { if (operation.key === h.key("jr-os-jobs")) { h.values.set(h.key("jr-os-customers"), intervening); throw new Error("Synthetic quota exceeded"); } });
  await assert.rejects(h.restore({ "jr-os-customers": newCustomers, "jr-os-jobs": [] }), /recovery is incomplete/i);
  assert.equal(h.values.get(h.key("jr-os-customers")), intervening); assert.equal(h.operations.filter(operation => operation.key === h.key("jr-os-customers")).length, 1);
});
test("account replacement during file reading or validation prevents every destination write", async () => {
  for (const replacement of [{ ...context, userId: "other" }, { ...context, role: "admin" }, { ...context, organisationId: "other" }, { ...context, customerSourceId: "other" }, null]) {
    const h = harness(); await assert.rejects(h.restore({ "jr-os-customers": newCustomers }, context, async () => replacement), /account changed/i); assert.equal(h.operations.length, 0);
  }
});
test("restricted capability keys and internal or already scoped keys remain excluded", async () => {
  for (const role of ["customer", "electrician"]) {
    const h = harness(); const owner = { ...context, role, customerSourceId: "customer" };
    const data = { "jr-os-job-documents": null, "jr-os-cloud-sync-queue": null, [h.key("jr-os-customers")]: null, "jr-os-unknown": null, "jr-os-customers": newCustomers };
    if (role === "customer") { data["jr-os-certificates"] = null; data["jr-os-portal-payment-links"] = null; }
    assert.equal(await h.restore(data, owner), 1); assert.deepEqual([...h.values.keys()], [h.key("jr-os-customers", owner)]);
  }
});
