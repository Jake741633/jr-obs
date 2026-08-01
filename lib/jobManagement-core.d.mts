import type { CanonicalJobStatus, Job, JobStatus, JobTimelineEntry, SiteDiaryEntry } from "./models";

export const canonicalJobStatuses: readonly CanonicalJobStatus[];
export function normaliseJobStatus(status: JobStatus | string): CanonicalJobStatus;
export function isCanonicalJobStatus(status: string): status is CanonicalJobStatus;
export function isJobClosedStatus(status: JobStatus | string): boolean;
export function isJobInactiveStatus(status: JobStatus | string): boolean;
export function isJobOnSiteStatus(status: JobStatus | string): boolean;
export function transitionJobStatus(input: { job: Job; nextStatus: CanonicalJobStatus; now: string; timelineId: string; completedBy?: string }): { job: Job & { status: CanonicalJobStatus }; timelineEntry: JobTimelineEntry | null };
export function initialJobTimelineEntry(input: { job: Job; now: string; timelineId: string; completedBy?: string }): JobTimelineEntry;
export function newestJobActivityFirst<T extends Pick<JobTimelineEntry, "id" | "completedAt" | "createdAt">>(entries: T[]): T[];
export function normaliseSiteDiaryEntry(entry: SiteDiaryEntry): SiteDiaryEntry & Required<Pick<SiteDiaryEntry, "staffPresent" | "otherStaffPresent" | "builderInstructions" | "customerInstructions" | "materialsRequired" | "photos" | "photoDocumentIds" | "voiceNoteTranscript" | "weather" | "issuesAndRisks" | "followUpActions">>;
export function siteDiaryDurationHours(entry: Pick<SiteDiaryEntry, "workDate" | "startedAt" | "finishedAt" | "breakMinutes">): number;
export function siteDiaryTimelineEntry(input: { entry: SiteDiaryEntry; timelineId: string; completedBy?: string; now: string }): JobTimelineEntry;
