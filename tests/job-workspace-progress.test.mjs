import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { queueTargetSyncState } from "../lib/cloud/repository-core.mjs";

const workspace = readFileSync(new URL("../app/jobs/[id]/workspace/page.tsx", import.meta.url), "utf8");

test("mobile job workspace loads and updates the existing job progress collection", () => {
  assert.match(workspace, /useJobProgressCollection/);
  assert.match(workspace, /const progress = useJobProgressCollection\(\)/);
  assert.match(workspace, /progress\.items\.find\(\(item\) => item\.jobId === jobId\)/);
  assert.match(workspace, /progress\.setItems/);
});

test("mobile job workspace edits only operational progress metrics", () => {
  assert.match(workspace, /normaliseJobProgress/);
  assert.match(workspace, /Save field progress/);
  assert.doesNotMatch(workspace, /Operational progress saved and queued for secure sync/);
  for (const metric of ["overall", "firstFix", "secondFix", "testing", "certificates", "materials"]) {
    assert.match(workspace, new RegExp(`key: \"${metric}\"`));
  }
  assert.match(workspace, /id=\{`progress-\$\{key\}`\}/);
  assert.doesNotMatch(workspace, /id=\{?`progress-payments`/);
  assert.match(workspace, /!fieldWorkspace \? <div[^>]*>\{progressBar\("Payments \(office controlled\)", progressValue\.payments\)\}<\/div> : null/);
  assert.match(workspace, /manual: fieldWorkspace \? fieldManual : normalised/);
  assert.doesNotMatch(workspace, /payments: progressValue\.payments/);
});

test("progress sync state selects only the exact queue target with terminal precedence", () => {
  const target = { table: "cloud_collections", collectionKey: "jr-os-job-progress", sourceId: "progress-1" };
  const change = (state, overrides = {}) => ({ ...target, state, ...overrides });

  assert.equal(queueTargetSyncState([], target, true), "Synced");
  assert.equal(queueTargetSyncState([change("Pending", { sourceId: "progress-2" })], target, true), "Synced");
  assert.equal(queueTargetSyncState([change("Pending", { collectionKey: "jr-os-job-tasks" })], target, true), "Synced");
  assert.equal(queueTargetSyncState([change("Pending", { table: "jobs" })], target, true), "Synced");
  assert.equal(queueTargetSyncState([change("Pending")], target, true), "Pending");
  assert.equal(queueTargetSyncState([change("Pending")], target, false), "Offline");
  assert.equal(queueTargetSyncState([change("Offline")], target, true), "Offline");
  assert.equal(queueTargetSyncState([change("Pending"), change("Failed")], target, true), "Failed");
  assert.equal(queueTargetSyncState([change("Failed"), change("Conflict")], target, false), "Conflict");
});

test("job progress reports exact replay failure state without claiming rollback or cloud success", () => {
  assert.match(workspace, /window\.addEventListener\("jr-os-sync-status", refreshProgressSyncState\)/);
  assert.match(workspace, /window\.removeEventListener\("jr-os-sync-status", refreshProgressSyncState\)/);
  assert.match(workspace, /window\.addEventListener\("jr-os-cloud-cache-reconciled", confirmProgressReconciliation\)/);
  assert.match(workspace, /window\.removeEventListener\("jr-os-cloud-cache-reconciled", confirmProgressReconciliation\)/);
  assert.match(workspace, /detail\?\.storageKey !== progressStorageKey \|\| detail\.sourceId !== progressRecordId/);
  assert.match(workspace, /progressSyncTargetKey = `\$\{progressSyncIdentityKey\}:\$\{progressTargetKey\}`/);
  assert.match(workspace, /nextState === "Synced"[\s\S]*state: null/);
  assert.match(workspace, /confirmProgressReconciliation[\s\S]*state: "Synced"/);
  assert.match(workspace, /queueTargetSyncState\(getSyncQueue\(\),/);
  assert.match(workspace, /table: "cloud_collections",\s*collectionKey: "jr-os-job-progress",\s*sourceId: progressRecordId/s);
  assert.match(workspace, /state: navigator\.onLine \? "Pending" : "Offline"/);
  assert.match(workspace, /disabled=\{progressSyncBlocked\}/);
  assert.match(workspace, /Failed: progress sync did not complete/);
  assert.match(workspace, /Conflict: progress sync could not be confirmed against the current cloud record/);
  assert.match(workspace, /Displayed percentages may be local and are not confirmed by cloud/);
  assert.match(workspace, /if \(progressSyncBlocked\) return/);
  assert.match(workspace, /Unsaved progress changes\./);
  assert.doesNotMatch(workspace, /progressSync.*error|item\.error/s);
});

test("mobile job workspace creates one canonical progress record shape when none exists", () => {
  assert.match(workspace, /`job-progress-\$\{jobId\}`/);
  assert.match(workspace, /fieldWorkspace \? \{\} : \{ suggestions: progressRecord\?\.suggestions \?\? \[\] \}/);
  assert.match(workspace, /No saved progress record yet\. Saving will create one for this assigned job\./);
});
