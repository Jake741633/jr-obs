"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { cloudInsert, cloudUpsert, createSignedDownload, createSignedUpload } from "./client";
import { cloudConfig, cloudStorageBucket, effectiveCloudMode, type CloudMode } from "./config";
import type { CloudIdentity } from "./useCloudIdentity";

export const PRIVATE_FILE_UPLOAD_QUEUE_KEY = "jr-os-private-file-upload-queue";
export const MAX_PRIVATE_FILE_BYTES = 10 * 1024 * 1024;

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
  sourceId: string;
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
}

function sanitizeSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
}

function mimeFromDataUrl(dataUrl: string) {
  return /^data:([^;,]+)[;,]/.exec(dataUrl)?.[1] || "application/octet-stream";
}

export function privateObjectPath(organisationId: string, jobId: string | undefined, sourceId: string, fileName: string) {
  const scope = jobId ? `jobs/${sanitizeSegment(jobId)}` : "unassigned";
  return `${organisationId}/${scope}/${sanitizeSegment(sourceId)}/${sanitizeSegment(fileName)}`;
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

export function cloudSafeFileRecord<T extends object>(storageKey: string, value: T): T {
  if (storageKey !== "jr-os-job-documents" && storageKey !== "jr-os-expenses") return value;
  const record = { ...value } as T & PrivateFileBackedRecord;
  delete record.dataUrl;
  delete record.receiptDataUrl;
  delete record.signedDownloadUrl;
  return record;
}

function dataUrlToBlob(dataUrl: string, mimeType: string) {
  const encoded = dataUrl.split(",")[1] || "";
  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

export function readPrivateUploadQueue() {
  if (typeof window === "undefined") return [] as PrivateFileUploadQueueItem[];
  try { return JSON.parse(window.localStorage.getItem(PRIVATE_FILE_UPLOAD_QUEUE_KEY) || "[]") as PrivateFileUploadQueueItem[]; }
  catch { return []; }
}

function writeQueue(items: PrivateFileUploadQueueItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PRIVATE_FILE_UPLOAD_QUEUE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("jr-os-private-file-queue-changed"));
}

export function queuePrivateFileUpload(item: Omit<PrivateFileUploadQueueItem, "id" | "state" | "createdAt" | "updatedAt">) {
  const now = new Date().toISOString();
  const queued: PrivateFileUploadQueueItem = {
    ...item,
    id: `${item.organisationId}:${item.storageKey}:${item.sourceId}`,
    state: typeof navigator !== "undefined" && !navigator.onLine ? "Offline" : "Pending",
    createdAt: now,
    updatedAt: now,
  };
  const current = readPrivateUploadQueue();
  writeQueue([queued, ...current.filter((entry) => entry.id !== queued.id)]);
  return queued;
}

function signedObjectUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  const normalized = value.startsWith("/") ? value : `/${value}`;
  return `${cloudConfig.url}/storage/v1${normalized}`;
}

