"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { readSupabaseSession } from "../supabase/client";
import { cloudInsert, cloudUpsert, downloadPrivateObject, uploadPrivateObject } from "./client";
import { cloudStorageBucket, effectiveCloudMode, type CloudMode } from "./config";
import { partitionPrivateUploadQueue, privateUploadMatchesAuthorization } from "./privateUploadQueue-core.mjs";
import { activeSyncAuthorizationMatches, revalidateSyncAuthorization, type SyncAuthorizationContext } from "./repository";
import type { CloudIdentity } from "./useCloudIdentity";

export const PRIVATE_FILE_UPLOAD_QUEUE_KEY = "jr-os-private-file-upload-queue";
export const MAX_PRIVATE_FILE_BYTES = 10 * 1024 * 1024;
const ACTIVE_ORGANISATION_KEY = "jr-os-active-organisation";

const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export type PrivateUploadState = "Pending" | "Offline" | "Uploading" | "Synced" | "Failed";

export interface PrivateFileUploadQueueItem {
  id: string;
  organisationId: string;
  userId: string;
  authorizationRole: string;
  authorizationCustomerSourceId?: string;
  sourceId: string;
  parentSourceId?: string;
  storageKey: string;
  jobSourceId?: string;
  customerSourceId?: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  objectPath: string;
  state: PrivateUploadState;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrivateFileMetadata {
  id?: string;
  organisation_id: string;
  source_id: string;
  storage_key: string;
  job_source_id?: string;
  customer_source_id?: string;
  bucket: string;
  object_path: string;
  file_name: string;
  mime_type?: string;
  created_by: string;
  updated_by: string;
}

export interface PrivateFileBackedRecord {
  id: string;
  jobId?: string;
  customerId?: string;
  fileName?: string;
  mimeType?: string;
  dataUrl?: string;
  externalUrl?: string;
  receiptDataUrl?: string;
  receiptFileName?: string;
  receiptUrl?: string;
  privateStoragePath?: string;
  privateFileId?: string;
  privateUploadState?: PrivateUploadState;
  privateUploadError?: string;
  signedDownloadUrl?: string;
  photos?: PrivateFileBackedRecord[];
}

function sanitizeSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
}

function mimeFromDataUrl(dataUrl: string) {
  return /^data:([^;,]+)[;,]/.exec(dataUrl)?.[1] || "application/octet-stream";
}

function organisationObjectPrefix(organisationId: string) {
  return `${sanitizeSegment(organisationId)}/`;
}

function activeOrganisationId() {
  return typeof window === "undefined" ? null : window.localStorage.getItem(ACTIVE_ORGANISATION_KEY);
}

function activeReplayOwnerMatches(authorization: SyncAuthorizationContext) {
  return activeOrganisationId() === authorization.organisationId
    && readSupabaseSession()?.user?.id === authorization.userId
    && activeSyncAuthorizationMatches(authorization);
}

export function privateDownloadCacheKey(identity: CloudIdentity, sourceId: string) {
  return JSON.stringify([identity.organisationId, identity.userId, identity.role, identity.customerSourceId ?? null, sourceId]);
}

export function privateUploadQueueItemId(organisationId: string, userId: string, role: string, customerSourceId: string | undefined, storageKey: string, sourceId: string) {
  return JSON.stringify([organisationId, userId, role, customerSourceId ?? null, storageKey, sourceId]);
}

export function privateObjectPath(organisationId: string, jobId: string | undefined, sourceId: string, fileName: string) {
  const scope = jobId ? `jobs/${sanitizeSegment(jobId)}` : "unassigned";
  return `${sanitizeSegment(organisationId)}/${scope}/${sanitizeSegment(sourceId)}/${sanitizeSegment(fileName)}`;
}

export function isOrganisationPrivateObjectPath(organisationId: string, objectPath: string) {
  return objectPath.startsWith(organisationObjectPrefix(organisationId)) && !objectPath.includes("../") && !objectPath.startsWith("/");
}

function assertOrganisationPrivateObjectPath(organisationId: string, objectPath: string) {
  if (!isOrganisationPrivateObjectPath(organisationId, objectPath)) {
    throw new Error("The private file does not belong to the active organisation.");
  }
}

