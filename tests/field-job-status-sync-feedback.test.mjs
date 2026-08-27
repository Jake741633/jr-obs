import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { queueTargetSyncState } from "../lib/cloud/repository-core.mjs";

const jobsPage = readFileSync(new URL("../app/jobs/page.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../app/jobs/[id]/workspace/page.tsx", import.meta.url), "utf8");
const fieldPage = readFileSync(new URL("../app/field/page.tsx", import.meta.url), "utf8");

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `Expected ${name} before ${nextName}`);
  return source.slice(start, end);
}

test("job stage sync state selects only the exact queued job with terminal precedence", () => {
  const target = { table: "jobs", sourceId: "job-1" };
  const change = (state, overrides = {}) => ({ ...target, state, ...overrides });

  assert.equal(queueTargetSyncState([], target, true), "Synced");
  assert.equal(queueTargetSyncState([change("Pending", { sourceId: "job-2" })], target, true), "Synced");
  assert.equal(queueTargetSyncState([change("Pending", { table: "cloud_collections" })], target, true), "Synced");
  assert.equal(queueTargetSyncState([change("Pending", { collectionKey: "jr-os-job-progress" })], target, true), "Synced");
  assert.equal(queueTargetSyncState([change("Pending")], target, true), "Pending");
  assert.equal(queueTargetSyncState([change("Pending")], target, false), "Offline");
  assert.equal(queueTargetSyncState([change("Offline")], target, true), "Offline");
  assert.equal(queueTargetSyncState([change("Pending"), change("Failed")], target, true), "Failed");
  assert.equal(queueTargetSyncState([change("Failed"), change("Conflict")], target, false), "Conflict");
});

