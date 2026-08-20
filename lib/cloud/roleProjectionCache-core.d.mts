export type RoleProjectionCacheMode = "local" | "cloud" | "migration";

export interface RoleProjectionCacheInput<T> {
  storageKey: string;
  role?: string;
  mode: RoleProjectionCacheMode;
  records: T[];
}

export const ELECTRICIAN_VARIATION_TIMELINE_NOTE: "Variation status updated.";
export const ELECTRICIAN_CUSTOMER_PROJECTION_CACHE_GENERATION: "20260820150000";
export const ELECTRICIAN_JOB_PROJECTION_CACHE_GENERATION: "20260820143000";
export const CUSTOMER_PROJECTION_CACHE_GENERATION: "20260814091500";
export function roleProjectionCacheGeneration(input: Pick<RoleProjectionCacheInput<never>, "storageKey" | "role">): string | undefined;
export function roleProjectionCachePolicy(input: Omit<RoleProjectionCacheInput<never>, "records"> & { generation?: string }): "keep" | "purge";
export function sanitizeRoleProjectionCache<T>(input: RoleProjectionCacheInput<T>): T[];
