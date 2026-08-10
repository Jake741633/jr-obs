export interface StorageReader {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
}

export interface StorageWriter extends StorageReader {
  setItem(key: string, value: string): void;
}

export const typedCollectionTables: Readonly<Record<string, string>>;
export const genericCloudCollectionStorageKeys: readonly string[];
export const cloudCollectionStorageKeys: readonly string[];
export const legacyAggregateStorageKeys: readonly string[];
export const LEGACY_MIGRATION_CLAIM_KEY: "jr-os-legacy-migration-claim";
export function isCloudCollectionStorageKey(storageKey: string): boolean;
export function isGenericCloudCollectionStorageKey(storageKey: string): boolean;
export function isLegacyAggregateStorageKey(storageKey: string): boolean;
export function typedLegacyMigrationStorageKeys(storage: StorageReader): string[];
export function aggregateLegacyMigrationStorageKeys(storage: StorageReader): string[];
export function collectLegacyAggregateData(storage: StorageReader): Record<string, unknown>;
export function scopedBusinessStorageKey(storageKey: string): { baseStorageKey: string; organisationId: string; accountScoped: boolean } | null;
export function collectOrganisationBusinessData(storage: StorageReader, organisationId: string): Record<string, unknown>;
export function claimLegacyMigrationStorage(storage: StorageWriter, organisationId: string): boolean;
