export function fieldTimerState(form) {
  const jobId = String(form?.jobId ?? "");
  const startedAt = String(form?.startedAt ?? "");
  const finishedAt = String(form?.finishedAt ?? "");
  if (!jobId || !startedAt) return { jobId: "", state: "idle", startedAt: "", finishedAt: "" };
  return {
    jobId,
    state: finishedAt ? "stopped" : "running",
    startedAt,
    finishedAt,
  };
}

export function fieldTimerStartBlock(form, nextJobId) {
  const timer = fieldTimerState(form);
  if (timer.state === "idle") return null;
  if (timer.jobId === nextJobId && timer.state === "running") return "already-running";
  if (timer.jobId === nextJobId && timer.state === "stopped") return "save-current";
  return timer.state === "running" ? "stop-current" : "save-current";
}

export function canStopFieldTimer(form, jobId) {
  const timer = fieldTimerState(form);
  return timer.state === "running" && timer.jobId === jobId;
}
