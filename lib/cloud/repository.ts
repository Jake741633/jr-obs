"use client";

import { cloudPatch, cloudSelect, cloudUpsert } from "./client";
import { effectiveCloudMode } from "./config";
import { coalesceQueue, hasVersionConflict, linkedSourceIds, makeTombstone, pendingImports, tenantRecordQuery } from "./repository-core.mjs";

export type SyncState = "Synced" | "Pending" | "Offline" | "Conflict" | "Failed";
export interface CloudEnvelope<T> { organisation_id: string; source_id: string; collection_key?: string; customer_source_id?: string; job_source_id?: string; version: number; source_updated_at?: string; payload: T; updated_at?: string; deleted_at?: string | null; }
export interface SyncQueueItem<T = unknown> { id: string; table: string; storageKey?: string; operation: "upsert" | "delete"; organisationId: string; sourceId: string; collectionKey?: string; userId?: string; payload?: T; expectedVersion?: number; queuedAt: string; attempts: number; state: SyncState; error?: string; }

const QUEUE_KEY = "jr-os-cloud-sync-queue";
const STATUS_KEY = "jr-os-cloud-sync-status";

function read<T>(key: string, fallback: T): T { try { return JSON.parse(window.localStorage.getItem(key) || "") as T; } catch { return fallback; } }
function write(key: string, value: unknown) { window.localStorage.setItem(key, JSON.stringify(value)); }
function collectionFilter(collectionKey?: string) { return collectionKey ? `&collection_key=eq.${encodeURIComponent(collectionKey)}` : ""; }
function updateCachedVersion(storageKey: string | undefined, sourceId: string, version?: number) {
  if (!storageKey) return;
  const key = `jr-os-cloud-versions:${storageKey}`;
  const versions = read<Record<string, number>>(key, {});
  if (version === undefined) delete versions[sourceId]; else versions[sourceId] = version;
  write(key, versions);
}

export const syncStatus = {
  get(): SyncState { return read<SyncState>(STATUS_KEY, navigator.onLine ? "Synced" : "Offline"); },
  set(value: SyncState) { write(STATUS_KEY, value); window.dispatchEvent(new CustomEvent("jr-os-sync-status", { detail: value })); },
};

export function queueChange<T>(item: Omit<SyncQueueItem<T>, "id" | "queuedAt" | "attempts" | "state">) {
  const queue = read<SyncQueueItem[]>(QUEUE_KEY, []);
  const next: SyncQueueItem<T> = { ...item, id: `${item.organisationId}:${item.table}:${item.collectionKey || "typed"}:${item.sourceId}:${Date.now()}`, queuedAt: new Date().toISOString(), attempts: 0, state: navigator.onLine ? "Pending" : "Offline" };
  write(QUEUE_KEY, coalesceQueue(queue, next));
  syncStatus.set(navigator.onLine ? "Pending" : "Offline");
}

export async function flushSyncQueue() {
  if (!navigator.onLine) return syncStatus.set("Offline");
  const queue = read<SyncQueueItem[]>(QUEUE_KEY, []);
  const remaining: SyncQueueItem[] = [];
  for (const item of queue) {
    try {
      const existing = await cloudSelect<CloudEnvelope<unknown>>(item.table, tenantRecordQuery({ organisationId: item.organisationId, sourceId: item.sourceId, collectionKey: item.collectionKey, includeDeleted: true }));
      const current = existing[0];
      if (hasVersionConflict(current?.version, item.expectedVersion)) {
        remaining.push({ ...item, state: "Conflict", error: `Cloud version ${current?.version} differs from expected ${item.expectedVersion}.` });
        continue;
      }

      if (item.operation === "delete") {
        if (!current) { updateCachedVersion(item.storageKey, item.sourceId); continue; }
        const deletedAt = new Date().toISOString();
        const query = `organisation_id=eq.${encodeURIComponent(item.organisationId)}&source_id=eq.${encodeURIComponent(item.sourceId)}${collectionFilter(item.collectionKey)}`;
        const tombstone = makeTombstone({ currentVersion: current.version, userId: item.userId, deletedAt });
        await cloudPatch(item.table, query, { ...tombstone, source_updated_at: deletedAt });
        updateCachedVersion(item.storageKey, item.sourceId, tombstone.version);
      } else {
        const nextVersion = (current?.version || 0) + 1;
        const links = linkedSourceIds(item.payload);
        const record = {
          organisation_id: item.organisationId,
          source_id: item.sourceId,
          collection_key: item.collectionKey ?? null,
          customer_source_id: links.customerSourceId ?? null,
          job_source_id: links.jobSourceId ?? null,
          version: nextVersion,
          source_updated_at: (item.payload as { updatedAt?: string } | undefined)?.updatedAt || new Date().toISOString(),
          payload: item.payload ?? null,
          deleted_at: null,
          created_by: current ? null : item.userId ?? null,
          updated_by: item.userId ?? null,
        };
        await cloudUpsert(item.table, [record], item.collectionKey ? "organisation_id,collection_key,source_id" : "organisation_id,source_id");
        updateCachedVersion(item.storageKey, item.sourceId, nextVersion);
      }
    } catch (error) { remaining.push({ ...item, attempts: item.attempts + 1, state: "Failed", error: error instanceof Error ? error.message : "Sync failed" }); }
  }
  write(QUEUE_KEY, remaining);
  syncStatus.set(remaining.some((item) => item.state === "Conflict") ? "Conflict" : remaining.length ? "Failed" : "Synced");
}

export async function importLocalCollection<T extends { id: string; updatedAt?: string; customerId?: string; jobId?: string }>(storageKey: string, table: string, organisationId: string, collectionKey?: string, userId?: string) {
  const records = read<T[]>(storageKey, []);
  if (!records.length) return { imported: 0, skipped: 0 };
  const filter = collectionFilter(collectionKey);
  const existing = await cloudSelect<{ source_id: string; source_updated_at?: string; version?: number; deleted_at?: string | null }>(table, `select=source_id,source_updated_at,version,deleted_at&organisation_id=eq.${encodeURIComponent(organisationId)}${filter}`);
  const pending = pendingImports(records, existing);
  if (pending.length) {
    const importedAt = new Date().toISOString();
    const rows = pending.map((record) => ({
      organisation_id: organisationId,
      collection_key: collectionKey ?? null,
      source_id: record.id,
      customer_source_id: record.customerId ?? null,
      job_source_id: record.jobId ?? null,
      version: 1,
      source_updated_at: record.updatedAt || importedAt,
      payload: record,
      deleted_at: null,
      created_by: userId ?? null,
      updated_by: userId ?? null,
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
