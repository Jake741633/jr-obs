import { normaliseFieldRequestedJobStatus } from "./fieldMutationPolicy-core.mjs";
import { sanitizeRoleProjectionCache } from "./roleProjectionCache-core.mjs";

export function collectionFilter(collectionKey) {
  return collectionKey ? `&collection_key=eq.${encodeURIComponent(collectionKey)}` : "";
}

export function tenantRecordQuery({ organisationId, sourceId, collectionKey, includeDeleted = true }) {
  const deletedFilter = includeDeleted ? "" : "&deleted_at=is.null";
  return `select=*&organisation_id=eq.${encodeURIComponent(organisationId)}&source_id=eq.${encodeURIComponent(sourceId)}${collectionFilter(collectionKey)}${deletedFilter}&limit=1`;
}

export function tenantRecordVersionQuery({ organisationId, sourceId, collectionKey, currentVersion }) {
  return `organisation_id=eq.${encodeURIComponent(organisationId)}&source_id=eq.${encodeURIComponent(sourceId)}${collectionFilter(collectionKey)}&version=eq.${encodeURIComponent(String(currentVersion))}`;
}

export function tenantListQuery({ organisationId, collectionKey }) {
  return `select=*&organisation_id=eq.${encodeURIComponent(organisationId)}${collectionFilter(collectionKey)}&deleted_at=is.null`;
}

export function hasVersionConflict(currentVersion, expectedVersion) {
  return currentVersion !== undefined && expectedVersion !== undefined && currentVersion !== expectedVersion;
}

function samePayload(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
}

