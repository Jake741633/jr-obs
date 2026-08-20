import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canAccessPath } from "../lib/cloud/permissions.ts";

const layout = readFileSync(new URL("../app/planner/layout.tsx", import.meta.url), "utf8");
const planner = readFileSync(new URL("../app/planner/page.tsx", import.meta.url), "utf8");
const dayPlanner = readFileSync(new URL("../app/field/day-planner/page.tsx", import.meta.url), "utf8");
const secureBoundary = readFileSync(new URL("../supabase/migrations/20260813235633_secure_field_mutation_boundary.sql", import.meta.url), "utf8");
const assignmentGuard = readFileSync(new URL("../supabase/migrations/20260810_064_preserve_planner_history_team_lifecycle.sql", import.meta.url), "utf8");

test("field accounts receive a planner handoff before the office planner mounts", () => {
  assert.equal(canAccessPath("electrician", "/planner"), true, "the route stays reachable for an explicit handoff");
  assert.match(layout, /mode !== "local" && identity\?\.role === "electrician"/);
  assert.match(layout, /Office scheduling is read-only for field accounts/);
  assert.match(layout, /href="\/field\/day-planner"/);
  const guardIndex = layout.indexOf("if (fieldCloudMode)");
  const childrenIndex = layout.lastIndexOf("return children;");
  assert.ok(guardIndex >= 0 && guardIndex < childrenIndex, "the field guard must return before rendering planner children");
});

test("the full resource planner retains office-controlled scheduling mutations", () => {
  assert.match(planner, /recurringDates\(/);
  assert.match(planner, /teamMemberIds: form\.teamMemberIds/);
  assert.match(planner, /vehicleId: form\.vehicleId/);
  assert.match(planner, /function moveEntry/);
  assert.match(planner, /function markStarted/);
  assert.match(planner, /entries\.setItems/);
  assert.match(planner, /jobs\.setItems/);
});

test("planner RLS remains narrower than the office scheduling page", () => {
  assert.match(secureBoundary, /create policy planner_entries_field_insert/);
  assert.match(secureBoundary, /private\.planner_entry_includes_current_team_member\(payload\)/);
  assert.match(secureBoundary, /private\.jr_field_record_targets_assigned_job\(/);
  assert.match(assignmentGuard, /Electricians may create planner entries assigned only to themselves/);
  assert.match(assignmentGuard, /Electricians cannot change planner team assignments/);
});

test("the dedicated engineer day planner retains the supported field workflow", () => {
  assert.equal(canAccessPath("electrician", "/field/day-planner"), true);
  assert.match(dayPlanner, /fieldOperatorMemberId\(\{/);
  assert.match(dayPlanner, /cloudFieldMode && !entry\.jobId/);
  assert.match(dayPlanner, /normaliseJobStatus\(job\.status\) === "Scheduled"/);
  assert.match(dayPlanner, /timesheets\.setItems/);
  assert.equal(canAccessPath("office", "/planner"), true);
  assert.equal(canAccessPath("owner", "/planner"), true);
  assert.equal(canAccessPath("admin", "/planner"), true);
});
