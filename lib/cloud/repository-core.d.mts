export interface TenantQueryInput { organisationId: string; sourceId?: string; collectionKey?: string; includeDeleted?: boolean; }
export interface QueueIdentity { organisationId: string; table: string; sourceId: string; collectionKey?: string; }
export interface QueueMutation extends QueueIdentity {
  userId?: string;
  role?: string;
  customerSourceId?: string;
  operation?: "upsert" | "delete";
  expectedVersion?: number;
  baseVersion?: number;
  baseIntent?: "create" | "update" | "unknown";
  mutationId?: string;
  sentAt?: string;
  state?: string;
  error?: string;
}
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
export type CloudUpdatePatch<T = unknown> = Pick<TypedCloudRow<T>,
  "customer_source_id" | "job_source_id" | "source_updated_at" | "payload"
>;
export function collectionFilter(collectionKey?: string): string;
export function tenantRecordQuery(input: Required<Pick<TenantQueryInput, "organisationId" | "sourceId">> & Pick<TenantQueryInput, "collectionKey" | "includeDeleted">): string;
export function tenantRecordVersionQuery(input: Required<Pick<TenantQueryInput, "organisationId" | "sourceId">> & Pick<TenantQueryInput, "collectionKey"> & { currentVersion: number }): string;
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
export function buildCloudUpdatePatch<T>(input: CloudEnvelopeInput<T>): CloudUpdatePatch<T>;
export function queueTargetSyncState(
  queue: Array<Pick<QueueMutation, "table" | "sourceId" | "collectionKey" | "state">>,
  target: Pick<QueueIdentity, "table" | "sourceId" | "collectionKey">,
  online: boolean,
): "Synced" | "Pending" | "Offline" | "Conflict" | "Failed";
export function sameQueueTarget(left: QueueMutation, right: QueueMutation): boolean;
export function coalesceQueue<T extends QueueMutation>(queue: T[], next: T): T[];
export function rebaseQueuedFieldMutation<T extends QueueMutation>(change: T, currentVersion: number): T;
export function fieldMutationReplayExpired(sentAt?: string, now?: number): boolean;
export function projectFieldMutationPayload<T>(input: { collectionKey?: string; role?: string; payload: T }): T;
export function sanitizeQueuedFieldMutationProjection<T extends { collectionKey?: string; role?: string; payload?: unknown; sentAt?: string }>(change: T, now?: number): T;
export function mergeProcessedQueue<T extends QueueMutation>(liveQueue: T[], processedQueue: T[], remainingQueue: T[]): T[];
export function shouldReconcileFieldMutationPayload<T extends QueueMutation>(retainedQueue: T[], mutation: T): boolean;
export function reconcileVersionedRecordCache<T extends { id?: string }>(input: {
  versions: Record<string, number>;
  records: T[];
  sourceId: string;
  version: number;
  payload?: T;
}): { applied: boolean; versions: Record<string, number>; records: T[] };
export function singleFlight<TArgs extends unknown[], TResult>(task: (...args: TArgs) => Promise<TResult>): (...args: TArgs) => Promise<TResult>;
export function serialSingleFlightByKey<TArgs extends unknown[], TResult>(
  task: (...args: TArgs) => Promise<TResult>,
  keyForArgs: (...args: TArgs) => string,
): (...args: TArgs) => Promise<TResult>;
export function withExclusiveBrowserLock<TResult>(
  lockManager: { request(name: string, options: { mode: "exclusive" }, task: () => Promise<TResult>): Promise<TResult> } | undefined,
  name: string,
  task: () => Promise<TResult>,
): Promise<TResult>;
export interface FieldMutationResponse<T = Record<string, unknown>> {
  status: "applied" | "replayed";
  resource: "jobs" | "cloud_collections";
  sourceId: string;
  collectionKey?: string;
  version: number;
  sourceUpdatedAt: string;
  payload: T & { id: string; status?: string };
}
export function validateFieldMutationResponse<T extends Record<string, unknown>>(
  value: unknown,
  expected: { resource: "jobs" | "cloud_collections"; sourceId: string; collectionKey?: string; requestedStatus?: unknown },
): FieldMutationResponse<T>;
export function makeTombstone(input: { currentVersion?: number; userId?: string; deletedAt: string }): { version: number; deleted_at: string; updated_at: string; updated_by?: string };
export function pendingImports<T extends { id: string; updatedAt?: string }>(records: T[], existingRows: Array<{ source_id: string; source_updated_at?: string; deleted_at?: string | null }>): T[];
export function applyLocalCrud<T extends { id: string }>(records: T[], operation: { type: "remove"; id: string } | { type: "save"; record: T }): T[];
export function queueModeChange<T extends QueueIdentity>(input: { mode: "local" | "migration" | "cloud"; online: boolean; queue: T[]; change: T }): { queue: T[]; status: "Synced" | "Pending" | "Offline" };
export function cloudRowsToCache<T>(rows: Array<{ source_id: string; version?: number; deleted_at?: string | null; payload: T }>): T[];
export function retainVersionConflict<T extends QueueIdentity & { expectedVersion?: number }>(queue: T[], change: T, currentVersion?: number): T[];
export function retainPatchConflict<T extends QueueIdentity>(queue: T[], change: T, currentVersion: number, affectedRowCount: number): T[];
export function retainProjectionMutationConflict<T extends QueueIdentity>(queue: T[], change: T, error?: string): T[];
export function retainDeletedRecordConflict<T extends QueueIdentity>(queue: T[], change: T): T[];
