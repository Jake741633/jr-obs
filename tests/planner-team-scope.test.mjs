import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_055_planner_team_scope.sql", import.meta.url),
  "utf8",
);
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");

function policyBody(name) {
  const start = migration.indexOf(`create policy ${name}`);
  const nextDrop = migration.indexOf("drop policy if exists", start);
  return migration.slice(start, nextDrop === -1 ? migration.length : nextDrop);
}

test("planner assignment helper resolves field visibility from teamMemberIds", () => {
  assert.match(migration, /create or replace function private\.planner_entry_includes_current_team_member\(record_payload jsonb\)/i);
  assert.match(migration, /jsonb_typeof\(record_payload -> 'teamMemberIds'\) = 'array'/i);
  assert.match(migration, /\(record_payload -> 'teamMemberIds'\) \? private\.current_team_member_source_id\(\)/i);
  assert.match(migration, /coalesce\([\s\S]*false[\s\S]*\)/i);
});

test("planner reads expose only assigned entries to electricians", () => {
  const selectPolicy = policyBody("planner_entries_select");
  assert.match(selectPolicy, /deleted_at is null/i);
  assert.match(selectPolicy, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(selectPolicy, /private\.can_manage_office_data\(\)/i);
  assert.match(selectPolicy, /private\.current_jr_role\(\) = 'electrician'/i);
  assert.match(selectPolicy, /private\.planner_entry_includes_current_team_member\(payload\)/i);
});

test("field planner inserts require authenticated actor and self assignment", () => {
  const insertPolicy = policyBody("planner_entries_field_insert");
  assert.match(insertPolicy, /created_by = \(select auth\.uid\(\)\)/i);
  assert.match(insertPolicy, /updated_by = \(select auth\.uid\(\)\)/i);
  assert.match(insertPolicy, /private\.can_manage_office_data\(\)/i);
  assert.match(insertPolicy, /private\.current_jr_role\(\) = 'electrician'/i);
  assert.match(insertPolicy, /private\.planner_entry_includes_current_team_member\(payload\)/i);
});

test("field planner updates cannot remove the authenticated assignment", () => {
  const updatePolicy = policyBody("planner_entries_field_update");
  const assignmentChecks = updatePolicy.match(/private\.planner_entry_includes_current_team_member\(payload\)/gi) ?? [];
  assert.equal(assignmentChecks.length, 2, "USING and WITH CHECK must both require current team assignment");
  assert.match(updatePolicy, /using \([\s\S]*private\.can_manage_office_data\(\)/i);
  assert.match(updatePolicy, /with check \([\s\S]*private\.can_manage_office_data\(\)/i);
});

test("planner assignment helper is not exposed anonymously and recovery reapplies it", () => {
  assert.match(migration, /revoke execute on function private\.planner_entry_includes_current_team_member\(jsonb\)[\s\S]*from public, anon/i);
  assert.match(migration, /grant execute on function private\.planner_entry_includes_current_team_member\(jsonb\)[\s\S]*to authenticated, service_role/i);
  assert.match(recovery, /20260809_055_planner_team_scope\.sql/i);
});
