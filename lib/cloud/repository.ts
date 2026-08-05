"use client";

import { cloudPatch, cloudSelect, cloudUpsert } from "./client";
import { effectiveCloudMode } from "./config";
import { buildCloudEnvelope, coalesceQueue, hasVersionConflict, makeTombstone, pendingImports, tenantRecordQuery } from "./repository-core.mjs";

export type SyncState = "Synced" | "Pending" | "Offline" | "Conflict" | "Failed";
export interface TypedCloudEnvelope<T> { organisation_id: string; source_id: string; customer_source_id?: string | null; job_source_id?: string | null; version: number; source_updated_at?: string; payload: T; updated_at?: string; deleted_at?: string | null; }
export interface GenericCloudEnvelope<T> extends TypedCloudEnvelope<T> { collection_key: string; }
export type CloudEnvelope<T> = TypedCloudEnvelope<T> | GenericCloudEnvelope<T>;
export interface SyncQueueItem<T = unknown> { id: string; table: string; storageKey?: string; operation: "upsert" | "delete"; organisationId: string; sourceId: string; collectionKey?: string; userId?: string; payload?: T; expectedVersion?: number; queuedAt: string; attempts: number; state: SyncState; error?: string; }
export interface SyncQueueFlushResult { processed: number; cleared: number; remaining: number; conflicts: number; failed: number; }

const QUEUE_KEY = "jr-os-cloud-sync-queue";
const STATUS_KEY = "jr-os-cloud-sync-status";
const ACTIVE_ORGANISATION_KEY = "jr-os-active-organisation";
const ACTIVE_USER_KEY = "jr-os-active-user";

function read<T>(key: string, fallback: T): T { try { return JSON.parse(window.localStorage.getItem(key) || "") as T; } catch { return fallback; } }
function write(key: string, value: unknown) { window.localStorage.setItem(key, JSON.stringify(value)); }
function readAllSyncQueue() { return read<SyncQueueItem[]>(QUEUE_KEY, []); }
function activeOrganisationId() { return typeof window === "undefined" ? null : window.localStorage.getItem(ACTIVE_ORGANISATION_KEY); }
function activeUserId() { return typeof window === "undefined" ? null : window.localStorage.getItem(ACTIVE_USER_KEY); }
function collectionFilter(collectionKey?: string) { return collectionKey ? `&collection_key=eq.${encodeURIComponent(collectionKey)}` : ""; }
function samePayload(left: unknown, right: unknown) { return JSON.stringify(left ?? null) === JSON.stringify(right ?? null); }
function updateCachedVersion(storageKey: string | undefined, sourceId: string, version?: number) {
  if (!storageKey) return;
  const key = `jr-os-cloud-versions:${storageKey}`;
  const versions = read<Record<string, number>>(key, {});
  if (version === undefined) delete versions[sourceId]; else versions[sourceId] = version;
  write(key, versions);
}

export function syncQueueItemId(organisationId: string, table: string, collectionKey: string | undefined, sourceId: string, queuedAt: number) {
  return JSON.stringify([organisationId, table, collectionKey || "typed", sourceId, queuedAt]);
}

function statusForQueue(queue: SyncQueueItem[]): SyncState {
  if (!queue.length) return "Synced";
  if (queue.some((item) => item.state === "Conflict")) return "Conflict";
  if (queue.some((item) => item.state === "Failed")) return "Failed";
  if (queue.some((item) => item.state === "Offline")) return "Offline";
  return "Pending";
}

export function setActiveSyncIdentity(organisationId: string | null, userId: string | null) {
  if (typeof window === "undefined") return;
  if (organisationId) window.localStorage.setItem(ACTIVE_ORGANISATION_KEY, organisationId);
  else window.localStorage.removeItem(ACTIVE_ORGANISATION_KEY);
  if (userId) window.localStorage.setItem(ACTIVE_USER_KEY, userId);
  else window.localStorage.removeItem(ACTIVE_USER_KEY);
  syncStatus.set(navigator.onLine ? statusForQueue(getSyncQueue()) : "Offline");
}

