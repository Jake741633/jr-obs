import type { Customer, FleetVehicle, Job, PlannerEntry, TeamMember } from "./models";

export type DiaryView = "day" | "week" | "month";
export type VisitPhase = "General" | "First fix" | "Second fix" | "Maintenance" | "Inspection" | "Follow-up";
export type RecurrenceFrequency = "None" | "Weekly" | "Monthly";

export interface ScheduledPlannerEntry extends PlannerEntry {
  endDate?: string;
  estimatedDurationMinutes?: number;
  vehicleId?: string;
  visitPhase?: VisitPhase;
  recurrence?: RecurrenceFrequency;
  recurrenceCount?: number;
  recurrenceGroupId?: string;
}

export interface ScheduleClash {
  entryId: string;
  otherEntryId: string;
  kind: "Staff" | "Vehicle" | "Job";
  label: string;
}

export const plannerStorageKey = "jr-os-planner";

/** Read-only calendar navigation accepts only an actual, unambiguous ISO day. */
export function plannerViewDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function plannerDateKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Date-only arithmetic has no timezone offset; monthly shifts clamp to the destination month. */
export function shiftPlannerDate(date: string, amount: number, view: DiaryView = "day") {
  if (!plannerViewDate(date) || !Number.isSafeInteger(amount)) return null;
  const value = new Date(`${date}T00:00:00Z`);
  if (view === "month") {
    const day = value.getUTCDate();
    value.setUTCMonth(value.getUTCMonth() + amount, 1);
    const last = new Date(value);
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
    value.setUTCDate(Math.min(day, last.getUTCDate()));
  } else value.setUTCDate(value.getUTCDate() + amount * (view === "week" ? 7 : 1));
  return Number.isFinite(value.getTime()) ? plannerViewDate(value.toISOString().slice(0, 10)) : null;
}

export function entryEndDate(entry: ScheduledPlannerEntry) {
  return entry.endDate || entry.date;
}

export function plannerEntryDatesValid(entry: ScheduledPlannerEntry) {
  return Boolean(plannerViewDate(entry.date) && plannerViewDate(entryEndDate(entry)) && entry.date <= entryEndDate(entry));
}

/** Saved work visits only; history and other appointment types cannot book a next job visit. */
export function jobVisitPlan(jobId: string, entries: ScheduledPlannerEntry[], today = plannerDateKey()) {
  const upcoming: ScheduledPlannerEntry[] = [];
  const uncertain: ScheduledPlannerEntry[] = [];
  if (!jobId.trim()) return { upcoming, uncertain };
  for (const entry of entries) {
    if (entry.jobId !== jobId || entry.type !== "Job" || ["Complete", "Cancelled"].includes(entry.status)) continue;
    const end = entryEndDate(entry);
    if (!plannerViewDate(today) || !plannerEntryDatesValid(entry)) {
      uncertain.push(entry);
    } else if (end >= today) {
      if (["Planned", "Confirmed"].includes(entry.status)) upcoming.push(entry);
      else uncertain.push(entry);
    }
  }
  return { upcoming, uncertain };
}

export function dateRangeOverlaps(a: ScheduledPlannerEntry, b: ScheduledPlannerEntry) {
  return plannerEntryDatesValid(a) && plannerEntryDatesValid(b) && a.date <= entryEndDate(b) && b.date <= entryEndDate(a);
}