export function validatePrivateFile(file: Pick<File, "name" | "size" | "type">) {
  if (!file.name.trim()) return "The selected file must have a name.";
  if (file.size <= 0) return "The selected file is empty.";
  if (file.size > MAX_PRIVATE_FILE_BYTES) return "Choose a file smaller than 10 MB.";
  if (!file.type || !allowedMimeTypes.has(file.type)) return `File type ${file.type || "unknown"} is not supported.`;
  return null;
}

export function dataUrlByteSize(dataUrl: string) {
  const encoded = dataUrl.split(",")[1] || "";
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(encoded.length * 0.75) - padding);
}

function stripPrivateBytes(record: PrivateFileBackedRecord) {
  const safe = { ...record };
  delete safe.dataUrl;
  delete safe.receiptDataUrl;
  delete safe.signedDownloadUrl;
  return safe;
}

export function cloudSafeFileRecord<T extends object>(storageKey: string, value: T): T {
  if (storageKey === "jr-os-job-documents" || storageKey === "jr-os-expenses") {
    return stripPrivateBytes(value as T & PrivateFileBackedRecord) as T;
  }
  if (storageKey === "jr-os-surveys") {
    const record = { ...value } as T & PrivateFileBackedRecord;
    if (record.photos) record.photos = record.photos.map((photo) => stripPrivateBytes(photo));
    return record;
  }
  return value;
}

function dataUrlToBlob(dataUrl: string, mimeType: string) {
  const encoded = dataUrl.split(",")[1] || "";
  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function readAllPrivateUploadQueue() {
  if (typeof window === "undefined") return [] as PrivateFileUploadQueueItem[];
  try { return JSON.parse(window.localStorage.getItem(PRIVATE_FILE_UPLOAD_QUEUE_KEY) || "[]") as PrivateFileUploadQueueItem[]; }
  catch { return []; }
}

function privateUploadAuthorization(item: PrivateFileUploadQueueItem): SyncAuthorizationContext {
  return { organisationId: item.organisationId, userId: item.userId, role: item.authorizationRole, customerSourceId: item.authorizationCustomerSourceId };
}

export function readPrivateUploadQueue(authorization: SyncAuthorizationContext) {
  const queue = readAllPrivateUploadQueue();
  return queue.filter((item) => privateUploadMatchesAuthorization(item, authorization));
}

function writeQueue(items: PrivateFileUploadQueueItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PRIVATE_FILE_UPLOAD_QUEUE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("jr-os-private-file-queue-changed"));
}

export function queuePrivateFileUpload(item: Omit<PrivateFileUploadQueueItem, "id" | "state" | "createdAt" | "updatedAt">) {
  assertOrganisationPrivateObjectPath(item.organisationId, item.objectPath);
  const now = new Date().toISOString();
  const queued: PrivateFileUploadQueueItem = {
    ...item,
    id: privateUploadQueueItemId(item.organisationId, item.userId, item.authorizationRole, item.authorizationCustomerSourceId, item.storageKey, item.sourceId),
    state: typeof navigator !== "undefined" && !navigator.onLine ? "Offline" : "Pending",
    createdAt: now,
    updatedAt: now,
  };
  const current = readAllPrivateUploadQueue();
  writeQueue([queued, ...current.filter((entry) => entry.id !== queued.id)]);
  return queued;
}

export async function uploadQueuedPrivateFile(item: PrivateFileUploadQueueItem) {
  assertOrganisationPrivateObjectPath(item.organisationId, item.objectPath);
  if (effectiveCloudMode() === "local") return { state: "Pending" as const };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { state: "Offline" as const };
  const authorization = privateUploadAuthorization(item);
  if (!activeReplayOwnerMatches(authorization) || !(await revalidateSyncAuthorization(authorization))) {
    throw new Error("Private upload authorisation changed before replay.");
  }
  const blob = dataUrlToBlob(item.dataUrl, item.mimeType);
  if (blob.size !== item.size && Math.abs(blob.size - item.size) > 4) throw new Error("The cached file size does not match the queued upload.");

  await uploadPrivateObject(item.objectPath, blob, item.mimeType);

  const metadata: PrivateFileMetadata = {
    organisation_id: item.organisationId,
    source_id: item.sourceId,
    storage_key: item.storageKey,
    job_source_id: item.jobSourceId,
    customer_source_id: item.customerSourceId,
    bucket: cloudStorageBucket,
    object_path: item.objectPath,
    file_name: item.fileName,
    mime_type: item.mimeType,
    created_by: item.userId,
    updated_by: item.userId,
  };
  const rows = await cloudUpsert<PrivateFileMetadata>("private_files", [metadata]);
  return { state: "Synced" as const, metadata: rows[0] ?? metadata };
}

