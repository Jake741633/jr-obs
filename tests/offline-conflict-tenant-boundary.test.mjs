import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  coalesceQueue,
  pendingImports,
  queueModeChange,
  retainVersionConflict,
  tenantRecordQuery,
} from "../lib/cloud/repository-core.mjs";

const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");

function change(organisationId, overrides = {}) {
  return {
    id: `${organisationId}:customers:shared-id`,
    table: "customers",
    operation: "upsert",
    organisationId,
    sourceId: "shared-id",
    payload: { id: "shared-id", name: organisationId },
    expectedVersion: 1,
    state: "Pending",
    ...overrides,
  };
}

test("offline queue coalescing never merges identical record ids across organisations", () => {
  const orgA = change("org-a");
  const orgB = change("org-b");
  const both = coalesceQueue([orgA], orgB);

  assert.equal(both.length, 2);
  const updatedA = coalesceQueue(both, change("org-a", { payload: { id: "shared-id", name: "updated-a" } }));
  assert.equal(updatedA.length, 2);
  assert.equal(updatedA.find((item) => item.organisationId === "org-a")?.payload.name, "updated-a");
  assert.equal(updatedA.find((item) => item.organisationId === "org-b")?.payload.name, "org-b");
});

test("version conflicts remain attached only to the originating tenant change", () => {
  const orgA = change("org-a");
  const orgB = change("org-b");
  const queue = retainVersionConflict([orgB], orgA, 4);

  assert.equal(queue.length, 2);
  assert.equal(queue.find((item) => item.organisationId === "org-a")?.state, "Conflict");
  assert.equal(queue.find((item) => item.organisationId === "org-b")?.state, "Pending");
  assert.match(queue.find((item) => item.organisationId === "org-a")?.error ?? "", /Cloud version 4/);
});

test("offline mode preserves tenant-separated changes until the active tenant reconnects", () => {
  const orgA = change("org-a");
  const orgB = change("org-b");
  const result = queueModeChange({ mode: "migration", online: false, queue: [orgA], change: orgB });

  assert.equal(result.status, "Offline");
  assert.equal(result.queue.length, 2);
  assert.deepEqual(new Set(result.queue.map((item) => item.organisationId)), new Set(["org-a", "org-b"]));
});

test("tenant record queries always include encoded organisation and source ids", () => {
  const query = tenantRecordQuery({
    organisationId: "org/a",
    sourceId: "record?1",
    collectionKey: "jr-os-drafts",
    includeDeleted: true,
  });

  assert.match(query, /organisation_id=eq\.org%2Fa/);
  assert.match(query, /source_id=eq\.record%3F1/);
  assert.match(query, /collection_key=eq\.jr-os-drafts/);
  assert.match(query, /limit=1$/);
});

test("offline import cannot resurrect a tenant tombstone", () => {
  const local = [{ id: "shared-id", updatedAt: "2026-08-02T10:00:00.000Z" }];
  const cloud = [{ source_id: "shared-id", source_updated_at: "2026-08-01T10:00:00.000Z", deleted_at: "2026-08-02T09:00:00.000Z" }];

  assert.deepEqual(pendingImports(local, cloud), []);
});

test("background sync merges results into the live queue without crossing tenants", () => {
  assert.match(repository, /const organisationId = activeOrganisationId\(\)/);
  assert.match(repository, /const queue = allQueue\.filter\(\(item\) => item\.organisationId === organisationId\)/);
  assert.match(repository, /const liveQueue = readAllSyncQueue\(\)/);
  assert.match(repository, /const originalIds = new Set\(queue\.map\(\(item\) => item\.id\)\)/);
  assert.match(repository, /const liveIds = new Set\(liveQueue\.map\(\(item\) => item\.id\)\)/);
  assert.match(repository, /const untouched = liveQueue\.filter\(\(item\) => item\.organisationId !== organisationId \|\| !originalIds\.has\(item\.id\)\)/);
  assert.match(repository, /const retained = remaining\.filter\(\(item\) => liveIds\.has\(item\.id\)\)/);
  assert.match(repository, /const nextQueue = \[\.\.\.untouched, \.\.\.retained\]/);
  assert.match(repository, /write\(QUEUE_KEY, nextQueue\)/);
  assert.match(repository, /const activeRemaining = nextQueue\.filter\(\(item\) => item\.organisationId === organisationId\)/);
  assert.match(repository, /tenantRecordQuery\(\{ organisationId: item\.organisationId/);
  assert.match(repository, /entry\.id === itemId && entry\.organisationId === organisationId/);
});

test("live queue merge preserves new work and respects concurrent discards", () => {
  assert.match(repository, /!originalIds\.has\(item\.id\)/);
  assert.match(repository, /remaining\.filter\(\(item\) => liveIds\.has\(item\.id\)\)/);
  assert.doesNotMatch(repository, /write\(QUEUE_KEY, \[\.\.\.preserved, \.\.\.remaining\]\)/);
});

test("background sync stops processing when the active organisation changes", () => {
  assert.match(repository, /if \(activeOrganisationId\(\) !== organisationId\) \{\s*remaining\.push\(\.\.\.queue\.slice\(processed\)\);\s*break;/);
  assert.match(repository, /const existing = await cloudSelect[\s\S]*if \(activeOrganisationId\(\) !== organisationId\) \{\s*remaining\.push\(item, \.\.\.queue\.slice\(processed\)\);\s*break;/);
  assert.match(repository, /if \(activeOrganisationId\(\) === organisationId\) syncStatus\.set\(statusForQueue\(activeRemaining\)\)/);
});

test("online retries resolve the active organisation at execution time", () => {
  assert.match(repository, /window\.addEventListener\("online", \(\) => void flushSyncQueue\(\)\)/);
  assert.match(repository, /setActiveSyncOrganisation\(organisationId: string \| null\)/);
  assert.match(repository, /syncStatus\.set\(navigator\.onLine \? statusForQueue\(getSyncQueue\(\)\) : "Offline"\)/);
});
