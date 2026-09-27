import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as repositoryCore from "../lib/cloud/repository-core.mjs";
import * as cachePolicy from "../lib/cloud/roleProjectionCache-core.mjs";
import * as creatorMetadata from "../lib/cloud/recordCreatorMetadata-core.mjs";
import * as storagePolicy from "../lib/cloud/migrationStoragePolicy-core.mjs";
import * as fieldPolicy from "../lib/cloud/fieldMutationPolicy-core.mjs";
import * as pageIdentity from "../lib/cloud/cloudPageIdentity-core.mjs";

const queueKey = "jr-os-cloud-sync-queue";
const statusKey = "jr-os-cloud-sync-status";
const owner = { organisationId: "org-a", userId: "owner-a", cacheUserId: "owner-a", cacheRole: "owner", table: "cloud_collections", collectionKey: "jr-os-electrical-calculations", storageKey: "jr-os-electrical-calculations" };
const oldRecord = { id: "record-a", title: "Original evidence" };
const plain = (value) => JSON.parse(JSON.stringify(value));

function harness({ mode = "cloud", initial = [oldRecord] } = {}) {
  const values = new Map(), blocked = new Set(), events = [];
  let queueFailure;
  const storage = {
    get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) { if (key === queueKey && queueFailure) queueFailure(); if (blocked.has(key)) throw new Error(`Storage blocked: ${key}`); values.set(key, String(value)); },
    removeItem(key) { if (blocked.has(key)) throw new Error(`Storage blocked: ${key}`); values.delete(key); },
  };
  const navigator = { onLine: false };
  const window = { localStorage: storage, addEventListener() {}, dispatchEvent: (event) => events.push(event) };
  function compile(path, dependencies) {
    const mod = { exports: {} };
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      exports: mod.exports, module: mod, window, navigator, crypto: { randomUUID }, Error, AggregateError, queueMicrotask,
      Event: class Event {}, CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } },
      require(name) { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
    });
    return mod.exports;
  }
  const collections = compile("../lib/cloud/collections.ts", { "./migrationStoragePolicy-core.mjs": storagePolicy, "./fieldMutationPolicy-core.mjs": fieldPolicy });
  const clients = Object.fromEntries(["cloudPatch", "cloudRpc", "cloudSelect", "cloudSelectFresh", "cloudUpsert"].map((name) => [name, async () => { throw new Error(`Unexpected network call: ${name}`); }]));
  const repository = compile("../lib/cloud/repository.ts", {
    "./client": clients, "./collections": collections, "./config": { effectiveCloudMode: () => mode },
    "./repository-core.mjs": repositoryCore, "./cloudPageIdentity-core.mjs": pageIdentity,
    "../supabase/client": { readSupabaseSession: () => null, supabaseFetch: clients.cloudSelect },
  });
  const adapter = compile("../lib/cloud/adapter.ts", {
    "./client": clients, "./collections": collections, "./config": { effectiveCloudMode: () => mode }, "./repository": repository,
    "./recordCreatorMetadata-core.mjs": creatorMetadata, "./roleProjectionCache-core.mjs": cachePolicy,
  });
  const key = adapter.accountStorageKey(owner.storageKey, owner.organisationId, owner.userId, owner.cacheRole);
  const creatorsKey = adapter.recordCreatorStorageKey(key);
  if (initial !== null) storage.setItem(key, JSON.stringify(initial));
  storage.setItem(creatorsKey, JSON.stringify({ "record-a": "owner-a" }));
  storage.setItem(`jr-os-cloud-versions:${key}`, JSON.stringify({ "record-a": 3 }));
  const foreignQueue = { organisationId: "org-b", userId: "owner-b", role: "owner", table: "customers", sourceId: "other", operation: "upsert", payload: { id: "other", name: "Other account" }, state: "Offline", queuedAt: "2026-09-27T12:00:00Z" };
  storage.setItem(queueKey, JSON.stringify([foreignQueue]));
  repository.setActiveSyncIdentity(owner.organisationId, owner.userId, owner.cacheRole);
  const collection = adapter.createCollectionRepository(owner);
  return { values, storage, blocked, events, navigator, window, repository, collection, adapter, collections, compile, mode, key, creatorsKey, foreignQueue,
    raw: () => storage.getItem(key), queue: () => JSON.parse(storage.getItem(queueKey)),
    failQueueWith(callback) { queueFailure = callback; },
  };
}

