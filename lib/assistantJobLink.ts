function validJobId(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= 300;
}

export function assistantJobBriefingHref(jobId: string) {
  return validJobId(jobId) ? `/ai/assistant?job=${encodeURIComponent(jobId)}` : null;
}

/** A link chooses only a loaded record; it cannot create one or run a command. */
export function assistantJobFromLink(search: string): { jobId: string | null } | null {
  const ids = new URLSearchParams(search).getAll("job");
  if (!ids.length) return null;
  return { jobId: ids.length === 1 && validJobId(ids[0]) ? ids[0] : null };
}
