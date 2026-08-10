"use client";

import { accountStorageKey, organisationStorageKey } from "./cloud/adapter";
import {
  aggregateLegacyMigrationStorageKeys,
  backupStorageScope,
  claimLegacyMigrationStorage,
  collectAccountBusinessData,
  collectLegacyAggregateData,
  isCompleteAccountStorageContext,
  sameAccountStorageContext,
  type AccountStorageContext,
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

export function exportJrOsData(context: AccountStorageContext): JrOsBackup {
  const data = collectAccountBusinessData(window.localStorage, context);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: "JR OS",
    organisationId: context.organisationId,
    data,
  };
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

export function downloadJrOsBackup(context: AccountStorageContext) {
  const backup = exportJrOsData(context);
  const date = backup.exportedAt.slice(0, 10);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `jr-os-backup-${date}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importJrOsBackup(
  file: File,
  context: AccountStorageContext,
  resolveCurrentContext: () => Promise<AccountStorageContext | null>,
) {
  if (!isCompleteAccountStorageContext(context)) {
    throw new Error("Authenticated backup restore requires a complete account context.");
  }
  const parsed = JSON.parse(await file.text()) as Partial<JrOsBackup>;
  if (parsed.app !== "JR OS" || parsed.version !== 1 || !parsed.data || typeof parsed.data !== "object") {
    throw new Error("This is not a valid JR OS backup file.");
  }
  if (parsed.organisationId !== context.organisationId) {
    throw new Error("This backup belongs to a different JR OS organisation.");
  }
  const currentContext = await resolveCurrentContext();
  if (!sameAccountStorageContext(context, currentContext)) {
    throw new Error("The active JR OS account changed before the backup could be restored.");
  }
  let restored = 0;
  Object.entries(parsed.data).forEach(([key, value]) => {
    const scope = backupStorageScope(key);
    if (!scope) return;
    const destinationKey = scope === "account"
      ? accountStorageKey(key, context.organisationId, context.userId, context.role, context.customerSourceId)
      : organisationStorageKey(key, context.organisationId);
    window.localStorage.setItem(destinationKey, typeof value === "string" ? value : JSON.stringify(value));
    restored += 1;
  });
  return restored;
}
