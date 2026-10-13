import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as repositoryCore from "../lib/cloud/repository-core.mjs";
import * as fieldPolicy from "../lib/cloud/fieldMutationPolicy-core.mjs";
import * as migrationPolicy from "../lib/cloud/migrationStoragePolicy-core.mjs";
import * as pageIdentity from "../lib/cloud/cloudPageIdentity-core.mjs";

const queueKey = "jr-os-cloud-sync-queue";
const identity = { organisationId: "org-a", userId: "user-a", role: "owner" };
const payload = { id: "record-a", title: "Unsynchronised edit" };

function loadTs(path, dependencies, globals = {}) {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const commonJsModule = { exports: {} };
  vm.runInNewContext(output, {
    module: commonJsModule, exports: commonJsModule.exports, ...globals,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return commonJsModule.exports;
}

const collections = loadTs("../lib/cloud/collections.ts", {
  "./fieldMutationPolicy-core.mjs": fieldPolicy,
  "./migrationStoragePolicy-core.mjs": migrationPolicy,
});

function queued(overrides = {}) {
  return {
    ...identity, id: "mutation-a", table: "cloud_collections", collectionKey: "jr-os-surveys",
    storageKey: "jr-os-surveys", sourceId: "record-a", operation: "upsert", payload,
    expectedVersion: 2, queuedAt: "2026-09-27T12:00:00.000Z", attempts: 1, state: "Failed",
    ...overrides,
  };
}

function remote(overrides = {}) {
  return { organisation_id: "org-a", collection_key: "jr-os-surveys", source_id: "record-a", version: 2, payload, deleted_at: null, ...overrides };
}

function harness({ queue = [queued()], rows = [], read, patch, upsert, online = true } = {}) {
  const values = new Map([[queueKey, JSON.stringify(queue)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const calls = { reads: [], writes: [] };
  const api = loadTs("../lib/cloud/repository.ts", {
    "./repository-core.mjs": repositoryCore,
    "./collections": collections,
    "./config": { effectiveCloudMode: () => "migration" },
    "./cloudPageIdentity-core.mjs": pageIdentity,
    "../supabase/client": {
      readSupabaseSession: () => ({ user: { id: "user-a" } }),
      supabaseFetch: async () => [{ organisation_id: "org-a", role: "owner", active: true }],
    },
    "./client": {
      isCloudConflictError: () => false,
      cloudSelect: async (table, query) => {
        calls.reads.push({ table, query });
        if (read) await read(api);
        const filter = new URLSearchParams(query);
        return rows.filter((row) => row.organisation_id === filter.get("organisation_id")?.slice(3)
          && row.source_id === filter.get("source_id")?.slice(3)
          && row.collection_key === filter.get("collection_key")?.slice(3));
      },
      cloudPatch: async (...args) => {
        calls.writes.push({ kind: "patch", args });
        if (patch) return patch(...args);
        throw new Error("Write failed; keep the queued change");
      },
      cloudUpsert: async (...args) => {
        calls.writes.push({ kind: "upsert", args });
        if (upsert) return upsert(...args);
        throw new Error("Write failed; keep the queued change");
      },
    },
  }, {
    window: { localStorage: storage, addEventListener() {}, dispatchEvent() {} },
    navigator: { onLine: online },
    crypto: { randomUUID: () => "replacement-mutation" },
    Event: class {}, CustomEvent: class {},
  });
  api.setActiveSyncIdentity(identity.organisationId, identity.userId, identity.role);
  return { api, calls, queue: () => JSON.parse(values.get(queueKey)) };
}

for (const [label, rows] of [
  ["missing cloud record", []],
  ["unrelated cloud record", [remote({ source_id: "unrelated" })]],
  ["same ID in another tenant", [remote({ organisation_id: "org-b" })]],
  ["same ID in another collection", [remote({ collection_key: "jr-os-rams" })]],
]) {
  test(`failed upsert remains recoverable with a ${label}`, async () => {
    const h = harness({ rows });
    const result = await h.api.flushSyncQueue();
    assert.equal(result.cleared, 0);
    assert.equal(result.failed, 1);
    assert.deepEqual(h.queue()[0].payload, payload);
    assert.equal(h.queue()[0].operation, "upsert");
    assert.match(h.calls.reads[0].query, /organisation_id=eq.org-a&source_id=eq.record-a&collection_key=eq.jr-os-surveys/);
  });
}

test("a different cloud payload with a newer version stays a conflict", async () => {
  const h = harness({ rows: [remote({ version: 3, payload: { id: "record-a", title: "Other edit" } })] });
  const result = await h.api.flushSyncQueue();
  assert.equal(result.conflicts, 1);
  assert.deepEqual(h.queue()[0].payload, payload);
  assert.equal(h.calls.writes.length, 0);
});

test("a failed update against the expected version retains its payload", async () => {
  const h = harness({ rows: [remote({ payload: { id: "record-a", title: "Old edit" } })] });
  assert.equal((await h.api.flushSyncQueue()).failed, 1);
  assert.equal(h.calls.writes[0].kind, "patch");
  assert.deepEqual(h.queue()[0].payload, payload);
});

test("a failed delete cannot clear while its cloud row is live", async () => {
  const h = harness({ queue: [queued({ operation: "delete" })], rows: [remote()] });
  const result = await h.api.flushSyncQueue();
  assert.equal(result.failed, 1);
  assert.equal(result.cleared, 0);
  assert.equal(h.queue()[0].operation, "delete");
});

for (const [label, operation, rows] of [
  ["identical applied upsert", "upsert", [remote()]],
  ["applied tombstone", "delete", [remote({ deleted_at: "2026-09-27T10:00:00Z" })]],
  ["already absent deletion", "delete", []],
]) {
  test(`${label} clears after exact-record reconciliation without a rewrite`, async () => {
    const h = harness({ queue: [queued({ operation })], rows });
    assert.equal((await h.api.flushSyncQueue()).cleared, 1);
    assert.deepEqual(h.queue(), []);
    assert.equal(h.calls.writes.length, 0);
  });
}

test("an upsert never resurrects a deleted record", async () => {
  const h = harness({ rows: [remote({ deleted_at: "2026-09-27T10:00:00Z" })] });
  assert.equal((await h.api.flushSyncQueue()).conflicts, 1);
  assert.equal(h.queue().length, 1);
  assert.equal(h.calls.writes.length, 0);
});

test("a delete clears only after the version-guarded write succeeds", async () => {
  const h = harness({ queue: [queued({ operation: "delete" })], rows: [remote()], patch: async () => [remote({ version: 3, deleted_at: "2026-09-27T10:00:00Z" })] });
  assert.equal((await h.api.flushSyncQueue()).cleared, 1);
  assert.match(h.calls.writes[0].args[1], /version=eq.2/);
  assert.deepEqual(h.queue(), []);
});

for (const [label, nextIdentity] of [
  ["account", ["org-b", "user-b", "owner"]],
  ["role", ["org-a", "user-a", "electrician"]],
  ["sign-out", [null, null, null]],
]) {
  test(`${label} change during the exact-record read retains the original operation`, async () => {
    const h = harness({ rows: [remote()], read: async (api) => api.setActiveSyncIdentity(...nextIdentity) });
    assert.equal((await h.api.flushSyncQueue()).cleared, 0);
    assert.deepEqual(h.queue(), [queued()]);
    assert.equal(h.calls.writes.length, 0);
  });
}

test("replacing an operation during reconciliation preserves the newer edit", async () => {
  const replacement = { id: "record-a", title: "Newer unsent edit" };
  const h = harness({ rows: [remote()], read: async (api) => api.queueChange({ ...queued(), payload: replacement }) });
  await h.api.flushSyncQueue();
  assert.equal(h.queue().length, 1);
  assert.deepEqual(h.queue()[0].payload, replacement);
  assert.notEqual(h.queue()[0].id, "mutation-a");
});

test("another account's failed change remains in the organisation queue", async () => {
  const other = queued({ id: "other", userId: "user-b" });
  const h = harness({ queue: [queued(), other], rows: [remote()] });
  await h.api.flushSyncQueue();
  assert.deepEqual(h.queue(), [other]);
});

test("offline retries preserve pending data", async () => {
  const h = harness({ online: false });
  assert.equal((await h.api.flushSyncQueue()).remaining, 1);
  assert.deepEqual(h.queue(), [queued()]);
  assert.equal(h.calls.reads.length, 0);
});

test("rendered cutover page offers safe retry with no per-record discard", async () => {
  const h = harness({ rows: [remote({ source_id: "unrelated" })] });
  const report = { checkedAt: "2026-09-27T10:00:00Z", collections: [], blockers: ["Failed queue"], pendingQueueCount: 0, failedQueueCount: 1, conflictQueueCount: 0 };
  const initialState = [report, [queued()], false, false, false, "", ""];
  let stateIndex = 0;
  let retry;
  const jsx = (type, props) => ({ type, props });
  const page = loadTs("../app/cloud/cutover/page.tsx", {
    "react": { useState: () => [initialState[stateIndex++], () => {}] },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "lucide-react": {},
    "../../../components/ui/Button": { Button: "Button" },
    "../../../components/ui/Card": { Card: "Card" },
    "../../../lib/cloud/cutover": { runCloudCutoverCheck: async () => report },
    "../../../lib/cloud/repository": { ...h.api, flushSyncQueue: () => (retry = h.api.flushSyncQueue()) },
    "../../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ identity, isReady: true, mode: "migration" }) },
  });
  const buttons = [];
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.type === "Button") buttons.push(node);
    walk(node.props?.children);
  }
  walk(page.default());
  assert.equal(buttons.length, 3, "only identity refresh, readiness read and safe retry are offered");
  const retryButton = buttons.find((button) => JSON.stringify(button.props.children).includes("Retry pending changes"));
  assert.ok(retryButton);
  retryButton.props.onClick();
  await retry;
  assert.equal(h.queue().length, 1);
  assert.deepEqual(h.queue()[0].payload, payload);
  assert.equal(h.api.discardSyncQueueItem, undefined);
});
