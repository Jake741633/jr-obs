export interface TenantQueryInput { organisationId: string; sourceId?: string; collectionKey?: string; includeDeleted?: boolean; }
export interface QueueIdentity { table: string; sourceId: string; collectionKey?: string; }
export function collectionFilter(collectionKey?: string): string;
export function tenantRecordQuery(input: Required<Pick<TenantQueryInput, "organisationId" | "sourceId">> & Pick<TenantQueryInput, "collectionKey" | "includeDeleted">): string;
export function tenantListQuery(input: Pick<TenantQueryInput, "organisationId" | "collectionKey">): string;
export function hasVersionConflict(currentVersion?: number, expectedVersion?: number): boolean;
export function linkedSourceIds(payload: unknown): { customerSourceId?: string; jobSourceId?: string };
export function coalesceQueue<T extends QueueIdentity>(queue: T[], next: T): T[];
export function makeTombstone(input: { currentVersion?: number; userId?: string; deletedAt: string }): { version: number; deleted_at: string; updated_at: string; updated_by?: string };
export function pendingImports<T extends { id: string; updatedAt?: string }>(records: T[], existingRows: Array<{ source_id: string; source_updated_at?: string; deleted_at?: string | null }>): T[];
