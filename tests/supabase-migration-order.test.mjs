import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const files = [
  "supabase/schema.sql",
  "supabase/migrations/20260730_000_prerequisite_helpers.sql",
  "supabase/migrations/20260730_001_cloud_foundation.sql",
  "supabase/migrations/20260730_002_audit_triggers.sql",
  "supabase/migrations/20260730_003_permission_hardening.sql",
  "supabase/migrations/20260731_004_generic_collection_sync.sql",
  "supabase/migrations/20260731_005_security_readiness_phase1.sql",
  "supabase/migrations/20260731_006_profiles_rls_recursion_fix.sql",
];
const allMigrationFiles = readdirSync("supabase/migrations")
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => `supabase/migrations/${file}`);
const supersededRecoveryMigrations = new Set([
  "supabase/migrations/20260810_063_guard_planner_team_assignments.sql",
]);

const sql = Object.fromEntries(files.map((file) => [file, readFileSync(file, "utf8")]));

function definitionIndex(source, name) {
  return source.search(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, "i"));
}

function referenceIndex(source, name) {
  return source.search(new RegExp(`public\\.${name}\\s*\\(`, "i"));
}

test("JR OS Supabase bootstrap files exist and recovery applies every current migration in order", () => {
  assert.deepEqual(Object.keys(sql), files);
  const recovery = readFileSync("supabase/recovery/after_schema_only.sql", "utf8");
  const included = [...recovery.matchAll(/\\ir\s+\.\.\/migrations\/([^\s]+)/g)].map((match) => `supabase/migrations/${match[1]}`);
  const expected = allMigrationFiles.filter((file) => !supersededRecoveryMigrations.has(file));
  assert.deepEqual(included, expected);
  assert.equal(new Set(included).size, included.length, "recovery must not apply a migration twice");
  assert.match(recovery, /Migration 064 is a self-contained replacement for 063/i);
  assert.match(recovery, /\\set ON_ERROR_STOP on/);
});

test("base-profile columns and five roles exist before RLS helpers compile", () => {
  const prerequisite = sql[files[1]];
  const activeColumn = prerequisite.indexOf("add column if not exists active");
  const customerColumn = prerequisite.indexOf("add column if not exists customer_source_id");
  const roleConstraint = prerequisite.indexOf("profiles_role_check");
  const firstHelper = definitionIndex(prerequisite, "current_jr_role");
  assert.ok(activeColumn >= 0 && activeColumn < firstHelper);
  assert.ok(customerColumn >= 0 && customerColumn < firstHelper);
  assert.ok(roleConstraint >= 0 && roleConstraint < firstHelper);
  for (const role of ["owner", "admin", "office", "electrician", "customer"]) assert.match(prerequisite, new RegExp(`'${role}'`));
});

test("all helpers referenced by generic collection RLS are defined earlier", () => {
  const prefix = files.slice(0, 5).map((file) => sql[file]).join("\n");
  const generic = sql[files[5]];
  for (const helper of ["current_jr_role", "current_customer_source_id", "is_organisation_member", "set_updated_at", "audit_jr_entity_change"]) {
    assert.ok(definitionIndex(prefix, helper) >= 0, `${helper} must be defined before migration 004`);
    assert.ok(referenceIndex(generic, helper) >= 0, `${helper} should be used by migration 004`);
  }
});

test("migrations after the private-helper move do not recreate policies against removed public helpers", () => {
  const privateHelperMove = "supabase/migrations/20260809_030_private_authorization_helpers.sql";
  const laterMigrations = allMigrationFiles.filter((file) => file > privateHelperMove);
  const movedPublicHelper = /public\.(?:current_organisation_id|current_jr_role|current_customer_source_id|is_organisation_member|can_manage_business|can_manage_office_data|can_manage_field_data|can_write_cloud_collection)\s*\(/i;

  for (const file of laterMigrations) {
    assert.doesNotMatch(readFileSync(file, "utf8"), movedPublicHelper, `${file} must use private authorization helpers`);
  }
});

test("RLS helper functions use explicit search paths and restricted execution", () => {
  const prerequisite = sql[files[1]];
  for (const helper of ["current_jr_role", "current_customer_source_id", "is_organisation_member"]) {
    const start = definitionIndex(prerequisite, helper);
    const end = prerequisite.indexOf("$$;", start);
    assert.match(prerequisite.slice(start, end), /security definer/i);
    assert.match(prerequisite.slice(start, end), /set search_path\s*=\s*''/i);
    assert.match(prerequisite, new RegExp(`revoke all on function public\\.${helper}`));
    assert.match(prerequisite, new RegExp(`grant execute on function public\\.${helper}`));
  }
  const triggerStart = definitionIndex(prerequisite, "set_updated_at");
  const triggerEnd = prerequisite.indexOf("$$;", triggerStart);
  assert.doesNotMatch(prerequisite.slice(triggerStart, triggerEnd), /security definer/i);
});

test("migration dependencies are created before triggers and policies use them", () => {
  const foundation = sql[files[2]];
  const audit = sql[files[3]];
  const permissions = sql[files[4]];
  const generic = sql[files[5]];
  const security = sql[files[6]];

  for (const table of ["audit_log", "private_files", "payments", "pricing_documents", "certificates", "portal_approvals", "portal_requests"]) {
    assert.match(foundation, new RegExp(`(?:create table if not exists public\\.${table}|array\\[[\\s\\S]*'${table}')`, "i"));
  }
  assert.ok(definitionIndex(audit, "audit_jr_entity_change") >= 0);
  assert.ok(definitionIndex(permissions, "prevent_profile_privilege_escalation") >= 0);
  assert.match(generic, /drop trigger if exists cloud_collections_set_updated_at/i);
  assert.match(generic, /drop trigger if exists cloud_collections_delete_audit/i);
  assert.match(security, /drop policy if exists jr_private_select/i);
  assert.match(security, /create policy jr_private_select/i);
});

test("profile and organisation read policies avoid recursive profile subqueries", () => {
  const fix = sql[files[7]];
  assert.match(fix, /drop policy if exists "Users can view organisation profiles"/i);
  assert.match(fix, /create policy profiles_tenant_select/i);
  assert.match(fix, /organisation_id\s*=\s*public\.current_organisation_id\(\)/i);
  assert.match(fix, /create policy organisations_tenant_select/i);
  assert.doesNotMatch(fix, /select\s+organisation_id\s+from\s+public\.profiles/i);
});

test("legacy and current private buckets remain distinct without public exposure", () => {
  const base = sql[files[0]];
  const foundation = sql[files[2]];
  const permissions = sql[files[4]];
  const security = sql[files[6]];
  assert.match(base, /'jr-os-files'\s*,\s*'jr-os-files'\s*,\s*false/i);
  assert.match(foundation, /'jr-os-private'\s*,\s*'jr-os-private'\s*,\s*false/i);
  assert.match(foundation, /on conflict \(id\) do update set public=false/i);
  assert.match(permissions, /bucket_id='jr-os-files'/i);
  assert.match(security, /bucket_id='jr-os-private'/i);
  assert.doesNotMatch([base, foundation, permissions, security].join("\n"), /'jr-os-private'\s*,\s*'jr-os-private'\s*,\s*true/i);
});
