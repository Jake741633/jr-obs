import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  coalesceQueue,
  pendingImports,
  queueModeChange,
  retainDeletedRecordConflict,
  retainPatchConflict,
  retainProjectionMutationConflict,
  retainVersionConflict,
  tenantRecordQuery,
  tenantRecordVersionQuery,
} from "../lib/cloud/repository-core.mjs";

const client = readFileSync(new URL("../lib/cloud/client.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");

function change(organisationId, overrides = {}) {
  return {
    id: `${organisationId}:customers:shared-id`,
    table: "customers",
    operation: "upsert",
    organisationId,
    userId: "user-a",
    role: "admin",
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

test("offline queue coalescing never merges users, roles or customer assignments", () => {
  const admin = change("org-a");
  const otherUser = change("org-a", { userId: "user-b" });
  const demoted = change("org-a", { role: "electrician" });
  const customerA = change("org-a", { role: "customer", customerSourceId: "customer-a" });
  const customerB = change("org-a", { role: "customer", customerSourceId: "customer-b" });

  const queue = [otherUser, demoted, customerA, customerB].reduce((items, item) => coalesceQueue(items, item), [admin]);
  assert.equal(queue.length, 5);
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

test("a stale version-filtered patch remains queued as a conflict", () => {
  const orgA = change("org-a");
  const orgB = change("org-b");
  const query = tenantRecordVersionQuery({
    organisationId: "org/a",
    sourceId: "record?1",
    collectionKey: "jr-os-drafts",
    currentVersion: 7,
  });
  const queue = retainPatchConflict([orgB], orgA, 7, 0);

  assert.match(query, /organisation_id=eq\.org%2Fa/);
  assert.match(query, /source_id=eq\.record%3F1/);
  assert.match(query, /collection_key=eq\.jr-os-drafts/);
  assert.match(query, /version=eq\.7$/);
  assert.equal(queue.length, 2);
  assert.equal(queue.find((item) => item.organisationId === "org-a")?.state, "Conflict");
  assert.match(queue.find((item) => item.organisationId === "org-a")?.error ?? "", /affected 0 rows/);
  assert.deepEqual(retainPatchConflict([], orgA, 7, 1), []);
});

test("projected records fail closed until the secure mutation service is available", () => {
  const queued = change("org-a", { role: "electrician", table: "jobs" });
  const retained = retainProjectionMutationConflict([], queued);

  assert.equal(retained.length, 1);
  assert.equal(retained[0].state, "Conflict");
  assert.match(retained[0].error, /secure field mutation service/i);
  assert.match(repository, /const readsThroughProjection = readTable !== item\.table/);
  assert.match(repository, /if \(readsThroughProjection && \(current \|\| item\.operation === "delete" \|\| item\.expectedVersion !== undefined\)\)/);
  assert.ok(repository.indexOf("retainProjectionMutationConflict([], item)") < repository.indexOf("if (item.operation === \"delete\")"));
});

test("ordinary replay cannot implicitly restore a tombstoned record", () => {
  const retained = retainDeletedRecordConflict([], change("org-a"));

  assert.equal(retained.length, 1);
  assert.equal(retained[0].state, "Conflict");
  assert.match(retained[0].error, /restored explicitly/i);
  assert.match(repository, /item\.operation === "upsert" && current\?\.deleted_at/);
  assert.match(repository, /\{ deleted_at: tombstone\.deleted_at, source_updated_at: deletedAt \}/);
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
  const activeOrganisation = repository.indexOf("const authorization = currentSyncAuthorization()");
  const tenantSnapshot = repository.indexOf("const queue = allQueue.filter", activeOrganisation);
  const liveQueueRead = repository.indexOf("const liveQueue = readAllSyncQueue()", tenantSnapshot);
  const mergedQueue = repository.indexOf("const nextQueue = mergeProcessedQueue(liveQueue, queue, remaining)", liveQueueRead);
  const writeMerged = repository.indexOf("write(QUEUE_KEY, nextQueue)", mergedQueue);
  const activeRemaining = repository.indexOf("const activeRemaining = nextQueue.filter", writeMerged);

  assert.ok(activeOrganisation >= 0);
  assert.ok(tenantSnapshot > activeOrganisation);
  assert.ok(liveQueueRead > tenantSnapshot);
  assert.ok(mergedQueue > liveQueueRead);
  assert.ok(writeMerged > mergedQueue);
  assert.ok(activeRemaining > writeMerged);
  assert.match(repository, /tenantRecordQuery\(\{ organisationId: item\.organisationId/);
  assert.match(repository, /entry\.id === itemId && queueItemMatchesAuthorization\(entry, authorization\)/);
});

test("existing edits preselect through role projections and patch exactly one canonical row", () => {
  assert.match(repository, /const readTable = collectionCloudReadTable\(item\.table, item\.role, item\.collectionKey\)/);
  assert.match(repository, /cloudSelect<CloudEnvelope<unknown>>\(readTable, tenantRecordQuery/);
  assert.match(repository, /if \(current\) \{[\s\S]*buildCloudUpdatePatch\(envelopeInput\)[\s\S]*cloudPatch<CloudEnvelope<unknown>>\(item\.table, query, patch\)[\s\S]*updated\.length !== 1[\s\S]*retainPatchConflict\(\[\], item, current\.version, updated\.length\)/);
  assert.match(repository, /else \{[\s\S]*buildCloudEnvelope\(\{ \.\.\.envelopeInput, createdBy: item\.userId \}\)[\s\S]*cloudUpsert\(item\.table, \[record\]/);
  assert.match(client, /cloudPatch[\s\S]*request<TResult\[\]>[\s\S]*Prefer: "return=representation"/);
});

test("live queue merge preserves new work and respects concurrent discards", () => {
  assert.ok(repository.indexOf("mergeProcessedQueue(liveQueue, queue, remaining)") >= 0);
  assert.doesNotMatch(repository, /write\(QUEUE_KEY, \[\.\.\.preserved, \.\.\.remaining\]\)/);
});

test("background sync stops processing when active authorisation changes", () => {
  const loopStart = repository.indexOf("for (const queuedItem of queue)");
  const loopGuard = repository.indexOf("if (!activeSyncAuthorizationMatches(authorization))", loopStart);
  const loopRetain = repository.indexOf("remaining.push(...queue.slice(processed));", loopGuard);
  const cloudRead = repository.indexOf("const existing = await cloudSelect", loopRetain);
  const postReadGuard = repository.indexOf("if (!activeSyncAuthorizationMatches(authorization))", cloudRead);
  const postReadRetain = repository.indexOf("remaining.push(item, ...queue.slice(processed));", postReadGuard);
  const guardedStatus = repository.indexOf("if (activeSyncAuthorizationMatches(authorization)) syncStatus.set(statusForQueue(activeRemaining))", postReadRetain);

  assert.ok(loopStart >= 0);
  assert.ok(loopGuard > loopStart);
  assert.ok(loopRetain > loopGuard);
  assert.ok(cloudRead > loopRetain);
  assert.ok(postReadGuard > cloudRead);
  assert.ok(postReadRetain > postReadGuard);
  assert.ok(guardedStatus > postReadRetain);
});

test("online retries resolve the active organisation at execution time", () => {
  assert.match(repository, /window\.addEventListener\("online", \(\) => void flushSyncQueue\(\)\)/);
  assert.match(repository, /setActiveSyncOrganisation\(organisationId: string \| null\)/);
  assert.match(repository, /syncStatus\.set\(navigator\.onLine \? statusForQueue\(getSyncQueue\(\)\) : "Offline"\)/);
  assert.match(repository, /revalidateSyncAuthorization\(authorization\)/);
});
