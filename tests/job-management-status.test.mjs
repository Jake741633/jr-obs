import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalJobStatuses,
  initialJobTimelineEntry,
  isJobClosedStatus,
  isJobInactiveStatus,
  isJobOnSiteStatus,
  newestJobActivityFirst,
  normaliseJobStatus,
  transitionJobStatus,
} from "../lib/jobManagement-core.mjs";
import { cloudRowsToCache, linkedSourceIds } from "../lib/cloud/repository-core.mjs";

const requestedStatuses = [
  "Enquiry",
  "Survey required",
  "Quoted",
  "Accepted",
  "Awaiting deposit",
  "Scheduled",
  "First fix",
  "Awaiting builder",
  "Second fix",
  "Testing",
  "Snagging",
  "Complete",
  "Invoiced",
  "Paid",
  "On hold",
  "Cancelled",
];

const job = {
  id: "job-1",
  title: "Kitchen rewire",
  siteAddress: "1 High Street",
  status: "Scheduled",
  startDate: "2026-08-03",
  value: 5_000,
  notes: "",
  createdAt: "2026-08-01T08:00:00.000Z",
  updatedAt: "2026-08-01T08:00:00.000Z",
};

test("Job Management Pro exposes the complete ordered status workflow", () => {
  assert.deepEqual(canonicalJobStatuses, requestedStatuses);
  for (const status of requestedStatuses) assert.equal(normaliseJobStatus(status), status);
  assert.equal(normaliseJobStatus("Lead"), "Enquiry");
  assert.equal(normaliseJobStatus("In progress"), "First fix");
});

test("job status transition updates the job without mutating the source and creates an audit timeline entry", () => {
  const result = transitionJobStatus({
    job,
    nextStatus: "First fix",
    now: "2026-08-03T07:45:00.000Z",
    timelineId: "timeline-1",
    completedBy: "Jake",
  });

  assert.equal(job.status, "Scheduled");
  assert.equal(result.job.status, "First fix");
  assert.equal(result.job.updatedAt, "2026-08-03T07:45:00.000Z");
  assert.deepEqual(result.timelineEntry, {
    id: "timeline-1",
    jobId: "job-1",
    milestone: "Custom update",
    eventType: "Status change",
    sourceId: "job-1",
    sourceType: "Job",
    fromStatus: "Scheduled",
    toStatus: "First fix",
    note: "Job status changed from Scheduled to First fix.",
    completedBy: "Jake",
    completedAt: "2026-08-03T07:45:00.000Z",
    createdAt: "2026-08-03T07:45:00.000Z",
  });
});

test("same-stage updates canonicalise legacy data without inventing a status-change event", () => {
  const result = transitionJobStatus({
    job: { ...job, status: "In progress" },
    nextStatus: "First fix",
    now: "2026-08-03T08:00:00.000Z",
    timelineId: "timeline-2",
  });
  assert.equal(result.job.status, "First fix");
  assert.equal(result.timelineEntry, null);
});

test("invalid next statuses are rejected instead of silently overwriting a job", () => {
  assert.throws(() => transitionJobStatus({ job, nextStatus: "Nearly done", now: "2026-08-03T08:00:00.000Z", timelineId: "timeline-3" }), /Unsupported job status/);
});

test("status helpers preserve active, on-site, paused and completed behaviour", () => {
  assert.equal(isJobOnSiteStatus("In progress"), true);
  assert.equal(isJobOnSiteStatus("Testing"), true);
  assert.equal(isJobInactiveStatus("On hold"), true);
  assert.equal(isJobInactiveStatus("Paid"), true);
  assert.equal(isJobClosedStatus("Complete"), true);
  assert.equal(isJobClosedStatus("Cancelled"), true);
  assert.equal(isJobClosedStatus("First fix"), false);
});

test("initial and changed status activity round-trip with stable job linkage", () => {
  const created = initialJobTimelineEntry({ job: { ...job, status: "Enquiry" }, now: "2026-08-01T08:00:00.000Z", timelineId: "timeline-created", completedBy: "Jake" });
  const changed = transitionJobStatus({ job, nextStatus: "First fix", now: "2026-08-03T07:45:00.000Z", timelineId: "timeline-changed", completedBy: "Jake" }).timelineEntry;
  const rows = [created, changed].map((payload, index) => ({ source_id: payload.id, version: index + 1, payload }));
  assert.deepEqual(cloudRowsToCache(rows), [created, changed]);
  assert.deepEqual(linkedSourceIds(created), { customerSourceId: undefined, jobSourceId: "job-1" });
  assert.deepEqual(newestJobActivityFirst([created, changed]).map((entry) => entry.id), ["timeline-changed", "timeline-created"]);
});
