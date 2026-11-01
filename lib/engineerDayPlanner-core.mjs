import { linkedSourceIds } from "./cloud/repository-core.mjs";

export function normaliseTime(value) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? value : "";
}

export function timeToMinutes(value) {
  const normalised = normaliseTime(value);
  if (!normalised) return 0;
  const [hours, minutes] = normalised.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesBetween(start, end) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (!startMinutes || !endMinutes || endMinutes < startMinutes) return 0;
  return endMinutes - startMinutes;
}

export function paidMinutes({ startedAt, finishedAt, breakMinutes = 0 }) {
  return Math.max(0, minutesBetween(startedAt, finishedAt) - Math.max(0, Number(breakMinutes || 0)));
}

export function formatMinutes(totalMinutes) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes || 0)));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function sequenceDayEntries(entries, date) {
  return entries
    .filter((entry) => entry.date === date && entry.status !== "Cancelled")
    .toSorted((left, right) => left.startTime.localeCompare(right.startTime) || left.title.localeCompare(right.title));
}

export function dayPlannerVisitStartBlock(activeEntryId, nextEntryId, finishedAt) {
  if (!activeEntryId) return null;
  if (activeEntryId === nextEntryId) return finishedAt ? "save-current" : "already-running";
  return finishedAt ? "save-current" : "stop-current";
}

export function canStopDayPlannerVisit({ activeEntryId, entryId, startedAt, finishedAt }) {
  return activeEntryId === entryId && Boolean(normaliseTime(startedAt)) && !finishedAt;
}

export function fieldDayPlannerWriteAllowed({ entry, job, operatorMemberId }) {
  const entryCustomerSourceId = linkedSourceIds(entry).customerSourceId ?? null;
  const jobCustomerSourceId = linkedSourceIds(job).customerSourceId ?? null;
  return Boolean(
    typeof operatorMemberId === "string"
      && operatorMemberId
      && entry
      && job
      && typeof entry.jobId === "string"
      && entry.jobId
      && entry.jobId === job.id
      && entryCustomerSourceId === jobCustomerSourceId
      && Array.isArray(entry.teamMemberIds)
      && entry.teamMemberIds.includes(operatorMemberId)
      && Array.isArray(job.assignedTo)
      && job.assignedTo.includes(operatorMemberId),
  );
}

export function dayPlannerSummary(entries, timesheets, date) {
  const scheduled = sequenceDayEntries(entries, date);
  const dayTimesheets = timesheets.filter((entry) => entry.workDate === date);
  const loggedJobIds = new Set(dayTimesheets.map((entry) => entry.jobId).filter(Boolean));
  const completed = scheduled.filter((entry) => entry.status === "Complete" || (entry.jobId && loggedJobIds.has(entry.jobId))).length;
  const minutes = dayTimesheets.reduce((total, entry) => total + paidMinutes(entry), 0);
  return { scheduled: scheduled.length, completed, remaining: Math.max(0, scheduled.length - completed), paidMinutes: minutes };
}

export function nextEntry(entries, date, nowTime) {
  return sequenceDayEntries(entries, date).find((entry) => entry.startTime >= nowTime && entry.status !== "Complete") ?? null;
}
