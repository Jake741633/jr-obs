import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasReplayableSyncQueueItems, serialSingleFlightByKey, trailingSingleFlightByKey } from "../lib/cloud/repository-core.mjs";

const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");

test("only pending or offline queue work is eligible for automatic replay", () => {
  assert.equal(hasReplayableSyncQueueItems([]), false);
  for (const state of ["Synced", "Failed", "Conflict", undefined]) {
    assert.equal(hasReplayableSyncQueueItems([{ state }]), false);
  }
  for (const state of ["Pending", "Offline"]) {
    assert.equal(hasReplayableSyncQueueItems([{ state }]), true);
    assert.equal(hasReplayableSyncQueueItems([{ state: "Failed" }, { state }]), true);
  }
});

test("resolved cloud identity schedules its exact replayable queue", () => {
  const identityActivation = repository.slice(
    repository.indexOf("export function setActiveSyncIdentity"),
    repository.indexOf("export function setActiveSyncOrganisation"),
  );

  const authorizationCapture = identityActivation.indexOf("const authorization = currentSyncAuthorization();");
  assert.ok(authorizationCapture > identityActivation.lastIndexOf("ACTIVE_CUSTOMER_SOURCE_KEY"));
  assert.match(identityActivation, /const activeQueue = authorization\s*\? readAllSyncQueue\(\)\.filter\(\(item\) => queueItemMatchesAuthorization\(item, authorization\)\)\s*:\s*\[\];/);
  assert.match(identityActivation, /syncStatus\.set\(navigator\.onLine \? statusForQueue\(activeQueue\) : "Offline"\);/);
  assert.match(identityActivation, /if \(authorization[\s\S]*effectiveCloudMode\(\) === "cloud"[\s\S]*navigator\.onLine[\s\S]*hasReplayableSyncQueueItems\(activeQueue\)[\s\S]*scheduleAutomaticSyncQueueFlush\(authorization\);/);
  assert.doesNotMatch(identityActivation, /getSyncQueue\(\)/);
  assert.doesNotMatch(identityActivation, /scheduleAutomaticSyncQueueFlush\(currentSyncAuthorization\(\)\)/);
});

test("online cloud changes schedule replay only for the active authorisation", () => {
  const queueChange = repository.slice(
    repository.indexOf("export function queueChange"),
    repository.indexOf("export async function revalidateSyncAuthorization"),
  );

  assert.match(
    queueChange,
    /if \(authorization && queueItemMatchesAuthorization\(next, authorization\)\) \{[\s\S]*syncStatus\.set\(navigator\.onLine \? statusForQueue\(activeQueue\) : "Offline"\);[\s\S]*if \(effectiveCloudMode\(\) === "cloud" && navigator\.onLine\) scheduleAutomaticSyncQueueFlush\(authorization\);[\s\S]*\}/,
  );
  assert.doesNotMatch(queueChange, /scheduleAutomaticSyncQueueFlush\(currentSyncAuthorization\(\)\)/);
});

test("automatic replay retains the exact identity and live membership preflight", () => {
  const automaticFlush = repository.slice(
    repository.indexOf("const runAutomaticSyncQueueFlush"),
    repository.indexOf("export function flushSyncQueue"),
  );

  assert.match(automaticFlush, /effectiveCloudMode\(\) !== "cloud"/);
  assert.match(automaticFlush, /!navigator\.onLine/);
  assert.match(automaticFlush, /!activeSyncAuthorizationMatches\(authorization\)/);
  assert.match(automaticFlush, /!hasReplayableSyncQueueItems\(getSyncQueue\(\)\)/);
  assert.match(automaticFlush, /runSyncQueueFlush\(syncAuthorizationKey\(authorization\), "automatic"\)/);
  assert.match(automaticFlush, /catch \{[\s\S]*return EMPTY_SYNC_QUEUE_FLUSH_RESULT;/);
  assert.match(repository, /if \(!\(await revalidateSyncAuthorization\(authorization\)\)\) \{/);
});

test("automatic replay queues behind an already-running manual flush", async () => {
  let releaseManual;
  const events = [];
  const run = serialSingleFlightByKey(async (_scope, origin) => {
    events.push(`${origin}:start`);
    if (origin === "manual") await new Promise((resolve) => { releaseManual = resolve; });
    events.push(`${origin}:end`);
    return origin;
  }, (scope, origin) => JSON.stringify([scope, origin]));
  const automatic = trailingSingleFlightByKey(
    (scope) => run(scope, "automatic"),
    (scope) => scope,
  );

  const manual = run("scope-a", "manual");
  await Promise.resolve();
  await Promise.resolve();
  const queuedAutomatic = automatic("scope-a");
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ["manual:start"]);

  releaseManual();
  assert.equal(await manual, "manual");
  assert.equal(await queuedAutomatic, "automatic");
  assert.deepEqual(events, ["manual:start", "manual:end", "automatic:start", "automatic:end"]);
});

test("a change queued during replay receives one trailing pass", async () => {
  let releaseFirst;
  const events = [];
  const flush = trailingSingleFlightByKey(async (_scope, label) => {
    events.push(`${label}:start`);
    if (label === "first") await new Promise((resolve) => { releaseFirst = resolve; });
    events.push(`${label}:end`);
    return label;
  }, (scope) => scope);

  const first = flush("scope-a", "first");
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ["first:start"]);

  const second = flush("scope-a", "second");
  const latest = flush("scope-a", "latest");
  assert.strictEqual(second, first);
  assert.strictEqual(latest, first);

  releaseFirst();
  assert.equal(await first, "latest");
  assert.deepEqual(events, ["first:start", "first:end", "latest:start", "latest:end"]);
});
