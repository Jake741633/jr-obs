export const canonicalJobStatuses = [
  "Enquiry",
  "Survey required",
  "Quoted",
  "Accepted",
  "Awaiting deposit",
  "Scheduled",
  "First fix",
  "Awaiting builder",
  "Second fix",
  "Testing",
  "Snagging",
  "Complete",
  "Invoiced",
  "Paid",
  "On hold",
  "Cancelled",
];

const legacyStatusMap = {
  Lead: "Enquiry",
  "In progress": "First fix",
};

const closedStatuses = new Set(["Complete", "Invoiced", "Paid", "Cancelled"]);
const inactiveStatuses = new Set([...closedStatuses, "On hold"]);
const onSiteStatuses = new Set(["First fix", "Awaiting builder", "Second fix", "Testing", "Snagging"]);

export function normaliseJobStatus(status) {
  if (canonicalJobStatuses.includes(status)) return status;
  return legacyStatusMap[status] ?? "Enquiry";
}

export function isCanonicalJobStatus(status) {
  return canonicalJobStatuses.includes(status);
}

export function isJobClosedStatus(status) {
  return closedStatuses.has(normaliseJobStatus(status));
}

export function isJobInactiveStatus(status) {
  return inactiveStatuses.has(normaliseJobStatus(status));
}

export function isJobOnSiteStatus(status) {
  return onSiteStatuses.has(normaliseJobStatus(status));
}

export function transitionJobStatus({ job, nextStatus, now, timelineId, completedBy }) {
  if (!isCanonicalJobStatus(nextStatus)) throw new Error(`Unsupported job status: ${nextStatus}`);
  const fromStatus = normaliseJobStatus(job.status);
  const updatedJob = { ...job, status: nextStatus, updatedAt: now };
  if (fromStatus === nextStatus) return { job: updatedJob, timelineEntry: null };

  return {
    job: updatedJob,
    timelineEntry: {
      id: timelineId,
      jobId: job.id,
      milestone: nextStatus === "Complete" ? "Job completed" : "Custom update",
      eventType: "Status change",
      sourceId: job.id,
      sourceType: "Job",
      fromStatus,
      toStatus: nextStatus,
      note: `Job status changed from ${fromStatus} to ${nextStatus}.`,
      completedBy: completedBy || "JR OS",
      completedAt: now,
      createdAt: now,
    },
  };
}

export function initialJobTimelineEntry({ job, now, timelineId, completedBy }) {
  const status = normaliseJobStatus(job.status);
  return {
    id: timelineId,
    jobId: job.id,
    milestone: "Job created",
    eventType: "Status change",
    sourceId: job.id,
    sourceType: "Job",
    toStatus: status,
    note: `Job created with status ${status}.`,
    completedBy: completedBy || "JR OS",
    completedAt: now,
    createdAt: now,
  };
}

export function newestJobActivityFirst(entries) {
  return [...entries].sort((left, right) => {
    const leftDate = left.completedAt || left.createdAt || "";
    const rightDate = right.completedAt || right.createdAt || "";
    return rightDate.localeCompare(leftDate) || String(right.id).localeCompare(String(left.id));
  });
}

export function normaliseSiteDiaryEntry(entry) {
  return {
    ...entry,
    staffPresent: entry.staffPresent ?? [],
    otherStaffPresent: entry.otherStaffPresent ?? "",
    builderInstructions: entry.builderInstructions ?? "",
    customerInstructions: entry.customerInstructions ?? entry.customerRequests ?? "",
    materialsRequired: entry.materialsRequired ?? "",
    photos: entry.photos ?? [],
    photoDocumentIds: entry.photoDocumentIds ?? [],
    voiceNoteTranscript: entry.voiceNoteTranscript ?? entry.voiceNotes ?? "",
    weather: entry.weather ?? "",
    issuesAndRisks: entry.issuesAndRisks ?? entry.delays ?? "",
    followUpActions: entry.followUpActions ?? "",
  };
}

export function siteDiaryDurationHours(entry) {
  if (!entry.workDate || !entry.startedAt || !entry.finishedAt) return 0;
  const start = new Date(`${entry.workDate}T${entry.startedAt}`).getTime();
  const finish = new Date(`${entry.workDate}T${entry.finishedAt}`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(finish)) return 0;
  return Math.max(0, (finish - start) / 3_600_000 - Math.max(0, Number(entry.breakMinutes) || 0) / 60);
}

export function siteDiaryTimelineEntry({ entry, timelineId, completedBy, now }) {
  const details = [
    entry.workCompleted?.trim() || "Site diary recorded.",
    entry.delays?.trim() ? `Delays: ${entry.delays.trim()}` : "",
    entry.followUpActions?.trim() ? `Follow-up: ${entry.followUpActions.trim()}` : "",
  ].filter(Boolean).join(" ");
  return {
    id: timelineId,
    jobId: entry.jobId,
    milestone: "Custom update",
    eventType: "Site diary",
    sourceId: entry.id,
    sourceType: "SiteDiaryEntry",
    note: details,
    completedBy: completedBy || entry.completedBy || "JR OS",
    completedAt: entry.updatedAt || now,
    createdAt: now,
  };
}