function minutes(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

/** Uncertain timing needs review, never an inferred time interval or clash. */
export function plannerVisitReviewIssues(entry: ScheduledPlannerEntry) {
  const issues: string[] = [];
  if (!plannerEntryDatesValid(entry)) issues.push("Start/end dates are missing, invalid or reversed.");
  const start = minutes(entry.startTime), end = minutes(entry.endTime);
  if (start === null || end === null) issues.push("Start/end times are missing or invalid; no timed clash can be confirmed.");
  else if (start >= end) issues.push("End time must be after start time; overnight timing needs a separate review.");
  if (!["Planned", "Confirmed", "Complete", "Cancelled"].includes(entry.status)) issues.push(`Unsupported visit status: ${entry.status || "Missing"}.`);
  return issues;
}

export function timeRangeOverlaps(a: ScheduledPlannerEntry, b: ScheduledPlannerEntry) {
  if (!dateRangeOverlaps(a, b)) return false;
  const aStart = minutes(a.startTime), aEnd = minutes(a.endTime);
  const bStart = minutes(b.startTime), bEnd = minutes(b.endTime);
  if (aStart === null || aEnd === null || bStart === null || bEnd === null || aStart >= aEnd || bStart >= bEnd) return false;
  return aStart < bEnd && bStart < aEnd;
}

export function detectScheduleClashes(entries: ScheduledPlannerEntry[], team: TeamMember[], vehicles: FleetVehicle[]) {
  const clashes: ScheduleClash[] = [];
  const active = entries.filter((entry) => ["Planned", "Confirmed"].includes(entry.status) && !plannerVisitReviewIssues(entry).length);
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i];
      const b = active[j];
      if (!timeRangeOverlaps(a, b)) continue;
      for (const memberId of new Set(a.teamMemberIds.filter((id) => b.teamMemberIds.includes(id)))) {
        clashes.push({ entryId: a.id, otherEntryId: b.id, kind: "Staff", label: team.find((item) => item.id === memberId)?.name || "Assigned worker" });
      }
      if (a.vehicleId && a.vehicleId === b.vehicleId) {
        clashes.push({ entryId: a.id, otherEntryId: b.id, kind: "Vehicle", label: vehicles.find((item) => item.id === a.vehicleId)?.registration || "Assigned vehicle" });
      }
      if (a.jobId && a.jobId === b.jobId) clashes.push({ entryId: a.id, otherEntryId: b.id, kind: "Job", label: "Overlapping visits for the same job" });
    }
  }
  return clashes;
}

export function recurringDates(startDate: string, frequency: RecurrenceFrequency, count: number) {
  if (!plannerViewDate(startDate) || !["None", "Weekly", "Monthly"].includes(frequency)) return [];
  if (frequency === "None") return [startDate];
  const safeCount = Math.max(1, Math.min(24, Number.isFinite(count) ? Math.trunc(count) : 1));
  const dates = Array.from({ length: safeCount }, (_, index) => shiftPlannerDate(startDate, index, frequency === "Weekly" ? "week" : "month"));
  return dates.every((date): date is string => date !== null) ? dates : [];
}

export function entryCustomer(entry: ScheduledPlannerEntry, jobs: Job[], customers: Customer[]) {
  const job = jobs.find((item) => item.id === entry.jobId);
  return customers.find((item) => item.id === (entry.customerId || job?.customerId));
}

export function dateWithinView(date: string, anchor: string, view: DiaryView, endDate = date) {
  if (!plannerViewDate(date) || !plannerViewDate(endDate) || !plannerViewDate(anchor) || endDate < date) return false;
  if (view === "day") return date <= anchor && endDate >= anchor;
  const anchorDate = new Date(`${anchor}T00:00:00Z`);
  const start = new Date(anchorDate);
  const end = new Date(anchorDate);
  if (view === "week") {
    const mondayOffset = (anchorDate.getUTCDay() + 6) % 7;
    start.setUTCDate(anchorDate.getUTCDate() - mondayOffset);
    end.setTime(start.getTime());
    end.setUTCDate(start.getUTCDate() + 6);
  } else {
    start.setUTCDate(1);
    end.setUTCMonth(start.getUTCMonth() + 1, 0);
  }
  const entryStart = new Date(`${date}T00:00:00Z`);
  const entryEnd = new Date(`${endDate}T00:00:00Z`);
  return entryStart <= end && entryEnd >= start;
}
