"use client";

import { cloudSelect } from "./client";
import { effectiveCloudMode } from "./config";
import { queueChange, type CloudEnvelope } from "./repository";

export interface RepositoryRecord { id: string; updatedAt?: string; customerId?: string; jobId?: string; }

export function organisationStorageKey(storageKey: string, organisationId: string) {
  return `${storageKey}:organisation:${JSON.stringify([organisationId])}`;
}

export function accountStorageKey(storageKey: string, organisationId: string, userId?: string) {
  const organisationKey = organisationStorageKey(storageKey, organisationId);
  return userId ? `${organisationKey}:account:${JSON.stringify([userId])}` : organisationKey;
}

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
  cacheUserId?: string;
  collectionKey?: string;
}) {
  const { storageKey, table, organisationId, userId, cacheUserId, collectionKey } = options;
  const scopedStorageKey = accountStorageKey(storageKey, organisationId, cacheUserId);
  const collectionFilter = collectionKey ? `&collection_key=eq.${encodeURIComponent(collectionKey)}` : "";

  return {
    mode: effectiveCloudMode(),
    storageKey: scopedStorageKey,
    async list(): Promise<T[]> {
      const local = readLocal<T>(scopedStorageKey);
      const mode = effectiveCloudMode();

      if (mode === "local" || !navigator.onLine) return local;

      // Authenticated caches are always tenant scoped. The legacy unscoped key is
      // deliberately left untouched as a migration backup and is never trusted by
      // a signed-in organisation.
      if (mode === "migration" && local.length > 0) return local;

      try {
        const rows = await cloudSelect<CloudEnvelope<T>>(table, `select=*&organisation_id=eq.${encodeURIComponent(organisationId)}${collectionFilter}&deleted_at=is.null`);
        const cloudRecords = rows.map((row) => row.payload);
        writeLocal(scopedStorageKey, cloudRecords);
        writeVersions(scopedStorageKey, Object.fromEntries(rows.map((row) => [row.source_id, row.version])));
        return cloudRecords;
      } catch { return local; }
    },
    save(record: T, expectedVersion?: number) {
      const local = readLocal<T>(scopedStorageKey);
      const index = local.findIndex((item) => item.id === record.id);
      if (index >= 0) local[index] = record; else local.push(record);
      writeLocal(scopedStorageKey, local);
      if (effectiveCloudMode() === "local") return;
      const version = expectedVersion ?? readVersions(scopedStorageKey)[record.id];
      queueChange({ table, storageKey: scopedStorageKey, operation: "upsert", organisationId, sourceId: record.id, payload: record, expectedVersion: version, collectionKey, userId });
    },
    remove(sourceId: string, expectedVersion?: number) {
      writeLocal(scopedStorageKey, readLocal<T>(scopedStorageKey).filter((record) => record.id !== sourceId));
      if (effectiveCloudMode() === "local") return;
      const version = expectedVersion ?? readVersions(scopedStorageKey)[sourceId];
      queueChange({ table, storageKey: scopedStorageKey, operation: "delete", organisationId, sourceId, expectedVersion: version, collectionKey, userId });
    },
  };
}
