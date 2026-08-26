"use client";

import { cloudPatch, cloudRpc, cloudSelect, cloudUpsert, isCloudConflictError } from "./client";
import { collectionCloudMutationRoute, collectionCloudReadTable, fieldMutationRouteAllows, isServerAuthoredFieldTimeline, normaliseFieldRequestedJobStatus } from "./collections";
import { effectiveCloudMode } from "./config";
import { buildCloudEnvelope, buildCloudUpdatePatch, cloudRecordMatchesQueuedPayload, coalesceQueue, fieldMutationReplayExpired, hasVersionConflict, makeTombstone, mergeProcessedQueue, pendingImports, projectFieldMutationPayload, rebaseQueuedFieldMutation, reconcileVersionedRecordCache, retainDeletedRecordConflict, retainPatchConflict, retainProjectionMutationConflict, sameQueueTarget, sanitizeQueuedFieldMutationProjection, serialSingleFlightByKey, shouldReconcileFieldMutationPayload, tenantRecordQuery, tenantRecordVersionQuery, validateFieldMutationResponse, withExclusiveBrowserLock } from "./repository-core.mjs";
import { readSupabaseSession, supabaseFetch } from "../supabase/client";
import { assertCloudPageOperationCurrent } from "./cloudPageIdentity-core.mjs";

export type SyncState = "Synced" | "Pending" | "Offline" | "Conflict" | "Failed";
export interface TypedCloudEnvelope<T> { organisation_id: string; source_id: string; customer_source_id?: string | null; job_source_id?: string | null; version: number; source_updated_at?: string; payload: T; created_at?: string; updated_at?: string; deleted_at?: string | null; }
export interface GenericCloudEnvelope<T> extends TypedCloudEnvelope<T> { collection_key: string; }
export type CloudEnvelope<T> = TypedCloudEnvelope<T> | GenericCloudEnvelope<T>;
export interface SyncQueueItem<T = unknown> { id: string; table: string; storageKey?: string; operation: "upsert" | "delete"; organisationId: string; sourceId: string; collectionKey?: string; userId?: string; role?: string; customerSourceId?: string; payload?: T; expectedVersion?: number; baseVersion?: number; baseIntent?: "create" | "update" | "unknown"; mutationId?: string; sentAt?: string; queuedAt: string; attempts: number; state: SyncState; error?: string; }
export interface SyncQueueFlushResult { processed: number; cleared: number; remaining: number; conflicts: number; failed: number; }
export interface SyncAuthorizationContext { organisationId: string; userId: string; role: string; customerSourceId?: string; }
interface FieldMutationResponse<T = Record<string, unknown>> { status: "applied" | "replayed"; resource: "jobs" | "cloud_collections"; sourceId: string; collectionKey?: string; version: number; sourceUpdatedAt: string; payload: T; }

const QUEUE_KEY = "jr-os-cloud-sync-queue";
const STATUS_KEY = "jr-os-cloud-sync-status";
const ACTIVE_ORGANISATION_KEY = "jr-os-active-organisation";
const ACTIVE_USER_KEY = "jr-os-active-user";
const ACTIVE_ROLE_KEY = "jr-os-active-role";
const ACTIVE_CUSTOMER_SOURCE_KEY = "jr-os-active-customer-source";

