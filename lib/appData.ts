"use client";

import { organisationStorageKey } from "./cloud/adapter";

export const JR_OS_STORAGE_PREFIX = "jr-os-";
const ORGANISATION_MARKER = ":organisation:";
const excludedBackupKeys = new Set([
  "jr-os-supabase-session",
  "jr-os-active-organisation",
  "jr-os-cloud-sync-queue",
  "jr-os-cloud-sync-status",
  "jr-os-cloud-last-sync",
]);

export interface JrAiProfile {
  ownerName: string;
  businessName: string;
  defaultLabourRate: number;
  preferredSuppliers: string[];
  preferredCertificateInspector: string;
  quoteStyle: "Detailed" | "Balanced" | "Simple";
  riskPreference: "Cautious" | "Balanced";
  notes: string;
  learningEnabled: boolean;
  updatedAt: string;
}

export const defaultAiProfile: JrAiProfile = {
  ownerName: "",
  businessName: "",
  defaultLabourRate: 45,
  preferredSuppliers: [],
  preferredCertificateInspector: "",
  quoteStyle: "Balanced",
  riskPreference: "Cautious",
  notes: "",
  learningEnabled: true,
  updatedAt: new Date(0).toISOString(),
};

export interface JrOsBackup {
  version: 1;
  exportedAt: string;
  app: "JR OS";
  organisationId?: string;
  data: Record<string, unknown>;
}

function isInternalBackupKey(key: string) {
  return excludedBackupKeys.has(key) || key.startsWith("jr-os-cloud-versions:");
}

function backupStorageKey(key: string, organisationId?: string) {
  if (!organisationId) return key;
  const suffix = organisationStorageKey("", organisationId);
  return key.endsWith(suffix) ? key.slice(0, -suffix.length) : null;
}

export function exportJrOsData(organisationId?: string): JrOsBackup {
  const data: Record<string, unknown> = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(JR_OS_STORAGE_PREFIX) || isInternalBackupKey(key)) continue;
    const exportedKey = backupStorageKey(key, organisationId);
    if (exportedKey === null) continue;
    if (organisationId && key.includes(ORGANISATION_MARKER) && !key.endsWith(organisationStorageKey("", organisationId))) continue;
    if (organisationId && !key.includes(ORGANISATION_MARKER)) continue;
    const raw = window.localStorage.getItem(key);
    if (raw === null) continue;
    try {
      data[exportedKey] = JSON.parse(raw);
    } catch {
      data[exportedKey] = raw;
    }
  }
  return { version: 1, exportedAt: new Date().toISOString(), app: "JR OS", organisationId, data };
}

export function downloadJrOsBackup(organisationId?: string) {
  const backup = exportJrOsData(organisationId);
  const date = backup.exportedAt.slice(0, 10);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `jr-os-backup-${date}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importJrOsBackup(file: File, organisationId?: string) {
  const parsed = JSON.parse(await file.text()) as Partial<JrOsBackup>;
  if (parsed.app !== "JR OS" || parsed.version !== 1 || !parsed.data || typeof parsed.data !== "object") {
    throw new Error("This is not a valid JR OS backup file.");
  }
  if (organisationId && parsed.organisationId !== organisationId) {
    throw new Error("This backup belongs to a different JR OS organisation.");
  }
  let restored = 0;
  Object.entries(parsed.data).forEach(([key, value]) => {
    if (!key.startsWith(JR_OS_STORAGE_PREFIX) || isInternalBackupKey(key) || key.includes(ORGANISATION_MARKER)) return;
    const destinationKey = organisationId ? organisationStorageKey(key, organisationId) : key;
    window.localStorage.setItem(destinationKey, typeof value === "string" ? value : JSON.stringify(value));
    restored += 1;
  });
  return restored;
}
