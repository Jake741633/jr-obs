import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_046_field_team_member_projection.sql", import.meta.url),
  "utf8",
);
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");

const payloadStart = migration.indexOf("create or replace function private.jr_field_team_payload");
const payloadEnd = migration.indexOf("revoke execute on function private.jr_field_team_payload", payloadStart);
const payloadProjection = migration.slice(payloadStart, payloadEnd);
const basePolicyStart = migration.indexOf("create policy team_members_select");
const basePolicy = migration.slice(basePolicyStart, migration.indexOf("notify pgrst", basePolicyStart));

test("field team projection is an RLS-protected read-only application surface", () => {
  assert.match(migration, /create table if not exists public\.field_team_members/i);
  assert.match(migration, /alter table public\.field_team_members enable row level security/i);
  assert.match(migration, /grant select on table public\.field_team_members to authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.field_team_members to service_role/i);
  assert.match(migration, /private\.current_jr_role\(\) = 'electrician'/i);
});

test("field payload allowlists operational directory data and omits private HR fields", () => {
  for (const key of ["id", "name", "role", "status", "email", "phone", "vanRegistration", "qualifications", "createdAt", "updatedAt"]) {
    assert.match(payloadProjection, new RegExp(`'${key}'`));
  }
  for (const key of ["hourlyCost", "chargeRate", "emergencyContact", "emergencyPhone", "notes", "certificateNumber"]) {
    assert.doesNotMatch(payloadProjection, new RegExp(`'${key}'`));
  }
  assert.match(payloadProjection, /'issuedAt'/i);
  assert.match(payloadProjection, /'expiresAt'/i);
});

test("complete team member rows are office-only after projection migration", () => {
  assert.match(migration, /drop policy if exists team_members_select on public\.team_members/i);
  assert.match(basePolicy, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(basePolicy, /private\.can_manage_office_data\(\)/i);
  assert.doesNotMatch(basePolicy, /electrician|customer/i);
});

test("electrician repositories read the safe projection while writes retain the source table", () => {
  assert.match(collections, /electrician:\s*\{[\s\S]*team_members:\s*"field_team_members"/i);
  assert.match(collections, /"jr-os-team":\s*"team_members"/i);
  assert.match(collections, /roleReadTables\[role\]\?\.\[table\] \?\? table/i);
});

test("live RLS runner verifies base-row denial and field projection access", () => {
  for (const phrase of [
    "Electrician must not read private team member records",
    "Electrician should retain field-safe team directory reads",
    "Field team projection must omit payroll rates",
    "Field team projection must omit emergency contacts",
  ]) {
    assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }
});

test("recovery and deployment guidance retain the field team privacy boundary", () => {
  const pricingIndex = recovery.indexOf("20260809_045_restrict_electrician_pricing_reads.sql");
  const teamIndex = recovery.indexOf("20260809_046_field_team_member_projection.sql");
  assert.ok(pricingIndex >= 0 && teamIndex > pricingIndex, "field team projection must follow prior hardening migrations");
  assert.match(setup, /electricians receive only the field-safe team directory projection/i);
  assert.match(setup, /payroll rates, emergency contacts and private team notes remain office-only/i);
});
