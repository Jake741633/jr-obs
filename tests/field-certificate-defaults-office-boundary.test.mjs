import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canAccessPath } from "../lib/cloud/permissions.ts";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";
import {
  roleProjectionCacheGeneration,
  roleProjectionCachePolicy,
  sanitizeRoleProjectionCache,
} from "../lib/cloud/roleProjectionCache-core.mjs";

const migrationName = "20260903144000_keep_field_certificate_defaults_office_only.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const previousReadableCollections = readFileSync(
  new URL("../supabase/migrations/20260827001445_keep_field_rams_office_only.sql", import.meta.url),
  "utf8",
);
const fieldPolicy = readFileSync(
  new URL("../supabase/migrations/20260826123514_hide_field_finance_timeline_activity.sql", import.meta.url),
  "utf8",
);
const canonicalPolicyMigration = readFileSync(
  new URL("../supabase/migrations/20260814091500_project_customer_portal_finance.sql", import.meta.url),
  "utf8",
);
const projection = readFileSync(
  new URL("../supabase/migrations/20260809_048_field_cloud_collection_projection.sql", import.meta.url),
  "utf8",
);
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const rlsGuide = readFileSync(new URL("../docs/SUPABASE_RLS_INTEGRATION_TESTS.md", import.meta.url), "utf8");
const cache = readFileSync(new URL("../lib/cloud/roleProjectionCache-core.mjs", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return source.slice(start, end);
}

test("the final field collection allowlist keeps certificate defaults office-only", () => {
  const allowlist = section(
    migration,
    "create or replace function private.jr_electrician_collection_is_readable",
    "revoke execute on function private.jr_electrician_collection_is_readable",
  );

  assert.match(previousReadableCollections, /'jr-os-certificate-defaults'/i);
  assert.doesNotMatch(allowlist, /jr-os-certificate-defaults/i);
  for (const retained of [
    "jr-os-surveys",
    "jr-os-job-packs",
    "jr-os-job-variations",
    "jr-os-job-timeline",
    "jr-os-site-diaries",
    "jr-os-site-diary",
    "jr-os-job-tasks",
    "jr-os-job-progress",
    "jr-os-job-material-usage",
    "jr-os-job-qa-inspections",
    "jr-os-stock-locations",
    "jr-os-fleet",
  ]) assert.match(allowlist, new RegExp(`'${retained}'`, "i"));
  assert.match(allowlist, /language sql[\s\S]*immutable[\s\S]*set search_path = ''/i);
  assert.match(
    migration,
    /revoke execute on function private\.jr_electrician_collection_is_readable\(text\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function private\.jr_electrician_collection_is_readable\(text\)[\s\S]*to authenticated, service_role/i,
  );
  assert.match(fieldPolicy, /private\.jr_electrician_collection_is_readable\(collection_key\)[\s\S]*else true/i);
  const canonicalPolicy = section(
    canonicalPolicyMigration,
    'drop policy if exists "cloud collections tenant read"',
    "create or replace function public.jr_os_deployed_migration",
  );
  assert.match(canonicalPolicy, /private\.can_manage_office_data\(\)/i);
  assert.doesNotMatch(canonicalPolicy, /electrician/i);
  assert.match(
    projection,
    /not private\.jr_electrician_collection_is_readable\(new\.collection_key\)[\s\S]*delete from public\.field_cloud_collections/i,
  );
  assert.doesNotMatch(migration, /delete\s+from\s+public\.field_cloud_collections/i);
});

test("electrician certificate-default caches purge and sanitize before offline fallback", () => {
  const records = [{
    id: "certificate-defaults",
    inspectorName: "Private Inspector",
    registrationNumber: "PRIVATE-REGISTRATION",
    notes: "Private office certification note",
  }];
  for (const mode of ["cloud", "migration"]) {
    assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-certificate-defaults", role: "electrician", mode }), "purge");
    assert.equal(
      roleProjectionCachePolicy({
        storageKey: "jr-os-certificate-defaults",
        role: "electrician",
        mode,
        generation: "20260903144000",
      }),
      "purge",
    );
    assert.deepEqual(
      sanitizeRoleProjectionCache({ storageKey: "jr-os-certificate-defaults", role: "electrician", mode, records }),
      [],
    );
  }
  assert.strictEqual(
    sanitizeRoleProjectionCache({ storageKey: "jr-os-certificate-defaults", role: "electrician", mode: "local", records }),
    records,
  );
  assert.strictEqual(
    sanitizeRoleProjectionCache({ storageKey: "jr-os-certificate-defaults", role: "office", mode: "cloud", records }),
    records,
  );
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-certificate-defaults", role: "electrician", mode: "local" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-certificate-defaults", role: "office", mode: "cloud" }), "keep");
  assert.equal(roleProjectionCacheGeneration({ storageKey: "jr-os-certificate-defaults", role: "electrician" }), undefined);
  assert.match(cache, /ELECTRICIAN_ALWAYS_PURGED_STORAGE_KEYS[\s\S]*"jr-os-certificate-defaults"/i);
  assert.match(
    cache,
    /role === "electrician"[\s\S]*storageKey === "jr-os-certificate-defaults"[\s\S]*return records\.length \? \[\] : records/i,
  );
  const policyIndex = adapter.indexOf("roleProjectionCachePolicy({ storageKey, role: cacheRole, mode, generation: cachedGeneration })");
  const offlineIndex = adapter.indexOf('if (mode === "local" || !navigator.onLine) return local');
  assert.ok(policyIndex >= 0 && offlineIndex > policyIndex, "certificate-default caches must purge before offline fallback");
});

