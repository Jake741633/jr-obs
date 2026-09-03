import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { queueTargetSyncState } from "../lib/cloud/repository-core.mjs";
import { nextSurveySyncTracker, surveySyncStateBlocksEdits } from "../lib/fieldSurveyOwnership-core.mjs";

const surveyPage = readFileSync(new URL("../app/surveys/[id]/page.tsx", import.meta.url), "utf8");

test("survey sync state selects only the exact queue target", () => {
  const target = { table: "cloud_collections", collectionKey: "jr-os-surveys", sourceId: "survey-1" };
  const change = (state, overrides = {}) => ({ ...target, state, ...overrides });

  assert.equal(queueTargetSyncState([], target, true), "Synced");
  assert.equal(queueTargetSyncState([change("Pending", { sourceId: "survey-2" })], target, true), "Synced");
  assert.equal(queueTargetSyncState([change("Pending", { collectionKey: "jr-os-job-tasks" })], target, true), "Synced");
  assert.equal(queueTargetSyncState([change("Pending", { table: "jobs" })], target, true), "Synced");
  assert.equal(queueTargetSyncState([change("Pending")], target, true), "Pending");
  assert.equal(queueTargetSyncState([change("Pending")], target, false), "Offline");
  assert.equal(queueTargetSyncState([change("Failed")], target, true), "Failed");
  assert.equal(queueTargetSyncState([change("Failed"), change("Conflict")], target, false), "Conflict");
});

test("survey detail tracks queue and reconciliation events for one survey", () => {
  assert.match(surveyPage, /queueTargetSyncState\(getSyncQueue\(\), \{\s*table: "cloud_collections",\s*collectionKey: "jr-os-surveys",\s*sourceId: id/s);
  assert.match(surveyPage, /window\.addEventListener\("jr-os-sync-status", refreshSurveySyncState\)/);
  assert.match(surveyPage, /window\.removeEventListener\("jr-os-sync-status", refreshSurveySyncState\)/);
  assert.match(surveyPage, /window\.addEventListener\("jr-os-cloud-cache-reconciled", confirmSurveyReconciliation\)/);
  assert.match(surveyPage, /detail\?\.storageKey !== surveyStorageKey \|\| detail\.sourceId !== id/);
  assert.match(surveyPage, /setSurveySync\(\{ targetKey: surveySyncTargetKey, state: "Synced", initialized: true \}\)/);
  assert.match(surveyPage, /state: navigator\.onLine \? "Pending" : "Offline", initialized: true/);
});

test("survey sync starts fail closed and absence cannot erase observed field state", () => {
  const uninitialised = { targetKey: "", state: null, initialized: false };
  const initial = nextSurveySyncTracker({ current: uninitialised, targetKey: "identity:survey-1", nextState: "Synced", requiresReconciliation: true });
  assert.deepEqual(initial, { targetKey: "identity:survey-1", state: null, initialized: true });

  for (const state of ["Pending", "Offline", "Failed", "Conflict"]) {
    const current = { targetKey: "identity:survey-1", state, initialized: true };
    assert.strictEqual(
      nextSurveySyncTracker({ current, targetKey: current.targetKey, nextState: "Synced", requiresReconciliation: true }),
      current,
    );
  }

  const officePending = { targetKey: "identity:survey-1", state: "Pending", initialized: true };
  assert.deepEqual(
    nextSurveySyncTracker({ current: officePending, targetKey: officePending.targetKey, nextState: "Synced", requiresReconciliation: false }),
    { targetKey: officePending.targetKey, state: null, initialized: true },
  );
  const officeFailed = { targetKey: "identity:survey-1", state: "Failed", initialized: true };
  assert.strictEqual(
    nextSurveySyncTracker({ current: officeFailed, targetKey: officeFailed.targetKey, nextState: "Synced", requiresReconciliation: false }),
    officeFailed,
  );

  assert.match(surveyPage, /initialized: false/);
  assert.match(surveyPage, /const surveySyncAwaiting = !surveySyncInitialized/);
  assert.match(surveyPage, /const surveyEditBlocked = fieldSurveyIdentityBlocked \|\| fieldOwnershipBlocked \|\| surveySyncAwaiting \|\| surveySyncBlocked/);
  assert.match(surveyPage, /Checking secure survey sync state…/);
  assert.match(surveyPage, /if \(!identityState\.isReady \|\| !surveys\.isReady/);
  assert.match(surveyPage, /nextSurveySyncTracker\(\{[\s\S]*requiresReconciliation: fieldMode/);
});

test("survey detail reports device-only states and locks terminal failures", () => {
  assert.equal(surveySyncStateBlocksEdits("Pending"), false);
  assert.equal(surveySyncStateBlocksEdits("Offline"), false);
  assert.equal(surveySyncStateBlocksEdits("Synced"), false);
  assert.equal(surveySyncStateBlocksEdits("Failed"), true);
  assert.equal(surveySyncStateBlocksEdits("Conflict"), true);
  assert.match(surveyPage, /Pending: changes are queued on this device and are not cloud-confirmed yet/);
  assert.match(surveyPage, /Offline: changes are saved on this device and are not cloud-confirmed yet/);
  assert.match(surveyPage, /Failed: cloud sync did not complete[\s\S]*further editing is locked/);
  assert.match(surveyPage, /Conflict: cloud could not confirm these changes[\s\S]*further editing is locked/);
  assert.match(surveyPage, /const surveyEditBlocked = fieldSurveyIdentityBlocked \|\| fieldOwnershipBlocked \|\| surveySyncAwaiting \|\| surveySyncBlocked/);
  assert.doesNotMatch(surveyPage, />Saved automatically on this device\.</);
});
