import type { Job } from "./models";

export function hasSavedIdentity(id: unknown): id is string {
  return typeof id === "string" && Boolean(id.trim());
}

export function savedIdentityIndex<T extends { id: string }>(records: T[]) {
  const counts = new Map<string, number>();
  for (const record of records) if (hasSavedIdentity(record.id)) counts.set(record.id, (counts.get(record.id) || 0) + 1);
  const selectable = records.filter((record) => hasSavedIdentity(record.id) && counts.get(record.id) === 1);
  return { counts, selectable, unique: new Map(selectable.map((record) => [record.id, record])), unusableCount: records.length - selectable.length };
}

export function assistantJobIdentityIndex(jobs: Job[]) {
  const { counts, selectable } = savedIdentityIndex(jobs);
  return { counts, selectable, uniqueJobs: new Map(selectable.map((job) => [job.id, job])), unusableCount: jobs.length - selectable.length };
}