async function mountedCollection(h, sanitize = (_key, item) => item) {
  const slots = [], effects = []; let cursor = 0;
  const same = (left, right) => left && right.length === left.length && right.every((value, index) => Object.is(value, left[index]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(calculate, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: calculate() }; return slots[i].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(callback, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) { slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = callback(); }); } },
  };
  const hookModule = h.compile("../lib/storage.ts", {
    react, "./cloud/adapter": h.adapter, "./cloud/collections": h.collections, "./cloud/roleProjectionCache-core.mjs": cachePolicy,
    "./cloud/privateFiles": { cloudSafeFileRecord: sanitize, usePrivateFileCollectionBridge: ({ items }) => ({ items }) },
    "./cloud/useCloudIdentity": { useCloudIdentity: () => ({ identity: { organisationId: owner.organisationId, userId: owner.userId, role: owner.cacheRole }, isReady: true, mode: h.mode }) },
  });
  function render() { cursor = 0; const result = hookModule.useCloudLocalCollection(owner.storageKey); effects.splice(0).forEach((effect) => effect()); return result; }
  render(); await new Promise((resolve) => setImmediate(resolve));
  let hook = render(); assert.equal(hook.isReady, true);
  return { update(change) { hook.setItems(change); hook = render(); return hook; } };
}

for (const operation of ["create", "update", "remove"]) test(`collection-hook ${operation} must not prewrite the cache before a failed enqueue`, async () => {
  const h = harness(); const hook = await mountedCollection(h); const before = new Map(h.values);
  h.blocked.add(queueKey);
  const next = operation === "create" ? [oldRecord, { id: "new", title: "New evidence" }] : operation === "update" ? [{ ...oldRecord, title: "Changed evidence" }] : [];
  assert.throws(() => hook.update(next), /Storage blocked/);
  assert.deepEqual(h.values, before);
});

test("successful hook writes preserve display ordering without restoring stripped file bytes", async () => {
  const h = harness();
  const hook = await mountedCollection(h, (_key, item) => { const safe = { ...item }; delete safe.privateBytes; return safe; });
  hook.update([{ id: "new", title: "New evidence", privateBytes: "device-only" }, oldRecord]);
  assert.deepEqual(JSON.parse(h.raw()), [{ id: "new", title: "New evidence" }, oldRecord]);
  assert.equal(h.queue().find((item) => item.sourceId === "new").payload.privateBytes, undefined);
});

test("failed queue creation restores a previously absent local collection and creator metadata", () => {
  const h = harness({ initial: null });
  const beforeCreators = h.storage.getItem(h.creatorsKey);
  h.blocked.add(queueKey);
  assert.throws(() => h.collection.save({ id: "new", title: "Draft evidence" }, 0), /Storage blocked/);
  assert.equal(h.raw(), null);
  assert.equal(h.storage.getItem(h.creatorsKey), beforeCreators);
  assert.deepEqual(plain(h.collection.recordCreators()), { "record-a": "owner-a" });
  assert.deepEqual(h.queue(), [h.foreignQueue]);
});

for (const operation of ["update", "remove"]) test(`failed queued ${operation} restores the exact local record, metadata and base version`, () => {
  const h = harness(); const before = new Map(h.values);
  h.blocked.add(queueKey);
  assert.throws(() => operation === "update" ? h.collection.save({ ...oldRecord, title: "Edited evidence" }) : h.collection.remove(oldRecord.id), /Storage blocked/);
  assert.deepEqual(h.values, before);
  assert.equal(h.collection.recordCreators()[oldRecord.id], "owner-a");
});

test("failed cache writes never enqueue or change creator metadata", () => {
  const h = harness(); const before = new Map(h.values);
  h.blocked.add(h.key);
  assert.throws(() => h.collection.save({ id: "new", title: "New evidence" }, 0), /Storage blocked/);
  assert.deepEqual(h.values, before);
  assert.throws(() => h.collection.remove(oldRecord.id), /Storage blocked/);
  assert.deepEqual(h.values, before);
});

test("retry after queue storage recovers creates one local and queued record without touching another account", () => {
  const h = harness({ initial: null }); const record = { id: "new", title: "New evidence" };
  h.blocked.add(queueKey); assert.throws(() => h.collection.save(record, 0));
  assert.equal(h.raw(), null);
  h.blocked.delete(queueKey); h.collection.save(record, 0);
  assert.deepEqual(JSON.parse(h.raw()), [record]);
  assert.equal(h.queue().length, 2); assert.deepEqual(h.queue()[0], h.foreignQueue);
  assert.equal(h.queue()[1].baseIntent, "create"); assert.equal(h.queue()[1].expectedVersion, 0);
  assert.equal(h.collection.recordCreators().new, owner.userId);
});

