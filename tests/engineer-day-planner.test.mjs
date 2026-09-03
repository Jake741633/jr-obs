import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canStopDayPlannerVisit, dayPlannerSummary, dayPlannerVisitStartBlock, fieldDayPlannerWriteAllowed, formatMinutes, minutesBetween, paidMinutes, sequenceDayEntries } from "../lib/engineerDayPlanner-core.mjs";

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

test("one visit owns the running or stopped-unsaved time log", () => {
  const startCases = [
    { activeEntryId: null, nextEntryId: "visit-b", finishedAt: "", expected: null },
    { activeEntryId: "visit-a", nextEntryId: "visit-a", finishedAt: "", expected: "already-running" },
    { activeEntryId: "visit-a", nextEntryId: "visit-b", finishedAt: "", expected: "stop-current" },
    { activeEntryId: "visit-a", nextEntryId: "visit-a", finishedAt: "09:00", expected: "save-current" },
    { activeEntryId: "visit-a", nextEntryId: "visit-b", finishedAt: "09:00", expected: "save-current" },
  ];
  for (const { activeEntryId, nextEntryId, finishedAt, expected } of startCases) {
    assert.equal(dayPlannerVisitStartBlock(activeEntryId, nextEntryId, finishedAt), expected);
  }

  assert.equal(canStopDayPlannerVisit({ activeEntryId: "visit-a", entryId: "visit-a", startedAt: "08:00", finishedAt: "" }), true);
  assert.equal(canStopDayPlannerVisit({ activeEntryId: "visit-a", entryId: "visit-b", startedAt: "08:00", finishedAt: "" }), false);
  assert.equal(canStopDayPlannerVisit({ activeEntryId: "visit-a", entryId: "visit-a", startedAt: "08:00", finishedAt: "09:00" }), false);
  assert.equal(canStopDayPlannerVisit({ activeEntryId: "visit-a", entryId: "visit-a", startedAt: "", finishedAt: "" }), false);
});

test("field day planner writes require the exact visit and job assignment", () => {
  const operatorMemberId = "field-1";
  const entry = { id: "visit-1", jobId: "job-1", customerId: "customer-1", teamMemberIds: ["field-1", "field-2"] };
  const job = { id: "job-1", customerId: "customer-1", assignedTo: ["field-2", "field-1"] };

  assert.equal(fieldDayPlannerWriteAllowed({ entry, job, operatorMemberId }), true);
  assert.equal(fieldDayPlannerWriteAllowed({
    entry: { ...entry, customerId: undefined, customerSourceId: "customer-1" },
    job: { ...job, customerId: undefined, customerSourceId: "customer-1" },
    operatorMemberId,
  }), true);
  assert.equal(fieldDayPlannerWriteAllowed({ entry: { ...entry, customerId: "customer-2" }, job, operatorMemberId }), false);
  assert.equal(fieldDayPlannerWriteAllowed({ entry: { ...entry, customerId: undefined }, job, operatorMemberId }), false);
  assert.equal(fieldDayPlannerWriteAllowed({ entry, job: { ...job, customerId: undefined }, operatorMemberId }), false);
  assert.equal(fieldDayPlannerWriteAllowed({
    entry: { ...entry, customerId: undefined },
    job: { ...job, customerId: undefined },
    operatorMemberId,
  }), true);
  assert.equal(fieldDayPlannerWriteAllowed({ entry: { ...entry, customerId: "" }, job: { ...job, customerId: "" }, operatorMemberId }), true);
  assert.equal(fieldDayPlannerWriteAllowed({ entry: { ...entry, customerId: "" }, job: { ...job, customerId: undefined }, operatorMemberId }), false);
  assert.equal(fieldDayPlannerWriteAllowed({ entry: { ...entry, jobId: "job-2" }, job, operatorMemberId }), false);
  assert.equal(fieldDayPlannerWriteAllowed({ entry: { ...entry, teamMemberIds: ["field-2"] }, job, operatorMemberId }), false);
  assert.equal(fieldDayPlannerWriteAllowed({ entry: { ...entry, teamMemberIds: undefined }, job, operatorMemberId }), false);
  assert.equal(fieldDayPlannerWriteAllowed({ entry, job: { ...job, assignedTo: ["field-2"] }, operatorMemberId }), false);
  assert.equal(fieldDayPlannerWriteAllowed({ entry, job: { ...job, assignedTo: undefined }, operatorMemberId }), false);
  assert.equal(fieldDayPlannerWriteAllowed({ entry, job, operatorMemberId: "" }), false);
  assert.equal(fieldDayPlannerWriteAllowed({ entry: null, job, operatorMemberId }), false);
  assert.equal(fieldDayPlannerWriteAllowed({ entry, job: null, operatorMemberId }), false);
});

test("day planner handlers cannot rebind or overwrite an unsaved visit", () => {
  const startEntry = page.slice(page.indexOf("function startEntry"), page.indexOf("function stopEntry"));
  const stopEntry = page.slice(page.indexOf("function stopEntry"), page.indexOf("function saveTime"));
  const saveTime = page.slice(page.indexOf("function saveTime"), page.indexOf("\n  return <div"));
  const startGuard = startEntry.indexOf("dayPlannerVisitStartBlock");
  assert.ok(startGuard >= 0);
  for (const mutation of ["setActiveEntryId", "planner.setItems", "jobs.setItems"]) {
    assert.ok(startGuard < startEntry.indexOf(mutation));
  }
  assert.match(startEntry, /startBlock === "already-running"/);
  assert.match(startEntry, /startBlock === "stop-current"/);
  assert.match(startEntry, /startBlock === "save-current"/);
  assert.match(stopEntry, /canStopDayPlannerVisit/);
  assert.doesNotMatch(stopEntry, /setActiveEntryId/);
  assert.match(saveTime, /activeEntryId !== entry\.id/);
  assert.match(page, /disabled=\{entry\.status === "Complete" \|\| Boolean\(labourAttempt\) \|\| Boolean\(visitStartBlock\)\}/);
  assert.match(page, /disabled=\{!canStopVisit\}/);
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