export async function flushPrivateFileUploadQueue(
  authorization: SyncAuthorizationContext,
  storageKey: string,
  onSynced?: (item: PrivateFileUploadQueueItem, result: Awaited<ReturnType<typeof uploadQueuedPrivateFile>>) => void,
) {
  const allQueue = readAllPrivateUploadQueue();
  const { preserved, activeQueue } = partitionPrivateUploadQueue(allQueue, authorization, storageKey);
  const remaining: PrivateFileUploadQueueItem[] = [];
  for (const [index, item] of activeQueue.entries()) {
    if (!activeReplayOwnerMatches(authorization)) {
      remaining.push(...activeQueue.slice(index));
      break;
    }
    try {
      const result = await uploadQueuedPrivateFile({ ...item, state: "Uploading", updatedAt: new Date().toISOString() });
      if (!activeReplayOwnerMatches(authorization)) {
        if (result.state !== "Synced") remaining.push({ ...item, state: result.state, updatedAt: new Date().toISOString() });
        remaining.push(...activeQueue.slice(index + 1));
        break;
      }
      if (result.state === "Synced") onSynced?.(item, result);
      else remaining.push({ ...item, state: result.state, updatedAt: new Date().toISOString() });
    } catch (error) {
      remaining.push({ ...item, state: "Failed", error: error instanceof Error ? error.message : "Private upload failed.", updatedAt: new Date().toISOString() });
    }
  }
  writeQueue([...preserved, ...remaining]);
  return remaining;
}

export async function authenticatedPrivateDownloadUrl(objectPath: string, organisationId: string) {
  assertOrganisationPrivateObjectPath(organisationId, objectPath);
  const file = await downloadPrivateObject(objectPath);
  return URL.createObjectURL(file);
}

export async function registerExistingPrivateFile(metadata: PrivateFileMetadata) {
  assertOrganisationPrivateObjectPath(metadata.organisation_id, metadata.object_path);
  return cloudInsert<PrivateFileMetadata>("private_files", [metadata]);
}

function embeddedFile(storageKey: string, record: PrivateFileBackedRecord) {
  if (storageKey === "jr-os-job-documents" && record.dataUrl && record.fileName) {
    return { dataUrl: record.dataUrl, fileName: record.fileName, mimeType: record.mimeType || mimeFromDataUrl(record.dataUrl) };
  }
  if (storageKey === "jr-os-expenses" && record.receiptDataUrl && record.receiptFileName) {
    return { dataUrl: record.receiptDataUrl, fileName: record.receiptFileName, mimeType: mimeFromDataUrl(record.receiptDataUrl) };
  }
  return null;
}

function supportedStorageKey(storageKey: string) {
  return ["jr-os-job-documents", "jr-os-expenses", "jr-os-surveys"].includes(storageKey);
}