test("optional status-cache failures do not turn a durable queued save into an error", () => {
  const h = harness(); h.blocked.add(statusKey);
  assert.doesNotThrow(() => h.collection.save({ id: "new", title: "New evidence" }, 0));
  assert.equal(h.queue().length, 2);
  assert.equal(JSON.parse(h.raw()).length, 2);
  assert.equal(h.events.at(-1).type, "jr-os-sync-status");
  assert.equal(h.events.at(-1).detail, "Offline");
  h.storage.getItem = (key) => key === statusKey ? '"Synced"' : h.values.get(key) ?? null;
  assert.equal(h.repository.syncStatus.get(), "Offline");
});

test("local-only saves and removes never require queue persistence", () => {
  const h = harness({ mode: "local" }); h.blocked.add(queueKey);
  h.collection.save({ id: "new", title: "Local draft" }, 0);
  assert.equal(JSON.parse(h.raw()).length, 2);
  h.collection.remove("new"); assert.deepEqual(JSON.parse(h.raw()), [oldRecord]);
  assert.deepEqual(h.queue(), [h.foreignQueue]);
});

test("authorization-storage failures happen before queue commit and restore the cache", () => {
  const h = harness(); const before = new Map(h.values);
  h.storage.getItem = (key) => { if (key === "jr-os-active-user") throw new Error("Account storage unavailable"); return h.values.get(key) ?? null; };
  assert.throws(() => h.collection.save({ id: "new", title: "New evidence" }, 0), /Account storage unavailable/);
  assert.deepEqual(h.values, before);
});

test("status notification errors cannot roll back a durably queued save", () => {
  const h = harness();
  h.window.dispatchEvent = () => { throw new Error("Notification failed"); };
  assert.doesNotThrow(() => h.collection.save({ id: "new", title: "New evidence" }, 0));
  assert.equal(h.queue().length, 2);
  assert.equal(JSON.parse(h.raw()).length, 2);
  assert.equal(h.collection.recordCreators().new, owner.userId);
});

test("rollback failure is explicit and keeps creator metadata and the durable queue unchanged", () => {
  const h = harness();
  h.failQueueWith(() => { h.blocked.add(h.key); throw new Error("Queue is full"); });
  assert.throws(() => h.collection.save({ ...oldRecord, title: "Unconfirmed edit" }), /local recovery is incomplete/);
  assert.equal(JSON.parse(h.raw())[0].title, "Unconfirmed edit");
  assert.deepEqual(h.queue(), [h.foreignQueue]);
  assert.equal(h.collection.recordCreators()[oldRecord.id], "owner-a");
});

test("rollback never overwrites an intervening local edit from another tab", () => {
  const h = harness();
  const concurrent = [{ ...oldRecord, title: "Another tab's edit" }];
  h.failQueueWith(() => { h.values.set(h.key, JSON.stringify(concurrent)); throw new Error("Queue is full"); });
  assert.throws(() => h.collection.save({ ...oldRecord, title: "This tab's edit" }), /local recovery is incomplete/);
  assert.deepEqual(JSON.parse(h.raw()), concurrent);
  assert.deepEqual(h.queue(), [h.foreignQueue]);
});

test("successful updates and removals retain the known version and queue intent", () => {
  const h = harness();
  h.collection.save({ ...oldRecord, title: "Reviewed evidence" });
  let change = h.queue().find((item) => item.sourceId === oldRecord.id);
  assert.equal(change.expectedVersion, 3); assert.equal(change.baseVersion, 3); assert.equal(change.baseIntent, "update");
  assert.equal(h.collection.recordCreators()[oldRecord.id], "owner-a");
  h.collection.remove(oldRecord.id);
  change = h.queue().find((item) => item.sourceId === oldRecord.id);
  assert.equal(change.operation, "delete"); assert.equal(change.baseVersion, 3);
  assert.deepEqual(JSON.parse(h.raw()), []);
  assert.equal(h.collection.recordCreators()[oldRecord.id], undefined);
  assert.deepEqual(h.queue()[0], h.foreignQueue);
});
