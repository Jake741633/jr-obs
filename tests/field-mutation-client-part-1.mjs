import {
  assert,
  test,
  collectionCloudMutationRoute,
  fieldMutationRouteAllows,
  isServerAuthoredFieldTimeline,
  normaliseFieldRequestedJobStatus,
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
  repository,
  adapter,
  storage,
  client,
  fieldChange,
} from "./field-mutation-client-helpers.mjs";

test("electrician mutations use only explicit secure RPC routes", () => {
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
    assert.equal(route.functionName, "jr_field_save_collection", collectionKey);
    assert.deepEqual(route.allowedIntents, intents, collectionKey);
    assert.equal(fieldMutationRouteAllows(route, "delete", "update"), false);
  }

  const progress = collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-job-progress");
  assert.equal(progress.kind, "rpc");
  assert.equal(progress.functionName, "jr_field_save_job_progress");
  assert.deepEqual(progress.allowedIntents, ["create", "update"]);
  assert.equal(fieldMutationRouteAllows(progress, "upsert", "create"), true);
  assert.equal(fieldMutationRouteAllows(progress, "upsert", "update"), true);
  assert.equal(fieldMutationRouteAllows(progress, "delete", "update"), false);

  for (const collectionKey of [
    "jr-os-rams", "jr-os-site-diary", "jr-os-job-packs", "jr-os-job-variations",
    "jr-os-job-qa-inspections", "jr-os-job-material-usage",
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

