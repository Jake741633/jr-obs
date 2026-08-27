import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  awaitingQueueState,
  confirmedDayPlannerSummary,
  emptyLabourSyncProjection,
  labourAttemptStates,
  refreshLabourSyncProjection,
  registerLabourSyncAttempt,
  unpairedLabourTargetStates,
} from "../lib/engineerDayPlannerSync-core.mjs";

const page = readFileSync(new URL("../app/field/day-planner/page.tsx", import.meta.url), "utf8");

function queueItem(table, sourceId, state = "Pending", extra = {}) {
  return { table, sourceId, state, ...extra };
}

function attemptProjection(plannerState, timesheetState) {
  return {
    scopeKey: "scope-a",
    initialized: true,
    attempts: { "entry-1": { timesheetId: "time-1" } },
    plannerTargets: { "entry-1": { seen: true, state: plannerState } },
    timesheetTargets: { "time-1": { seen: true, state: timesheetState } },
  };
}

test("labour save targets must enter the exact queue before absence can mean synced", () => {
  let projection = registerLabourSyncAttempt(emptyLabourSyncProjection(), {
    scopeKey: "scope-a",
    entryId: "entry-1",
    timesheetId: "time-1",
  });
  assert.deepEqual(labourAttemptStates(projection, "entry-1"), {
    planner: awaitingQueueState,
    timesheet: awaitingQueueState,
    timesheetId: "time-1",
  });

  projection = refreshLabourSyncProjection({
    current: projection,
    scopeKey: "scope-a",
    queue: [queueItem("planner_entries", "entry-1")],
    online: true,
  });
  assert.equal(projection.initialized, true);
  assert.equal(projection.plannerTargets["entry-1"].state, "Pending");
  assert.equal(projection.plannerTargets["entry-1"].seen, true);
  assert.equal(projection.timesheetTargets["time-1"].state, awaitingQueueState);
  assert.equal(projection.timesheetTargets["time-1"].seen, false);

  projection = refreshLabourSyncProjection({
    current: projection,
    scopeKey: "scope-a",
    queue: [queueItem("planner_entries", "entry-1"), queueItem("timesheets", "time-1")],
    online: true,
  });
  projection = refreshLabourSyncProjection({
    current: projection,
    scopeKey: "scope-a",
    queue: [queueItem("timesheets", "time-1")],
    online: true,
  });
  assert.equal(projection.plannerTargets["entry-1"].state, "Synced");
  assert.equal(projection.timesheetTargets["time-1"].state, "Pending");

  projection = refreshLabourSyncProjection({ current: projection, scopeKey: "scope-a", queue: [], online: true });
  assert.equal(projection.timesheetTargets["time-1"].state, "Synced");
});

test("labour sync projection is exact-target and identity-scope isolated", () => {
  let projection = registerLabourSyncAttempt(emptyLabourSyncProjection(), {
    scopeKey: "scope-a",
    entryId: "entry-1",
    timesheetId: "time-1",
  });
  projection = refreshLabourSyncProjection({
    current: projection,
    scopeKey: "scope-a",
    queue: [
      queueItem("planner_entries", "other-entry", "Conflict"),
      queueItem("planner_entries", "entry-1", "Failed", { collectionKey: "wrong-collection" }),
      queueItem("timesheets", "other-time", "Failed"),
      queueItem("jobs", "time-1", "Conflict"),
    ],
    online: true,
  });
  assert.equal(projection.plannerTargets["entry-1"].state, awaitingQueueState);
  assert.equal(projection.timesheetTargets["time-1"].state, awaitingQueueState);
  assert.equal(projection.plannerTargets["other-entry"].state, "Conflict");
  assert.equal(projection.timesheetTargets["other-time"].state, "Failed");

  const replacement = refreshLabourSyncProjection({ current: projection, scopeKey: "scope-b", queue: [], online: true });
  assert.equal(replacement.scopeKey, "scope-b");
  assert.deepEqual(replacement.attempts, {});
  assert.deepEqual(replacement.plannerTargets, {});
  assert.deepEqual(replacement.timesheetTargets, {});
});

