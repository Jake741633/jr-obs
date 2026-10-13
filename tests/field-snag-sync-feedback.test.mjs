import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  awaitingQueueState,
  emptySnagSyncProjection,
  refreshSnagSyncProjection,
  registerSnagSyncAttempt,
  snagAttemptStates,
  snagTaskHasUnconfirmedSync,
  unpairedSnagTargetStates,
} from "../lib/snagSync-core.mjs";

const page = readFileSync(new URL("../app/field/snags/page.tsx", import.meta.url), "utf8");

function queueItem(collectionKey, sourceId, state = "Pending", payload = {}, extra = {}) {
  return { table: "cloud_collections", collectionKey, sourceId, state, payload, ...extra };
}

test("snag changes wait for both exact targets and reset a later same-task attempt", () => {
  let projection = registerSnagSyncAttempt(emptySnagSyncProjection(), {
    scopeKey: "scope-a",
    taskId: "task-1",
    timelineId: "timeline-1",
    jobId: "job-1",
    title: "Loose socket",
    action: "created",
  });
  assert.deepEqual(snagAttemptStates(projection, "task-1"), {
    task: awaitingQueueState,
    timeline: awaitingQueueState,
    timelineId: "timeline-1",
    jobId: "job-1",
    title: "Loose socket",
    action: "created",
  });
  assert.equal(snagTaskHasUnconfirmedSync(projection, "task-1"), true);

  projection = refreshSnagSyncProjection({
    current: projection,
    scopeKey: "scope-a",
    queue: [queueItem("jr-os-job-tasks", "task-1", "Pending", { id: "task-1", type: "Snag" })],
    online: true,
  });
  assert.equal(projection.taskTargets["task-1"].state, "Pending");
  assert.equal(projection.timelineTargets["timeline-1"].state, awaitingQueueState);

  projection = refreshSnagSyncProjection({
    current: projection,
    scopeKey: "scope-a",
    queue: [
      queueItem("jr-os-job-tasks", "task-1", "Offline", { id: "task-1", type: "Snag" }),
      queueItem("jr-os-job-timeline", "timeline-1", "Offline", { sourceId: "task-1", sourceType: "JobTask", eventType: "Snag" }),
    ],
    online: false,
  });
  assert.equal(projection.taskTargets["task-1"].state, "Offline");
  assert.equal(projection.timelineTargets["timeline-1"].state, "Offline");

  projection = refreshSnagSyncProjection({
    current: projection,
    scopeKey: "scope-a",
    queue: [queueItem("jr-os-job-timeline", "timeline-1", "Failed", { sourceId: "task-1", sourceType: "JobTask", eventType: "Snag" })],
    online: true,
  });
  assert.equal(projection.taskTargets["task-1"].state, "Synced");
  assert.equal(projection.timelineTargets["timeline-1"].state, "Failed");
  assert.equal(snagTaskHasUnconfirmedSync(projection, "task-1"), true);

  projection = refreshSnagSyncProjection({ current: projection, scopeKey: "scope-a", queue: [], online: true });
  assert.equal(snagTaskHasUnconfirmedSync(projection, "task-1"), false);

  projection = registerSnagSyncAttempt(projection, {
    scopeKey: "scope-a",
    taskId: "task-1",
    timelineId: "timeline-2",
    jobId: "job-1",
    title: "Loose socket",
    action: "marked completed",
  });
  assert.equal(projection.taskTargets["task-1"].state, awaitingQueueState);
  assert.equal(projection.taskTargets["task-1"].seen, false);
  assert.equal(projection.timelineTargets["timeline-2"].state, awaitingQueueState);
  assert.equal(projection.timelineTargets["timeline-1"], undefined);
});

test("an unconfirmed same-task attempt cannot be replaced by another optimistic transition", () => {
  const projection = registerSnagSyncAttempt(emptySnagSyncProjection(), {
    scopeKey: "scope-a",
    taskId: "task-1",
    timelineId: "timeline-1",
  });
  const replacement = registerSnagSyncAttempt(projection, {
    scopeKey: "scope-a",
    taskId: "task-1",
    timelineId: "timeline-2",
  });
  assert.equal(replacement, projection);
  assert.equal(replacement.attempts["task-1"].timelineId, "timeline-1");
});