function read<T>(key: string, fallback: T): T { try { return JSON.parse(window.localStorage.getItem(key) || "") as T; } catch { return fallback; } }
function write(key: string, value: unknown) { window.localStorage.setItem(key, JSON.stringify(value)); }
function readAllSyncQueue() {
  const queue = read<SyncQueueItem[]>(QUEUE_KEY, []);
  const sanitized = queue.map((item) => sanitizeQueuedFieldMutationProjection(item) as SyncQueueItem);
  if (sanitized.some((item, index) => item !== queue[index])) write(QUEUE_KEY, sanitized);
  return sanitized;
}
function activeOrganisationId() { return typeof window === "undefined" ? null : window.localStorage.getItem(ACTIVE_ORGANISATION_KEY); }
function activeUserId() { return typeof window === "undefined" ? null : window.localStorage.getItem(ACTIVE_USER_KEY); }
function activeRole() { return typeof window === "undefined" ? null : window.localStorage.getItem(ACTIVE_ROLE_KEY); }
function activeCustomerSourceId() { return typeof window === "undefined" ? null : window.localStorage.getItem(ACTIVE_CUSTOMER_SOURCE_KEY); }
function currentSyncAuthorization(): SyncAuthorizationContext | null {
  const organisationId = activeOrganisationId();
  const userId = activeUserId();
  const role = activeRole();
  if (!organisationId || !userId || !role) return null;
  return { organisationId, userId, role, customerSourceId: activeCustomerSourceId() ?? undefined };
}
function sameSyncAuthorization(left: SyncAuthorizationContext, right: SyncAuthorizationContext) {
  return left.organisationId === right.organisationId
    && left.userId === right.userId
    && left.role === right.role
    && (left.customerSourceId ?? null) === (right.customerSourceId ?? null);
}
function queueItemMatchesAuthorization(item: SyncQueueItem, authorization: SyncAuthorizationContext) {
  return item.organisationId === authorization.organisationId
    && item.userId === authorization.userId
    && item.role === authorization.role
    && (item.customerSourceId ?? null) === (authorization.customerSourceId ?? null);
}
export function activeSyncAuthorizationMatches(authorization: SyncAuthorizationContext) {
  const active = currentSyncAuthorization();
  return Boolean(active && sameSyncAuthorization(active, authorization));
}
function collectionFilter(collectionKey?: string) { return collectionKey ? `&collection_key=eq.${encodeURIComponent(collectionKey)}` : ""; }
function updateCachedVersion(storageKey: string | undefined, sourceId: string, version?: number) {
  if (!storageKey) return;
  const key = `jr-os-cloud-versions:${storageKey}`;
  const versions = read<Record<string, number>>(key, {});
  if (version === undefined) delete versions[sourceId]; else versions[sourceId] = version;
  write(key, versions);
}

function reconcileCachedFieldMutation(storageKey: string | undefined, sourceId: string, version: number, payload?: unknown) {
  if (!storageKey) return false;
  const versionStorageKey = `jr-os-cloud-versions:${storageKey}`;
  const versions = read<Record<string, number>>(versionStorageKey, {});
  const records = read<Record<string, unknown>[]>(storageKey, []);
  const recordPayload = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : undefined;
  const result = reconcileVersionedRecordCache({ versions, records, sourceId, version, payload: recordPayload });
  if (!result.applied) return false;
  if (result.records !== records) write(storageKey, result.records);
  write(versionStorageKey, result.versions);
  if (result.records !== records) {
    window.dispatchEvent(new CustomEvent("jr-os-cloud-cache-reconciled", {
      detail: { storageKey, sourceId, payload },
    }));
  }
  return true;
}

function markFieldMutationSent(item: SyncQueueItem) {
  const queue = readAllSyncQueue();
  const index = queue.findIndex((entry) => entry.id === item.id);
  if (index < 0) return null;
  const prepared: SyncQueueItem = {
    ...queue[index],
    baseIntent: item.baseIntent,
    baseVersion: item.baseVersion,
    expectedVersion: item.expectedVersion,
    mutationId: queue[index].mutationId || crypto.randomUUID(),
    sentAt: queue[index].sentAt || new Date().toISOString(),
  };
  queue[index] = prepared;
  write(QUEUE_KEY, queue);
  return prepared;
}

function fieldMutationTargetKey(item: SyncQueueItem) {
  return JSON.stringify([
    item.organisationId,
    item.userId ?? null,
    item.role ?? null,
    item.customerSourceId ?? null,
    item.table,
    item.collectionKey ?? null,
    item.sourceId,
  ]);
}

export function syncQueueItemId(organisationId: string, userId: string | undefined, role: string | undefined, customerSourceId: string | undefined, table: string, collectionKey: string | undefined, sourceId: string, queuedAt: number, mutationId?: string) {
  return JSON.stringify([organisationId, userId ?? null, role ?? null, customerSourceId ?? null, table, collectionKey || "typed", sourceId, queuedAt, mutationId ?? null]);
}

