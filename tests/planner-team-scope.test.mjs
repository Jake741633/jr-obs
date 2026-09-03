import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_055_planner_team_scope.sql", import.meta.url),
  "utf8",
);
const assignmentGuardBase = readFileSync(
  new URL("../supabase/migrations/20260810_063_guard_planner_team_assignments.sql", import.meta.url),
  "utf8",
);
const lifecycleGuard = readFileSync(
  new URL("../supabase/migrations/20260810_064_preserve_planner_history_team_lifecycle.sql", import.meta.url),
  "utf8",
);
const assignmentGuard = lifecycleGuard;
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

test("planner assignment references resolve to unique same-organisation team members", () => {
  assert.match(assignmentGuard, /create or replace function private\.jr_planner_team_assignments_are_valid\(\s*target_organisation_id uuid,\s*record_payload jsonb\s*\)/i);
  assert.match(assignmentGuard, /jsonb_typeof\(record_payload -> 'teamMemberIds'\) = 'array'/i);
  assert.match(assignmentGuard, /count\(\*\) = count\(distinct assignment\.team_member_source_id\)/i);
  assert.match(assignmentGuard, /assignment\.team_member_source_id <> btrim\(assignment\.team_member_source_id\)/i);
  assert.match(assignmentGuard, /member\.organisation_id = target_organisation_id/i);
  assert.match(assignmentGuard, /member\.source_id = assignment\.team_member_source_id/i);
  assert.match(assignmentGuard, /Planner assignments must reference unique team members in the same organisation[\s\S]*errcode = '23503'/i);
});

test("new, changed, and reopened schedulable assignments lock live team members", () => {
  assert.match(assignmentGuard, /create or replace function private\.jr_planner_team_assignments_are_live\([\s\S]*member\.deleted_at is null/i);
  assert.match(assignmentGuard, /require_live_assignments := new\.deleted_at is null/i);
  assert.match(assignmentGuard, /old\.deleted_at is not null[\s\S]*or assignments_changed/i);
  assert.match(lifecycleGuard, /require_live_assignments := new\.deleted_at is null[\s\S]*jr_planner_entry_blocks_team_member_deletion\(new\.payload\)/i);
  assert.match(lifecycleGuard, /private\.jr_planner_team_assignments_are_live\(new\.organisation_id, new\.payload\)/i);
  assert.match(lifecycleGuard, /member\.organisation_id = new\.organisation_id[\s\S]*member\.source_id = assignment_id[\s\S]*member\.deleted_at is null[\s\S]*for no key update/i);
  assert.match(lifecycleGuard, /New or schedulable planner assignments must reference non-deleted team members in the same organisation[\s\S]*errcode = '23503'/i);
});

test("electrician planner inserts are self-only and assignment updates are immutable", () => {
  assert.match(assignmentGuard, /private\.current_jr_role\(\) = 'electrician'[\s\S]*tg_op = 'INSERT'/i);
  assert.match(assignmentGuard, /jsonb_array_length\(new\.payload -> 'teamMemberIds'\) <> 1/i);
  assert.match(assignmentGuard, /new\.payload -> 'teamMemberIds' ->> 0 is distinct from actor_team_member_source_id/i);
  assert.match(assignmentGuard, /assignments_changed := new\.payload -> 'teamMemberIds'[\s\S]*is distinct from old\.payload -> 'teamMemberIds'/i);
  assert.match(assignmentGuard, /Electricians may create planner entries assigned only to themselves[\s\S]*errcode = '42501'/i);
  assert.match(assignmentGuard, /Electricians cannot change planner team assignments[\s\S]*errcode = '42501'/i);
});

test("planner assignment guard preserves tombstones and protects team-member lifecycle", () => {
  assert.match(lifecycleGuard, /from public\.planner_entries planner[\s\S]*where planner\.deleted_at is null[\s\S]*jr_planner_team_assignments_are_valid\(planner\.organisation_id, planner\.payload\)[\s\S]*jr_planner_entry_blocks_team_member_deletion\(planner\.payload\)[\s\S]*jr_planner_team_assignments_are_live\(planner\.organisation_id, planner\.payload\)[\s\S]*Cannot preserve planner history/i);
  assert.match(assignmentGuard, /new\.deleted_at is null or assignments_changed/i);
  assert.match(assignmentGuard, /create or replace function private\.jr_planner_entry_blocks_team_member_deletion\([\s\S]*not in \('Complete', 'Cancelled'\)/i);
  assert.match(assignmentGuard, /create or replace function private\.guard_jr_assigned_team_member_deletion\(\)[\s\S]*planner\.deleted_at is null[\s\S]*tg_op = 'DELETE'[\s\S]*jr_planner_entry_blocks_team_member_deletion\(planner\.payload\)[\s\S]*\(planner\.payload -> 'teamMemberIds'\) \? old\.source_id/i);
  assert.match(assignmentGuard, /Tombstone retained planner entries before permanently deleting this team member[\s\S]*Reassign schedulable planner entries before deleting this team member[\s\S]*errcode = '23503'/i);
  assert.match(assignmentGuard, /lock table public\.planner_entries, public\.team_members in share row exclusive mode/i);
  assert.match(assignmentGuard, /create trigger assigned_team_member_deletion_guard\s+before update of deleted_at or delete on public\.team_members\s+for each row execute function private\.guard_jr_assigned_team_member_deletion\(\)/is);
});

test("planner assignment guards are trigger-only and restored after schema recovery", () => {
  assert.match(assignmentGuard, /create trigger planner_team_assignment_guard\s+before insert or update on public\.planner_entries\s+for each row execute function private\.guard_jr_planner_team_assignments\(\)/is);
  assert.match(assignmentGuard, /revoke execute on function private\.jr_planner_team_assignments_are_valid\(uuid, jsonb\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(assignmentGuard, /revoke execute on function private\.jr_planner_team_assignments_are_live\(uuid, jsonb\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(assignmentGuard, /revoke execute on function private\.jr_planner_entry_blocks_team_member_deletion\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(assignmentGuard, /revoke execute on function private\.guard_jr_planner_team_assignments\(\)[\s\S]*from public, anon, authenticated/i);
  assert.match(assignmentGuard, /revoke execute on function private\.guard_jr_assigned_team_member_deletion\(\)[\s\S]*from public, anon, authenticated/i);
  assert.match(recovery, /20260810_064_preserve_planner_history_team_lifecycle\.sql/i);
  assert.doesNotMatch(recovery, /\\ir\s+\.\.\/migrations\/20260810_063_guard_planner_team_assignments\.sql/i);
  assert.match(assignmentGuardBase, /Cannot secure planner entry/i);
  assert.match(lifecycleGuard, /begin;[\s\S]*lock table public\.planner_entries, public\.team_members in share row exclusive mode[\s\S]*commit;/i);
});
