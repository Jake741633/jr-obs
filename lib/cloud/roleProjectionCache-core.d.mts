export type RoleProjectionCacheMode = "local" | "cloud" | "migration";

export interface RoleProjectionCacheInput<T> {
  storageKey: string;
  role?: string;
  mode: RoleProjectionCacheMode;
  records: T[];
}

export const ELECTRICIAN_VARIATION_TIMELINE_NOTE: "Variation status updated.";
export function sanitizeRoleProjectionCache<T>(input: RoleProjectionCacheInput<T>): T[];