function isObjectPayload(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const isoUtcMilliseconds = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/;

export function cloudRecordMatchesQueuedPayload(table, current, queuedPayload) {
  if (samePayload(current?.payload, queuedPayload)) return true;
  if (table !== "portal_approvals" || !isObjectPayload(current?.payload) || !isObjectPayload(queuedPayload)) return false;

  const currentDecisionTime = current.payload.decidedAt;
  const queuedDecisionTime = queuedPayload.decidedAt;
  const receiptTime = current.created_at;
  if (typeof currentDecisionTime !== "string"
    || typeof queuedDecisionTime !== "string"
    || typeof receiptTime !== "string"
    || !isoUtcMilliseconds.test(currentDecisionTime)
    || !isoUtcMilliseconds.test(queuedDecisionTime)
    || !Number.isFinite(Date.parse(currentDecisionTime))
    || !Number.isFinite(Date.parse(queuedDecisionTime))
    || Date.parse(currentDecisionTime) !== Date.parse(receiptTime)) return false;

  const currentEvidence = { ...current.payload };
  const queuedEvidence = { ...queuedPayload };
  delete currentEvidence.decidedAt;
  delete queuedEvidence.decidedAt;
  return JSON.stringify(canonicalJson(currentEvidence)) === JSON.stringify(canonicalJson(queuedEvidence));
}

export function linkedSourceIds(payload) {
  if (!payload || typeof payload !== "object") return { customerSourceId: undefined, jobSourceId: undefined };
  return {
    customerSourceId: typeof payload.customerId === "string"
      ? payload.customerId
      : typeof payload.customerSourceId === "string"
        ? payload.customerSourceId
        : undefined,
    jobSourceId: typeof payload.jobId === "string"
      ? payload.jobId
      : typeof payload.jobSourceId === "string"
        ? payload.jobSourceId
        : undefined,
  };
}

export function buildTypedEnvelope({
  organisationId,
  sourceId,
  recordTable,
  payload,
  version,
  sourceUpdatedAt,
  createdBy,
  updatedBy,
}) {
  const links = linkedSourceIds(payload);
  const customerSourceId = recordTable === "customers" ? sourceId : links.customerSourceId;
  const jobSourceId = recordTable === "customers" || recordTable === "jobs" ? undefined : links.jobSourceId;
  return {
    organisation_id: organisationId,
    source_id: sourceId,
    customer_source_id: customerSourceId ?? null,
    job_source_id: jobSourceId ?? null,
    version,
    source_updated_at: sourceUpdatedAt,
    payload: payload ?? null,
    deleted_at: null,
    created_by: createdBy ?? null,
    updated_by: updatedBy ?? null,
  };
}

export function buildGenericEnvelope({ collectionKey, ...typed }) {
  if (!collectionKey) throw new Error("Generic cloud records require a collection key.");
  return {
    ...buildTypedEnvelope(typed),
    collection_key: collectionKey,
  };
}

export function buildCloudEnvelope(input) {
  return input.collectionKey ? buildGenericEnvelope(input) : buildTypedEnvelope(input);
}

export function buildCloudUpdatePatch(input) {
  const envelope = buildCloudEnvelope(input);
  return {
    customer_source_id: envelope.customer_source_id,
    job_source_id: envelope.job_source_id,
    source_updated_at: envelope.source_updated_at,
    payload: envelope.payload,
  };
}

export function hasReplayableSyncQueueItems(queue) {
  return queue.some((item) => item.state === "Pending" || item.state === "Offline");
}

export function queueTargetSyncState(queue, target, online) {
  const matching = queue.filter((item) => item.table === target.table
    && item.sourceId === target.sourceId
    && (item.collectionKey ?? undefined) === (target.collectionKey ?? undefined));
  if (!matching.length) return "Synced";
  if (matching.some((item) => item.state === "Conflict")) return "Conflict";
  if (matching.some((item) => item.state === "Failed")) return "Failed";
  if (!online || matching.some((item) => item.state === "Offline")) return "Offline";
  return "Pending";
}

export function sameQueueTarget(item, next) {
  return item.organisationId === next.organisationId
    && item.userId === next.userId
    && item.role === next.role
    && (item.customerSourceId ?? null) === (next.customerSourceId ?? null)
    && item.table === next.table
    && item.sourceId === next.sourceId
    && item.collectionKey === next.collectionKey;
}

function queuedElectricianJobStatus(item) {
  if (item.role !== "electrician"
    || item.table !== "jobs"
    || item.operation !== "upsert"
    || item.baseIntent !== "update"
    || !isObjectPayload(item.payload)
    || typeof item.payload.status !== "string") return undefined;
  const status = normaliseFieldRequestedJobStatus(item.payload.status);
  return typeof status === "string" && status ? status : undefined;
}

export function coalesceQueue(queue, next) {
  let index = -1;
  for (let candidateIndex = queue.length - 1; candidateIndex >= 0; candidateIndex -= 1) {
    const candidate = queue[candidateIndex];
    if (!sameQueueTarget(candidate, next)) continue;
    if (candidate.sentAt === undefined) { index = candidateIndex; break; }
    // A sent request is an immutable replay boundary. Never reach behind it
    // and replace an older unsent request with a newer logical mutation.
    return [...queue, next];
  }
  if (index < 0) return [...queue, next];
  const copy = [...queue];
  const original = queue[index];
  if (original.baseIntent === "create" && next.operation === "delete" && original.sentAt === undefined) {
    copy.splice(index, 1);
    return copy;
  }
  const originalJobStatus = queuedElectricianJobStatus(original);
  const nextJobStatus = queuedElectricianJobStatus(next);
  if (originalJobStatus !== undefined
    && nextJobStatus !== undefined
    && originalJobStatus !== nextJobStatus) {
    // Secure job-status mutations are graph edges, not last-write-wins state.
    // Preserve each distinct edge so the replay loop can apply and rebase them
    // in order instead of collapsing them into an invalid server-side jump.
    return [...queue, next];
  }
  if (original.role !== "electrician" && next.role !== "electrician"
    && original.baseIntent === undefined && next.baseIntent === undefined
    && original.baseVersion === undefined && next.baseVersion === undefined) {
    copy[index] = next;
    return copy;
  }
  const legacyBaseIntent = original.expectedVersion > 0 ? "update" : "unknown";
  const replacement = {
    ...next,
    baseIntent: original.baseIntent ?? legacyBaseIntent,
    baseVersion: original.baseVersion ?? (legacyBaseIntent === "update" ? original.expectedVersion : undefined),
  };
  const sameMutationRequest = original.operation === replacement.operation
    && original.baseIntent === replacement.baseIntent
    && original.baseVersion === replacement.baseVersion
    && samePayload(original.payload, replacement.payload);
  copy[index] = sameMutationRequest && original.mutationId
    ? {
        ...replacement,
        id: original.id,
        mutationId: original.mutationId,
        queuedAt: original.queuedAt,
      }
    : replacement;
  return copy;
}

export function rebaseQueuedFieldMutation(change, currentVersion) {
  if (change.sentAt !== undefined) return change;
  return {
    ...change,
    baseIntent: "update",
    baseVersion: currentVersion,
    expectedVersion: currentVersion,
    sentAt: undefined,
    state: change.state === "Offline" ? "Offline" : "Pending",
    error: undefined,
  };
}

const FIELD_MUTATION_RECEIPT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const JOB_DOCUMENT_AUTHORING_ROLES = new Set(["owner", "admin", "office"]);

function validOfficeJobDocumentQueue(change) {
  if (!change
    || !JOB_DOCUMENT_AUTHORING_ROLES.has(change.role)
    || typeof change.organisationId !== "string"
    || !change.organisationId
    || typeof change.userId !== "string"
    || !change.userId
    || typeof change.sourceId !== "string"
    || !change.sourceId
    || change.collectionKey != null
    || change.customerSourceId != null) return false;
  const expectedStorageKey = `jr-os-job-documents:organisation:${JSON.stringify([change.organisationId])}:account:${JSON.stringify([
    change.userId,
    change.role,
    null,
  ])}`;
  return change.storageKey === expectedStorageKey;
}

export function fieldMutationReplayExpired(sentAt, now = Date.now()) {
  if (sentAt === undefined) return false;
  const sentAtTime = typeof sentAt === "string" ? Date.parse(sentAt) : Number.NaN;
  return !Number.isFinite(sentAtTime)
    || !Number.isFinite(now)
    || sentAtTime < now - FIELD_MUTATION_RECEIPT_WINDOW_MS;
}

export function projectFieldMutationPayload({ collectionKey, role, payload }) {
  if (role !== "electrician"
    || collectionKey !== "jr-os-job-progress"
    || !isObjectPayload(payload)) return payload;
  const projected = sanitizeRoleProjectionCache({
    storageKey: collectionKey,
    role,
    mode: "cloud",
    records: [payload],
  });
  return projected[0] ?? {};
}

export function sanitizeQueuedFieldMutationProjection(change, now = Date.now()) {
  if (change?.table === "job_documents" && !validOfficeJobDocumentQueue(change)) return undefined;
  if (change?.role === "electrician" && change.table === "certificates") return undefined;
  if (!change
    || change.role !== "electrician"
    || change.collectionKey !== "jr-os-job-progress"
    || !isObjectPayload(change.payload)
    || (change.sentAt !== undefined && !fieldMutationReplayExpired(change.sentAt, now))) return change;
  const payload = projectFieldMutationPayload(change);
  return payload === change.payload ? change : { ...change, payload };
}

export function mergeProcessedQueue(liveQueue, processedQueue, remainingQueue) {
  const processedIds = new Set(processedQueue.map((item) => item.id));
  const liveIds = new Set(liveQueue.map((item) => item.id));
  const remainingById = new Map(
    remainingQueue.filter((item) => liveIds.has(item.id)).map((item) => [item.id, item]),
  );
  return liveQueue.flatMap((item) => {
    if (!processedIds.has(item.id)) return [item];
    const retained = remainingById.get(item.id);
    return retained ? [retained] : [];
  });
}

export function shouldReconcileFieldMutationPayload(retainedQueue, mutation) {
  return !retainedQueue.some((item) => sameQueueTarget(item, mutation));
}

export function reconcileVersionedRecordCache({ versions, records, sourceId, version, payload }) {
  const currentVersion = versions[sourceId];
  if (currentVersion !== undefined && currentVersion > version) {
    return { applied: false, versions, records };
  }
  const nextVersions = { ...versions, [sourceId]: version };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { applied: true, versions: nextVersions, records };
  }
  const index = records.findIndex((record) => record?.id === sourceId);
  const nextRecords = index < 0
    ? [...records, payload]
    : records.map((record, recordIndex) => recordIndex === index ? payload : record);
  return { applied: true, versions: nextVersions, records: nextRecords };
}

