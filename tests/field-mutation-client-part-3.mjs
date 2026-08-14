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

