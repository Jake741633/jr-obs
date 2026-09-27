import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  collectionCloudMutationRoute,
  fieldMutationRouteAllows,
  isServerAuthoredFieldTimeline,
  normaliseFieldRequestedJobStatus,
} from "../lib/cloud/fieldMutationPolicy-core.mjs";
import {
  coalesceQueue,
  fieldMutationReplayExpired,
  mergeProcessedQueue,
  rebaseQueuedFieldMutation,
  reconcileVersionedRecordCache,
  serialSingleFlightByKey,
  shouldReconcileFieldMutationPayload,
  singleFlight,
  validateFieldMutationResponse,
  withExclusiveBrowserLock,
} from "../lib/cloud/repository-core.mjs";

const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../lib/cloud/client.ts", import.meta.url), "utf8");

function fieldChange(overrides = {}) {
  return {
    id: "queue-a",
    mutationId: "11111111-1111-4111-8111-111111111111",
    queuedAt: "2026-08-13T20:00:00.000Z",
    organisationId: "org-a",
    userId: "user-a",
    role: "electrician",
    table: "cloud_collections",
    collectionKey: "jr-os-surveys",
    sourceId: "survey-1",
    operation: "upsert",
    payload: { id: "survey-1", jobId: "job-1", status: "Draft" },
    expectedVersion: 4,
    baseIntent: "update",
    baseVersion: 4,
    state: "Pending",
    attempts: 0,
    ...overrides,
  };
}


export {
  assert,
  test,
  collectionCloudMutationRoute,
  fieldMutationRouteAllows,
  isServerAuthoredFieldTimeline,
  normaliseFieldRequestedJobStatus,
  coalesceQueue,
  fieldMutationReplayExpired,
  mergeProcessedQueue,
  rebaseQueuedFieldMutation,
  reconcileVersionedRecordCache,
  serialSingleFlightByKey,
  shouldReconcileFieldMutationPayload,
  singleFlight,
  validateFieldMutationResponse,
  withExclusiveBrowserLock,
  repository,
  adapter,
  storage,
  client,
  fieldChange,
};
