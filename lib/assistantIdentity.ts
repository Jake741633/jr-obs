import type { Job } from "./models";

export function hasSavedIdentity(id: unknown): id is string {
  return typeof id === "string" && Boolean(id.trim());
}

export function assistantJobIdentityIndex(jobs: Job[]) {
  const counts = new Map<string, number>();
  for (const job of jobs) if (hasSavedIdentity(job.id)) counts.set(job.id, (counts.get(job.id) || 0) + 1);
  const selectable = jobs.filter((job) => hasSavedIdentity(job.id) && counts.get(job.id) === 1);
  return { counts, selectable, uniqueJobs: new Map(selectable.map((job) => [job.id, job])), unusableCount: jobs.length - selectable.length };
}
