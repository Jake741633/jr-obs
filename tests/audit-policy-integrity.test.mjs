import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const foundation = readFileSync(new URL("../supabase/migrations/20260730_001_cloud_foundation.sql", import.meta.url), "utf8");
const triggers = readFileSync(new URL("../supabase/migrations/20260730_002_audit_triggers.sql", import.meta.url), "utf8");
const integrity = readFileSync(new URL("../supabase/migrations/20260802_010_audit_log_integrity.sql", import.meta.url), "utf8");
const readBoundary = readFileSync(new URL("../supabase/migrations/20260810_061_restrict_profile_audit_reads.sql", import.meta.url), "utf8");
const helper = readFileSync(new URL("../lib/cloud/audit.ts", import.meta.url), "utf8");

test("final audit reads remain organisation scoped and hide profile history from office roles", () => {
  assert.match(foundation, /create policy audit_read[\s\S]*public\.can_manage_office_data\(\)/i);
  assert.match(readBoundary, /drop policy if exists audit_read on public\.audit_log/i);
  assert.match(readBoundary, /create policy audit_read[\s\S]*organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(readBoundary, /private\.can_manage_business\(\)/i);
  assert.match(readBoundary, /private\.current_jr_role\(\) = 'office'[\s\S]*entity_table <> 'profiles'[\s\S]*action <> 'user_permission_changed'/i);
});

test("direct audit inserts cannot impersonate another actor or cross organisations", () => {
  assert.match(integrity, /alter column actor_user_id set default auth\.uid\(\)/i);
  assert.match(integrity, /organisation_id\s*=\s*public\.current_organisation_id\(\)/i);
  assert.match(integrity, /actor_user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(helper, /organisation_id: input\.organisationId/);
  assert.doesNotMatch(helper, /actor_user_id:/);
});

test("privileged audit actions require owner or admin authority", () => {
  assert.match(integrity, /action in \('user_permission_changed', 'record_deleted'\)[\s\S]*public\.can_manage_business\(\)/i);
});

test("operational audit actions require an active field-capable membership", () => {
  assert.match(integrity, /action in \('quote_approved', 'certificate_issued', 'payment_changed'\)[\s\S]*public\.can_manage_field_data\(\)/i);
});

test("audit rows remain append-only", () => {
  assert.match(integrity, /drop policy if exists audit_append/i);
  assert.match(integrity, /create policy audit_append[\s\S]*for insert/i);
  assert.doesNotMatch(integrity, /create policy[^;]+for update/i);
  assert.doesNotMatch(integrity, /create policy[^;]+for delete/i);
});

test("trigger-generated events inherit the changed record organisation and authenticated actor", () => {
  assert.match(triggers, /organisation_value := old\.organisation_id/);
  assert.match(triggers, /organisation_value := new\.organisation_id/);
  assert.match(triggers, /organisation_value,[\s\S]*auth\.uid\(\),[\s\S]*action_name/i);
  assert.match(triggers, /values \(new\.organisation_id,auth\.uid\(\),'user_permission_changed'/i);
  assert.match(triggers, /values \(old\.organisation_id,auth\.uid\(\),'record_deleted'/i);
});
