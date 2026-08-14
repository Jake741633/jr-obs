export type RoleProjectionCacheMode = "local" | "cloud" | "migration";

export interface RoleProjectionCacheInput<T> {
  storageKey: string;
  role?: string;
  mode: RoleProjectionCacheMode;
  records: T[];
}

export const ELECTRICIAN_VARIATION_TIMELINE_NOTE: "Variation status updated.";
export const CUSTOMER_PROJECTION_CACHE_GENERATION: "20260814091500";
export function customerProjectionCachePolicy(input: Omit<RoleProjectionCacheInput<never>, "records"> & { generation?: string }): "keep" | "purge";
export function sanitizeRoleProjectionCache<T>(input: RoleProjectionCacheInput<T>): T[];