test("confirmed summary treats the planner and timesheet receipts independently", () => {
  const entries = [{ id: "entry-1", title: "Visit", date: "2026-08-27", startTime: "08:00", status: "Complete", jobId: "job-1" }];
  const timesheets = [{ id: "time-1", workDate: "2026-08-27", startedAt: "08:00", finishedAt: "10:00", breakMinutes: 0, jobId: "job-1" }];

  assert.deepEqual(confirmedDayPlannerSummary(entries, timesheets, "2026-08-27", attemptProjection("Conflict", "Synced")), {
    scheduled: 1,
    completed: 0,
    remaining: 1,
    paidMinutes: 120,
  });
  assert.deepEqual(confirmedDayPlannerSummary(entries, timesheets, "2026-08-27", attemptProjection("Synced", "Failed")), {
    scheduled: 1,
    completed: 1,
    remaining: 0,
    paidMinutes: 0,
  });
  assert.deepEqual(confirmedDayPlannerSummary(entries, timesheets, "2026-08-27", attemptProjection("Failed", "Conflict")), {
    scheduled: 1,
    completed: 0,
    remaining: 1,
    paidMinutes: 0,
  });
  assert.deepEqual(confirmedDayPlannerSummary(entries, timesheets, "2026-08-27", attemptProjection("Synced", "Synced")), {
    scheduled: 1,
    completed: 1,
    remaining: 0,
    paidMinutes: 120,
  });
});

test("retained terminal targets are projected on mount even without an in-memory pair", () => {
  const projection = refreshLabourSyncProjection({
    current: emptyLabourSyncProjection("scope-a"),
    scopeKey: "scope-a",
    queue: [queueItem("timesheets", "retained-time", "Failed")],
    online: true,
  });
  assert.deepEqual(unpairedLabourTargetStates(projection), [{ sourceId: "retained-time", state: "Failed" }]);
  const summary = confirmedDayPlannerSummary([], [{ id: "retained-time", workDate: "2026-08-27", startedAt: "08:00", finishedAt: "09:00", breakMinutes: 0 }], "2026-08-27", projection);
  assert.equal(summary.paidMinutes, 0);
});

test("day planner registers both targets before optimistic success surfaces", () => {
  const saveTime = page.slice(page.indexOf("function saveTime"), page.indexOf("\n  return <div"));
  const registration = saveTime.indexOf("registerLabourSyncAttempt");
  assert.ok(registration >= 0);
  assert.ok(registration < saveTime.indexOf("timesheets.setItems"));
  assert.ok(registration < saveTime.indexOf("planner.setItems"));
  assert.ok(registration < saveTime.indexOf("setMessage(cloudFieldMode"));
  assert.ok(registration < saveTime.indexOf("setActiveEntryId(null)"));
  assert.match(saveTime, /entryId: entry\.id,[\s\S]*timesheetId: record\.id/);
  assert.match(saveTime, /already has a labour save awaiting or retaining its exact cloud result/);
});

test("day planner derives direct-table success only from exact queue events", () => {
  assert.match(page, /activeSyncAuthorizationMatches\(authorization\)/);
  assert.match(page, /const queue = getSyncQueue\(\)/);
  assert.match(page, /window\.addEventListener\("jr-os-sync-status", refreshLabourSyncStates\)/);
  assert.match(page, /window\.removeEventListener\("jr-os-sync-status", refreshLabourSyncStates\)/);
  assert.doesNotMatch(page, /jr-os-cloud-cache-reconciled/);
  assert.match(page, /labourSyncScopeKey = JSON\.stringify\(\[[\s\S]*organisationId[\s\S]*userId[\s\S]*role[\s\S]*customerSourceId/);
  assert.match(page, /labourSyncReady = !cloudFieldMode \|\| \(activeLabourSyncProjection\.initialized/);
  assert.match(page, /setLabourSyncProjection\(emptyLabourSyncProjection\(labourSyncScopeKey\)\)[\s\S]*setActiveEntryId\(null\)[\s\S]*setStartedAt\(""\)[\s\S]*setFinishedAt\(""\)[\s\S]*setNotes\(""\)[\s\S]*setMessage\(""\)[\s\S]*setInteractionScopeKey\(labourSyncScopeKey\)[\s\S]*\[labourSyncScopeKey\]/);
  assert.match(page, /interactionScopeReady = interactionScopeKey === labourSyncScopeKey/);
});

test("day planner labels partial saves and gates every confirmed success surface", () => {
  assert.match(page, /captured on this device[\s\S]*awaiting cloud confirmation/);
  assert.match(page, /The combined labour save is not fully cloud-confirmed/);
  assert.match(page, /confirmedDayPlannerSummary\(planner\.items, timesheets\.items, date, activeLabourSyncProjection\)/);
  assert.match(page, /cloudFieldMode \? "Confirmed complete" : "Complete"/);
  assert.match(page, /cloudFieldMode \? "Confirmed time" : "Logged time"/);
  assert.match(page, /entry\.status === "Complete" && plannerConfirmed/);
  assert.match(page, /disabled=\{entry\.status === "Complete" \|\| Boolean\(labourAttempt\)\}/);
  assert.match(page, /href="\/cloud"/);
  assert.doesNotMatch(page, /href="\/cloud\/queue"/);
  assert.ok(page.includes(': `${formatMinutes(paidMinutes(record))} saved for ${entry.title}.`);'));
});
