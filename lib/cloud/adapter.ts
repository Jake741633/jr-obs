"use client";

import { cloudSelect, cloudSelectFresh } from "./client";
import { collectionCloudReadTable } from "./collections";
import { effectiveCloudMode } from "./config";
import { creatorMapForCloudRows, normaliseRecordCreatorMap, retainRecordCreatorsForRecords } from "./recordCreatorMetadata-core.mjs";
import { queueChange, type CloudEnvelope, type SyncQueueItem } from "./repository";
import { purgeCustomerNetworkOnlyCollectionCaches, purgeElectricianNetworkOnlyCollectionCaches, purgeRoleProjectionCacheStorage, roleProjectionCacheGeneration, roleProjectionCachePolicy, roleProjectionVersionMap, sanitizeRoleProjectionCache } from "./roleProjectionCache-core.mjs";

export interface RepositoryRecord { id: string; updatedAt?: string; customerId?: string; jobId?: string; }
export type RecordCreatorMap = Record<string, string>;

export function organisationStorageKey(storageKey: string, organisationId: string) {
  return `${storageKey}:organisation:${JSON.stringify([organisationId])}`;
}

export function accountStorageKey(storageKey: string, organisationId: string, userId?: string, role?: string, customerSourceId?: string) {
  const organisationKey = organisationStorageKey(storageKey, organisationId);
  return userId ? `${organisationKey}:account:${JSON.stringify([userId, role ?? null, customerSourceId ?? null])}` : organisationKey;
}

function readLocal<T>(storageKey: string): T[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(storageKey) || "[]") as T[]; } catch { return []; }
}

function writeLocal<T>(storageKey: string, records: T[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(records));
}

function writeLocalAndQueue<T>(storageKey: string, records: T[], enqueue: () => void) {
  const previous = window.localStorage.getItem(storageKey);
  const next = JSON.stringify(records);
  window.localStorage.setItem(storageKey, next);
  try {
    enqueue();
  } catch (queueError) {
    try {
      // Never roll another tab's intervening edit back to our older snapshot.
      if (window.localStorage.getItem(storageKey) !== next) throw new Error("The local collection changed during the failed save.");
      if (previous === null) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, previous);
    } catch (recoveryError) {
      throw new Error("The sync queue could not be saved and local recovery is incomplete. Keep this draft open and check Cloud before retrying.", { cause: new AggregateError([queueError, recoveryError]) });
    }
    throw queueError;
  }
}

function versionKey(storageKey: string) { return `jr-os-cloud-versions:${storageKey}`; }
function projectionGenerationKey(storageKey: string) { return `jr-os-cloud-projection-generation:${storageKey}`; }
export function recordCreatorStorageKey(storageKey: string) { return `jr-os-cloud-created-by:${storageKey}`; }
function readVersions(storageKey: string): Record<string, number> {
  try { return JSON.parse(window.localStorage.getItem(versionKey(storageKey)) || "{}") as Record<string, number>; } catch { return {}; }
}
function writeVersions(storageKey: string, versions: Record<string, number>) { window.localStorage.setItem(versionKey(storageKey), JSON.stringify(versions)); }
function readRecordCreators(storageKey: string): RecordCreatorMap {
  try { return normaliseRecordCreatorMap(JSON.parse(window.localStorage.getItem(recordCreatorStorageKey(storageKey)) || "{}")); } catch { return {}; }
}
function writeRecordCreators(storageKey: string, creators: RecordCreatorMap) {
  try { window.localStorage.setItem(recordCreatorStorageKey(storageKey), JSON.stringify(creators)); } catch { /* Optional metadata must never block record sync. */ }
}