function statusForQueue(queue: SyncQueueItem[]): SyncState {
  if (!queue.length) return "Synced";
  if (queue.some((item) => item.state === "Conflict")) return "Conflict";
  if (queue.some((item) => item.state === "Failed")) return "Failed";
  if (queue.some((item) => item.state === "Offline")) return "Offline";
  return "Pending";
}

export function setActiveSyncIdentity(organisationId: string | null, userId: string | null, role: string | null = null, customerSourceId: string | null = null) {
  if (typeof window === "undefined") return;
  if (organisationId) window.localStorage.setItem(ACTIVE_ORGANISATION_KEY, organisationId);
  else window.localStorage.removeItem(ACTIVE_ORGANISATION_KEY);
  if (userId) window.localStorage.setItem(ACTIVE_USER_KEY, userId);
  else window.localStorage.removeItem(ACTIVE_USER_KEY);
  if (role) window.localStorage.setItem(ACTIVE_ROLE_KEY, role);
  else window.localStorage.removeItem(ACTIVE_ROLE_KEY);
  if (customerSourceId) window.localStorage.setItem(ACTIVE_CUSTOMER_SOURCE_KEY, customerSourceId);
  else window.localStorage.removeItem(ACTIVE_CUSTOMER_SOURCE_KEY);
  syncStatus.set(navigator.onLine ? statusForQueue(getSyncQueue()) : "Offline");
}

export function setActiveSyncOrganisation(organisationId: string | null) {
  setActiveSyncIdentity(organisationId, activeUserId(), activeRole(), activeCustomerSourceId());
}

export const syncStatus = {
  get(): SyncState {
    const derived = navigator.onLine ? statusForQueue(getSyncQueue()) : "Offline";
    const stored = read<SyncState>(STATUS_KEY, derived);
    if (stored !== derived) write(STATUS_KEY, derived);
    return derived;
  },
  set(value: SyncState) { write(STATUS_KEY, value); window.dispatchEvent(new CustomEvent("jr-os-sync-status", { detail: value })); },
};

export function getSyncQueue() {
  const authorization = currentSyncAuthorization();
  if (!authorization) return [];
  return readAllSyncQueue().filter((item) => queueItemMatchesAuthorization(item, authorization));
}

export function getOrganisationSyncQueue(organisationId: string) {
  return readAllSyncQueue().filter((item) => item.organisationId === organisationId);
}

export function discardSyncQueueItem(itemId: string) {
  const authorization = currentSyncAuthorization();
  if (!authorization) return { removed: false, remaining: 0 };
  const queue = readAllSyncQueue();
  const item = queue.find((entry) => entry.id === itemId && queueItemMatchesAuthorization(entry, authorization));
  if (!item) return { removed: false, remaining: getSyncQueue().length };
  const next = queue.filter((entry) => entry.id !== itemId);
  write(QUEUE_KEY, next);
  const activeRemaining = next.filter((entry) => queueItemMatchesAuthorization(entry, authorization));
  syncStatus.set(statusForQueue(activeRemaining));
  return { removed: true, remaining: activeRemaining.length, item };
}

export function queueChange<T>(item: Omit<SyncQueueItem<T>, "id" | "mutationId" | "sentAt" | "queuedAt" | "attempts" | "state">) {
  const queue = readAllSyncQueue();
  const safeItem = sanitizeQueuedFieldMutationProjection(item) as typeof item;
  if (isServerAuthoredFieldTimeline(safeItem.table, safeItem.role, safeItem.collectionKey, safeItem.payload)) return;
  const queuedAt = Date.now();
  const mutationId = crypto.randomUUID();
  const next: SyncQueueItem<T> = { ...safeItem, id: syncQueueItemId(safeItem.organisationId, safeItem.userId, safeItem.role, safeItem.customerSourceId, safeItem.table, safeItem.collectionKey, safeItem.sourceId, queuedAt, mutationId), mutationId, queuedAt: new Date(queuedAt).toISOString(), attempts: 0, state: navigator.onLine ? "Pending" : "Offline" };
  const coalesced = coalesceQueue(queue, next);
  write(QUEUE_KEY, coalesced);
  const authorization = currentSyncAuthorization();
  if (authorization && queueItemMatchesAuthorization(next, authorization)) {
    const activeQueue = coalesced.filter((entry) => queueItemMatchesAuthorization(entry, authorization));
    syncStatus.set(navigator.onLine ? statusForQueue(activeQueue) : "Offline");
  }
}

