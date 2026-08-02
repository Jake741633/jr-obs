import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dayPlannerSummary, formatMinutes, minutesBetween, paidMinutes, sequenceDayEntries } from "../lib/engineerDayPlanner-core.mjs";

const page = readFileSync(new URL("../app/field/day-planner/page.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../components/navigation.ts", import.meta.url), "utf8");

test("day planner sequences visits and ignores cancelled entries", () => {
  const entries = [
    { id: "late", title: "Late", date: "2026-08-02", startTime: "13:00", status: "Planned" },
    { id: "early", title: "Early", date: "2026-08-02", startTime: "08:00", status: "Confirmed" },
    { id: "cancelled", title: "Cancelled", date: "2026-08-02", startTime: "07:00", status: "Cancelled" },
  ];
  assert.deepEqual(sequenceDayEntries(entries, "2026-08-02").map((entry) => entry.id), ["early", "late"]);
});

test("arrival and departure calculations retain breaks", () => {
  assert.equal(minutesBetween("08:00", "16:30"), 510);
  assert.equal(paidMinutes({ startedAt: "08:00", finishedAt: "16:30", breakMinutes: 30 }), 480);
  assert.equal(formatMinutes(480), "8h");
  assert.equal(formatMinutes(495), "8h 15m");
});

test("day summary combines completed bookings and timesheet logs", () => {
  const entries = [
    { id: "one", title: "One", date: "2026-08-02", startTime: "08:00", status: "Complete", jobId: "job-1" },
    { id: "two", title: "Two", date: "2026-08-02", startTime: "11:00", status: "Planned", jobId: "job-2" },
  ];
  const timesheets = [{ id: "time", workDate: "2026-08-02", jobId: "job-2", startedAt: "11:00", finishedAt: "13:00", breakMinutes: 0 }];
  assert.deepEqual(dayPlannerSummary(entries, timesheets, "2026-08-02"), { scheduled: 2, completed: 2, remaining: 0, paidMinutes: 120 });
});

test("mobile engineer day planner reuses typed collections and existing routes", () => {
  assert.match(page, /usePlannerCollection\(\)/);
  assert.match(page, /useTimesheetsCollection\(\)/);
  assert.match(page, /useJobsCollection\(\)/);
  assert.match(page, /type="button"/);
  assert.match(page, /Save time and complete visit/);
  assert.match(navigation, /\["Engineer Day Planner", "\/field\/day-planner"\]/);
});
