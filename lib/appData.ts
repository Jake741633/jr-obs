"use client";

import { accountStorageKey, organisationStorageKey } from "./cloud/adapter";
import {
  aggregateLegacyMigrationStorageKeys,
  accountBackupStorageKeyAllowed,
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

function backupObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function backupSectionValue(key: string, value: unknown, scope: "account" | "organisation") {
  let decoded: unknown;
  try { decoded = typeof value === "string" ? JSON.parse(value) : value; }
  catch { throw new Error(`Backup section ${key} is not valid JSON. Review the backup before restoring.`); }
  if (scope === "account") {
    // Some settings collections have no record id. Present identities must
    // still be strings so restored records remain usable by normal consumers.
    if (!Array.isArray(decoded) || decoded.some(record => !backupObject(record)
      || (Object.hasOwn(record, "id") && (typeof record.id !== "string" || !record.id.trim())))) {
      throw new Error(`Backup section ${key} needs an array of valid record objects.`);
    }
  } else {
    if (!backupObject(decoded) || Object.entries(defaultAiProfile).some(([field, fallback]) => {
      if (!Object.hasOwn(decoded, field)) return false;
      const item = decoded[field];
      if (field === "quoteStyle") return !["Detailed", "Balanced", "Simple"].includes(item as string);
      if (field === "riskPreference") return !["Cautious", "Balanced"].includes(item as string);
      if (Array.isArray(fallback)) return !Array.isArray(item) || item.some(entry => typeof entry !== "string");
      if (typeof fallback === "number") return typeof item !== "number" || !Number.isFinite(item) || item < 0;
      return typeof item !== typeof fallback;
    })) throw new Error("The backup AI profile has invalid settings. Review it before restoring.");
  }
  // Preserve valid legacy serialized bytes, including intentional whitespace.
  return typeof value === "string" ? value : JSON.stringify(decoded);
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
  if (!backupObject(parsed) || parsed.app !== "JR OS" || parsed.version !== 1 || !backupObject(parsed.data)) {
    throw new Error("This is not a valid JR OS backup file.");
  }
  if (parsed.organisationId !== context.organisationId) {
    throw new Error("This backup belongs to a different JR OS organisation.");
  }
  const currentContext = await resolveCurrentContext();
  if (!sameAccountStorageContext(context, currentContext)) {
    throw new Error("The active JR OS account changed before the backup could be restored.");
  }
  const storage = window.localStorage;
  const plan: Array<{ destinationKey: string; next: string; previous: string | null }> = [];
  Object.entries(parsed.data).forEach(([key, value]) => {
    if (!accountBackupStorageKeyAllowed(key, context.role)) return;
    const scope = backupStorageScope(key);
    if (!scope) return;
    const destinationKey = scope === "account"
      ? accountStorageKey(key, context.organisationId, context.userId, context.role, context.customerSourceId)
      : organisationStorageKey(key, context.organisationId);
    const next = backupSectionValue(key, value, scope);
    plan.push({ destinationKey, next, previous: storage.getItem(destinationKey) });
  });
  const completed: typeof plan = [];
  try {
    for (const section of plan) {
      if (storage.getItem(section.destinationKey) !== section.previous) throw new Error("Browser data changed before this backup section could be restored.");
      storage.setItem(section.destinationKey, section.next);
      completed.push(section);
    }
  } catch (error) {
    const recoveryErrors: unknown[] = [];
    for (const section of completed.toReversed()) {
      try {
        if (storage.getItem(section.destinationKey) !== section.next) throw new Error("Restored browser data changed before recovery; the intervening change was preserved.");
        if (section.previous === null) storage.removeItem(section.destinationKey);
        else storage.setItem(section.destinationKey, section.previous);
      } catch (recoveryError) { recoveryErrors.push(recoveryError); }
    }
    if (recoveryErrors.length) {
      throw new Error("Backup restore failed and recovery is incomplete. Keep this page open and review browser data before retrying.", { cause: new AggregateError([error, ...recoveryErrors]) });
    }
    throw new Error("Backup could not be restored. Previous browser data was recovered.", { cause: error });
  }
  return plan.length;
}