export function singleFlight(task) {
  let active = null;
  return (...args) => {
    if (active) return active;
    const pending = Promise.resolve().then(() => task(...args));
    const tracked = pending.finally(() => {
      if (active === tracked) active = null;
    });
    active = tracked;
    return tracked;
  };
}

export function serialSingleFlightByKey(task, keyForArgs) {
  const activeByKey = new Map();
  let tail = Promise.resolve();
  return (...args) => {
    const key = keyForArgs(...args);
    const existing = activeByKey.get(key);
    if (existing) return existing;
    const pending = tail.then(() => task(...args));
    const tracked = pending.finally(() => {
      if (activeByKey.get(key) === tracked) activeByKey.delete(key);
    });
    activeByKey.set(key, tracked);
    tail = tracked.then(() => undefined, () => undefined);
    return tracked;
  };
}

export function trailingSingleFlightByKey(task, keyForArgs) {
  const activeByKey = new Map();
  return (...args) => {
    const key = keyForArgs(...args);
    const existing = activeByKey.get(key);
    if (existing) {
      existing.args = args;
      if (existing.running) existing.trailing = true;
      return existing.promise;
    }

    const state = { args, running: false, trailing: false, promise: null };
    const drain = async () => {
      let result;
      try {
        do {
          state.trailing = false;
          state.running = true;
          result = await task(...state.args);
        } while (state.trailing);
        return result;
      } finally {
        state.running = false;
        if (activeByKey.get(key) === state) activeByKey.delete(key);
      }
    };
    state.promise = Promise.resolve().then(drain);
    activeByKey.set(key, state);
    return state.promise;
  };
}

