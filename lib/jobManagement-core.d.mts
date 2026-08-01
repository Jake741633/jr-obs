import type { CanonicalJobStatus, Job, JobStatus, JobTimelineEntry } from "./models";

export const canonicalJobStatuses: readonly CanonicalJobStatus[];
export function normaliseJobStatus(status: JobStatus | string): CanonicalJobStatus;
export function isCanonicalJobStatus(status: string): status is CanonicalJobStatus;
export function isJobClosedStatus(status: JobStatus | string): boolean;
export function isJobInactiveStatus(status: JobStatus | string): boolean;
export function isJobOnSiteStatus(status: JobStatus | string): boolean;
export function transitionJobStatus(input: { job: Job; nextStatus: CanonicalJobStatus; now: string; timelineId: string; completedBy?: string }): { job: Job & { status: CanonicalJobStatus }; timelineEntry: JobTimelineEntry | null };
export function initialJobTimelineEntry(input: { job: Job; now: string; timelineId: string; completedBy?: string }): JobTimelineEntry;
export function newestJobActivityFirst<T extends Pick<JobTimelineEntry, "id" | "completedAt" | "createdAt">>(entries: T[]): T[];
