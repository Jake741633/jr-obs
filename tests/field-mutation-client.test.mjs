import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  collectionCloudMutationRoute,
  fieldMutationRouteAllows,
  isServerAuthoredFieldTimeline,
  normaliseFieldRequestedJobStatus,
} from "../lib/cloud/fieldMutationPolicy-core.mjs";
import {
  coalesceQueue,
  fieldMutationReplayExpired,
  mergeProcessedQueue,
  rebaseQueuedFieldMutation,
  reconcileVersionedRecordCache,
  serialSingleFlightByKey,
  shouldReconcileFieldMutationPayload,
  singleFlight,
  validateFieldMutationResponse,
  withExclusiveBrowserLock,
} from "../lib/cloud/repository-core.mjs";

const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../lib/cloud/client.ts", import.meta.url), "utf8");

function fieldChange(overrides = {}) {
  return {
    id: "queue-a",
    mutationId: "11111111-1111-4111-8111-111111111111",
    queuedAt: "2026-08-13T20:00:00.000Z",
    organisationId: "org-a",
    userId: "user-a",
    role: "electrician",
    table: "cloud_collections",
    collectionKey: "jr-os-surveys",
    sourceId: "survey-1",
    operation: "upsert",
    payload: { id: "survey-1", jobId: "job-1", status: "Draft" },
    expectedVersion: 4,
    baseIntent: "update",
    baseVersion: 4,
    state: "Pending",
    attempts: 0,
    ...overrides,
  };
}

test("electrician mutations use only the explicit v1 RPC allowlist", () => {
  const job = collectionCloudMutationRoute("jobs", "electrician");
  assert.equal(job.kind, "rpc");
  assert.equal(job.functionName, "jr_field_update_job_status");
  assert.equal(fieldMutationRouteAllows(job, "upsert", "update"), true);
  assert.equal(fieldMutationRouteAllows(job, "upsert", "create"), false);

  const allowed = new Map([
    ["jr-os-surveys", ["create", "update"]],
    ["jr-os-site-diaries", ["create"]],
    ["jr-os-job-tasks", ["create", "update"]],
    ["jr-os-job-timeline", ["create"]],
  ]);
  for (const [collectionKey, intents] of allowed) {
    const route = collectionCloudMutationRoute("cloud_collections", "electrician", collectionKey);
    assert.equal(route.kind, "rpc", collectionKey);
    assert.deepEqual(route.allowedIntents, intents, collectionKey);
    assert.equal(fieldMutationRouteAllows(route, "delete", "update"), false);
  }

  for (const collectionKey of [
    "jr-os-rams", "jr-os-site-diary", "jr-os-job-packs", "jr-os-job-variations",
    "jr-os-job-qa-inspections", "jr-os-job-progress", "jr-os-job-material-usage",
    "jr-os-job-completion", "jr-os-stock-locations",
  ]) {
    assert.equal(collectionCloudMutationRoute("cloud_collections", "electrician", collectionKey).kind, "deny", collectionKey);
  }
  for (const table of [
    "materials", "stock_items", "stock_movements", "purchase_lists", "certificates",
    "electrical_testing_records", "job_documents", "customers", "builders", "team_members",
  ]) assert.equal(collectionCloudMutationRoute(table, "electrician").kind, "deny", table);
  for (const table of ["planner_entries", "timesheets"]) {
    assert.equal(collectionCloudMutationRoute(table, "electrician").kind, "direct", table);
  }
  assert.equal(collectionCloudMutationRoute("jobs", "office").kind, "direct");
});

