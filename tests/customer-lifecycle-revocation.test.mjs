import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationFilename = "20260813215116_revoke_deleted_customer_portals.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationFilename}`, import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const identity = readFileSync(new URL("../lib/cloud/useCloudIdentity.ts", import.meta.url), "utf8");
const cloudSync = readFileSync(new URL("../lib/cloudSync.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");
const liveRls = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");

test("every customer identity helper requires a live canonical scope", () => {
  assert.match(migration, /create or replace function private\.jr_profile_scope_is_live\([\s\S]*from public\.customers customer/i);
  assert.match(migration, /customer\.organisation_id = record_organisation_id/i);
  assert.match(migration, /customer\.source_id = record_customer_source_id/i);
  assert.match(migration, /customer\.deleted_at is null/i);
  assert.match(migration, /revoke execute on function private\.jr_profile_scope_is_live\(uuid, text, text\)[\s\S]*from public, anon, authenticated, service_role/i);

  for (const signature of [
    "current_jr_role\\(\\)",
    "current_customer_source_id\\(\\)",
    "is_organisation_member\\(target_organisation_id uuid\\)",
    "current_organisation_id\\(\\)",
    '\\"current_role\\"\\(\\)',
  ]) {
    assert.match(
      migration,
      new RegExp(`create or replace function private\\.${signature}[\\s\\S]*?private\\.jr_profile_scope_is_live\\(`, "i"),
    );
  }
  assert.match(migration, /grant execute on function[\s\S]*private\."current_role"\(\)[\s\S]*to authenticated, service_role/i);
});

test("customer deletion deactivates portal profiles without automatic restoration", () => {
  assert.match(migration, /create or replace function private\.deactivate_jr_customer_portal_profiles\(\)/i);
  assert.match(migration, /update public\.profiles profile[\s\S]*set active = false/i);
  assert.match(migration, /profile\.organisation_id = target_organisation_id/i);
  assert.match(migration, /profile\.role = 'customer'/i);
  assert.match(migration, /profile\.customer_source_id = target_customer_source_id/i);
  assert.match(migration, /and profile\.active = true/i);
  assert.match(migration, /after insert or update of deleted_at or delete on public\.customers/i);
  assert.match(migration, /old\.deleted_at is not null or new\.deleted_at is null[\s\S]*return new/i);
  assert.match(migration, /revoke execute on function private\.deactivate_jr_customer_portal_profiles\(\)[\s\S]*from public, anon, authenticated, service_role/i);
});

test("backfill and profile guard support only privilege-reducing cleanup", () => {
  assert.match(migration, /create or replace function private\.guard_jr_profile_management\(\)[\s\S]*old\.role = 'customer'[\s\S]*new\.active = false/i);
  assert.match(migration, /new\.role is not distinct from old\.role/i);
  assert.match(migration, /new\.customer_source_id is not distinct from old\.customer_source_id/i);
  assert.match(migration, /new\.full_name is not distinct from old\.full_name/i);
  assert.match(migration, /not exists \([\s\S]*customer\.deleted_at is null[\s\S]*return new/i);
  assert.match(migration, /update public\.profiles profile[\s\S]*where profile\.role = 'customer'[\s\S]*profile\.active = true[\s\S]*profile\.organisation_id is not null[\s\S]*not exists/i);
});

test("browser identity and queued replay reject customer profiles without scope", () => {
  assert.match(identity, /profile\.role === "customer" && !profile\.customer_source_id/i);
  assert.match(cloudSync, /profile\.role === "customer" && !profile\.customer_source_id/i);
  assert.match(repository, /profile\?\.role !== "customer" \|\| Boolean\(profile\?\.customer_source_id\)/i);
});

test("live RLS coverage proves stale customer sessions lose downstream access", () => {
  for (const phrase of [
    "Active portal customer should read their live job before deletion",
    "Tombstoning a customer must deactivate linked portal profiles",
    "Deleted-customer tokens must not retain tenant reads",
    "Deleted customer must immediately lose its portal contact projection",
    "Stale customer profiles must not retain downstream job reads",
    "Stale customer profiles must not retain portal writes",
    "Restoring a customer must not reactivate its portal profile",
    "Explicit portal reactivation should restore live customer access",
    "Service-role hard deletion must deactivate linked portal profiles",
    "Hard-deleted customer tokens must not retain downstream reads",
    "Authenticated owner hard deletion must deactivate linked portal profiles",
    "Owner-deleted customer tokens must not retain downstream reads",
  ]) {
    assert.match(liveRls, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }
});

test("schema recovery installs and publishes the lifecycle boundary last", () => {
  const pricingIndex = recovery.indexOf("20260811_068_hide_customer_draft_pricing.sql");
  const lifecycleIndex = recovery.indexOf(migrationFilename);
  assert.ok(pricingIndex >= 0 && lifecycleIndex > pricingIndex);
  assert.match(migration, new RegExp(`'migration',\\s*'${migrationFilename.replace(".", "\\.")}'`, "i"));
  assert.match(migration, /grant execute on function public\.jr_os_deployed_migration\(\)\s*to service_role/i);
});