test("both electrician job stage surfaces track exact account and job reconciliation", () => {
  for (const source of [jobsPage, workspace]) {
    assert.match(source, /queueTargetSyncState\(getSyncQueue\(\), \{\s*table: "jobs",\s*sourceId:/s);
    assert.match(source, /accountStorageKey\(\s*"jr-os-jobs",\s*identityState\.identity\.organisationId,\s*identityState\.identity\.userId,\s*identityState\.identity\.role,\s*identityState\.identity\.customerSourceId/s);
    assert.match(source, /window\.addEventListener\("jr-os-sync-status", refreshJobStatusSyncState/);
    assert.match(source, /window\.removeEventListener\("jr-os-sync-status", refreshJobStatusSyncState/);
    assert.match(source, /window\.addEventListener\("jr-os-cloud-cache-reconciled", confirmJobStatusReconciliation\)/);
    assert.match(source, /window\.removeEventListener\("jr-os-cloud-cache-reconciled", confirmJobStatusReconciliation\)/);
  }

  assert.match(jobsPage, /detail\?\.storageKey !== jobsStorageKey \|\| !detail\.sourceId/);
  assert.match(jobsPage, /\[detail\.sourceId!\]: "Synced"/);
  assert.match(workspace, /detail\?\.storageKey !== jobsStorageKey \|\| detail\.sourceId !== jobId/);
  assert.match(workspace, /setJobStatusSync\(\{ targetKey: jobStatusSyncTargetKey, state: "Synced" \}\)/);
});

test("field start cards track exact account and job reconciliation", () => {
  assert.match(fieldPage, /const queue = getSyncQueue\(\)/);
  assert.match(fieldPage, /queueTargetSyncState\(queue, \{\s*table: "jobs",\s*sourceId: job\.id/s);
  assert.match(fieldPage, /accountStorageKey\(\s*"jr-os-jobs",\s*identityState\.identity\.organisationId,\s*identityState\.identity\.userId,\s*identityState\.identity\.role,\s*identityState\.identity\.customerSourceId/s);
  assert.match(fieldPage, /window\.addEventListener\("jr-os-sync-status", refreshJobStatusSyncStates\)/);
  assert.match(fieldPage, /window\.removeEventListener\("jr-os-sync-status", refreshJobStatusSyncStates\)/);
  assert.match(fieldPage, /window\.addEventListener\("jr-os-cloud-cache-reconciled", confirmJobStatusReconciliation\)/);
  assert.match(fieldPage, /window\.removeEventListener\("jr-os-cloud-cache-reconciled", confirmJobStatusReconciliation\)/);
  assert.match(fieldPage, /detail\?\.storageKey !== jobsStorageKey \|\| !detail\.sourceId/);
  assert.match(fieldPage, /\[sourceId\]: "Synced"/);
});

test("an empty queue cannot independently claim cloud-confirmed job stage state", () => {
  assert.match(jobsPage, /nextState !== "Synced" \|\| currentStates\[job\.id\] === "Synced"/);
  assert.match(fieldPage, /nextState !== "Synced" \|\| currentStates\[job\.id\] === "Synced"/);
  assert.match(workspace, /if \(nextState === "Synced"\) \{[\s\S]*current\.state === "Synced"[\s\S]*state: null/);
  assert.doesNotMatch(jobsPage, /nextState === "Synced"[^\n]*nextStates\[job\.id\] = nextState/);
  assert.doesNotMatch(fieldPage, /nextState === "Synced"[^\n]*nextStates\[job\.id\] = nextState/);
});

test("failed or conflicted job stage attempts stay visibly local and block another transition", () => {
  for (const source of [jobsPage, workspace]) {
    assert.match(source, /Displayed stage may be local and is not cloud-confirmed/i);
    assert.match(source, /syncState === "Failed" \|\| syncState === "Conflict"|activeJobStatusSyncState === "Failed" \|\| activeJobStatusSyncState === "Conflict"/);
  }

  const listHandler = functionBody(jobsPage, "updateStatus", "deleteJob");
  assert.ok(listHandler.indexOf('syncState === "Failed" || syncState === "Conflict"') < listHandler.indexOf("jobs.setItems"));
  assert.match(jobsPage, /jobStatusSyncBlocked\(job\)/);

  const workspaceHandler = functionBody(workspace, "updateStatus", "updateProgressMetric");
  assert.ok(workspaceHandler.indexOf("if (jobStatusSyncBlocked)") < workspaceHandler.indexOf("jobs.setItems"));
  assert.match(workspace, /disabled=\{statusControlLocked\}/);
  assert.match(jobsPage, /\["Conflict", "Failed", "Offline", "Pending", "Synced"\]/);
  assert.match(jobsPage, /displayedStatusMessage \? <p role="status"/);
});

test("field start cards keep failed stages visibly local and block another start", () => {
  assert.match(fieldPage, /The displayed badge may be local and is not cloud-confirmed/);
  assert.match(fieldPage, /jobStatusSyncNotice\(job\.id\)/);
  assert.match(fieldPage, /disabled=\{cloudFieldMode && \(!operatorName \|\| jobStatusSyncBlocked\(job\.id\)\)\}/);

  const statusHandler = functionBody(fieldPage, "updateJobStatus", "startJob");
  assert.ok(statusHandler.indexOf('syncState === "Failed" || syncState === "Conflict"') < statusHandler.indexOf("jobs.setItems"));
  assert.match(statusHandler, /\[jobId\]: navigator\.onLine \? "Pending" : "Offline"/);

  const startHandler = functionBody(fieldPage, "startJob", "stopJob");
  assert.ok(startHandler.indexOf("jobStatusSyncBlocked(job.id)") < startHandler.indexOf("setForm"));
  assert.match(startHandler, /const transitionApplied = updateJobStatus\(job\.id, "First fix"\);\s*if \(!transitionApplied\) return/);
  assert.match(startHandler, /Work timer for \$\{job\.title\} started on this device at \$\{startedAt\}\./);
  assert.match(fieldPage, /variant="secondary" onClick=\{\(\) => stopJob\(job\)\}/);
});

test("field mutations report pending or offline immediately while office evidence stays unchanged", () => {
  assert.match(jobsPage, /\[id\]: navigator\.onLine \? "Pending" : "Offline"/);
  assert.match(workspace, /setJobStatusSync\(\{ targetKey: jobStatusSyncTargetKey, state: navigator\.onLine \? "Pending" : "Offline" \}\)/);
  assert.match(jobsPage, /if \(!fieldJobStatusRestricted && result\.timelineEntry\) timeline\.setItems/);
  assert.match(workspace, /if \(!fieldJobStatusRestricted && result\.timelineEntry\)/);
  assert.match(workspace, /fieldJobStatusRestricted\s*\? "Cloud-confirmed stage changes add a job timeline entry automatically\."\s*: "Every change is written to the job timeline automatically\."/);
});

test("job status queue reads are effect-only and identity scoped", () => {
  for (const source of [jobsPage, workspace, fieldPage]) {
    assert.doesNotMatch(source, /useState[^\n]*getSyncQueue/);
    assert.match(source, /identityState\.identity\?\.organisationId \?\? null,[\s\S]*identityState\.identity\?\.customerSourceId \?\? null/);
  }
});
