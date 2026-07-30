"use client";

import { cloudSelect } from "./client";
import { effectiveCloudMode } from "./config";
import { queueChange, type CloudEnvelope } from "./repository";

export interface RepositoryRecord { id: string; updatedAt?: string; customerId?: string; jobId?: string; }

function readLocal<T>(storageKey: string): T[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(storageKey) || "[]") as T[]; } catch { return []; }
}

function writeLocal<T>(storageKey: string, records: T[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(records));
}

function versionKey(storageKey: string) { return `jr-os-cloud-versions:${storageKey}`; }
function readVersions(storageKey: string): Record<string, number> {
  try { return JSON.parse(window.localStorage.getItem(versionKey(storageKey)) || "{}") as Record<string, number>; } catch { return {}; }
}
function writeVersions(storageKey: string, versions: Record<string, number>) { window.localStorage.setItem(versionKey(storageKey), JSON.stringify(versions)); }

export function createCollectionRepository<T extends RepositoryRecord>(options: {
  storageKey: string;
  table: string;
  organisationId: string;
  userId?: string;
  collectionKey?: string;
}) {
  const { storageKey, table, organisationId, userId, collectionKey } = options;
  const collectionFilter = collectionKey ? `&collection_key=eq.${encodeURIComponent(collectionKey)}` : "";

  return {
    mode: effectiveCloudMode(),
    async list(): Promise<T[]> {
      const local = readLocal<T>(storageKey);
      if (effectiveCloudMode() !== "cloud" || !navigator.onLine) return local;
      try {
        const rows = await cloudSelect<CloudEnvelope<T>>(table, `select=*&organisation_id=eq.${organisationId}${collectionFilter}&deleted_at=is.null`);
        const cloudRecords = rows.map((row) => row.payload);
        writeLocal(storageKey, cloudRecords);
        writeVersions(storageKey, Object.fromEntries(rows.map((row) => [row.source_id, row.version])));
        return cloudRecords;
      } catch { return local; }
    },
    save(record: T, expectedVersion?: number) {
      const local = readLocal<T>(storageKey);
      const index = local.findIndex((item) => item.id === record.id);
      if (index >= 0) local[index] = record; else local.push(record);
      writeLocal(storageKey, local);
      if (effectiveCloudMode() === "local") return;
      const version = expectedVersion ?? readVersions(storageKey)[record.id];
      queueChange({ table, operation: "upsert", organisationId, sourceId: record.id, payload: record, expectedVersion: version, collectionKey, userId });
    },
    remove(sourceId: string, expectedVersion?: number) {
      writeLocal(storageKey, readLocal<T>(storageKey).filter((record) => record.id !== sourceId));
      if (effectiveCloudMode() === "local") return;
      const version = expectedVersion ?? readVersions(storageKey)[sourceId];
      queueChange({ table, operation: "delete", organisationId, sourceId, expectedVersion: version, collectionKey, userId });
    },
  };
}
