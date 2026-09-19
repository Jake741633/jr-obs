import test from "node:test";
import assert from "node:assert/strict";

import {
  isOutstandingJobTask,
  jobTaskCounts,
  jobTaskTimelineEntry,
  normaliseJobTaskStatus,
  sortJobTasks,
  transitionJobTask,
} from "../lib/jobTasks-core.mjs";

const now = "2026-08-01T18:55:00.000Z";

function task(overrides = {}) {
  return {
    id: "task-1",
    jobId: "job-1",
    type: "Task",
    title: "Complete first-fix checks",
    description: "",
    category: "First fix",
    priority: "Normal",
    dueDate: "2026-08-02",
    status: "Open",
    photos: [],
    notes: "",
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
    ...overrides,
  };
}

test("job task status transitions preserve completion evidence", () => {
  const inProgress = transitionJobTask({ task: task(), nextStatus: "In progress", now });
  assert.equal(inProgress.status, "In progress");
  assert.equal(inProgress.completedAt, undefined);

  const completed = transitionJobTask({ task: inProgress, nextStatus: "Completed", now });
  assert.equal(completed.status, "Completed");
  assert.equal(completed.completedAt, now);

  const confirmedAt = "2026-08-01T19:00:00.000Z";
  const confirmed = transitionJobTask({ task: completed, nextStatus: "Customer confirmed", now: confirmedAt });
  assert.equal(confirmed.completedAt, now);
  assert.equal(confirmed.customerConfirmedAt, confirmedAt);
  assert.equal(confirmed.updatedAt, confirmedAt);
});

test("invalid task transitions are rejected instead of silently overwritten", () => {
  assert.throws(
    () => transitionJobTask({ task: task(), nextStatus: "Customer confirmed", now }),
    /cannot move from Open to Customer confirmed/,
  );
  assert.throws(
    () => transitionJobTask({ task: task(), nextStatus: "Unknown", now }),
    /Unsupported job task status/,
  );
});

test("task and snag counts separate outstanding site actions", () => {
  const tasks = [
    task(),
    task({ id: "snag-1", type: "Snag", title: "Damaged faceplate", status: "In progress" }),
    task({ id: "task-2", status: "Completed" }),
    task({ id: "snag-2", type: "Snag", status: "Customer confirmed" }),
    task({ id: "other-job", jobId: "job-2" }),
  ];

  assert.deepEqual(jobTaskCounts(tasks, "job-1"), {
    total: 4,
    outstanding: 2,
    outstandingTasks: 1,
    outstandingSnags: 1,
    completed: 2,
  });
  assert.equal(isOutstandingJobTask(tasks[0]), true);
  assert.equal(isOutstandingJobTask(tasks[2]), false);
});

test("task timeline entries retain job and source linkage", () => {
  const entry = jobTaskTimelineEntry({
    task: task({ id: "snag-1", type: "Snag", title: "Socket not level" }),
    fromStatus: "Open",
    toStatus: "In progress",
    timelineId: "timeline-1",
    completedBy: "Jake",
    now,
  });

  assert.equal(entry.jobId, "job-1");
  assert.equal(entry.eventType, "Snag");
  assert.equal(entry.sourceId, "snag-1");
  assert.equal(entry.sourceType, "JobTask");
  assert.equal(entry.milestone, "Custom update");
  assert.match(entry.note, /Socket not level changed from Open to In progress/);
});

test("task sorting keeps active urgent work ahead of completed work", () => {
  const sorted = sortJobTasks([
    task({ id: "completed", status: "Completed", priority: "Urgent" }),
    task({ id: "low", priority: "Low", dueDate: "2026-08-01" }),
    task({ id: "urgent-later", priority: "Urgent", dueDate: "2026-08-03" }),
    task({ id: "urgent-sooner", priority: "Urgent", dueDate: "2026-08-02" }),
  ]);

  assert.deepEqual(sorted.map((item) => item.id), ["urgent-sooner", "urgent-later", "low", "completed"]);
  assert.equal(normaliseJobTaskStatus("Legacy status"), "Open");
});