export function createCollectionRepository<T extends RepositoryRecord>(options: {
  storageKey: string;
  table: string;
  organisationId: string;
  userId?: string;
  cacheUserId?: string;
  cacheRole?: string;
  cacheCustomerSourceId?: string;
  collectionKey?: string;
}) {
  const { storageKey, table, organisationId, userId, cacheUserId, cacheRole, cacheCustomerSourceId, collectionKey } = options;
  const scopedStorageKey = accountStorageKey(storageKey, organisationId, cacheUserId, cacheRole, cacheCustomerSourceId);
  const readTable = collectionCloudReadTable(table, cacheRole, collectionKey);
  const collectionFilter = collectionKey ? `&collection_key=eq.${encodeURIComponent(collectionKey)}` : "";
  let currentRecordCreators = readRecordCreators(scopedStorageKey);

  function replaceRecordCreators(creators: RecordCreatorMap) {
    currentRecordCreators = normaliseRecordCreatorMap(creators);
    writeRecordCreators(scopedStorageKey, currentRecordCreators);
  }

  function purgeDormantNetworkOnlyCapabilities(mode: ReturnType<typeof effectiveCloudMode>) {
    if (mode !== "local" && cacheUserId && cacheRole) {
      purgeCustomerNetworkOnlyCollectionCaches(window.localStorage, storageKey);
      purgeElectricianNetworkOnlyCollectionCaches(window.localStorage, storageKey);
    }
  }

  function pendingCollectionChanges() {
    if (!userId || !cacheUserId || userId !== cacheUserId || !cacheRole) return [];
    try {
      const queue: unknown = JSON.parse(window.localStorage.getItem("jr-os-cloud-sync-queue") || "[]");
      if (!Array.isArray(queue)) return [];
      return (queue as SyncQueueItem<T>[]).filter((item) => item
        && item.organisationId === organisationId
        && item.userId === userId
        && item.role === cacheRole
        && (item.customerSourceId ?? null) === (cacheCustomerSourceId ?? null)
        && item.table === table
        && (item.collectionKey ?? null) === (collectionKey ?? null)
        && item.storageKey === scopedStorageKey
        && typeof item.sourceId === "string"
        && (item.operation === "delete" || (item.operation === "upsert" && item.payload?.id === item.sourceId)));
    } catch { return []; }
  }

  return {
    mode: effectiveCloudMode(),
    storageKey: scopedStorageKey,
    recordCreators() { return { ...currentRecordCreators }; },
    async list(signal?: AbortSignal): Promise<T[]> {
      const mode = effectiveCloudMode();
      purgeDormantNetworkOnlyCapabilities(mode);
      const cached = readLocal<T>(scopedStorageKey);
      const cachedGeneration = window.localStorage.getItem(projectionGenerationKey(scopedStorageKey)) ?? undefined;
      const cachePolicy = roleProjectionCachePolicy({ storageKey, role: cacheRole, mode, generation: cachedGeneration });
      const networkOnly = cachePolicy === "network-only";
      const local = cachePolicy === "purge" || networkOnly
        ? []
        : sanitizeRoleProjectionCache({ storageKey, role: cacheRole, mode, records: cached });
      if (networkOnly) {
        purgeRoleProjectionCacheStorage(window.localStorage, scopedStorageKey);
        currentRecordCreators = {};
      } else {
        if (local !== cached) writeLocal(scopedStorageKey, local);
        replaceRecordCreators(cachePolicy === "purge" ? {} : retainRecordCreatorsForRecords(currentRecordCreators, local));
        if (cachePolicy === "purge") writeVersions(scopedStorageKey, {});
      }

      if (mode === "local" || !navigator.onLine) return local;

      // Authenticated caches are always tenant scoped. The legacy unscoped key is
      // deliberately left untouched as a migration backup and is never trusted by
      // a signed-in organisation.
      if (mode === "migration" && local.length > 0) return local;

      const versionsAtRead: Record<string, number> = networkOnly ? {} : readVersions(scopedStorageKey);
      try {
        const select = networkOnly ? cloudSelectFresh : cloudSelect;
        const rows = await select<CloudEnvelope<T>>(readTable, `select=*&organisation_id=eq.${encodeURIComponent(organisationId)}${collectionFilter}&deleted_at=is.null`, signal);
        if (signal?.aborted) return [];
        // Read the durable queue after the request: another tab or a retained
        // editor may have saved a newer local intent while this read awaited.
        const pending = networkOnly ? [] : pendingCollectionChanges();
        const records = new Map(rows.map((row) => [row.source_id, row.payload]));
        const confirmedVersions = new Map<string, number>();
        if (!networkOnly) {
          const latestRecords = new Map(readLocal<T>(scopedStorageKey).map((record) => [record.id, record]));
          const remoteVersions = roleProjectionVersionMap(rows, rows.map((row) => row.payload));
          for (const [sourceId, version] of Object.entries(readVersions(scopedStorageKey))) {
            if (!Number.isSafeInteger(version) || version <= 0) continue;
            const remoteVersion = remoteVersions[sourceId];
            // Replay may already have removed its queue item. A response older
            // than a confirmed local version must not undo that completion.
            const confirmedDuringRead = version > (versionsAtRead[sourceId] ?? 0);
            if (remoteVersion !== undefined ? version > remoteVersion : confirmedDuringRead) {
              const latest = latestRecords.get(sourceId);
              if (latest) records.set(sourceId, latest);
              else records.delete(sourceId);
              confirmedVersions.set(sourceId, version);
            }
          }
        }
        for (const item of pending) {
          if (item.operation === "delete") records.delete(item.sourceId);
          else records.set(item.sourceId, item.payload!);
        }
        const cloudRecords = [...records.values()];
        const roleProjectionRecords = sanitizeRoleProjectionCache({ storageKey, role: cacheRole, mode, records: cloudRecords });
        if (networkOnly) {
          purgeRoleProjectionCacheStorage(window.localStorage, scopedStorageKey);
          currentRecordCreators = {};
        } else {
          const cachedCreators = readRecordCreators(scopedStorageKey);
          const versions = roleProjectionVersionMap(rows, roleProjectionRecords);
          const creators = creatorMapForCloudRows(rows, roleProjectionRecords);
          const visibleIds = new Set(roleProjectionRecords.map((record) => record.id));
          for (const [sourceId, version] of confirmedVersions) {
            if (records.has(sourceId) && !visibleIds.has(sourceId)) continue;
            versions[sourceId] = version;
            if (cachedCreators[sourceId] && !creators[sourceId]) creators[sourceId] = cachedCreators[sourceId];
          }
          const basedIds = new Set<string>();
          for (const item of pending) {
            if (!visibleIds.has(item.sourceId) && item.operation !== "delete") continue;
            // A fetched version belongs to clean cloud data. Queued data must
            // keep its original comparison base, including an unknown base.
            if (!basedIds.has(item.sourceId)) {
              const baseVersion = item.expectedVersion ?? item.baseVersion ?? (item.baseIntent === "create" ? 0 : undefined);
              if (baseVersion === undefined) delete versions[item.sourceId];
              else versions[item.sourceId] = baseVersion;
              basedIds.add(item.sourceId);
            }
            if (item.operation === "upsert" && !creators[item.sourceId]) {
              const creator = item.baseIntent === "create" ? item.userId : cachedCreators[item.sourceId];
              if (creator) creators[item.sourceId] = creator;
            }
          }
          writeLocal(scopedStorageKey, roleProjectionRecords);
          writeVersions(scopedStorageKey, versions);
          replaceRecordCreators(retainRecordCreatorsForRecords(creators, roleProjectionRecords));
          const projectionGeneration = roleProjectionCacheGeneration({ storageKey, role: cacheRole });
          if (projectionGeneration) window.localStorage.setItem(projectionGenerationKey(scopedStorageKey), projectionGeneration);
        }
        return roleProjectionRecords;
      } catch {
        if (networkOnly || signal?.aborted) return [];
        const current = sanitizeRoleProjectionCache({ storageKey, role: cacheRole, mode, records: readLocal<T>(scopedStorageKey) });
        replaceRecordCreators(retainRecordCreatorsForRecords(readRecordCreators(scopedStorageKey), current));
        return current;
      }
    },
    save(record: T, expectedVersion?: number) {
      const mode = effectiveCloudMode();
      purgeDormantNetworkOnlyCapabilities(mode);
      const networkOnly = roleProjectionCachePolicy({ storageKey, role: cacheRole, mode }) === "network-only";
      const local = networkOnly ? [] : readLocal<T>(scopedStorageKey);
      const index = local.findIndex((item) => item.id === record.id);
      if (index >= 0) local[index] = record; else local.push(record);
      if (networkOnly) {
        purgeRoleProjectionCacheStorage(window.localStorage, scopedStorageKey);
        currentRecordCreators = {};
        return;
      }
      if (mode === "local") {
        writeLocal(scopedStorageKey, local);
        return;
      }
      const version = expectedVersion ?? readVersions(scopedStorageKey)[record.id];
      const baseIntent = version === 0 ? "create" : version !== undefined ? "update" : index < 0 ? "create" : "unknown";
      writeLocalAndQueue(scopedStorageKey, local, () => {
        queueChange({ table, storageKey: scopedStorageKey, operation: "upsert", organisationId, sourceId: record.id, payload: record, expectedVersion: version, baseIntent, baseVersion: baseIntent === "update" ? version : undefined, collectionKey, userId, role: cacheRole, customerSourceId: cacheCustomerSourceId });
      });
      if (!networkOnly && expectedVersion === 0 && userId) {
        replaceRecordCreators({ ...currentRecordCreators, [record.id]: userId });
      }
    },
    remove(sourceId: string, expectedVersion?: number) {
      const mode = effectiveCloudMode();
      purgeDormantNetworkOnlyCapabilities(mode);
      const networkOnly = roleProjectionCachePolicy({ storageKey, role: cacheRole, mode }) === "network-only";
      if (networkOnly) {
        purgeRoleProjectionCacheStorage(window.localStorage, scopedStorageKey);
        currentRecordCreators = {};
        return;
      }
      const remaining = readLocal<T>(scopedStorageKey).filter((record) => record.id !== sourceId);
      if (mode === "local") writeLocal(scopedStorageKey, remaining);
      else {
        const version = expectedVersion ?? readVersions(scopedStorageKey)[sourceId];
        const baseIntent = version !== undefined ? "update" : "unknown";
        writeLocalAndQueue(scopedStorageKey, remaining, () => {
          queueChange({ table, storageKey: scopedStorageKey, operation: "delete", organisationId, sourceId, expectedVersion: version, baseIntent, baseVersion: version, collectionKey, userId, role: cacheRole, customerSourceId: cacheCustomerSourceId });
        });
      }
      const creators = { ...currentRecordCreators };
      delete creators[sourceId];
      replaceRecordCreators(creators);
    },
  };
}
