import {
  assert,
  test,
  isServerAuthoredFieldTimeline,
  normaliseFieldRequestedJobStatus,
  validateFieldMutationResponse,
  repository,
} from "./field-mutation-client-helpers.mjs";

test("job status evidence is server-owned while explicit field notes remain routable", () => {
  assert.equal(normaliseFieldRequestedJobStatus("In progress"), "First fix");
  assert.equal(normaliseFieldRequestedJobStatus(" In progress "), "First fix");
  assert.equal(normaliseFieldRequestedJobStatus(" Testing "), "Testing");
  assert.equal(normaliseFieldRequestedJobStatus("\tTesting\t"), "\tTesting\t", "field request normalization must match PostgreSQL btrim spaces");
  assert.equal(normaliseFieldRequestedJobStatus("Testing"), "Testing");
  assert.match(repository, /normaliseFieldRequestedJobStatus\(payload\.status\)/);
  assert.equal(isServerAuthoredFieldTimeline("cloud_collections", "electrician", "jr-os-job-timeline", {
    id: "timeline-1", eventType: "Status change", sourceType: "Job", fromStatus: "Scheduled", toStatus: "First fix",
  }), true);
  assert.equal(isServerAuthoredFieldTimeline("cloud_collections", "electrician", "jr-os-job-timeline", {
    id: "timeline-2", eventType: "Note", note: "Access issue at rear door",
  }), false);
  assert.equal(isServerAuthoredFieldTimeline("cloud_collections", "electrician", "jr-os-job-timeline", {
    id: "timeline-3", eventType: "Snag", sourceType: "JobTask", sourceId: "task-1", note: "Socket faceplate damaged",
  }), false, "structured field activity may contribute note text for server canonicalization");
  assert.match(repository, /if \(isServerAuthoredFieldTimeline\(item\.table, item\.role, item\.collectionKey, item\.payload\)\) return/);
  assert.match(repository, /if \(isServerAuthoredFieldTimeline\(item\.table, item\.role, item\.collectionKey, item\.payload\)\) \{[\s\S]*cleared \+= 1/);
});


test("RPC responses are identity-checked before safe cache reconciliation", () => {
  const response = {
    status: "replayed",
    resource: "jobs",
    sourceId: "job-1",
    version: 8,
    sourceUpdatedAt: "2026-08-13T20:00:00.000Z",
    payload: { id: "job-1", status: "Testing" },
  };
  assert.strictEqual(validateFieldMutationResponse(response, { resource: "jobs", sourceId: "job-1", requestedStatus: "Testing" }), response);
  assert.strictEqual(validateFieldMutationResponse(response, {
    resource: "jobs",
    sourceId: "job-1",
    requestedStatus: normaliseFieldRequestedJobStatus(" Testing "),
  }), response, "padded field requests must validate against the canonical RPC response");
  assert.throws(() => validateFieldMutationResponse({ ...response, sourceId: "job-2" }, { resource: "jobs", sourceId: "job-1" }), /mismatched/i);
  assert.throws(() => validateFieldMutationResponse({ ...response, version: "8" }, { resource: "jobs", sourceId: "job-1" }), /mismatched/i);
  assert.throws(() => validateFieldMutationResponse({ ...response, status: "maybe" }, { resource: "jobs", sourceId: "job-1" }), /invalid status/i);

  const canonicalNote = {
    status: "applied",
    resource: "cloud_collections",
    sourceId: "timeline-3",
    collectionKey: "jr-os-job-timeline",
    version: 1,
    sourceUpdatedAt: "2026-08-13T20:00:00.000Z",
    payload: {
      id: "timeline-3",
      jobId: "job-1",
      milestone: "Custom update",
      eventType: "Note",
      note: "Socket faceplate damaged",
      completedBy: "Field Electrician",
      completedAt: "2026-08-13T20:00:00.000Z",
      createdAt: "2026-08-13T20:00:00.000Z",
    },
  };
  assert.strictEqual(validateFieldMutationResponse(canonicalNote, {
    resource: "cloud_collections",
    sourceId: "timeline-3",
    collectionKey: "jr-os-job-timeline",
  }), canonicalNote);
  assert.throws(() => validateFieldMutationResponse({
    ...canonicalNote,
    payload: { ...canonicalNote.payload, eventType: "Snag", sourceType: "JobTask", sourceId: "task-1" },
  }, {
    resource: "cloud_collections",
    sourceId: "timeline-3",
    collectionKey: "jr-os-job-timeline",
  }), /unsafe timeline note/i, "client evidence classification must never enter the safe cache");
  assert.match(repository, /success\.response\.payload/);
});