test("electrician certificate-default routes and mutations remain denied", () => {
  assert.equal(canAccessPath("electrician", "/certificates"), false);
  assert.equal(canAccessPath("electrician", "/business"), false);
  assert.deepEqual(
    collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-certificate-defaults"),
    { kind: "deny" },
  );
});

test("live RLS coverage proves complete certificate defaults remain office-only", () => {
  for (const phrase of [
    "Service should seed a pre-migration certificate-default projection",
    "Office should retain complete certificate defaults",
    "Assigned electrician must not read certificate defaults from the field projection",
    "Co-assigned electrician must not read certificate defaults from the field projection",
    "Electrician without an active field identity must not read certificate defaults",
    "Tenant B electrician must not read its own organisation certificate defaults",
    "Customers must not read certificate defaults from the field projection",
    "Customers must not read canonical certificate defaults",
    "Electrician must not read canonical certificate defaults",
    "Another organisation must not read canonical certificate defaults",
    "Electrician direct certificate-default writes must fail closed",
    "Field collection RPC must reject certificate-default writes",
    "Office should retain certificate-default tombstone history",
    "Tombstoning certificate defaults must remove the stale field projection",
    "Electrician must not read deleted certificate defaults",
  ]) assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
});

test("recovery, guidance and deployment marker retain the certificate-default boundary", () => {
  const purchaseListBoundary = recovery.indexOf("20260903141000_scope_field_purchase_list_reads_to_assignments.sql");
  const certificateDefaultsBoundary = recovery.indexOf(migrationName);
  assert.ok(purchaseListBoundary >= 0 && certificateDefaultsBoundary > purchaseListBoundary);
  assert.match(
    recovery.slice(certificateDefaultsBoundary - 100, certificateDefaultsBoundary + migrationName.length + 50),
    /begin;[\s\S]*\\ir[\s\S]*commit;/i,
  );
  assert.match(setup, /certificate defaults[\s\S]*inspector, scheme-registration, numbering and private-note settings remain office-only/i);
  assert.match(rlsGuide, /certificate-default settings remain office-only[\s\S]*scheme registration[\s\S]*private notes/i);
  assert.match(migration, new RegExp(`'${migrationName.replaceAll(".", "\\.")}'`, "i"));
  assert.match(migration, /security invoker[\s\S]*set search_path = ''/i);
  assert.match(
    migration,
    /revoke execute on function public\.jr_os_deployed_migration\(\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(migration, /grant execute on function public\.jr_os_deployed_migration\(\)[\s\S]*to service_role/i);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});
