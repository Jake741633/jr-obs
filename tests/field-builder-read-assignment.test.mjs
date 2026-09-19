import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ELECTRICIAN_BUILDER_PROJECTION_CACHE_GENERATION,
  roleProjectionCacheGeneration,
  roleProjectionCachePolicy,
} from "../lib/cloud/roleProjectionCache-core.mjs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260826132500_scope_field_builder_reads_to_assignments.sql", import.meta.url),
  "utf8",
);
const originalProjection = readFileSync(
  new URL("../supabase/migrations/20260809_052_field_builder_projection.sql", import.meta.url),
  "utf8",
);
const cache = readFileSync(new URL("../lib/cloud/roleProjectionCache-core.mjs", import.meta.url), "utf8");
const cacheTypes = readFileSync(new URL("../lib/cloud/roleProjectionCache-core.d.mts", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return source.slice(start, end);
}

test("field builder reads require a unique active identity and an assigned canonical job", () => {
  const helper = section(
    migration,
    "create or replace function private.jr_field_builder_has_assigned_job(",
    "revoke execute on function private.jr_field_builder_has_assigned_job",
  );
  assert.match(helper, /language sql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(helper, /record_organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(helper, /nullif\(pg_catalog\.btrim\(record_builder_source_id\), ''\) is not null/i);
  assert.match(helper, /from private\.jr_active_field_identity\(\) field_identity/i);
  assert.match(helper, /join public\.jobs job[\s\S]*job\.organisation_id = field_identity\.organisation_id/i);
  assert.match(helper, /field_identity\.organisation_id = record_organisation_id/i);
  assert.match(helper, /job\.deleted_at is null/i);
  assert.match(helper, /pg_catalog\.jsonb_typeof\(job\.payload -> 'builderId'\) = 'string'/i);
  assert.match(helper, /job\.payload ->> 'builderId' = record_builder_source_id/i);
  assert.match(helper, /private\.jr_job_is_assigned_to_team_member\([\s\S]*job\.payload,[\s\S]*field_identity\.team_member_source_id/i);
  assert.match(
    migration,
    /revoke execute on function private\.jr_field_builder_has_assigned_job\(uuid, text\)[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*to authenticated, service_role/i,
  );
});

test("the final builder policy supersedes the tenant-wide projection policy", () => {
  const policy = section(
    migration,
    "create policy field_builders_electrician_select",
    "create or replace function public.jr_os_deployed_migration",
  );
  assert.match(policy, /deleted_at is null/i);
  assert.match(policy, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(policy, /private\.current_jr_role\(\) = 'electrician'/i);
  assert.match(policy, /private\.jr_field_builder_has_assigned_job\([\s\S]*organisation_id,[\s\S]*source_id/i);
  assert.match(originalProjection, /create policy field_builders_electrician_select[\s\S]*private\.current_jr_role\(\) = 'electrician'/i);
  assert.ok(
    recovery.indexOf("20260826132500_scope_field_builder_reads_to_assignments.sql")
      > recovery.indexOf("20260809_052_field_builder_projection.sql"),
    "recovery must replace the original tenant-wide policy after creating the projection",
  );
});

test("builder assignment lookups have a matching active-job expression index", () => {
  assert.match(
    migration,
    /create index if not exists jobs_org_builder_assignment_idx[\s\S]*organisation_id,[\s\S]*payload ->> 'builderId'[\s\S]*where deleted_at is null[\s\S]*jsonb_typeof\(payload -> 'builderId'\) = 'string'/i,
  );
});

test("stale tenant-wide electrician builder caches purge before offline fallback", () => {
  assert.equal(ELECTRICIAN_BUILDER_PROJECTION_CACHE_GENERATION, "20260826132500");
  assert.equal(
    roleProjectionCacheGeneration({ storageKey: "jr-os-builders", role: "electrician" }),
    ELECTRICIAN_BUILDER_PROJECTION_CACHE_GENERATION,
  );
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-builders", role: "electrician", mode: "cloud" }), "purge");
  assert.equal(
    roleProjectionCachePolicy({
      storageKey: "jr-os-builders",
      role: "electrician",
      mode: "migration",
      generation: "20260809",
    }),
    "purge",
  );
  assert.equal(
    roleProjectionCachePolicy({
      storageKey: "jr-os-builders",
      role: "electrician",
      mode: "cloud",
      generation: ELECTRICIAN_BUILDER_PROJECTION_CACHE_GENERATION,
    }),
    "keep",
  );
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-builders", role: "electrician", mode: "local" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-builders", role: "office", mode: "cloud" }), "keep");
  assert.match(cache, /ELECTRICIAN_BUILDER_PROJECTION_CACHE_GENERATION = "20260826132500"/);
  assert.match(cache, /role === "electrician" && storageKey === "jr-os-builders"[\s\S]*return ELECTRICIAN_BUILDER_PROJECTION_CACHE_GENERATION/);
  assert.match(cacheTypes, /ELECTRICIAN_BUILDER_PROJECTION_CACHE_GENERATION: "20260826132500"/);
  assert.match(adapter, /roleProjectionCachePolicy\(\{ storageKey, role: cacheRole, mode, generation: cachedGeneration \}\)/);
  assert.match(adapter, /if \(mode === "local" \|\| !navigator\.onLine\) return local/);
  assert.match(adapter, /roleProjectionCacheGeneration\(\{ storageKey, role: cacheRole \}\)/);
  assert.ok(
    adapter.indexOf("roleProjectionCachePolicy({ storageKey, role: cacheRole, mode, generation: cachedGeneration })")
      < adapter.indexOf('if (mode === "local" || !navigator.onLine) return local'),
    "stale builder caches must purge before the offline fallback returns",
  );
});

test("the latest migration publishes the service-role-only deployment marker", () => {
  assert.match(migration, /20260826132500_scope_field_builder_reads_to_assignments\.sql/i);
  assert.match(migration, /security invoker[\s\S]*set search_path = ''/i);
  assert.match(migration, /revoke execute on function public\.jr_os_deployed_migration\(\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.jr_os_deployed_migration\(\)[\s\S]*to service_role/i);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});
