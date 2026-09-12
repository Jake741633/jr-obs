import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260820150000_scope_field_customer_reads_to_assignments.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const cache = readFileSync(new URL("../lib/cloud/roleProjectionCache-core.mjs", import.meta.url), "utf8");
const cacheTypes = readFileSync(new URL("../lib/cloud/roleProjectionCache-core.d.mts", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");

function section(startText, endText) {
  const start = migration.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = migration.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return migration.slice(start, end);
}

test("field customer visibility resolves through a canonical assigned job", () => {
  const helper = section(
    "create or replace function private.jr_field_customer_has_assigned_job",
    "revoke execute on function private.jr_field_customer_has_assigned_job",
  );
  assert.match(helper, /language sql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(helper, /record_organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(helper, /record_customer_source_id is not null/i);
  assert.match(helper, /from private\.jr_active_field_identity\(\) field_identity/i);
  assert.match(helper, /join public\.jobs job[\s\S]*job\.organisation_id = field_identity\.organisation_id/i);
  assert.match(helper, /field_identity\.organisation_id = record_organisation_id/i);
  assert.match(helper, /job\.customer_source_id = record_customer_source_id/i);
  assert.match(helper, /job\.deleted_at is null/i);
  assert.match(
    helper,
    /private\.jr_job_is_assigned_to_team_member\(\s*job\.payload,\s*field_identity\.team_member_source_id\s*\)/i,
  );
  assert.match(
    migration,
    /revoke execute on function private\.jr_field_customer_has_assigned_job\(uuid, text\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function private\.jr_field_customer_has_assigned_job\(uuid, text\)[\s\S]*to authenticated, service_role/i,
  );
});

test("the final electrician field customer policy uses the customer projection source id", () => {
  const policy = section(
    "create policy field_customers_electrician_select",
    "create or replace function public.jr_os_deployed_migration",
  );
  assert.match(policy, /deleted_at is null/i);
  assert.match(policy, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(policy, /private\.current_jr_role\(\) = 'electrician'/i);
  assert.match(
    policy,
    /private\.jr_field_customer_has_assigned_job\(\s*organisation_id,\s*source_id\s*\)/i,
  );
  assert.doesNotMatch(policy, /jr_field_customer_has_assigned_job\([\s\S]*(?:customer_source_id|job_source_id)/i);
});

test("stale electrician customer projection caches purge before offline fallback", () => {
  assert.match(cache, /ELECTRICIAN_CUSTOMER_PROJECTION_CACHE_GENERATION = "20260820150000"/);
  assert.match(
    cache,
    /role === "electrician" && storageKey === "jr-os-customers"[\s\S]*return ELECTRICIAN_CUSTOMER_PROJECTION_CACHE_GENERATION/,
  );
  assert.match(cache, /expectedGeneration && generation !== expectedGeneration[\s\S]*return "purge"/);
  assert.match(cacheTypes, /ELECTRICIAN_CUSTOMER_PROJECTION_CACHE_GENERATION: "20260820150000"/);
});

test("live RLS coverage retains assigned contacts and denies broader customer reads", () => {
  for (const phrase of [
    "Electrician must not read field customers before active identity binding",
    "Assigned electrician should retain the assigned field customer",
    "Co-assigned electrician should retain the assigned field customer",
    "Electrician must not read a same-tenant customer with only unassigned jobs",
    "Assigned electrician must not read another organisation's field customer",
  ]) assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
});

test("recovery, guidance and deployment marker retain field customer assignment scoping", () => {
  const jobScope = recovery.indexOf("20260820143000_scope_field_job_reads_to_assignments.sql");
  const customerScope = recovery.indexOf(migrationName);
  assert.ok(jobScope >= 0 && customerScope > jobScope);
  assert.match(recovery.slice(customerScope - 120, customerScope + migrationName.length + 50), /begin;[\s\S]*\\ir[\s\S]*commit;/i);
  assert.match(setup, /contact-safe customers linked to those assigned jobs/i);
  assert.match(migration, new RegExp(`'${migrationName.replaceAll(".", "\\.")}'`));
});
