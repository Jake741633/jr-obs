import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_054_bind_timesheets_to_team_identity.sql", import.meta.url),
  "utf8",
);
const permissions = readFileSync(
  new URL("../supabase/migrations/20260730_003_permission_hardening.sql", import.meta.url),
  "utf8",
);
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");

function policyBody(name) {
  const start = migration.indexOf(`create policy ${name}`);
  const nextDrop = migration.indexOf("drop policy if exists", start);
  const end = nextDrop === -1 ? migration.length : nextDrop;
  return migration.slice(start, end);
}

test("team identity resolver matches exactly one same-organisation email", () => {
  assert.match(migration, /create or replace function private\.current_team_member_source_id\(\)/i);
  assert.match(migration, /from public\.team_members member/i);
  assert.match(migration, /member\.organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(migration, /member\.deleted_at is null/i);
  assert.match(migration, /auth\.jwt\(\) ->> 'email'/i);
  assert.match(migration, /lower\(btrim\(coalesce\(member\.payload ->> 'email', ''\)\)\)/i);
  assert.match(migration, /case when count\(\*\) = 1 then max\(source_id\) else null end/i);
});

test("team identity resolver is internal and fail-closed", () => {
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /revoke execute on function private\.current_team_member_source_id\(\)[\s\S]*from public, anon/i);
  assert.match(migration, /grant execute on function private\.current_team_member_source_id\(\)[\s\S]*to authenticated, service_role/i);
  assert.doesNotMatch(migration, /grant execute on function private\.current_team_member_source_id\(\)[\s\S]*to anon/i);
});

test("field timesheet inserts bind actor and team identity", () => {
  const insertPolicy = policyBody("timesheets_field_insert");
  assert.match(insertPolicy, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(insertPolicy, /created_by = \(select auth\.uid\(\)\)/i);
  assert.match(insertPolicy, /updated_by = \(select auth\.uid\(\)\)/i);
  assert.match(insertPolicy, /private\.can_manage_office_data\(\)/i);
  assert.match(insertPolicy, /private\.current_jr_role\(\) = 'electrician'/i);
  assert.match(insertPolicy, /payload ->> 'teamMemberId' = private\.current_team_member_source_id\(\)/i);
});

test("field timesheet updates cannot reattribute the worker", () => {
  const updatePolicy = policyBody("timesheets_field_update");
  assert.match(updatePolicy, /using \([\s\S]*created_by = \(select auth\.uid\(\)\)/i);
  assert.match(updatePolicy, /with check \([\s\S]*created_by = \(select auth\.uid\(\)\)/i);
  assert.match(updatePolicy, /with check \([\s\S]*payload ->> 'teamMemberId' = private\.current_team_member_source_id\(\)/i);
});

test("electricians cannot rewrite the team directory email used for binding", () => {
  const officeStart = permissions.indexOf("'customers','builders','pricing_documents','invoices','payments','expenses','team_members'");
  const fieldStart = permissions.indexOf("'jobs','materials','stock_items','stock_movements','purchase_lists','planner_entries','timesheets'");
  assert.notEqual(officeStart, -1);
  assert.notEqual(fieldStart, -1);
  assert.ok(officeStart < fieldStart, "team_members must remain in the office-only write group");
  const fieldGroup = permissions.slice(fieldStart, permissions.indexOf("end $$;", fieldStart));
  assert.doesNotMatch(fieldGroup, /team_members/i);
});

test("schema-only recovery reapplies the team identity binding", () => {
  assert.match(recovery, /20260809_054_bind_timesheets_to_team_identity\.sql/i);
  assert.match(recovery, /Binding field timesheets to the authenticated team identity/i);
});
