import {
  assert,
  test,
  collectionCloudMutationRoute,
  fieldMutationRouteAllows,
  coalesceQueue,
  rebaseQueuedFieldMutation,
  repository,
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


test("distinct electrician job-status edges remain ordered for sequential replay", () => {
  const firstFix = fieldChange({
    table: "jobs",
    collectionKey: undefined,
    sourceId: "job-1",
    payload: { id: "job-1", status: "First fix" },
    expectedVersion: 1,
    baseVersion: 1,
  });
  const secondFix = fieldChange({
    id: "queue-b",
    mutationId: "22222222-2222-4222-8222-222222222222",
    table: "jobs",
    collectionKey: undefined,
    sourceId: "job-1",
    payload: { id: "job-1", status: "Second fix" },
    expectedVersion: 1,
    baseVersion: 1,
  });

  const ordered = coalesceQueue([firstFix], secondFix);
  assert.deepEqual(ordered.map((item) => item.payload.status), ["First fix", "Second fix"]);
  assert.deepEqual(ordered.map((item) => item.baseVersion), [1, 1]);
  assert.equal(new Set(ordered.map((item) => item.mutationId)).size, 2);
  const rebasedSecondEdge = rebaseQueuedFieldMutation(ordered[1], 2);
  assert.equal(rebasedSecondEdge.baseVersion, 2);
  assert.equal(rebasedSecondEdge.expectedVersion, 2);
  assert.equal(rebasedSecondEdge.mutationId, secondFix.mutationId);

  const legacyFirstFix = {
    ...secondFix,
    id: "queue-c",
    mutationId: "33333333-3333-4333-8333-333333333333",
    payload: { id: "job-1", status: " In progress " },
  };
  const legacyEquivalent = coalesceQueue([firstFix], legacyFirstFix);
  assert.equal(legacyEquivalent.length, 1, "legacy and padded equivalents remain one logical target status");
  assert.equal(legacyEquivalent[0].id, legacyFirstFix.id);

  const testing = {
    ...secondFix,
    id: "queue-d",
    mutationId: "44444444-4444-4444-8444-444444444444",
    payload: { id: "job-1", status: "Testing" },
  };
  const threeEdges = coalesceQueue(ordered, testing);
  assert.deepEqual(threeEdges.map((item) => item.payload.status), ["First fix", "Second fix", "Testing"]);

  const awaitingBuilder = { ...firstFix, payload: { id: "job-1", status: "Awaiting builder" } };
  const backToFirstFix = { ...secondFix, payload: { id: "job-1", status: "First fix" } };
  assert.deepEqual(
    coalesceQueue([awaitingBuilder], backToFirstFix).map((item) => item.payload.status),
    ["Awaiting builder", "First fix"],
    "a reversible valid sequence must not collapse to its original status",
  );

  assert.equal(
    coalesceQueue([{ ...firstFix, sentAt: "2026-08-13T20:00:01.000Z" }], secondFix).length,
    2,
    "a sent status fingerprint remains an immutable replay boundary",
  );

  const unknownBase = { ...firstFix, baseIntent: "unknown", baseVersion: undefined };
  const unknownBaseQueue = coalesceQueue([unknownBase], { ...secondFix, baseIntent: "unknown", baseVersion: undefined });
  assert.equal(unknownBaseQueue.length, 1, "untrusted legacy bases retain fail-closed coalescing");
  assert.equal(unknownBaseQueue[0].baseIntent, "unknown");

  const officeQueue = coalesceQueue(
    [{ ...firstFix, role: "office" }],
    { ...secondFix, role: "office" },
  );
  assert.equal(officeQueue.length, 1, "direct office writes retain last-write-wins coalescing");
});


test("the repository rebases each later field edge from the prior verified receipt", () => {
  const versionMap = repository.indexOf("const fieldMutationVersions = new Map<string, number>()");
  const queueLoop = repository.indexOf("for (const queuedItem of queue)", versionMap);
  const priorVersion = repository.indexOf("const priorVersion = fieldMutationVersions.get(targetKey)", queueLoop);
  const rebase = repository.indexOf("item = rebaseQueuedFieldMutation(item, priorVersion)", priorVersion);
  const markSent = repository.indexOf("const prepared = markFieldMutationSent(item)", rebase);
  const dispatch = repository.indexOf("const rawResponse = await cloudRpc", markSent);
  const validate = repository.indexOf("const response = validateFieldMutationResponse", dispatch);
  const rememberVersion = repository.indexOf("fieldMutationVersions.set(targetKey, response.version)", validate);
  assert.ok(
    versionMap >= 0
      && queueLoop > versionMap
      && priorVersion > queueLoop
      && rebase > priorVersion
      && markSent > rebase
      && dispatch > markSent
      && validate > dispatch
      && rememberVersion > validate,
    "the flush must rebase before sending and remember only a validated receipt version",
  );
  const blockedCheck = repository.indexOf("if (blockedFieldMutationTargets.has(targetKey))", queueLoop);
  const catchBlock = repository.indexOf("if (activeFieldMutationTarget) blockedFieldMutationTargets.add(activeFieldMutationTarget)", dispatch);
  assert.ok(blockedCheck > queueLoop && blockedCheck < dispatch);
  assert.ok(catchBlock > dispatch, "a failed predecessor must block later same-target edges");
});
