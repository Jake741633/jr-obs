export interface StorageReader {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
}

export interface StorageWriter extends StorageReader {
  setItem(key: string, value: string): void;
}

export interface StorageMutator extends StorageWriter {
  removeItem(key: string): void;
}

export interface AccountStorageContext {
  organisationId: string;
  userId: string;
  role: string;
  customerSourceId?: string;
}

export interface ScopedBackupStorageKey {
  baseStorageKey: string;
  organisationId: string;
  scope: "account" | "organisation";
  userId?: string;
  role?: string;
  customerSourceId?: string;
}

export const typedCollectionTables: Readonly<Record<string, string>>;
export const genericCloudCollectionStorageKeys: readonly string[];
export const cloudCollectionStorageKeys: readonly string[];
export const legacyAggregateStorageKeys: readonly string[];
export const CABLE_SIZING_HISTORY_STORAGE_KEY: "jr-os:electrical-calculators:cable-sizing:recent:v1";
export const accountBackupStorageKeys: readonly string[];
export const organisationBackupStorageKeys: readonly string[];
export const LEGACY_MIGRATION_CLAIM_KEY: "jr-os-legacy-migration-claim";
export function isCloudCollectionStorageKey(storageKey: string): boolean;
export function isGenericCloudCollectionStorageKey(storageKey: string): boolean;
export function isLegacyAggregateStorageKey(storageKey: string): boolean;
export function backupStorageScope(storageKey: string): "account" | "organisation" | null;
export function accountBackupStorageKeyAllowed(storageKey: string, role: string): boolean;
export function isCompleteAccountStorageContext(context: unknown): context is AccountStorageContext;
export function sameAccountStorageContext(left: unknown, right: unknown): boolean;
export function typedLegacyMigrationStorageKeys(storage: StorageReader): string[];
export function aggregateLegacyMigrationStorageKeys(storage: StorageReader): string[];
export function collectLegacyAggregateData(storage: StorageReader): Record<string, unknown>;
export function scopedBusinessStorageKey(storageKey: string): { baseStorageKey: string; organisationId: string; accountScoped: boolean } | null;
export function collectOrganisationBusinessData(storage: StorageReader, organisationId: string): Record<string, unknown>;
export function scopedBackupStorageKey(storageKey: string): ScopedBackupStorageKey | null;
export function collectAccountBusinessData(storage: StorageReader, context: AccountStorageContext): Record<string, unknown>;
export function claimLegacyMigrationStorage(storage: StorageWriter, organisationId: string): boolean;
export function migrateClaimedLegacyStorageValues(
  storage: StorageMutator,
  organisationId: string,
  mappings: readonly { legacyKey: string; scopedKey: string }[],
): { claimedByOrganisation: boolean; migrated: number; removed: number };
