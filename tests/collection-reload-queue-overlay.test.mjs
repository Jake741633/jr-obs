import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

function loadLocalTs(url, overrides, globals) {
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const mod = { exports: {} }; cache.set(path, mod);
    const source = ts.transpileModule(readFileSync(path, "utf8"), {
      fileName: path.replace(/\.(mjs|js)$/, ".ts"),
      compilerOptions: { allowJs: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    function require(name) {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      assert.ok(name.startsWith("."), `Unexpected dependency: ${name}`);
      const candidate = resolve(dirname(path), name);
      return load([candidate, ...[".ts", ".mjs", ".js"].map((extension) => candidate + extension)].find(existsSync));
    }
    vm.runInNewContext(source, { module: mod, exports: mod.exports, require, URL, Date, Error, structuredClone, ...globals }, { filename: path });
    return mod.exports;
  }
  return load(fileURLToPath(url));
}

const queueKey = "jr-os-cloud-sync-queue";
const identity = { organisationId: "org-a", userId: "user-a", cacheUserId: "user-a", cacheRole: "owner" };
const original = { id: "record-a", name: "Original" };
const plain = (value) => JSON.parse(JSON.stringify(value));
const row = (payload, version = 3, createdBy = "original-author") => ({ source_id: payload.id, version, created_by: createdBy, payload });

function harness(options = {}, rows = [row(original)]) {
  const owner = { ...identity, storageKey: "jr-os-customers", table: "customers", ...options };
  const values = new Map();
  const storage = {
    get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key),
  };
  let select = async () => rows;
  const clients = { cloudSelect: (...args) => select(...args), cloudSelectFresh: (...args) => select(...args), isCloudConflictError: () => false };
  const adapter = loadLocalTs(new URL("../lib/cloud/adapter.ts", import.meta.url), {
    "./client": clients, "./config": { effectiveCloudMode: () => "cloud" },
    "../supabase/client": { readSupabaseSession: () => ({ user: { id: owner.userId } }), supabaseFetch: async () => [] },
  }, {
    window: { localStorage: storage, addEventListener() {}, dispatchEvent() {} },
    navigator: { onLine: true }, crypto: { randomUUID }, queueMicrotask, Event: class {}, CustomEvent: class {},
  });
  const repository = adapter.createCollectionRepository(owner);
  const versionKey = `jr-os-cloud-versions:${repository.storageKey}`;
  const creatorKey = adapter.recordCreatorStorageKey(repository.storageKey);
  storage.setItem(repository.storageKey, JSON.stringify([original]));
  storage.setItem(versionKey, JSON.stringify({ "record-a": 3 }));
  storage.setItem(creatorKey, JSON.stringify({ "record-a": "original-author" }));
  function queued(overrides = {}) {
    return {
      id: randomUUID(), organisationId: owner.organisationId, userId: owner.userId, role: owner.cacheRole,
      customerSourceId: owner.cacheCustomerSourceId, table: owner.table, collectionKey: owner.collectionKey,
      storageKey: repository.storageKey, sourceId: "record-a", operation: "upsert",
      payload: { ...original, name: "Offline edit" }, expectedVersion: 3, baseVersion: 3, baseIntent: "update",
      state: "Offline", attempts: 0, queuedAt: "2026-11-08T00:00:00Z", ...overrides,
    };
  }
  return {
    repository, queued, storage, values, versionKey, creatorKey,
    queue(items) { storage.setItem(queueKey, JSON.stringify(items)); },
    select(fn) { select = fn; },
    records: () => JSON.parse(storage.getItem(repository.storageKey) || "[]"),
    versions: () => JSON.parse(storage.getItem(versionKey) || "{}"),
    creators: () => plain(repository.recordCreators()),
    pending: () => JSON.parse(storage.getItem(queueKey) || "[]"),
  };
}

for (const state of ["Pending", "Offline", "Failed", "Conflict"]) test(`online reload retains ${state} edits and original conflict bases`, async () => {
  const clean = { id: "clean", name: "Remote clean record" };
  const h = harness({}, [row({ ...original, name: "Remote newer edit" }, 9), row(clean, 7, "clean-author")]);
  const pending = h.queued({ state }); h.queue([pending]);
  assert.deepEqual(plain(await h.repository.list()), [pending.payload, clean]);
  assert.deepEqual(h.records(), [pending.payload, clean]);
  assert.deepEqual(h.versions(), { "record-a": 3, clean: 7 });
  assert.deepEqual(h.creators(), { "record-a": "original-author", clean: "clean-author" });
  assert.deepEqual(h.pending(), [plain(pending)]);
  h.repository.save({ ...pending.payload, phone: "123" });
  assert.equal(h.pending()[0].payload.name, "Offline edit");
  assert.equal(h.pending()[0].expectedVersion, 3);
  assert.equal(h.pending()[0].baseVersion, 3);
});

test("online reload retains queued creates and their creator and create base", async () => {
  const h = harness(); const created = { id: "new", name: "Offline create" };
  h.repository.save(created, 0);
  assert.deepEqual(plain(await h.repository.list()), [original, created]);
  assert.equal(h.versions().new, 0);
  assert.equal(h.creators().new, identity.userId);
  h.repository.save({ ...created, phone: "123" });
  const pending = h.pending().find((item) => item.sourceId === "new");
  assert.equal(pending.expectedVersion, 0); assert.equal(pending.baseIntent, "create");
});

test("online reload does not resurrect a queued delete or its creator", async () => {
  const h = harness(); h.repository.remove(original.id);
  assert.deepEqual(plain(await h.repository.list()), []);
  assert.deepEqual(h.records(), []); assert.deepEqual(h.creators(), {});
  assert.equal(h.versions()[original.id], 3);
  assert.equal(h.pending()[0].operation, "delete");
});

test("queued changes appended while a read awaits survive its stale response", async () => {
  const other = { id: "other", name: "Delete me" };
  const h = harness({}, [row(original), row(other, 4)]);
  await h.repository.list();
  let finish; h.select(() => new Promise((resolve) => { finish = resolve; }));
  const loading = h.repository.list();
  h.repository.save({ ...original, name: "Edit during read" });
  h.repository.save({ id: "new", name: "Create during read" }, 0);
  h.repository.remove(other.id);
  finish([row(original, 8), row(other, 8)]);
  assert.deepEqual(plain(await loading), [{ ...original, name: "Edit during read" }, { id: "new", name: "Create during read" }]);
  assert.deepEqual(h.versions(), { "record-a": 3, other: 4, new: 0 });
  assert.equal(h.creators().new, identity.userId); assert.equal(h.creators().other, undefined);
});

test("a failed read returns current local intent appended while awaiting", async () => {
  const h = harness(); let fail;
  h.select(() => new Promise((_resolve, reject) => { fail = reject; }));
  const loading = h.repository.list(); h.repository.save({ ...original, name: "Edit during failed read" });
  fail(new Error("Offline"));
  assert.deepEqual(plain(await loading), [{ ...original, name: "Edit during failed read" }]);
});

for (const operation of ["edit", "create", "delete"]) test(`confirmed ${operation} during the read survives after replay removes its queue entry`, async () => {
  const h = harness();
  let finish; h.select(() => new Promise((resolve) => { finish = resolve; }));
  const loading = h.repository.list();
  if (operation === "edit") h.repository.save({ ...original, name: "Confirmed edit" });
  if (operation === "create") h.repository.save({ id: "new", name: "Confirmed create" }, 0);
  if (operation === "delete") h.repository.remove(original.id);
  // These are the durable effects of a successful replay: retain the local
  // payload/deletion, advance its version, and remove the applied queue item.
  h.storage.setItem(h.versionKey, JSON.stringify(operation === "create" ? { "record-a": 3, new: 1 } : { "record-a": 4 }));
  h.queue([]);
  finish([row(original)]);
  const expected = operation === "edit" ? [{ ...original, name: "Confirmed edit" }]
    : operation === "create" ? [original, { id: "new", name: "Confirmed create" }] : [];
  assert.deepEqual(plain(await loading), expected);
  assert.deepEqual(h.records(), expected);
  assert.equal(h.versions()[operation === "create" ? "new" : original.id], operation === "create" ? 1 : 4);
  if (operation === "create") assert.equal(h.creators().new, identity.userId);
});

test("a remote deletion still removes an unchanged clean cached record", async () => {
  const h = harness({}, []);
  assert.deepEqual(plain(await h.repository.list()), []);
  assert.deepEqual(h.records(), []); assert.deepEqual(h.versions(), {}); assert.deepEqual(h.creators(), {});
});

test("overlay excludes every other account, permission context, collection and cache", async () => {
  const h = harness({ table: "cloud_collections", collectionKey: "jr-os-surveys", storageKey: "jr-os-surveys", cacheCustomerSourceId: "scope-a" });
  const mismatches = [
    { organisationId: "org-b" }, { userId: "user-b" }, { role: "admin" },
    { customerSourceId: "scope-b" }, { customerSourceId: undefined }, { table: "customers" },
    { collectionKey: "jr-os-rams" }, { collectionKey: undefined }, { storageKey: "other-cache" },
  ];
  h.queue(mismatches.map((mismatch) => h.queued({ ...mismatch, payload: { ...original, name: "Foreign edit" } })));
  assert.deepEqual(plain(await h.repository.list()), [original]);
  assert.deepEqual(h.versions(), { "record-a": 3 });
});

test("queue order determines the last visible intent while the first base is retained", async () => {
  const h = harness(); const latest = { ...original, name: "Last local edit" };
  h.queue([h.queued({ expectedVersion: 2, baseVersion: 2 }), h.queued({ operation: "delete" }), h.queued({ payload: latest, expectedVersion: 4, baseVersion: 4 })]);
  assert.deepEqual(plain(await h.repository.list()), [latest]);
  assert.equal(h.versions()[original.id], 2);
});

test("an unknown queued base never inherits the newer remote version", async () => {
  const h = harness({}, [row(original, 9)]);
  h.queue([h.queued({ expectedVersion: undefined, baseVersion: undefined, baseIntent: "unknown" })]);
  await h.repository.list();
  assert.equal(h.versions()[original.id], undefined);
});

test("projection sanitization still applies to queued field payloads", async () => {
  const h = harness({ storageKey: "jr-os-jobs", table: "jobs", cacheRole: "electrician" }, [row({ id: "record-a", title: "Remote", status: "Scheduled" }, 9)]);
  h.queue([h.queued({ payload: { id: "record-a", title: "Queued", status: "In progress", officeSecret: "Do not cache" } })]);
  const records = plain(await h.repository.list());
  assert.equal(records[0].title, "Queued"); assert.equal(records[0].officeSecret, undefined);
  assert.equal(h.records()[0].officeSecret, undefined); assert.equal(h.versions()[original.id], 3);
});

test("network-only capabilities ignore queued payloads and leave no cache or metadata", async () => {
  const h = harness({ storageKey: "jr-os-certificates", table: "certificates", cacheRole: "customer", cacheCustomerSourceId: "customer-a" });
  h.queue([h.queued()]);
  assert.deepEqual(plain(await h.repository.list()), [original]);
  assert.equal(h.storage.getItem(h.repository.storageKey), null);
  assert.equal(h.storage.getItem(h.versionKey), null); assert.deepEqual(h.creators(), {});
});

test("always-purged field collections cannot regain records from queued payloads", async () => {
  const h = harness({ storageKey: "jr-os-certificates", table: "certificates", cacheRole: "electrician" });
  h.queue([h.queued()]);
  assert.deepEqual(plain(await h.repository.list()), []);
  assert.deepEqual(h.records(), []); assert.deepEqual(h.creators(), {}); assert.deepEqual(h.versions(), {});
});
