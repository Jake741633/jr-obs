export type RoleProjectionCacheMode = "local" | "cloud" | "migration";

export interface RoleProjectionCacheInput<T> {
  storageKey: string;
  role?: string;
  mode: RoleProjectionCacheMode;
  records: T[];
}

export const ELECTRICIAN_VARIATION_TIMELINE_NOTE: "Variation status updated.";
export const ELECTRICIAN_CUSTOMER_PROJECTION_CACHE_GENERATION: "20260820150000";
export const ELECTRICIAN_JOB_DOCUMENT_CACHE_GENERATION: "20260820153000";
export const ELECTRICIAN_JOB_MATERIAL_USAGE_CACHE_GENERATION: "20260826110301";
export const ELECTRICIAN_JOB_PROGRESS_CACHE_GENERATION: "20260826104958";
export const ELECTRICIAN_JOB_PROJECTION_CACHE_GENERATION: "20260820143000";
export const ELECTRICIAN_JOB_QA_INSPECTION_CACHE_GENERATION: "20260826120037";
export const ELECTRICIAN_JOB_TASK_CACHE_GENERATION: "20260826114300";
export const ELECTRICIAN_JOB_TIMELINE_CACHE_GENERATION: "20260820160000";
export const ELECTRICIAN_JOB_VARIATION_CACHE_GENERATION: "20260826101908";
export const ELECTRICIAN_SITE_DIARY_CACHE_GENERATION: "20260820163000";
export const CUSTOMER_PROJECTION_CACHE_GENERATION: "20260814091500";
export function roleProjectionCacheGeneration(input: Pick<RoleProjectionCacheInput<never>, "storageKey" | "role">): string | undefined;
export function roleProjectionCachePolicy(input: Omit<RoleProjectionCacheInput<never>, "records"> & { generation?: string }): "keep" | "purge";
export function sanitizeRoleProjectionCache<T>(input: RoleProjectionCacheInput<T>): T[];