export async function revalidateSyncAuthorization(expected: SyncAuthorizationContext) {
  if (!activeSyncAuthorizationMatches(expected)) return false;
  const sessionUserId = readSupabaseSession()?.user?.id;
  if (sessionUserId !== expected.userId) {
    setActiveSyncIdentity(null, null, null, null);
    window.dispatchEvent(new Event("jr-os-cloud-identity-changed"));
    return false;
  }
  try {
    const rows = await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(expected.userId)}&active=eq.true&select=organisation_id,role,customer_source_id,active`);
    const profile = Array.isArray(rows) ? rows[0] : null;
    const hasCustomerScope = profile?.role !== "customer" || Boolean(profile?.customer_source_id);
    const live: SyncAuthorizationContext | null = hasCustomerScope && profile?.active && profile?.organisation_id && profile?.role
      ? { organisationId: profile.organisation_id, userId: expected.userId, role: profile.role, customerSourceId: profile.customer_source_id || undefined }
      : null;
    if (!live || !sameSyncAuthorization(live, expected)) {
      setActiveSyncIdentity(null, null, null, null);
      window.dispatchEvent(new Event("jr-os-cloud-identity-changed"));
      return false;
    }
    return activeSyncAuthorizationMatches(expected);
  } catch {
    return false;
  }
}

async function flushSyncQueueOnce(): Promise<SyncQueueFlushResult> {
  const authorization = currentSyncAuthorization();
  const allQueue = readAllSyncQueue();
  if (!authorization) return { processed: 0, cleared: 0, remaining: 0, conflicts: 0, failed: 0 };

  const queue = allQueue.filter((item) => queueItemMatchesAuthorization(item, authorization));
  if (!navigator.onLine) {
    syncStatus.set("Offline");
    return { processed: 0, cleared: 0, remaining: queue.length, conflicts: queue.filter((item) => item.state === "Conflict").length, failed: queue.filter((item) => item.state === "Failed").length };
  }
  if (!(await revalidateSyncAuthorization(authorization))) {
    return { processed: 0, cleared: 0, remaining: queue.length, conflicts: queue.filter((item) => item.state === "Conflict").length, failed: queue.filter((item) => item.state === "Failed").length };
  }

  const remaining: SyncQueueItem[] = [];
  const fieldMutationSuccesses: { item: SyncQueueItem; response: FieldMutationResponse }[] = [];
  const fieldMutationVersions = new Map<string, number>();
  const blockedFieldMutationTargets = new Set<string>();
  let cleared = 0;
  let processed = 0;
  for (const queuedItem of queue) {
    let item = queuedItem;
    let activeFieldMutationTarget: string | undefined;
    if (!activeSyncAuthorizationMatches(authorization)) {
      remaining.push(...queue.slice(processed));
      break;
    }
    processed += 1;
    try {
      const mutationRoute = collectionCloudMutationRoute(item.table, item.role, item.collectionKey);
      if (mutationRoute.kind === "deny") {
        remaining.push(...retainProjectionMutationConflict(
          [],
          item,
          "This electrician resource does not have an approved secure mutation route.",
        ));
        continue;
      }
      if (mutationRoute.kind === "rpc") {
        const targetKey = fieldMutationTargetKey(item);
        activeFieldMutationTarget = targetKey;
        if (blockedFieldMutationTargets.has(targetKey)) {
          remaining.push(item);
          continue;
        }
        if (isServerAuthoredFieldTimeline(item.table, item.role, item.collectionKey, item.payload)) {
          cleared += 1;
          continue;
        }
        if (fieldMutationReplayExpired(item.sentAt)) {
          blockedFieldMutationTargets.add(targetKey);
          remaining.push(...retainProjectionMutationConflict(
            [],
            item,
            "This field change was sent more than 30 days ago and its replay receipt may have expired. Refresh the record and resolve the change manually before retrying.",
          ));
          continue;
        }
        const priorVersion = fieldMutationVersions.get(targetKey);
        if (priorVersion !== undefined && item.sentAt === undefined) {
          item = rebaseQueuedFieldMutation(item, priorVersion);
        }
        if (!fieldMutationRouteAllows(mutationRoute, item.operation, item.baseIntent)) {
          const reason = item.operation === "delete"
            ? "Projected field records cannot be deleted from the offline queue."
            : item.baseIntent === "unknown" || item.baseIntent === undefined
              ? "This field change has no trustworthy create or update base and cannot be replayed."
              : `Secure ${mutationRoute.resource} mutations do not allow ${item.baseIntent} operations.`;
          remaining.push(...retainProjectionMutationConflict([], item, reason));
          continue;
        }

        const expectedVersion = item.baseIntent === "create" ? 0 : item.baseVersion;
        if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 0) {
          remaining.push(...retainProjectionMutationConflict(
            [],
            item,
            "This field change has no trustworthy base version and cannot be replayed.",
          ));
          continue;
        }
        if (!item.payload || typeof item.payload !== "object" || Array.isArray(item.payload)) {
          throw new Error("The queued field mutation payload is invalid.");
        }

        const prepared = markFieldMutationSent(item);
        if (!prepared) continue;
        item = prepared;
        const payload = item.payload as Record<string, unknown>;
        const requestedStatus = mutationRoute.resource === "jobs"
          ? normaliseFieldRequestedJobStatus(payload.status)
          : undefined;
        if (mutationRoute.resource === "jobs" && (typeof requestedStatus !== "string" || !requestedStatus.trim())) {
          throw new Error("A secure job mutation requires the requested status.");
        }
        const args = mutationRoute.resource === "jobs"
          ? {
              record_source_id: item.sourceId,
              expected_version: expectedVersion,
              requested_status: requestedStatus,
              mutation_id: item.mutationId,
            }
          : {
              collection_key_value: item.collectionKey,
              record_source_id: item.sourceId,
              expected_version: expectedVersion,
              record_payload: payload,
              mutation_id: item.mutationId,
            };
        const rawResponse = await cloudRpc<FieldMutationResponse>(mutationRoute.functionName, args);
        if (!activeSyncAuthorizationMatches(authorization)) {
          remaining.push(item, ...queue.slice(processed));
          break;
        }
        const response = validateFieldMutationResponse(rawResponse, {
          resource: mutationRoute.resource,
          sourceId: item.sourceId,
          collectionKey: item.collectionKey,
          requestedStatus,
        }) as FieldMutationResponse;
        fieldMutationSuccesses.push({ item, response });
        fieldMutationVersions.set(targetKey, response.version);
        cleared += 1;
        continue;
      }

      const readTable = collectionCloudReadTable(item.table, item.role, item.collectionKey);
      const readsThroughProjection = readTable !== item.table;
      const existing = await cloudSelect<CloudEnvelope<unknown>>(readTable, tenantRecordQuery({ organisationId: item.organisationId, sourceId: item.sourceId, collectionKey: item.collectionKey, includeDeleted: true }));
      if (!activeSyncAuthorizationMatches(authorization)) {
        remaining.push(item, ...queue.slice(processed));
        break;
      }
      const current = existing[0];

      if (item.operation === "delete" && (!current || current.deleted_at)) {
        updateCachedVersion(item.storageKey, item.sourceId, current?.version);
        cleared += 1;
        continue;
      }
      if (item.operation === "upsert" && current && !current.deleted_at && cloudRecordMatchesQueuedPayload(item.table, current, item.payload)) {
        updateCachedVersion(item.storageKey, item.sourceId, current.version);
        cleared += 1;
        continue;
      }
      if (hasVersionConflict(current?.version, item.expectedVersion)) {
        remaining.push({ ...item, state: "Conflict", error: `Cloud version ${current?.version} differs from expected ${item.expectedVersion}.` });
        continue;
      }
      if (item.operation === "upsert" && current?.deleted_at) {
        remaining.push(...retainDeletedRecordConflict([], item));
        continue;
      }

      // PostgreSQL requires canonical SELECT visibility for a direct UPDATE.
      // A role projection can safely prove equality/version, but it must never
      // be used to rebuild canonical relationship columns from redacted JSON.
      // Keep the operation queued until the narrow server-side field mutation
      // service applies it without reopening the source table.
      if (readsThroughProjection && (current || item.operation === "delete" || item.expectedVersion !== undefined)) {
        remaining.push(...retainProjectionMutationConflict([], item));
        continue;
      }

      if (item.operation === "delete") {
        if (!current) { updateCachedVersion(item.storageKey, item.sourceId); cleared += 1; continue; }
        const deletedAt = new Date().toISOString();
        const query = tenantRecordVersionQuery({ organisationId: item.organisationId, sourceId: item.sourceId, collectionKey: item.collectionKey, currentVersion: current.version });
        const tombstone = makeTombstone({ currentVersion: current.version, userId: item.userId, deletedAt });
        const updated = await cloudPatch<CloudEnvelope<unknown>>(item.table, query, { deleted_at: tombstone.deleted_at, source_updated_at: deletedAt });
        if (updated.length !== 1) {
          remaining.push(...retainPatchConflict([], item, current.version, updated.length));
          continue;
        }
        updateCachedVersion(item.storageKey, item.sourceId, updated[0].version);
        cleared += 1;
      } else {
        const sourceUpdatedAt = (item.payload as { updatedAt?: string } | undefined)?.updatedAt || new Date().toISOString();
        const envelopeInput = {
          organisationId: item.organisationId,
          sourceId: item.sourceId,
          recordTable: item.table,
          collectionKey: item.collectionKey,
          payload: item.payload,
          version: (current?.version || 0) + 1,
          sourceUpdatedAt,
          updatedBy: item.userId,
        };
        if (current) {
          const query = tenantRecordVersionQuery({ organisationId: item.organisationId, sourceId: item.sourceId, collectionKey: item.collectionKey, currentVersion: current.version });
          const patch = buildCloudUpdatePatch(envelopeInput);
          const updated = await cloudPatch<CloudEnvelope<unknown>>(item.table, query, patch);
          if (updated.length !== 1) {
            remaining.push(...retainPatchConflict([], item, current.version, updated.length));
            continue;
          }
          updateCachedVersion(item.storageKey, item.sourceId, updated[0].version);
        } else {
          const record = buildCloudEnvelope({ ...envelopeInput, createdBy: item.userId });
          await cloudUpsert(item.table, [record], item.collectionKey ? "organisation_id,collection_key,source_id" : "organisation_id,source_id");
          updateCachedVersion(item.storageKey, item.sourceId, record.version);
        }
        cleared += 1;
      }
    } catch (error) {
      if (activeFieldMutationTarget) blockedFieldMutationTargets.add(activeFieldMutationTarget);
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        state: isCloudConflictError(error) ? "Conflict" : "Failed",
        error: error instanceof Error ? error.message : "Sync failed",
      });
    }
  }

  const liveQueue = readAllSyncQueue();
  const processedIds = new Set(queue.map((item) => item.id));
  const latestSuccessByTarget = new Map<string, { item: SyncQueueItem; response: FieldMutationResponse }>();
  for (const success of fieldMutationSuccesses) {
    latestSuccessByTarget.set(fieldMutationTargetKey(success.item), success);
  }
  for (const success of latestSuccessByTarget.values()) {
    const concurrentIndices = liveQueue
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => !processedIds.has(entry.id) && sameQueueTarget(entry, success.item))
      .map(({ index }) => index);
    if (concurrentIndices.length) {
      for (const index of concurrentIndices) {
        liveQueue[index] = rebaseQueuedFieldMutation(liveQueue[index], success.response.version);
      }
    }
  }
  const nextQueue = mergeProcessedQueue(liveQueue, queue, remaining);
  write(QUEUE_KEY, nextQueue);
  for (const success of latestSuccessByTarget.values()) {
    // A retained mutation is the newer optimistic UI state, whether it was
    // added during this request or was processed later in the same snapshot
    // and failed. Only an unshadowed receipt may replace the cached payload.
    const payload = shouldReconcileFieldMutationPayload(nextQueue, success.item)
      ? projectFieldMutationPayload({
          collectionKey: success.item.collectionKey,
          role: success.item.role,
          payload: success.response.payload,
        })
      : undefined;
    reconcileCachedFieldMutation(success.item.storageKey, success.item.sourceId, success.response.version, payload);
  }

  const activeRemaining = nextQueue.filter((item) => queueItemMatchesAuthorization(item, authorization));
  const conflicts = activeRemaining.filter((item) => item.state === "Conflict").length;
  const failed = activeRemaining.filter((item) => item.state === "Failed").length;
  if (activeSyncAuthorizationMatches(authorization)) syncStatus.set(statusForQueue(activeRemaining));
  return { processed, cleared, remaining: activeRemaining.length, conflicts, failed };
}

function syncAuthorizationFlightKey() {
  const authorization = currentSyncAuthorization();
  return authorization
    ? JSON.stringify([authorization.organisationId, authorization.userId, authorization.role, authorization.customerSourceId ?? null])
    : "no-active-authorization";
}

const EMPTY_SYNC_QUEUE_FLUSH_RESULT: SyncQueueFlushResult = {
  processed: 0,
  cleared: 0,
  remaining: 0,
  conflicts: 0,
  failed: 0,
};

const runSyncQueueFlush = serialSingleFlightByKey<[string], SyncQueueFlushResult>((expectedAuthorizationKey) => withExclusiveBrowserLock<SyncQueueFlushResult>(
  typeof navigator === "undefined" ? undefined : navigator.locks,
  "jr-os-cloud-sync-queue-flush",
  () => syncAuthorizationFlightKey() === expectedAuthorizationKey
    ? flushSyncQueueOnce()
    : Promise.resolve(EMPTY_SYNC_QUEUE_FLUSH_RESULT),
), (authorizationKey) => authorizationKey);

export function flushSyncQueue(): Promise<SyncQueueFlushResult> {
  return runSyncQueueFlush(syncAuthorizationFlightKey());
}

export async function importLocalCollection<T extends { id: string; updatedAt?: string; customerId?: string; customerSourceId?: string; jobId?: string; jobSourceId?: string }>(storageKey: string, table: string, organisationId: string, collectionKey?: string, userId?: string, operationIsCurrent?: () => boolean) {
  assertCloudPageOperationCurrent(operationIsCurrent);
  const records = read<T[]>(storageKey, []);
  if (!records.length) return { imported: 0, skipped: 0 };
  const filter = collectionFilter(collectionKey);
  assertCloudPageOperationCurrent(operationIsCurrent);
  const existing = await cloudSelect<{ source_id: string; source_updated_at?: string; version?: number; deleted_at?: string | null }>(table, `select=source_id,source_updated_at,version,deleted_at&organisation_id=eq.${encodeURIComponent(organisationId)}${filter}`);
  assertCloudPageOperationCurrent(operationIsCurrent);
  const pending = pendingImports(records, existing);
  if (pending.length) {
    const importedAt = new Date().toISOString();
    const rows = pending.map((record) => buildCloudEnvelope({
      organisationId,
      sourceId: record.id,
      recordTable: table,
      collectionKey,
      payload: record,
      version: 1,
      sourceUpdatedAt: record.updatedAt || importedAt,
      createdBy: userId,
      updatedBy: userId,
    }));
    assertCloudPageOperationCurrent(operationIsCurrent);
    await cloudUpsert(table, rows, collectionKey ? "organisation_id,collection_key,source_id" : "organisation_id,source_id");
    assertCloudPageOperationCurrent(operationIsCurrent);
  }
  const versions = Object.fromEntries(existing.map((row) => [row.source_id, row.version || 1]));
  for (const record of pending) versions[record.id] = 1;
  write(`jr-os-cloud-versions:${storageKey}`, versions);
  return { imported: pending.length, skipped: records.length - pending.length };
}

export function collectionMode() { return effectiveCloudMode(); }

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushSyncQueue());
  window.addEventListener("offline", () => syncStatus.set("Offline"));
}

