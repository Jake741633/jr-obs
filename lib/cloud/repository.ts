"use client";

import { cloudDelete, cloudSelect, cloudUpsert } from "./client";
import { effectiveCloudMode } from "./config";

export type SyncState = "Synced" | "Pending" | "Offline" | "Conflict" | "Failed";
export interface CloudEnvelope<T> { business_id: string; source_id: string; customer_source_id?: string; job_source_id?: string; version: number; source_updated_at?: string; payload: T; updated_at?: string; }
export interface SyncQueueItem<T = unknown> { id: string; table: string; operation: "upsert" | "delete"; businessId: string; sourceId: string; payload?: T; expectedVersion?: number; queuedAt: string; attempts: number; state: SyncState; error?: string; }

const QUEUE_KEY = "jr-os-cloud-sync-queue";
const STATUS_KEY = "jr-os-cloud-sync-status";

function read<T>(key: string, fallback: T): T { try { return JSON.parse(window.localStorage.getItem(key) || "") as T; } catch { return fallback; } }
function write(key: string, value: unknown) { window.localStorage.setItem(key, JSON.stringify(value)); }

export const syncStatus = {
  get(): SyncState { return read<SyncState>(STATUS_KEY, navigator.onLine ? "Synced" : "Offline"); },
  set(value: SyncState) { write(STATUS_KEY, value); window.dispatchEvent(new CustomEvent("jr-os-sync-status", { detail: value })); },
};

export function queueChange<T>(item: Omit<SyncQueueItem<T>, "id" | "queuedAt" | "attempts" | "state">) {
  const queue = read<SyncQueueItem[]>(QUEUE_KEY, []);
  queue.push({ ...item, id: `${item.table}:${item.sourceId}:${Date.now()}`, queuedAt: new Date().toISOString(), attempts: 0, state: navigator.onLine ? "Pending" : "Offline" });
  write(QUEUE_KEY, queue);
  syncStatus.set(navigator.onLine ? "Pending" : "Offline");
}

export async function flushSyncQueue() {
  if (!navigator.onLine) return syncStatus.set("Offline");
  const queue = read<SyncQueueItem[]>(QUEUE_KEY, []);
  const remaining: SyncQueueItem[] = [];
  for (const item of queue) {
    try {
      if (item.operation === "delete") await cloudDelete(item.table, item.sourceId);
      else {
        const existing = await cloudSelect<CloudEnvelope<unknown>>(item.table, `select=*&business_id=eq.${item.businessId}&source_id=eq.${encodeURIComponent(item.sourceId)}&limit=1`);
        const current = existing[0];
        if (current && item.expectedVersion !== undefined && current.version !== item.expectedVersion) {
          remaining.push({ ...item, state: "Conflict", error: `Cloud version ${current.version} differs from expected ${item.expectedVersion}.` });
          continue;
        }
        await cloudUpsert(item.table, [{ business_id: item.businessId, source_id: item.sourceId, version: (current?.version || 0) + 1, source_updated_at: (item.payload as { updatedAt?: string } | undefined)?.updatedAt || new Date().toISOString(), payload: item.payload }]);
      }
    } catch (error) {
      remaining.push({ ...item, attempts: item.attempts + 1, state: "Failed", error: error instanceof Error ? error.message : "Sync failed" });
    }
  }
  write(QUEUE_KEY, remaining);
  syncStatus.set(remaining.some((item) => item.state === "Conflict") ? "Conflict" : remaining.length ? "Failed" : "Synced");
}

export async function importLocalCollection<T extends { id: string; updatedAt?: string; customerId?: string; jobId?: string }>(storageKey: string, table: string, businessId: string) {
  const records = read<T[]>(storageKey, []);
  if (!records.length) return { imported: 0, skipped: 0 };
  const existing = await cloudSelect<{ source_id: string; source_updated_at?: string }>(table, `select=source_id,source_updated_at&business_id=eq.${businessId}`);
  const marker = new Map(existing.map((row) => [row.source_id, row.source_updated_at || ""]));
  const pending = records.filter((record) => !marker.has(record.id) || (record.updatedAt || "") > (marker.get(record.id) || ""));
  if (pending.length) await cloudUpsert(table, pending.map((record) => ({ business_id: businessId, source_id: record.id, customer_source_id: record.customerId, job_source_id: record.jobId, version: 1, source_updated_at: record.updatedAt || new Date().toISOString(), payload: record })));
  return { imported: pending.length, skipped: records.length - pending.length };
}

export function collectionMode() { return effectiveCloudMode(); }

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushSyncQueue());
  window.addEventListener("offline", () => syncStatus.set("Offline"));
}
