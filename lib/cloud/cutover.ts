"use client";

import { cloudSelect } from "./client";
import { collectionCloudTarget } from "./collections";
import { cloudCollectionStorageKeys } from "./migrationStoragePolicy-core.mjs";
import type { SyncQueueItem } from "./repository";
import type { PrivateFileUploadQueueItem } from "./privateFiles";

export type CutoverCollectionStatus = "Ready" | "Local only" | "Cloud only" | "Empty" | "Error";

export interface CutoverCollectionResult {
  storageKey: string;
  table: string;
  collectionKey?: string;
  localCount: number;
  cloudCount: number;
  matchingCount: number;
  localOnlyIds: string[];
  cloudOnlyIds: string[];
  status: CutoverCollectionStatus;
  error?: string;
}

export interface CloudCutoverReport {
  checkedAt: string;
  organisationId: string;
  collections: CutoverCollectionResult[];
  localTotal: number;
  cloudTotal: number;
  localOnlyTotal: number;
  cloudOnlyTotal: number;
  pendingQueueCount: number;
  conflictQueueCount: number;
  failedQueueCount: number;
  privateUploadQueueCount: number;
  readyForCloudMode: boolean;
  blockers: string[];
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function idsFromLocalCollection(storageKey: string) {
  const value = readJson<unknown>(storageKey, []);
  if (!Array.isArray(value)) return [];
  return value
    .map((record) => typeof record === "object" && record !== null && "id" in record ? (record as { id?: unknown }).id : null)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

function collectionKeys() {
  return [...cloudCollectionStorageKeys].sort();
}

function queueSummary(organisationId: string) {
  const queue = readJson<SyncQueueItem[]>("jr-os-cloud-sync-queue", [])
    .filter((item) => item.organisationId === organisationId);
  return {
    pending: queue.filter((item) => item.state === "Pending" || item.state === "Offline").length,
    conflicts: queue.filter((item) => item.state === "Conflict").length,
    failed: queue.filter((item) => item.state === "Failed").length,
  };
}

export async function runCloudCutoverCheck(organisationId: string): Promise<CloudCutoverReport> {
  const collections: CutoverCollectionResult[] = [];

  for (const storageKey of collectionKeys()) {
    const target = collectionCloudTarget(storageKey);
    if (!target) continue;
    const localIds = idsFromLocalCollection(storageKey);
    const collectionFilter = target.collectionKey ? `&collection_key=eq.${encodeURIComponent(target.collectionKey)}` : "";

    try {
      const rows = await cloudSelect<{ source_id: string }>(
        target.table,
        `select=source_id&organisation_id=eq.${encodeURIComponent(organisationId)}${collectionFilter}&deleted_at=is.null`,
      );
      const cloudIds = rows.map((row) => row.source_id).filter(Boolean);
      const localSet = new Set(localIds);
      const cloudSet = new Set(cloudIds);
      const localOnlyIds = localIds.filter((id) => !cloudSet.has(id));
      const cloudOnlyIds = cloudIds.filter((id) => !localSet.has(id));
      const matchingCount = localIds.filter((id) => cloudSet.has(id)).length;
      let status: CutoverCollectionStatus = "Ready";
      if (!localIds.length && !cloudIds.length) status = "Empty";
      else if (localOnlyIds.length) status = "Local only";
      else if (!localIds.length && cloudIds.length) status = "Cloud only";

      collections.push({
        storageKey,
        table: target.table,
        collectionKey: target.collectionKey,
        localCount: localIds.length,
        cloudCount: cloudIds.length,
        matchingCount,
        localOnlyIds,
        cloudOnlyIds,
        status,
      });
    } catch (error) {
      collections.push({
        storageKey,
        table: target.table,
        collectionKey: target.collectionKey,
        localCount: localIds.length,
        cloudCount: 0,
        matchingCount: 0,
        localOnlyIds: localIds,
        cloudOnlyIds: [],
        status: "Error",
        error: error instanceof Error ? error.message : "Cloud collection check failed.",
      });
    }
  }

  const queue = queueSummary(organisationId);
  const privateUploadQueueCount = readJson<PrivateFileUploadQueueItem[]>("jr-os-private-file-upload-queue", [])
    .filter((item) => item.organisationId === organisationId).length;
  const localOnlyTotal = collections.reduce((sum, item) => sum + item.localOnlyIds.length, 0);
  const cloudOnlyTotal = collections.reduce((sum, item) => sum + item.cloudOnlyIds.length, 0);
  const errorCount = collections.filter((item) => item.status === "Error").length;
  const blockers: string[] = [];
  if (localOnlyTotal) blockers.push(`${localOnlyTotal} local record${localOnlyTotal === 1 ? "" : "s"} still need cloud upload.`);
  if (queue.pending) blockers.push(`${queue.pending} queued change${queue.pending === 1 ? " is" : "s are"} still pending or offline.`);
  if (queue.conflicts) blockers.push(`${queue.conflicts} sync conflict${queue.conflicts === 1 ? " requires" : "s require"} review.`);
  if (queue.failed) blockers.push(`${queue.failed} queued change${queue.failed === 1 ? " has" : "s have"} failed.`);
  if (privateUploadQueueCount) blockers.push(`${privateUploadQueueCount} private file upload${privateUploadQueueCount === 1 ? " is" : "s are"} still queued.`);
  if (errorCount) blockers.push(`${errorCount} collection check${errorCount === 1 ? " could" : "s could"} not read from Supabase.`);

  return {
    checkedAt: new Date().toISOString(),
    organisationId,
    collections,
    localTotal: collections.reduce((sum, item) => sum + item.localCount, 0),
    cloudTotal: collections.reduce((sum, item) => sum + item.cloudCount, 0),
    localOnlyTotal,
    cloudOnlyTotal,
    pendingQueueCount: queue.pending,
    conflictQueueCount: queue.conflicts,
    failedQueueCount: queue.failed,
    privateUploadQueueCount,
    readyForCloudMode: blockers.length === 0,
    blockers,
  };
}
