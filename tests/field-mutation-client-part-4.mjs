import {
  assert,
  test,
  collectionCloudMutationRoute,
  fieldMutationRouteAllows,
  coalesceQueue,
  reconcileVersionedRecordCache,
  withExclusiveBrowserLock,
  repository,
  fieldChange,
} from "./field-mutation-client-helpers.mjs";

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