export function usePrivateFileCollectionBridge<T>(input: {
  storageKey: string;
  items: T[];
  setItems: Dispatch<SetStateAction<T[]>>;
  isReady: boolean;
  identity: CloudIdentity | null;
  mode: CloudMode;
}) {
  const { storageKey, items, setItems, isReady, identity, mode } = input;
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});
  const downloadUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    downloadUrlsRef.current = downloadUrls;
  }, [downloadUrls]);

  useEffect(() => () => {
    for (const url of Object.values(downloadUrlsRef.current)) URL.revokeObjectURL(url);
    downloadUrlsRef.current = {};
  }, []);

  useEffect(() => {
    if (!isReady || mode === "local" || !identity || !supportedStorageKey(storageKey)) return;
    const queuedIds = new Set(
      readPrivateUploadQueue(identity)
        .filter((item) => item.storageKey === storageKey)
        .map((item) => item.sourceId),
    );
    for (const item of items) {
      const record = item as PrivateFileBackedRecord;
      if (storageKey === "jr-os-surveys") {
        for (const photo of record.photos ?? []) {
          if (!photo.dataUrl || photo.privateStoragePath || queuedIds.has(photo.id)) continue;
          const mimeType = photo.mimeType || mimeFromDataUrl(photo.dataUrl);
          const fileName = photo.fileName || `${photo.id}.${mimeType.split("/")[1] || "jpg"}`;
          const size = dataUrlByteSize(photo.dataUrl);
          if (validatePrivateFile({ name: fileName, size, type: mimeType })) continue;
          queuePrivateFileUpload({
            organisationId: identity.organisationId,
            userId: identity.userId,
            authorizationRole: identity.role,
            authorizationCustomerSourceId: identity.customerSourceId,
            sourceId: photo.id,
            parentSourceId: record.id,
            storageKey,
            jobSourceId: record.jobId,
            customerSourceId: record.customerId,
            fileName,
            mimeType,
            size,
            dataUrl: photo.dataUrl,
            objectPath: privateObjectPath(identity.organisationId, record.jobId, photo.id, fileName),
          });
        }
        continue;
      }
      const file = embeddedFile(storageKey, record);
      if (!file || record.privateStoragePath || queuedIds.has(record.id)) continue;
      const size = dataUrlByteSize(file.dataUrl);
      if (validatePrivateFile({ name: file.fileName, size, type: file.mimeType })) continue;
      queuePrivateFileUpload({
        organisationId: identity.organisationId,
        userId: identity.userId,
        authorizationRole: identity.role,
        authorizationCustomerSourceId: identity.customerSourceId,
        sourceId: record.id,
        storageKey,
        jobSourceId: record.jobId,
        customerSourceId: record.customerId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        size,
        dataUrl: file.dataUrl,
        objectPath: privateObjectPath(identity.organisationId, record.jobId, record.id, file.fileName),
      });
    }

    const flush = () => void flushPrivateFileUploadQueue(identity, storageKey, (queued, result) => {
      if (queued.storageKey !== storageKey || result.state !== "Synced") return;
      setItems((current) => current.map((item) => {
        const record = item as PrivateFileBackedRecord;
        if (storageKey === "jr-os-surveys") {
          if (record.id !== queued.parentSourceId) return item;
          return {
            ...record,
            photos: (record.photos ?? []).map((photo) => photo.id === queued.sourceId ? {
              ...photo,
              privateStoragePath: queued.objectPath,
              privateFileId: result.metadata.id,
              privateUploadState: "Synced",
              privateUploadError: undefined,
            } : photo),
          } as T;
        }
        if (record.id !== queued.sourceId) return item;
        return {
          ...record,
          privateStoragePath: queued.objectPath,
          privateFileId: result.metadata.id,
          privateUploadState: "Synced",
          privateUploadError: undefined,
        } as T;
      }));
    });
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [identity, isReady, items, mode, setItems, storageKey]);

  useEffect(() => {
    if (!isReady || mode === "local" || !identity || !supportedStorageKey(storageKey)) return;
    let active = true;
    const missing = items.flatMap((item) => {
      const record = item as PrivateFileBackedRecord;
      if (storageKey === "jr-os-surveys") {
        return (record.photos ?? []).filter((photo) => photo.privateStoragePath && !downloadUrls[privateDownloadCacheKey(identity, photo.id)]);
      }
      return record.privateStoragePath && !downloadUrls[privateDownloadCacheKey(identity, record.id)] ? [record] : [];
    });
    if (missing.length === 0) return;
    const createdUrls: string[] = [];
    Promise.all(missing.map(async (record) => {
      const url = await authenticatedPrivateDownloadUrl(record.privateStoragePath!, identity.organisationId);
      createdUrls.push(url);
      return [privateDownloadCacheKey(identity, record.id), url] as const;
    })).then((entries) => {
      if (!active) {
        for (const url of createdUrls) URL.revokeObjectURL(url);
        return;
      }
      setDownloadUrls((current) => {
        const next = { ...current, ...Object.fromEntries(entries) };
        downloadUrlsRef.current = next;
        return next;
      });
    }).catch(() => {
      for (const url of createdUrls) URL.revokeObjectURL(url);
    });
    return () => { active = false; };
  }, [downloadUrls, identity, isReady, items, mode, storageKey]);

  const hydratedItems = useMemo(() => items.map((item) => {
    const record = item as PrivateFileBackedRecord;
    if (storageKey === "jr-os-surveys") {
      return {
        ...record,
        photos: (record.photos ?? []).map((photo) => ({ ...photo, signedDownloadUrl: identity ? downloadUrls[privateDownloadCacheKey(identity, photo.id)] : undefined })),
      } as T;
    }
    return { ...record, signedDownloadUrl: identity ? downloadUrls[privateDownloadCacheKey(identity, record.id)] : undefined } as T;
  }), [downloadUrls, identity, items, storageKey]);

  return { items: hydratedItems };
}