export function setActiveSyncOrganisation(organisationId: string | null) {
  setActiveSyncIdentity(organisationId, activeUserId());
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
  const organisationId = activeOrganisationId();
  const userId = activeUserId();
  if (!organisationId) return [];
  return readAllSyncQueue().filter((item) => item.organisationId === organisationId && (!userId || item.userId === userId));
}

export function getOrganisationSyncQueue(organisationId: string) {
  return readAllSyncQueue().filter((item) => item.organisationId === organisationId);
}

export function discardSyncQueueItem(itemId: string) {
  const organisationId = activeOrganisationId();
  const userId = activeUserId();
  const queue = readAllSyncQueue();
  const item = queue.find((entry) => entry.id === itemId && entry.organisationId === organisationId && (!userId || entry.userId === userId));
  if (!item) return { removed: false, remaining: getSyncQueue().length };
  const next = queue.filter((entry) => entry.id !== itemId);
  write(QUEUE_KEY, next);
  const activeRemaining = next.filter((entry) => entry.organisationId === organisationId && (!userId || entry.userId === userId));
  syncStatus.set(statusForQueue(activeRemaining));
  return { removed: true, remaining: activeRemaining.length, item };
}

export function queueChange<T>(item: Omit<SyncQueueItem<T>, "id" | "queuedAt" | "attempts" | "state">) {
  const queue = readAllSyncQueue();
  const queuedAt = Date.now();
  const next: SyncQueueItem<T> = { ...item, id: syncQueueItemId(item.organisationId, item.table, item.collectionKey, item.sourceId, queuedAt), queuedAt: new Date(queuedAt).toISOString(), attempts: 0, state: navigator.onLine ? "Pending" : "Offline" };
  write(QUEUE_KEY, coalesceQueue(queue, next));
  if (activeOrganisationId() === item.organisationId && (!activeUserId() || activeUserId() === item.userId)) syncStatus.set(navigator.onLine ? "Pending" : "Offline");
}

