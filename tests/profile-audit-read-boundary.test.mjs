import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260810_061_restrict_profile_audit_reads.sql", import.meta.url),
  "utf8",
);
const triggers = readFileSync(new URL("../supabase/migrations/20260730_002_audit_triggers.sql", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const liveRls = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");

const policy = migration.slice(migration.indexOf("create policy audit_read"), migration.indexOf("notify pgrst"));
const officeBranch = policy.slice(policy.indexOf("private.current_jr_role() = 'office'"));

test("the final audit policy replaces the staff-wide read boundary", () => {
  assert.match(migration, /drop policy if exists audit_read on public\.audit_log/i);
  assert.match(policy, /on public\.audit_log[\s\S]*for select to authenticated/i);
  assert.match(policy, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(policy, /private\.can_manage_business\(\)/i);
});

test("office audit access excludes profile and permission history", () => {
  assert.match(officeBranch, /private\.current_jr_role\(\) = 'office'/i);
  assert.match(officeBranch, /entity_table <> 'profiles'/i);
  assert.match(officeBranch, /action <> 'user_permission_changed'/i);
  assert.doesNotMatch(officeBranch, /can_manage_office_data/i);
});

test("the restricted rows contain complete historical profile identities", () => {
  const profileTrigger = triggers.slice(
    triggers.indexOf("create or replace function public.audit_profile_change"),
    triggers.indexOf("revoke all on function public.audit_profile_change"),
  );
  assert.match(profileTrigger, /'user_permission_changed','profiles'/i);
  assert.match(profileTrigger, /to_jsonb\(old\),to_jsonb\(new\)/i);
  assert.match(profileTrigger, /'record_deleted','profiles'/i);
});

test("recovery, deployment guidance and live RLS coverage retain the profile-audit boundary", () => {
  assert.match(recovery, /20260810_061_restrict_profile_audit_reads\.sql/i);
  assert.match(setup, /profile and permission audit history is restricted to owner\/admin accounts/i);
  for (const phrase of [
    "Owner should retain profile audit history",
    "Admin should retain profile audit history",
    "Office profile audit query should fail closed",
    "Office must not recover authentication profiles through audit history",
    "Office should retain operational audit rows",
  ]) {
    assert.match(liveRls, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }
});
