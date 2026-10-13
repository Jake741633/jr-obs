import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prioritiseSnags, snagSummary } from "../lib/mobileSnagControl-core.mjs";

const tasks = [
  { id: "1", jobId: "job-1", type: "Snag", title: "Urgent overdue", priority: "Urgent", dueDate: "2026-08-01", status: "Open" },
  { id: "2", jobId: "job-1", type: "Snag", title: "Completed", priority: "High", dueDate: "2026-07-30", status: "Completed" },
  { id: "3", jobId: "job-1", type: "Task", title: "Not a snag", priority: "Urgent", dueDate: "2026-07-30", status: "Open" },
  { id: "4", jobId: "job-2", type: "Snag", title: "Other job", priority: "Urgent", dueDate: "2026-07-30", status: "Open" },
];

test("snag summary scopes counts to one job", () => {
  assert.deepEqual(snagSummary(tasks, "job-1", "2026-08-02"), { total: 2, outstanding: 1, completed: 1, overdue: 1, urgent: 1 });
});

test("mobile snag ordering keeps open overdue urgent work first", () => {
  const ordered = prioritiseSnags(tasks.filter((task) => task.jobId === "job-1"), "2026-08-02");
  assert.deepEqual(ordered.map((task) => task.id), ["1", "2"]);
});

test("mobile snag control reuses cloud-aware job task and timeline collections", () => {
  const page = readFileSync(new URL("../app/field/snags/page.tsx", import.meta.url), "utf8");
  const navigation = readFileSync(new URL("../components/navigation.ts", import.meta.url), "utf8");
  assert.match(page, /useJobTasksCollection/);
  assert.match(page, /useJobTimelineCollection/);
  assert.match(page, /transitionJobTask/);
  assert.match(page, /jobTaskTimelineEntry/);
  assert.match(navigation, /Mobile Snag Control/);
  assert.match(navigation, /\/field\/snags/);
});
