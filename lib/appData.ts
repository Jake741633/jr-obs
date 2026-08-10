"use client";

import { organisationStorageKey } from "./cloud/adapter";
import {
  aggregateLegacyMigrationStorageKeys,
  claimLegacyMigrationStorage,
  collectLegacyAggregateData,
  collectOrganisationBusinessData,
  isLegacyAggregateStorageKey,
} from "./cloud/migrationStoragePolicy-core.mjs";

export const JR_OS_STORAGE_PREFIX = "jr-os-";

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

export function exportJrOsData(organisationId?: string): JrOsBackup {
  const data = organisationId
    ? collectOrganisationBusinessData(window.localStorage, organisationId)
    : collectLegacyAggregateData(window.localStorage);
  return { version: 1, exportedAt: new Date().toISOString(), app: "JR OS", organisationId, data };
}

export function exportLegacyJrOsData(organisationId: string): JrOsBackup {
  if (aggregateLegacyMigrationStorageKeys(window.localStorage).length) {
    claimLegacyMigrationStorage(window.localStorage, organisationId);
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: "JR OS",
    organisationId,
    data: collectLegacyAggregateData(window.localStorage),
  };
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
    if (!isLegacyAggregateStorageKey(key)) return;
    const destinationKey = organisationId ? organisationStorageKey(key, organisationId) : key;
    window.localStorage.setItem(destinationKey, typeof value === "string" ? value : JSON.stringify(value));
    restored += 1;
  });
  return restored;
}