test("retained snag targets ignore unrelated tasks and map exact snag notes back to their task", () => {
  const projection = refreshSnagSyncProjection({
    current: emptySnagSyncProjection("scope-a"),
    scopeKey: "scope-a",
    queue: [
      queueItem("jr-os-job-tasks", "snag-task", "Failed", { id: "snag-task", type: "Snag" }),
      queueItem("jr-os-job-tasks", "ordinary-task", "Conflict", { id: "ordinary-task", type: "Task" }),
      queueItem("jr-os-job-timeline", "snag-timeline", "Conflict", { sourceId: "timeline-task", sourceType: "JobTask", eventType: "Snag" }),
      queueItem("jr-os-job-timeline", "task-timeline", "Failed", { sourceId: "ordinary-task", sourceType: "JobTask", eventType: "Task" }),
      queueItem("wrong-key", "wrong", "Failed", { type: "Snag" }),
      queueItem("jr-os-job-tasks", "wrong-table", "Failed", { type: "Snag" }, { table: "jobs" }),
    ],
    online: true,
  });

  assert.deepEqual(unpairedSnagTargetStates(projection), [
    { kind: "task", sourceId: "snag-task", state: "Failed" },
    { kind: "timeline", sourceId: "snag-timeline", taskId: "timeline-task", state: "Conflict" },
  ]);
  assert.equal(projection.taskTargets["ordinary-task"], undefined);
  assert.equal(projection.timelineTargets["task-timeline"], undefined);
  assert.equal(snagTaskHasUnconfirmedSync(projection, "timeline-task"), true);

  const replacement = refreshSnagSyncProjection({ current: projection, scopeKey: "scope-b", queue: [], online: true });
  assert.equal(replacement.scopeKey, "scope-b");
  assert.deepEqual(replacement.attempts, {});
  assert.deepEqual(replacement.taskTargets, {});
  assert.deepEqual(replacement.timelineTargets, {});
});

test("snag creation and status changes register exact pairs before optimistic surfaces", () => {
  const create = page.slice(page.indexOf("function createSnag"), page.indexOf("\n\n  function changeStatus"));
  const change = page.slice(page.indexOf("function changeStatus"), page.indexOf("\n\n  return <div"));

  for (const handler of [create, change]) {
    const registration = handler.indexOf("registerSnagSyncAttempt");
    assert.ok(registration >= 0);
    assert.ok(registration < handler.indexOf("tasks.setItems"));
    assert.ok(registration < handler.indexOf("timeline.setItems"));
    assert.ok(registration < handler.indexOf("setMessage(cloudFieldMode"));
  }
  assert.ok(create.indexOf("registerSnagSyncAttempt") < create.indexOf("setForm({ ...blankForm"));
  assert.match(create, /taskId: snag\.id,[\s\S]*timelineId: timelineEntry\.id,[\s\S]*jobId,[\s\S]*title: snag\.title/);
  assert.match(change, /taskId: task\.id,[\s\S]*timelineId: timelineEntry\.id,[\s\S]*jobId: task\.jobId,[\s\S]*title: task\.title/);
});

test("snag sync truth is exact-event and full-identity scoped", () => {
  assert.match(page, /activeSyncAuthorizationMatches\(authorization\)/);
  assert.match(page, /const queue = getSyncQueue\(\)/);
  assert.match(page, /window\.addEventListener\("jr-os-sync-status", refreshSnagSyncStates\)/);
  assert.match(page, /window\.removeEventListener\("jr-os-sync-status", refreshSnagSyncStates\)/);
  assert.doesNotMatch(page, /jr-os-cloud-cache-reconciled/);
  assert.match(page, /snagSyncScopeKey = JSON\.stringify\(\[[\s\S]*organisationId[\s\S]*userId[\s\S]*role[\s\S]*customerSourceId/);
  assert.match(page, /snagSyncReady = !cloudFieldMode \|\| \(activeSnagSyncProjection\.initialized/);
  assert.match(page, /setSnagSyncProjection\(emptySnagSyncProjection\(snagSyncScopeKey\)\)[\s\S]*setSelectedJobId\(""\)[\s\S]*setForm\(\{ \.\.\.blankForm, dueDate: today\(\) \}\)[\s\S]*setMessage\(""\)[\s\S]*setInteractionScopeKey\(snagSyncScopeKey\)[\s\S]*\[snagSyncScopeKey\]/);
  assert.match(page, /interactionScopeReady = interactionScopeKey === snagSyncScopeKey/);
});

test("field snag copy stays unconfirmed and blocks overlap until both targets clear", () => {
  assert.match(page, /captured on this device; its task record and separate job timeline note are awaiting cloud confirmation/i);
  assert.match(page, /Task record is [\s\S]*Job timeline note is/);
  assert.match(page, /The combined snag change is not fully cloud-confirmed/);
  assert.match(page, /retained snag sync targets are not cloud-confirmed/i);
  assert.match(page, /href="\/cloud"/);
  assert.match(page, /snagTaskHasUnconfirmedSync\(activeSnagSyncProjection, task\.id\)/);
  assert.match(page, /snagTaskHasUnconfirmedSync\(activeSnagSyncProjection, snag\.id\)/);
  assert.match(page, /disabled=\{syncBlocked\}/);
  assert.match(page, /disabled=\{syncBlocked \|\| \(cloudFieldMode && !fieldJobTaskStatusTransitionAllowed\(snag\.status, "Open"\)\)\}/);
  assert.match(page, /disabled=\{syncBlocked \|\| snag\.status === "Completed" \|\| snag\.status === "Customer confirmed"\}/);
  assert.match(page, /activeJobs\.some\(\(job\) => job\.id === jobId\)/);
  assert.match(page, /activeJobs\.some\(\(job\) => job\.id === task\.jobId\)/);
  assert.match(page, /: `\$\{snag\.title\} added to the job snag list\.`/);
  assert.match(page, /: `\$\{task\.title\} marked \$\{nextStatus\.toLowerCase\(\)\}\.`/);
});
