import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_053_timesheet_actor_scope.sql", import.meta.url),
  "utf8",
);
const actorGuard = readFileSync(
  new URL("../supabase/migrations/20260803_019_typed_insert_actor_guard.sql", import.meta.url),
  "utf8",
);
const identityGuard = readFileSync(
  new URL("../supabase/migrations/20260803_024_cloud_record_identity_guard.sql", import.meta.url),
  "utf8",
);
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");

test("timesheet reads are office-wide but electrician rows are creator-scoped", () => {
  const selectPolicy = migration.slice(
    migration.indexOf("create policy timesheets_select"),
    migration.indexOf("drop policy if exists timesheets_field_update"),
  );
  assert.match(selectPolicy, /deleted_at is null/i);
  assert.match(selectPolicy, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(selectPolicy, /private\.can_manage_office_data\(\)/i);
  assert.match(selectPolicy, /private\.current_jr_role\(\) = 'electrician'/i);
  assert.match(selectPolicy, /created_by = \(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(selectPolicy, /= 'customer'/i);
});

test("electricians can update only their own timesheets", () => {
  const updatePolicy = migration.slice(migration.indexOf("create policy timesheets_field_update"));
  const creatorMatches = updatePolicy.match(/created_by = \(select auth\.uid\(\)\)/gi) ?? [];
  assert.equal(creatorMatches.length, 2, "USING and WITH CHECK must both enforce creator ownership");
  assert.match(updatePolicy, /using \([\s\S]*private\.can_manage_office_data\(\)[\s\S]*private\.current_jr_role\(\) = 'electrician'/i);
  assert.match(updatePolicy, /with check \([\s\S]*private\.can_manage_office_data\(\)[\s\S]*private\.current_jr_role\(\) = 'electrician'/i);
});

test("field timesheet creation is bound to the authenticated actor", () => {
  assert.match(
    actorGuard,
    /'jobs','materials','stock_items','stock_movements','purchase_lists','planner_entries','timesheets','certificates','electrical_testing_records','job_documents'/i,
  );
  assert.match(actorGuard, /created_by = auth\.uid\(\)/i);
  assert.match(actorGuard, /updated_by = auth\.uid\(\)/i);
});

test("timesheet creator identity cannot be rewritten after insert", () => {
  assert.match(identityGuard, /new\.created_by is distinct from old\.created_by/i);
  assert.match(identityGuard, /'team_members','timesheets','certificates','electrical_testing_records'/i);
  assert.match(identityGuard, /create trigger %I before update on public\.%I for each row execute function public\.guard_jr_record_identity\(\)/i);
});

test("schema-only recovery reapplies the timesheet actor boundary", () => {
  assert.match(recovery, /20260809_053_timesheet_actor_scope\.sql/i);
  assert.match(recovery, /Scoping field timesheet reads and updates to their creator/i);
});
