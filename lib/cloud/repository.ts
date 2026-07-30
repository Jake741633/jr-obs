"use client";

import { cloudDelete, cloudSelect, cloudUpsert } from "./client";
import { effectiveCloudMode } from "./config";

export type SyncState = "Synced" | "Pending" | "Offline" | "Conflict" | "Failed";
export interface CloudEnvelope<T> { organisation_id: string; source_id: string; collection_key?: string; customer_source_id?: string; job_source_id?: string; version: number; source_updated_at?: string; payload: T; updated_at?: string; }
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
  const existingIndex = queue.findIndex((queued) => queued.table === item.table && queued.sourceId === item.sourceId && queued.collectionKey === item.collectionKey);
  const next = { ...item, id: `${item.table}:${item.collectionKey || "typed"}:${item.sourceId}:${Date.now()}`, queuedAt: new Date().toISOString(), attempts: 0, state: navigator.onLine ? "Pending" as const : "Offline" as const };
  if (existingIndex >= 0) queue[existingIndex] = next; else queue.push(next);
  write(QUEUE_KEY, queue); syncStatus.set(navigator.onLine ? "Pending" : "Offline");
}

export async function flushSyncQueue() {
  if (!navigator.onLine) return syncStatus.set("Offline");
  const queue = read<SyncQueueItem[]>(QUEUE_KEY, []);
  const remaining: SyncQueueItem[] = [];
  for (const item of queue) {
    try {
      const filter = collectionFilter(item.collectionKey);
      const existing = await cloudSelect<CloudEnvelope<unknown>>(item.table, `select=*&organisation_id=eq.${item.organisationId}&source_id=eq.${encodeURIComponent(item.sourceId)}${filter}&limit=1`);
      const current = existing[0];
      if (current && item.expectedVersion !== undefined && current.version !== item.expectedVersion) {
        remaining.push({ ...item, state: "Conflict", error: `Cloud version ${current.version} differs from expected ${item.expectedVersion}.` });
        continue;
      }

      if (item.operation === "delete") {
        await cloudDelete(item.table, item.sourceId, `&organisation_id=eq.${item.organisationId}${filter}`);
        updateCachedVersion(item.storageKey, item.sourceId);
      } else {
        const nextVersion = (current?.version || 0) + 1;
        const record = {
          organisation_id: item.organisationId,
          source_id: item.sourceId,
          collection_key: item.collectionKey,
          customer_source_id: (item.payload as { customerId?: string } | undefined)?.customerId,
          job_source_id: (item.payload as { jobId?: string } | undefined)?.jobId,
          version: nextVersion,
          source_updated_at: (item.payload as { updatedAt?: string } | undefined)?.updatedAt || new Date().toISOString(),
          payload: item.payload,
          created_by: current ? undefined : item.userId,
          updated_by: item.userId,
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
  const existing = await cloudSelect<{ source_id: string; source_updated_at?: string; version?: number }>(table, `select=source_id,source_updated_at,version&organisation_id=eq.${organisationId}${filter}`);
  const marker = new Map(existing.map((row) => [row.source_id, row.source_updated_at || ""]));
  const pending = records.filter((record) => !marker.has(record.id) || (record.updatedAt || "") > (marker.get(record.id) || ""));
  if (pending.length) await cloudUpsert(table, pending.map((record) => ({ organisation_id: organisationId, collection_key: collectionKey, source_id: record.id, customer_source_id: record.customerId, job_source_id: record.jobId, version: 1, source_updated_at: record.updatedAt || new Date().toISOString(), payload: record, created_by: userId, updated_by: userId })), collectionKey ? "organisation_id,collection_key,source_id" : "organisation_id,source_id");
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
