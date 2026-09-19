import {
  assert,
  test,
  coalesceQueue,
  fieldMutationReplayExpired,
  mergeProcessedQueue,
  rebaseQueuedFieldMutation,
  repository,
  fieldChange,
} from "./field-mutation-client-helpers.mjs";

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