test("queue coalescing preserves the original base while rotating changed request ids", () => {
  const created = fieldChange({
    id: "create-a",
    mutationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    expectedVersion: 0,
    baseVersion: undefined,
    baseIntent: "create",
  });
  const changed = fieldChange({
    id: "create-b",
    mutationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    payload: { id: "survey-1", jobId: "job-1", status: "In progress" },
    expectedVersion: undefined,
    baseVersion: undefined,
    baseIntent: "unknown",
  });
  const [coalesced] = coalesceQueue([created], changed);
  assert.equal(coalesced.baseIntent, "create");
  assert.equal(coalesced.baseVersion, undefined);
  assert.equal(coalesced.mutationId, changed.mutationId);
  assert.equal(coalesced.id, changed.id);

  const duplicate = coalesceQueue([coalesced], { ...changed, id: "duplicate", mutationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
  assert.equal(duplicate[0].mutationId, coalesced.mutationId);
  assert.equal(duplicate[0].id, coalesced.id);
});

test("in-flight work is retained ahead of newer edits and response loss remains replayable", () => {
  const sent = fieldChange({ sentAt: "2026-08-13T20:00:01.000Z" });
  const newer = fieldChange({
    id: "queue-b",
    mutationId: "22222222-2222-4222-8222-222222222222",
    payload: { id: "survey-1", jobId: "job-1", status: "Complete" },
  });
  const queued = coalesceQueue([sent], newer);
  assert.deepEqual(queued.map((item) => item.id), ["queue-a", "queue-b"]);

  const newest = { ...newer, id: "queue-c", mutationId: "33333333-3333-4333-8333-333333333333", payload: { ...newer.payload, surveyNotes: "Latest" } };
  const coalesced = coalesceQueue(queued, newest);
  assert.deepEqual(coalesced.map((item) => item.id), ["queue-a", "queue-c"]);

  const failed = { ...sent, state: "Failed", attempts: 1, error: "Network unavailable" };
  const afterLoss = mergeProcessedQueue(coalesced, coalesced, [failed, coalesced[1]]);
  assert.deepEqual(afterLoss.map((item) => [item.id, item.state]), [["queue-a", "Failed"], ["queue-c", "Pending"]]);

  const rebased = rebaseQueuedFieldMutation(afterLoss[1], 5);
  assert.equal(rebased.baseVersion, 5);
  assert.equal(rebased.mutationId, newest.mutationId);
  assert.deepEqual(rebased.payload, newest.payload);
  assert.strictEqual(rebaseQueuedFieldMutation(sent, 99), sent, "a sent fingerprint must never be rebased");
});

test("sent field mutations never outlive the server receipt replay window", () => {
  const now = Date.parse("2026-08-14T12:00:00.000Z");
  assert.equal(fieldMutationReplayExpired(undefined, now), false, "never-sent offline work remains eligible");
  assert.equal(fieldMutationReplayExpired("2026-07-15T12:00:00.000Z", now), false, "the exact 30-day boundary remains replayable");
  assert.equal(fieldMutationReplayExpired("2026-07-15T11:59:59.999Z", now), true);
  assert.equal(fieldMutationReplayExpired("not-a-timestamp", now), true, "an untrustworthy sent age fails closed");

  const guard = repository.indexOf("if (fieldMutationReplayExpired(item.sentAt))");
  const dispatch = repository.indexOf("const rawResponse = await cloudRpc", guard);
  assert.ok(guard >= 0 && dispatch > guard, "receipt expiry must be checked before RPC dispatch");
  assert.match(repository, /blockedFieldMutationTargets\.add\(targetKey\)/);
  assert.match(repository, /sent more than 30 days ago[\s\S]*Refresh the record and resolve the change manually/);
});

test("queue merge preserves concurrent order and exact Failed or Conflict state", () => {
  const original = fieldChange();
  const concurrent = fieldChange({ id: "queue-b", mutationId: "22222222-2222-4222-8222-222222222222" });
  const failed = { ...original, state: "Failed", attempts: 2, error: "Malformed response" };
  assert.deepEqual(mergeProcessedQueue([original, concurrent], [original], [failed]), [failed, concurrent]);
  const conflict = { ...original, state: "Conflict", attempts: 1, error: "stale" };
  assert.deepEqual(mergeProcessedQueue([original, concurrent], [original], [conflict]), [conflict, concurrent]);
  assert.deepEqual(mergeProcessedQueue([concurrent], [original], [failed]), [concurrent], "a concurrent discard cannot resurrect the processed item");
});

test("an A success never overwrites a retained optimistic B after B fails", () => {
  const first = fieldChange({ id: "queue-a" });
  const second = fieldChange({
    id: "queue-b",
    mutationId: "22222222-2222-4222-8222-222222222222",
    payload: { id: "survey-1", jobId: "job-1", status: "Complete" },
    baseVersion: 5,
    expectedVersion: 5,
  });
  const failedSecond = { ...second, state: "Failed", attempts: 1, error: "Malformed response" };
  const retained = mergeProcessedQueue([first, second], [first, second], [failedSecond]);

  assert.deepEqual(retained, [failedSecond]);
  assert.equal(shouldReconcileFieldMutationPayload(retained, first), false);
  assert.equal(shouldReconcileFieldMutationPayload([], second), true);
  assert.match(repository, /shouldReconcileFieldMutationPayload\(nextQueue, success\.item\)/);
});

test("overlapping flush attempts cannot reorder secure mutation responses", async () => {
  let releaseFirst;
  let calls = 0;
  const responses = [
    { sourceId: "survey-1", version: 5, payload: { id: "survey-1", status: "A" } },
    { sourceId: "survey-1", version: 6, payload: { id: "survey-1", status: "B" } },
  ];
  const flush = singleFlight(async () => {
    const call = calls;
    calls += 1;
    if (call === 0) await new Promise((resolve) => { releaseFirst = resolve; });
    return responses[call];
  });

  const first = flush();
  const overlapping = flush();
  assert.strictEqual(overlapping, first);
  await Promise.resolve();
  assert.equal(calls, 1, "only one network flush may run at a time");
  releaseFirst();
  assert.deepEqual(await overlapping, responses[0]);

  const next = flush();
  assert.notStrictEqual(next, first);
  assert.deepEqual(await next, responses[1]);
  assert.equal(calls, 2);
  assert.match(repository, /const runSyncQueueFlush = serialSingleFlightByKey<\[string\], SyncQueueFlushResult>/);
  assert.match(repository, /syncAuthorizationFlightKey\(\) === expectedAuthorizationKey[\s\S]*flushSyncQueueOnce\(\)/);
  assert.match(repository, /return runSyncQueueFlush\(syncAuthorizationFlightKey\(\)\)/);
});

test("an identity switch waits for the old flight and then runs its own queue", async () => {
  let releaseFirst;
  const events = [];
  const flush = serialSingleFlightByKey(async (identity) => {
    events.push(`${identity}:start`);
    if (identity === "identity-a") await new Promise((resolve) => { releaseFirst = resolve; });
    events.push(`${identity}:end`);
    return identity;
  }, (identity) => identity);

  const first = flush("identity-a");
  const duplicate = flush("identity-a");
  const switched = flush("identity-b");
  assert.strictEqual(first, duplicate);
  assert.notStrictEqual(first, switched);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ["identity-a:start"]);
  releaseFirst();
  assert.equal(await first, "identity-a");
  assert.equal(await switched, "identity-b");
  assert.deepEqual(events, ["identity-a:start", "identity-a:end", "identity-b:start", "identity-b:end"]);
});

test("stale receipts cannot downgrade a newer cached field payload or version", () => {
  const newerPayload = { id: "survey-1", status: "B" };
  const stalePayload = { id: "survey-1", status: "A" };
  const stale = reconcileVersionedRecordCache({
    versions: { "survey-1": 6 },
    records: [newerPayload],
    sourceId: "survey-1",
    version: 5,
    payload: stalePayload,
  });
  assert.equal(stale.applied, false);
  assert.deepEqual(stale.versions, { "survey-1": 6 });
  assert.deepEqual(stale.records, [newerPayload]);

  const current = reconcileVersionedRecordCache({
    versions: { "survey-1": 5 },
    records: [stalePayload],
    sourceId: "survey-1",
    version: 6,
    payload: newerPayload,
  });
  assert.equal(current.applied, true);
  assert.deepEqual(current.versions, { "survey-1": 6 });
  assert.deepEqual(current.records, [newerPayload]);
  assert.match(repository, /reconcileCachedFieldMutation\(success\.item\.storageKey, success\.item\.sourceId, success\.response\.version, payload\)/);
});

test("separate tabs serialize queue replay through one exclusive browser lock", async () => {
  let active = Promise.resolve();
  const lockManager = {
    request(_name, options, task) {
      assert.deepEqual(options, { mode: "exclusive" });
      const result = active.then(task);
      active = result.then(() => undefined, () => undefined);
      return result;
    },
  };
  const events = [];
  let releaseFirst;
  const first = withExclusiveBrowserLock(lockManager, "queue", async () => {
    events.push("first:start");
    await new Promise((resolve) => { releaseFirst = resolve; });
    events.push("first:end");
    return 5;
  });
  const second = withExclusiveBrowserLock(lockManager, "queue", async () => {
    events.push("second:start");
    return 6;
  });

  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ["first:start"]);
  releaseFirst();
  assert.equal(await first, 5);
  assert.equal(await second, 6);
  assert.deepEqual(events, ["first:start", "first:end", "second:start"]);
  assert.match(repository, /navigator\.locks/);
});

