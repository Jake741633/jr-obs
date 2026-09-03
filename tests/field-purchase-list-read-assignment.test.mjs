import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  roleProjectionCacheGeneration,
  roleProjectionCachePolicy,
  sanitizeRoleProjectionCache,
} from "../lib/cloud/roleProjectionCache-core.mjs";

const migrationName = "20260903141000_scope_field_purchase_list_reads_to_assignments.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const historicalInventory = readFileSync(new URL("../supabase/migrations/20260809_049_field_inventory_projections.sql", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const rlsGuide = readFileSync(new URL("../docs/SUPABASE_RLS_INTEGRATION_TESTS.md", import.meta.url), "utf8");
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const cache = readFileSync(new URL("../lib/cloud/roleProjectionCache-core.mjs", import.meta.url), "utf8");
const cacheTypes = readFileSync(new URL("../lib/cloud/roleProjectionCache-core.d.mts", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");

function section(startText, endText) {
  const start = migration.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = migration.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return migration.slice(start, end);
}

test("the historical field purchase-list policy exposed every same-tenant list", () => {
  const historicalPolicyStart = historicalInventory.indexOf(
    "foreach table_name in array array['field_materials','field_stock_items','field_purchase_lists']",
  );
  const historicalPolicyEnd = historicalInventory.indexOf(
    "foreach table_name in array array['materials','stock_items','purchase_lists']",
    historicalPolicyStart,
  );
  assert.ok(historicalPolicyStart >= 0, "Missing historical field projection policy loop");
  assert.ok(historicalPolicyEnd > historicalPolicyStart, "Missing historical canonical inventory policy loop");
  const historicalPolicy = historicalInventory.slice(
    historicalPolicyStart,
    historicalPolicyEnd,
  );
  assert.match(historicalPolicy, /field_purchase_lists/i);
  assert.match(historicalPolicy, /deleted_at is null/i);
  assert.match(historicalPolicy, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(historicalPolicy, /private\.current_jr_role\(\) = ''electrician''/i);
  assert.doesNotMatch(historicalPolicy, /assigned|job_source_id|current_team_member_source_id/i);
});

test("electrician purchase-list reads resolve through one active canonical job assignment", () => {
  const helper = section(
    "create or replace function private.jr_field_purchase_list_targets_assigned_job",
    "revoke execute on function private.jr_field_purchase_list_targets_assigned_job",
  );

  assert.match(helper, /language sql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(helper, /\(select auth\.uid\(\)\) is not null/i);
  assert.match(helper, /record_organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(helper, /record_job_source_id is not null/i);
  assert.match(helper, /from private\.jr_active_field_identity\(\) field_identity/i);
  assert.match(helper, /join public\.jobs job[\s\S]*job\.source_id = record_job_source_id/i);
  assert.match(helper, /field_identity\.organisation_id = record_organisation_id/i);
  assert.match(helper, /job\.deleted_at is null/i);
  assert.match(
    helper,
    /record_customer_source_id is null[\s\S]*or job\.customer_source_id is not distinct from record_customer_source_id/i,
  );
  assert.match(
    helper,
    /private\.jr_job_is_assigned_to_team_member\(\s*job\.payload,\s*field_identity\.team_member_source_id\s*\)/i,
  );
  assert.match(
    migration,
    /revoke execute on function private\.jr_field_purchase_list_targets_assigned_job\(uuid, text, text\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function private\.jr_field_purchase_list_targets_assigned_job\(uuid, text, text\)[\s\S]*to authenticated, service_role/i,
  );
});

test("the final typed projection policy exposes only live assigned purchase lists", () => {
  const policy = section(
    "drop policy if exists field_purchase_lists_electrician_select",
    "create or replace function public.jr_os_deployed_migration",
  );

  assert.match(policy, /drop policy if exists field_purchase_lists_electrician_select[\s\S]*on public\.field_purchase_lists/i);
  assert.match(policy, /create policy field_purchase_lists_electrician_select[\s\S]*for select to authenticated/i);
  assert.match(policy, /deleted_at is null/i);
  assert.match(policy, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(policy, /private\.current_jr_role\(\) = 'electrician'/i);
  assert.match(
    policy,
    /private\.jr_field_purchase_list_targets_assigned_job\(\s*organisation_id,\s*customer_source_id,\s*job_source_id\s*\)/i,
  );
  assert.doesNotMatch(migration, /for (?:insert|update|delete)/i);
  assert.match(collections, /electrician:[\s\S]*purchase_lists: "field_purchase_lists"/i);
});

test("electrician purchase-list caches are permanently purged before offline fallback", () => {
  const records = [{ id: "list-1", jobId: "revoked-job", notes: "Private delivery note" }];
  for (const mode of ["cloud", "migration"]) {
    assert.equal(
      roleProjectionCachePolicy({
        storageKey: "jr-os-purchase-lists",
        role: "electrician",
        mode,
        generation: "20260903141000",
      }),
      "purge",
    );
    assert.strictEqual(
      sanitizeRoleProjectionCache({ storageKey: "jr-os-purchase-lists", role: "electrician", mode, records }),
      records,
      "fresh server-filtered rows must remain usable without making cached fallback trusted",
    );
  }
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-purchase-lists", role: "electrician", mode: "local" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-purchase-lists", role: "office", mode: "cloud" }), "keep");
  assert.strictEqual(sanitizeRoleProjectionCache({ storageKey: "jr-os-purchase-lists", role: "electrician", mode: "local", records }), records);
  assert.strictEqual(sanitizeRoleProjectionCache({ storageKey: "jr-os-purchase-lists", role: "office", mode: "cloud", records }), records);
  assert.equal(roleProjectionCacheGeneration({ storageKey: "jr-os-purchase-lists", role: "electrician" }), undefined);
  assert.match(cache, /ELECTRICIAN_ALWAYS_PURGED_STORAGE_KEYS[\s\S]*"jr-os-purchase-lists"/i);
  const inventorySetStart = cache.indexOf("const ELECTRICIAN_INVENTORY_PROJECTION_STORAGE_KEYS");
  const inventorySetEnd = cache.indexOf("]);", inventorySetStart);
  assert.ok(inventorySetStart >= 0 && inventorySetEnd > inventorySetStart);
  assert.doesNotMatch(cache.slice(inventorySetStart, inventorySetEnd), /"jr-os-purchase-lists"/i);
  assert.doesNotMatch(cacheTypes, /PURCHASE_LIST_CACHE_GENERATION/i);
  const policyIndex = adapter.indexOf("roleProjectionCachePolicy({ storageKey, role: cacheRole, mode, generation: cachedGeneration })");
  const offlineIndex = adapter.indexOf('if (mode === "local" || !navigator.onLine) return local');
  assert.ok(policyIndex >= 0 && offlineIndex > policyIndex, "stale caches must purge before offline fallback");
  assert.match(adapter, /roleProjectionCacheGeneration\(\{ storageKey, role: cacheRole \}\)/);
});

test("live RLS coverage retains assigned lists and rejects wider procurement reads", () => {
  for (const phrase of [
    "Assigned electrician should retain the production-shaped assigned purchase list",
    "Co-assigned electrician should retain the assigned purchase list",
    "Electrician must not read canonical purchase lists",
    "Customers must not read field purchase lists",
    "Electrician must not read an unassigned same-tenant purchase list",
    "Electrician must not read a purchase list without a canonical job",
    "Assigned electrician must not read another organisation's purchase list",
    "Tenant B assigned electrician should retain its own purchase list",
    "Electrician without an active field identity must not read purchase lists",
    "Field purchase-list projection must omit item unit costs",
    "Field purchase-list projection must omit pricing-document linkage",
    "Office should retain unassigned purchase-list access",
    "Electrician must immediately lose purchase-list reads after assignment revocation",
    "Co-assigned electrician should retain purchase-list access after another assignment is revoked",
    "Office should retain canonical purchase-list history after assignment revocation",
    "Electrician should read a purchase list while the job is active and assigned",
    "Electrician must not read a purchase list for a soft-deleted job",
    "Office should retain canonical purchase-list history after job deletion",
  ]) assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
});

test("recovery, guidance and deployment marker retain purchase-list assignment scoping", () => {
  const stockMovementBoundary = recovery.indexOf("20260903132756_keep_field_stock_movements_office_only.sql");
  const purchaseListBoundary = recovery.indexOf(migrationName);
  assert.ok(stockMovementBoundary >= 0 && purchaseListBoundary > stockMovementBoundary);
  assert.match(
    recovery.slice(purchaseListBoundary - 120, purchaseListBoundary + migrationName.length + 50),
    /begin;[\s\S]*\\ir[\s\S]*commit;/i,
  );
  assert.match(setup, /purchase lists are limited to active jobs assigned to the field identity/i);
  assert.match(rlsGuide, /field purchase-list projections[\s\S]*live canonical jobs assigned[\s\S]*item costs and pricing-document links/i);
  assert.match(migration, new RegExp(`'${migrationName.replaceAll(".", "\\.")}'`, "i"));
  assert.match(migration, /security invoker[\s\S]*set search_path = ''/i);
  assert.match(
    migration,
    /revoke execute on function public\.jr_os_deployed_migration\(\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(migration, /grant execute on function public\.jr_os_deployed_migration\(\)[\s\S]*to service_role/i);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});