export async function uploadQueuedPrivateFile(item: PrivateFileUploadQueueItem) {
  if (effectiveCloudMode() === "local") return { state: "Pending" as const };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { state: "Offline" as const };
  const blob = dataUrlToBlob(item.dataUrl, item.mimeType);
  if (blob.size !== item.size && Math.abs(blob.size - item.size) > 4) throw new Error("The cached file size does not match the queued upload.");

  const signed = await createSignedUpload(item.objectPath);
  const response = await fetch(signedObjectUrl(signed.signedURL), {
    method: "PUT",
    headers: { "Content-Type": item.mimeType, "x-upsert": "false" },
    body: blob,
  });
  if (!response.ok) throw new Error((await response.text()) || `Private file upload failed (${response.status}).`);

  const metadata: PrivateFileMetadata = {
    organisation_id: item.organisationId,
    source_id: item.sourceId,
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
  const signedDownload = await createSignedDownload(item.objectPath);
  return { state: "Synced" as const, metadata: rows[0] ?? metadata, signedDownloadUrl: signedObjectUrl(signedDownload.signedURL) };
}

export async function flushPrivateFileUploadQueue(onSynced?: (item: PrivateFileUploadQueueItem, result: Awaited<ReturnType<typeof uploadQueuedPrivateFile>>) => void) {
  const queue = readPrivateUploadQueue();
  const next: PrivateFileUploadQueueItem[] = [];
  for (const item of queue) {
    try {
      const result = await uploadQueuedPrivateFile({ ...item, state: "Uploading", updatedAt: new Date().toISOString() });
      if (result.state === "Synced") onSynced?.(item, result);
      else next.push({ ...item, state: result.state, updatedAt: new Date().toISOString() });
    } catch (error) {
      next.push({ ...item, state: "Failed", error: error instanceof Error ? error.message : "Private upload failed.", updatedAt: new Date().toISOString() });
    }
  }
  writeQueue(next);
  return next;
}

export async function signedPrivateDownloadUrl(objectPath: string, expiresIn = 300) {
  const result = await createSignedDownload(objectPath, expiresIn);
  return signedObjectUrl(result.signedURL);
}

export async function registerExistingPrivateFile(metadata: PrivateFileMetadata) {
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

export function usePrivateFileCollectionBridge<T>(input: {
  storageKey: string;
  items: T[];
  setItems: Dispatch<SetStateAction<T[]>>;
  isReady: boolean;
  identity: CloudIdentity | null;
  mode: CloudMode;
}) {
  const { storageKey, items, setItems, isReady, identity, mode } = input;
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isReady || mode === "local" || !identity || !["jr-os-job-documents", "jr-os-expenses"].includes(storageKey)) return;
    const queuedIds = new Set(readPrivateUploadQueue().filter((item) => item.storageKey === storageKey).map((item) => item.sourceId));
    for (const item of items) {
      const record = item as PrivateFileBackedRecord;
      const file = embeddedFile(storageKey, record);
      if (!file || record.privateStoragePath || queuedIds.has(record.id)) continue;
      const size = dataUrlByteSize(file.dataUrl);
      if (validatePrivateFile({ name: file.fileName, size, type: file.mimeType })) continue;
      queuePrivateFileUpload({
        organisationId: identity.organisationId,
        userId: identity.userId,
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

    const flush = () => void flushPrivateFileUploadQueue((queued, result) => {
      if (queued.storageKey !== storageKey || result.state !== "Synced") return;
      setItems((current) => current.map((item) => {
        const record = item as PrivateFileBackedRecord;
        if (record.id !== queued.sourceId) return item;
        return {
          ...record,
          privateStoragePath: queued.objectPath,
          privateFileId: result.metadata.id,
          privateUploadState: "Synced",
          privateUploadError: undefined,
        } as T;
      }));
      setSignedUrls((current) => ({ ...current, [queued.sourceId]: result.signedDownloadUrl }));
    });
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [identity, isReady, items, mode, setItems, storageKey]);

  useEffect(() => {
    if (!isReady || mode === "local" || !identity || !["jr-os-job-documents", "jr-os-expenses"].includes(storageKey)) return;
    let active = true;
    const missing = items
      .map((item) => item as PrivateFileBackedRecord)
      .filter((record) => record.privateStoragePath && !signedUrls[record.id]);
    if (!missing.length) return;
    void Promise.all(missing.map(async (record) => [record.id, await signedPrivateDownloadUrl(record.privateStoragePath!)] as const))
      .then((entries) => { if (active) setSignedUrls((current) => ({ ...current, ...Object.fromEntries(entries) })); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [identity, isReady, items, mode, signedUrls, storageKey]);

  return useMemo(() => items.map((item) => {
    const record = item as PrivateFileBackedRecord;
    const signedUrl = signedUrls[record.id];
    if (!signedUrl) return item;
    if (storageKey === "jr-os-job-documents" && !record.dataUrl) return { ...record, dataUrl: signedUrl } as T;
    if (storageKey === "jr-os-expenses" && !record.receiptDataUrl) return { ...record, receiptUrl: signedUrl } as T;
    return item;
  }), [items, signedUrls, storageKey]);
}