export async function flushSyncQueue(): Promise<SyncQueueFlushResult> {
  const organisationId = activeOrganisationId();
  const userId = activeUserId();
  const allQueue = readAllSyncQueue();
  if (!organisationId) return { processed: 0, cleared: 0, remaining: 0, conflicts: 0, failed: 0 };

  const queue = allQueue.filter((item) => item.organisationId === organisationId && (!userId || item.userId === userId));
  if (!navigator.onLine) {
    syncStatus.set("Offline");
    return { processed: 0, cleared: 0, remaining: queue.length, conflicts: queue.filter((item) => item.state === "Conflict").length, failed: queue.filter((item) => item.state === "Failed").length };
  }

  const remaining: SyncQueueItem[] = [];
  let cleared = 0;
  let processed = 0;
  for (const item of queue) {
    if (activeOrganisationId() !== organisationId || activeUserId() !== userId) {
      remaining.push(...queue.slice(processed));
      break;
    }
    processed += 1;
    try {
      const existing = await cloudSelect<CloudEnvelope<unknown>>(item.table, tenantRecordQuery({ organisationId: item.organisationId, sourceId: item.sourceId, collectionKey: item.collectionKey, includeDeleted: true }));
      if (activeOrganisationId() !== organisationId || activeUserId() !== userId) {
        remaining.push(item, ...queue.slice(processed));
        break;
      }
      const current = existing[0];

      if (item.operation === "delete" && (!current || current.deleted_at)) {
        updateCachedVersion(item.storageKey, item.sourceId, current?.version);
        cleared += 1;
        continue;
      }
      if (item.operation === "upsert" && current && !current.deleted_at && samePayload(current.payload, item.payload)) {
        updateCachedVersion(item.storageKey, item.sourceId, current.version);
        cleared += 1;
        continue;
      }
      if (hasVersionConflict(current?.version, item.expectedVersion)) {
        remaining.push({ ...item, state: "Conflict", error: `Cloud version ${current?.version} differs from expected ${item.expectedVersion}.` });
        continue;
      }

      if (item.operation === "delete") {
        if (!current) { updateCachedVersion(item.storageKey, item.sourceId); cleared += 1; continue; }
        const deletedAt = new Date().toISOString();
        const query = `organisation_id=eq.${encodeURIComponent(item.organisationId)}&source_id=eq.${encodeURIComponent(item.sourceId)}${collectionFilter(item.collectionKey)}`;
        const tombstone = makeTombstone({ currentVersion: current.version, userId: item.userId, deletedAt });
        await cloudPatch(item.table, query, { ...tombstone, source_updated_at: deletedAt });
        updateCachedVersion(item.storageKey, item.sourceId, tombstone.version);
        cleared += 1;
      } else {
        const sourceUpdatedAt = (item.payload as { updatedAt?: string } | undefined)?.updatedAt || new Date().toISOString();
        const record = buildCloudEnvelope({
          organisationId: item.organisationId,
          sourceId: item.sourceId,
          collectionKey: item.collectionKey,
          payload: item.payload,
          version: (current?.version || 0) + 1,
          sourceUpdatedAt,
          createdBy: current ? null : item.userId,
          updatedBy: item.userId,
        });
        await cloudUpsert(item.table, [record], item.collectionKey ? "organisation_id,collection_key,source_id" : "organisation_id,source_id");
        updateCachedVersion(item.storageKey, item.sourceId, record.version);
        cleared += 1;
      }
    } catch (error) { remaining.push({ ...item, attempts: item.attempts + 1, state: "Failed", error: error instanceof Error ? error.message : "Sync failed" }); }
  }

  const liveQueue = readAllSyncQueue();
  const originalIds = new Set(queue.map((item) => item.id));
  const liveIds = new Set(liveQueue.map((item) => item.id));
  const untouched = liveQueue.filter((item) => item.organisationId !== organisationId || item.userId !== userId || !originalIds.has(item.id));
  const retained = remaining.filter((item) => liveIds.has(item.id));
  const nextQueue = [...untouched, ...retained];
  write(QUEUE_KEY, nextQueue);

  const activeRemaining = nextQueue.filter((item) => item.organisationId === organisationId && (!userId || item.userId === userId));
  const conflicts = activeRemaining.filter((item) => item.state === "Conflict").length;
  const failed = activeRemaining.filter((item) => item.state === "Failed").length;
  if (activeOrganisationId() === organisationId && activeUserId() === userId) syncStatus.set(statusForQueue(activeRemaining));
  return { processed, cleared, remaining: activeRemaining.length, conflicts, failed };
}

export async function importLocalCollection<T extends { id: string; updatedAt?: string; customerId?: string; customerSourceId?: string; jobId?: string; jobSourceId?: string }>(storageKey: string, table: string, organisationId: string, collectionKey?: string, userId?: string) {
  const records = read<T[]>(storageKey, []);
  if (!records.length) return { imported: 0, skipped: 0 };
  const filter = collectionFilter(collectionKey);
  const existing = await cloudSelect<{ source_id: string; source_updated_at?: string; version?: number; deleted_at?: string | null }>(table, `select=source_id,source_updated_at,version,deleted_at&organisation_id=eq.${encodeURIComponent(organisationId)}${filter}`);
  const pending = pendingImports(records, existing);
  if (pending.length) {
    const importedAt = new Date().toISOString();
    const rows = pending.map((record) => buildCloudEnvelope({
      organisationId,
      sourceId: record.id,
      collectionKey,
      payload: record,
      version: 1,
      sourceUpdatedAt: record.updatedAt || importedAt,
      createdBy: userId,
      updatedBy: userId,
    }));
    await cloudUpsert(table, rows, collectionKey ? "organisation_id,collection_key,source_id" : "organisation_id,source_id");
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