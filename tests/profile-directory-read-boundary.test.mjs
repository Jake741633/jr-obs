import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_044_restrict_profile_directory_reads.sql", import.meta.url),
  "utf8",
);
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const identity = readFileSync(new URL("../lib/cloud/useCloudIdentity.ts", import.meta.url), "utf8");
const liveRls = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");

const policy = migration.slice(migration.indexOf("create policy profiles_tenant_select"), migration.indexOf("notify pgrst"));

test("the final profile SELECT policy replaces staff-wide enumeration", () => {
  assert.match(migration, /drop policy if exists profiles_tenant_select on public\.profiles/i);
  assert.match(policy, /on public\.profiles[\s\S]*for select to authenticated/i);
  assert.match(policy, /private\.current_jr_role\(\) is not null/i);
  assert.match(policy, /id = \(select auth\.uid\(\)\)/i);
});

test("only owner and admin sessions receive the organisation directory branch", () => {
  const directoryBranch = policy.slice(policy.indexOf("organisation_id = private.current_organisation_id()"));
  assert.match(directoryBranch, /private\.current_jr_role\(\) in \('owner', 'admin'\)/i);
  assert.doesNotMatch(directoryBranch, /'office'|'electrician'|'customer'/i);
});

test("profile reads depend on the live business-auth identity helper", () => {
  const sessionGuard = policy.indexOf("private.current_jr_role() is not null");
  const selfRead = policy.indexOf("id = (select auth.uid())");
  assert.ok(sessionGuard >= 0 && sessionGuard < selfRead, "live-session authorization must guard the self-read branch");
  assert.match(policy, /using \(\s*private\.current_jr_role\(\) is not null\s*and \(\s*id = \(select auth\.uid\(\)\)/i);
});

test("cloud identity queries only the signed-in profile", () => {
  assert.match(identity, /profiles\?id=eq\.\$\{encodeURIComponent\(user\.id\)\}&active=eq\.true&select=organisation_id,role,customer_source_id,active/);
  assert.doesNotMatch(identity, /rest\/v1\/profiles\?select=/);
});

test("recovery, deployment guidance and live RLS coverage retain the directory boundary", () => {
  assert.match(recovery, /20260809_044_restrict_profile_directory_reads\.sql/i);
  assert.match(setup, /only owner\/admin accounts can enumerate organisation authentication profiles/i);
  for (const phrase of [
    "Owners should retain organisation profile administration",
    "Admins should retain organisation profile administration",
    "Office must not enumerate authentication profiles",
    "Electrician must not enumerate authentication profiles",
    "Customer must not enumerate authentication profiles",
    "Suspended sessions must not read their authentication profile",
    "Recovery-only sessions must not resolve an authentication profile",
    "Revoked access tokens must not read their authentication profile",
  ]) {
    assert.match(liveRls, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }
});
