export interface TenantQueryInput { organisationId: string; sourceId?: string; collectionKey?: string; includeDeleted?: boolean; }
export interface QueueIdentity { organisationId: string; table: string; sourceId: string; collectionKey?: string; }
export interface CloudEnvelopeInput<T = unknown> {
  organisationId: string;
  sourceId: string;
  recordTable?: string;
  collectionKey?: string;
  payload?: T;
  version: number;
  sourceUpdatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}
export interface TypedCloudRow<T = unknown> {
  organisation_id: string;
  source_id: string;
  customer_source_id: string | null;
  job_source_id: string | null;
  version: number;
  source_updated_at: string;
  payload: T | null;
  deleted_at: null;
  created_by: string | null;
  updated_by: string | null;
}
export interface GenericCloudRow<T = unknown> extends TypedCloudRow<T> { collection_key: string; }
export function collectionFilter(collectionKey?: string): string;
export function tenantRecordQuery(input: Required<Pick<TenantQueryInput, "organisationId" | "sourceId">> & Pick<TenantQueryInput, "collectionKey" | "includeDeleted">): string;
export function tenantListQuery(input: Pick<TenantQueryInput, "organisationId" | "collectionKey">): string;
export function hasVersionConflict(currentVersion?: number, expectedVersion?: number): boolean;
export function cloudRecordMatchesQueuedPayload(
  table: string,
  current: { payload?: unknown; created_at?: string | null } | null | undefined,
  queuedPayload: unknown,
): boolean;
export function linkedSourceIds(payload: unknown): { customerSourceId?: string; jobSourceId?: string };
export function buildTypedEnvelope<T>(input: CloudEnvelopeInput<T>): TypedCloudRow<T>;
export function buildGenericEnvelope<T>(input: CloudEnvelopeInput<T> & { collectionKey: string }): GenericCloudRow<T>;
export function buildCloudEnvelope<T>(input: CloudEnvelopeInput<T>): TypedCloudRow<T> | GenericCloudRow<T>;
export function coalesceQueue<T extends QueueIdentity>(queue: T[], next: T): T[];
export function makeTombstone(input: { currentVersion?: number; userId?: string; deletedAt: string }): { version: number; deleted_at: string; updated_at: string; updated_by?: string };
export function pendingImports<T extends { id: string; updatedAt?: string }>(records: T[], existingRows: Array<{ source_id: string; source_updated_at?: string; deleted_at?: string | null }>): T[];
export function applyLocalCrud<T extends { id: string }>(records: T[], operation: { type: "remove"; id: string } | { type: "save"; record: T }): T[];
export function queueModeChange<T extends QueueIdentity>(input: { mode: "local" | "migration" | "cloud"; online: boolean; queue: T[]; change: T }): { queue: T[]; status: "Synced" | "Pending" | "Offline" };
export function cloudRowsToCache<T>(rows: Array<{ source_id: string; version?: number; deleted_at?: string | null; payload: T }>): T[];
export function retainVersionConflict<T extends QueueIdentity & { expectedVersion?: number }>(queue: T[], change: T, currentVersion?: number): T[];
