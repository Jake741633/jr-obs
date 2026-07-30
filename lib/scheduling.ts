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

export function entryEndDate(entry: ScheduledPlannerEntry) {
  return entry.endDate || entry.date;
}

export function dateRangeOverlaps(a: ScheduledPlannerEntry, b: ScheduledPlannerEntry) {
  return a.date <= entryEndDate(b) && b.date <= entryEndDate(a);
}

function minutes(value: string, fallback: number) {
  if (!value) return fallback;
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

export function timeRangeOverlaps(a: ScheduledPlannerEntry, b: ScheduledPlannerEntry) {
  if (!dateRangeOverlaps(a, b)) return false;
  const aStart = minutes(a.startTime, 0);
  const aEnd = minutes(a.endTime, aStart + (a.estimatedDurationMinutes || 60));
  const bStart = minutes(b.startTime, 0);
  const bEnd = minutes(b.endTime, bStart + (b.estimatedDurationMinutes || 60));
  return aStart < bEnd && bStart < aEnd;
}

export function detectScheduleClashes(entries: ScheduledPlannerEntry[], team: TeamMember[], vehicles: FleetVehicle[]) {
  const clashes: ScheduleClash[] = [];
  const active = entries.filter((entry) => entry.status !== "Cancelled");
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i];
      const b = active[j];
      if (!timeRangeOverlaps(a, b)) continue;
      for (const memberId of a.teamMemberIds.filter((id) => b.teamMemberIds.includes(id))) {
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

function addDate(date: string, amount: number, monthly = false) {
  const value = new Date(`${date}T12:00:00`);
  if (monthly) value.setMonth(value.getMonth() + amount);
  else value.setDate(value.getDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function recurringDates(startDate: string, frequency: RecurrenceFrequency, count: number) {
  const safeCount = Math.max(1, Math.min(24, count || 1));
  return Array.from({ length: safeCount }, (_, index) => frequency === "Weekly" ? addDate(startDate, index * 7) : frequency === "Monthly" ? addDate(startDate, index, true) : startDate);
}

export function entryCustomer(entry: ScheduledPlannerEntry, jobs: Job[], customers: Customer[]) {
  const job = jobs.find((item) => item.id === entry.jobId);
  return customers.find((item) => item.id === job?.customerId);
}

export function dateWithinView(date: string, anchor: string, view: DiaryView) {
  if (view === "day") return date === anchor;
  const anchorDate = new Date(`${anchor}T12:00:00`);
  const start = new Date(anchorDate);
  const end = new Date(anchorDate);
  if (view === "week") {
    const mondayOffset = (anchorDate.getDay() + 6) % 7;
    start.setDate(anchorDate.getDate() - mondayOffset);
    end.setDate(start.getDate() + 6);
  } else {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 0);
  }
  const value = new Date(`${date}T12:00:00`);
  return value >= start && value <= end;
}