test("unsent create-delete cancels locally while projected and sent deletes fail closed", () => {
  const create = fieldChange({ baseIntent: "create", baseVersion: undefined, expectedVersion: 0 });
  const remove = fieldChange({ id: "delete", mutationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", operation: "delete", payload: undefined });
  assert.deepEqual(coalesceQueue([create], remove), []);
  assert.equal(fieldMutationRouteAllows(collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-surveys"), "delete", "update"), false);
  assert.equal(coalesceQueue([{ ...create, sentAt: "2026-08-13T20:00:01.000Z" }], remove).length, 2);
});

test("legacy electrician queues never infer create from missing version metadata", () => {
  const legacy = fieldChange({ baseIntent: undefined, baseVersion: undefined, expectedVersion: undefined, mutationId: undefined });
  const next = fieldChange({ id: "new", baseIntent: "create", baseVersion: undefined, expectedVersion: 0 });
  const [coalesced] = coalesceQueue([legacy], next);
  assert.equal(coalesced.baseIntent, "unknown");
  assert.equal(coalesced.baseVersion, undefined);

  const versionedLegacy = { ...legacy, expectedVersion: 7 };
  const [versioned] = coalesceQueue([versionedLegacy], next);
  assert.equal(versioned.baseIntent, "update");
  assert.equal(versioned.baseVersion, 7);
});

test("job status evidence is server-owned while explicit field notes remain routable", () => {
  assert.equal(normaliseFieldRequestedJobStatus("In progress"), "First fix");
  assert.equal(normaliseFieldRequestedJobStatus("Testing"), "Testing");
  assert.match(repository, /normaliseFieldRequestedJobStatus\(payload\.status\)/);
  assert.equal(isServerAuthoredFieldTimeline("cloud_collections", "electrician", "jr-os-job-timeline", {
    id: "timeline-1", eventType: "Status change", sourceType: "Job", fromStatus: "Scheduled", toStatus: "First fix",
  }), true);
  assert.equal(isServerAuthoredFieldTimeline("cloud_collections", "electrician", "jr-os-job-timeline", {
    id: "timeline-2", eventType: "Note", note: "Access issue at rear door",
  }), false);
  assert.equal(isServerAuthoredFieldTimeline("cloud_collections", "electrician", "jr-os-job-timeline", {
    id: "timeline-3", eventType: "Snag", sourceType: "JobTask", sourceId: "task-1", note: "Socket faceplate damaged",
  }), false, "structured field activity may contribute note text for server canonicalization");
  assert.match(repository, /if \(isServerAuthoredFieldTimeline\(item\.table, item\.role, item\.collectionKey, item\.payload\)\) return/);
  assert.match(repository, /if \(isServerAuthoredFieldTimeline\(item\.table, item\.role, item\.collectionKey, item\.payload\)\) \{[\s\S]*cleared \+= 1/);
});

test("RPC responses are identity-checked before safe cache reconciliation", () => {
  const response = {
    status: "replayed",
    resource: "jobs",
    sourceId: "job-1",
    version: 8,
    sourceUpdatedAt: "2026-08-13T20:00:00.000Z",
    payload: { id: "job-1", status: "Testing" },
  };
  assert.strictEqual(validateFieldMutationResponse(response, { resource: "jobs", sourceId: "job-1", requestedStatus: "Testing" }), response);
  assert.throws(() => validateFieldMutationResponse({ ...response, sourceId: "job-2" }, { resource: "jobs", sourceId: "job-1" }), /mismatched/i);
  assert.throws(() => validateFieldMutationResponse({ ...response, version: "8" }, { resource: "jobs", sourceId: "job-1" }), /mismatched/i);
  assert.throws(() => validateFieldMutationResponse({ ...response, status: "maybe" }, { resource: "jobs", sourceId: "job-1" }), /invalid status/i);

  const canonicalNote = {
    status: "applied",
    resource: "cloud_collections",
    sourceId: "timeline-3",
    collectionKey: "jr-os-job-timeline",
    version: 1,
    sourceUpdatedAt: "2026-08-13T20:00:00.000Z",
    payload: {
      id: "timeline-3",
      jobId: "job-1",
      milestone: "Custom update",
      eventType: "Note",
      note: "Socket faceplate damaged",
      completedBy: "Field Electrician",
      completedAt: "2026-08-13T20:00:00.000Z",
      createdAt: "2026-08-13T20:00:00.000Z",
    },
  };
  assert.strictEqual(validateFieldMutationResponse(canonicalNote, {
    resource: "cloud_collections",
    sourceId: "timeline-3",
    collectionKey: "jr-os-job-timeline",
  }), canonicalNote);
  assert.throws(() => validateFieldMutationResponse({
    ...canonicalNote,
    payload: { ...canonicalNote.payload, eventType: "Snag", sourceType: "JobTask", sourceId: "task-1" },
  }, {
    resource: "cloud_collections",
    sourceId: "timeline-3",
    collectionKey: "jr-os-job-timeline",
  }), /unsafe timeline note/i, "client evidence classification must never enter the safe cache");
  assert.match(repository, /success\.response\.payload/);
});

test("client sends idempotent RPC args and reconciles mounted safe caches without requeueing", () => {
  for (const arg of ["record_source_id", "expected_version", "requested_status", "collection_key_value", "record_payload", "mutation_id"]) {
    assert.match(repository, new RegExp(`${arg}:`));
  }
  assert.match(client, /class CloudRequestError extends Error/);
  assert.match(client, /error\.status === 409 \|\| error\.code === "PT409"/);
  assert.match(repository, /state: isCloudConflictError\(error\) \? "Conflict" : "Failed"/);
  assert.match(adapter, /index < 0 \? "create" : "unknown"/);
  assert.match(storage, /before \? undefined : 0/);
  assert.match(repository, /jr-os-cloud-cache-reconciled/);
  assert.match(storage, /window\.addEventListener\("jr-os-cloud-cache-reconciled", reconcileCloudCache\)/);
  assert.match(storage, /previousRef\.current = next/);
  assert.match(storage, /return \(\) => window\.removeEventListener\("jr-os-cloud-cache-reconciled", reconcileCloudCache\)/);
});