export function withExclusiveBrowserLock(lockManager, name, task) {
  if (!lockManager || typeof lockManager.request !== "function") return task();
  return lockManager.request(name, { mode: "exclusive" }, task);
}

export function validateFieldMutationResponse(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The secure field mutation service returned an invalid response.");
  }
  if (value.status !== "applied" && value.status !== "replayed") {
    throw new Error("The secure field mutation service returned an invalid status.");
  }
  if (value.resource !== expected.resource
    || value.sourceId !== expected.sourceId
    || !Number.isInteger(value.version)
    || value.version < 1
    || typeof value.sourceUpdatedAt !== "string"
    || !Number.isFinite(Date.parse(value.sourceUpdatedAt))
    || !value.payload
    || typeof value.payload !== "object"
    || Array.isArray(value.payload)
    || value.payload.id !== expected.sourceId) {
    throw new Error("The secure field mutation service returned a mismatched record.");
  }
  if (expected.resource === "cloud_collections" && value.collectionKey !== expected.collectionKey) {
    throw new Error("The secure field mutation service returned a mismatched collection.");
  }
  if (expected.collectionKey === "jr-os-job-timeline") {
    const forbiddenEvidenceKeys = ["sourceId", "sourceType", "fromStatus", "toStatus"];
    const hasEvidenceClassification = forbiddenEvidenceKeys.some((key) => (
      Object.prototype.hasOwnProperty.call(value.payload, key)
    ));
    if (value.payload.eventType !== "Note"
      || value.payload.milestone !== "Custom update"
      || typeof value.payload.note !== "string"
      || !value.payload.note.trim()
      || typeof value.payload.completedBy !== "string"
      || !value.payload.completedBy.trim()
      || typeof value.payload.completedAt !== "string"
      || !Number.isFinite(Date.parse(value.payload.completedAt))
      || typeof value.payload.createdAt !== "string"
      || !Number.isFinite(Date.parse(value.payload.createdAt))
      || hasEvidenceClassification) {
      throw new Error("The secure field mutation service returned an unsafe timeline note.");
    }
  }
  if (expected.collectionKey === "jr-os-job-progress") {
    const topLevelKeys = new Set(["id", "jobId", "manual", "updatedBy", "createdAt", "updatedAt"]);
    const manualKeys = new Set(["overall", "firstFix", "secondFix", "testing", "certificates", "materials"]);
    const manual = value.payload.manual;
    if (!isObjectPayload(manual)
      || Object.keys(value.payload).some((key) => !topLevelKeys.has(key))
      || Object.keys(manual).some((key) => !manualKeys.has(key))) {
      throw new Error("The secure field mutation service returned private job progress.");
    }
  }
  if (expected.requestedStatus !== undefined && value.payload.status !== expected.requestedStatus) {
    throw new Error("The secure field mutation service did not apply the requested job status.");
  }
  return value;
}

