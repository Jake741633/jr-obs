import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canAccessPath } from "../lib/cloud/permissions.ts";

const plannerPage = readFileSync(new URL("../app/planner/page.tsx", import.meta.url), "utf8");
const fieldPlannerPage = readFileSync(new URL("../app/field/day-planner/page.tsx", import.meta.url), "utf8");
const plannerGuard = readFileSync(new URL("../supabase/migrations/20260810_064_preserve_planner_history_team_lifecycle.sql", import.meta.url), "utf8");

test("electricians use the dedicated field day planner instead of the office dispatch planner", () => {
  assert.equal(canAccessPath("electrician", "/planner"), false);
  assert.equal(canAccessPath("electrician", "/field/day-planner"), true);
  assert.equal(canAccessPath("office", "/planner"), true);
  assert.equal(canAccessPath("owner", "/planner"), true);
  assert.equal(canAccessPath("admin", "/planner"), true);
});

test("office planner exposes assignment controls that exceed the electrician planner contract", () => {
  assert.match(plannerPage, /teamMemberIds: \[\] as string\[\]/);
  assert.match(plannerPage, /function toggleMember\(id: string\)/);
  assert.match(plannerPage, /teamMemberIds: form\.teamMemberIds/);
  assert.match(plannerPage, /Add diary entry/);
  assert.match(plannerGuard, /Electricians may create planner entries assigned only to themselves/);
  assert.match(plannerGuard, /Electricians cannot change planner team assignments/);
});

test("field day planner does not advertise office dispatch to electricians", () => {
  assert.match(fieldPlannerPage, /import \{ canAccessPath \} from "\.\.\/\.\.\/\.\.\/lib\/cloud\/permissions"/);
  assert.match(fieldPlannerPage, /const unrestricted = identityState\.mode === "local" \|\| \(identityState\.mode === "migration" && !identityState\.identity\)/);
  assert.match(fieldPlannerPage, /const canOpenOfficePlanner = unrestricted \|\| canAccessPath\(identityState\.identity\?\.role, "\/planner", identityState\.identity\?\.email\)/);
  assert.equal((fieldPlannerPage.match(/canOpenOfficePlanner \? <Link href="\/planner"/g) ?? []).length, 2);
  assert.equal((fieldPlannerPage.match(/href="\/planner"/g) ?? []).length, 2);
  assert.match(fieldPlannerPage, /Office-managed booking/);
  assert.match(fieldPlannerPage, /No assigned visits are scheduled for this date/);
});