export function makeTombstone({ currentVersion = 0, userId, deletedAt }) {
  return {
    version: currentVersion + 1,
    deleted_at: deletedAt,
    updated_at: deletedAt,
    updated_by: userId,
  };
}

export function pendingImports(records, existingRows) {
  const existing = new Map(existingRows.map((row) => [row.source_id, row]));
  return records.filter((record) => {
    const cloud = existing.get(record.id);
    if (!cloud) return true;
    if (cloud.deleted_at) return false;
    return (record.updatedAt || "") > (cloud.source_updated_at || "");
  });
}

export function applyLocalCrud(records, operation) {
  if (operation.type === "remove") return records.filter((record) => record.id !== operation.id);
  const index = records.findIndex((record) => record.id === operation.record.id);
  if (index < 0) return [operation.record, ...records];
  return records.map((record, recordIndex) => recordIndex === index ? operation.record : record);
}

export function queueModeChange({ mode, online, queue, change }) {
  if (mode === "local") return { queue, status: online ? "Synced" : "Offline" };
  const state = online ? "Pending" : "Offline";
  return { queue: coalesceQueue(queue, { ...change, state }), status: state };
}

export function cloudRowsToCache(rows) {
  const latest = new Map();
  for (const row of rows) {
    const current = latest.get(row.source_id);
    if (!current || (row.version || 0) > (current.version || 0)) latest.set(row.source_id, row);
  }
  return [...latest.values()].filter((row) => !row.deleted_at).map((row) => row.payload);
}

export function retainVersionConflict(queue, change, currentVersion) {
  if (!hasVersionConflict(currentVersion, change.expectedVersion)) return queue;
  return coalesceQueue(queue, {
    ...change,
    state: "Conflict",
    error: `Cloud version ${currentVersion} differs from expected ${change.expectedVersion}.`,
  });
}

export function retainPatchConflict(queue, change, currentVersion, affectedRowCount) {
  if (affectedRowCount === 1) return queue;
  return coalesceQueue(queue, {
    ...change,
    state: "Conflict",
    error: `Cloud update at version ${currentVersion} affected ${affectedRowCount} rows; exactly one was required.`,
  });
}

export function retainProjectionMutationConflict(queue, change, error = "This projected record requires the secure field mutation service before it can be changed.") {
  return coalesceQueue(queue, {
    ...change,
    state: "Conflict",
    error,
  });
}

export function retainDeletedRecordConflict(queue, change) {
  return coalesceQueue(queue, {
    ...change,
    state: "Conflict",
    error: "The cloud record is deleted and must be restored explicitly before it can be changed.",
  });
}
