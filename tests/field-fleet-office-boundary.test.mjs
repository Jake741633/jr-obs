import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";
import { canAccessPath } from "../lib/cloud/permissions.ts";
import {
  purgeElectricianFleetCollectionCaches,
  roleProjectionCacheGeneration,
  roleProjectionCachePolicy,
  roleProjectionCacheStorageKeys,
  sanitizeRoleProjectionCache,
} from "../lib/cloud/roleProjectionCache-core.mjs";

const migrationName = "20260903153000_keep_field_fleet_office_only.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const previousReadableCollections = readFileSync(
  new URL("../supabase/migrations/20260903144000_keep_field_certificate_defaults_office_only.sql", import.meta.url),
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
const identity = readFileSync(new URL("../lib/cloud/useCloudIdentity.ts", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const fieldMaterials = readFileSync(new URL("../app/field/materials/page.tsx", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return source.slice(start, end);
}

class FakeStorage {
  constructor(entries = []) { this.values = new Map(entries); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function seedCache(storage, scopedStorageKey) {
  for (const key of roleProjectionCacheStorageKeys(scopedStorageKey)) storage.setItem(key, "private-fleet-data");
}

function assertCacheAbsent(storage, scopedStorageKey) {
  for (const key of roleProjectionCacheStorageKeys(scopedStorageKey)) assert.equal(storage.getItem(key), null, key);
}

function assertCachePresent(storage, scopedStorageKey) {
  for (const key of roleProjectionCacheStorageKeys(scopedStorageKey)) assert.notEqual(storage.getItem(key), null, key);
}

test("the final field collection allowlist keeps complete fleet records office-only", () => {
  const allowlist = section(
    migration,
    "create or replace function private.jr_electrician_collection_is_readable",
    "revoke execute on function private.jr_electrician_collection_is_readable",
  );

  assert.match(previousReadableCollections, /'jr-os-fleet'/i);
  assert.doesNotMatch(allowlist, /jr-os-fleet/i);
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

test("electrician fleet caches purge at the identity boundary and before offline fallback", () => {
  const records = [{
    id: "vehicle-private",
    registration: "PRIVATE-REG",
    assignedTeamMemberId: "private-team-id",
    insuranceDue: "2027-09-03",
    currentMileage: 42424,
    notes: "Private office vehicle note",
  }];
  for (const mode of ["cloud", "migration"]) {
    assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-fleet", role: "electrician", mode }), "purge");
    assert.deepEqual(sanitizeRoleProjectionCache({ storageKey: "jr-os-fleet", role: "electrician", mode, records }), []);
  }
  assert.strictEqual(sanitizeRoleProjectionCache({ storageKey: "jr-os-fleet", role: "electrician", mode: "local", records }), records);
  assert.strictEqual(sanitizeRoleProjectionCache({ storageKey: "jr-os-fleet", role: "office", mode: "cloud", records }), records);
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-fleet", role: "electrician", mode: "local" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-fleet", role: "office", mode: "cloud" }), "keep");
  assert.equal(roleProjectionCacheGeneration({ storageKey: "jr-os-fleet", role: "electrician" }), undefined);

  const electrician = 'jr-os-fleet:organisation:["org-a"]:account:["user-a","electrician",null]';
  const delimiterIds = 'jr-os-fleet:organisation:["org:account:embedded"]:account:["user:account:embedded","electrician",null]';
  const office = 'jr-os-fleet:organisation:["org-a"]:account:["office-a","office",null]';
  const admin = 'jr-os-fleet:organisation:["org-a"]:account:["admin-a","admin",null]';
  const owner = 'jr-os-fleet:organisation:["org-a"]:account:["owner-a","owner",null]';
  const customer = 'jr-os-fleet:organisation:["org-a"]:account:["customer-a","customer","customer-source-a"]';
  const organisationOnly = 'jr-os-fleet:organisation:["org-a"]';
  const legacyRawOrganisation = "jr-os-fleet:organisation:org-legacy";
  const legacyOneTuple = 'jr-os-fleet:organisation:["org-legacy"]:account:["user-legacy"]';
  const legacyRawScope = "jr-os-fleet:organisation:org-legacy:account:user-legacy%40example.com";
  const unscoped = "jr-os-fleet";
  const unrelated = 'jr-os-job-packs:organisation:["org-a"]:account:["user-a","electrician",null]';
  const orphanCompanion = 'jr-os-fleet:organisation:["org-orphan"]:account:["user-orphan","electrician",null]';
  const storage = new FakeStorage();
  for (const scoped of [electrician, delimiterIds, office, admin, owner, customer, organisationOnly, legacyRawOrganisation, legacyOneTuple, legacyRawScope, unscoped, unrelated]) seedCache(storage, scoped);
  storage.setItem(`jr-os-cloud-created-by:${orphanCompanion}`, "private-fleet-data");

  purgeElectricianFleetCollectionCaches(storage);

  assertCacheAbsent(storage, electrician);
  assertCacheAbsent(storage, delimiterIds);
  assertCacheAbsent(storage, organisationOnly);
  assertCacheAbsent(storage, legacyRawOrganisation);
  assertCacheAbsent(storage, legacyOneTuple);
  assertCacheAbsent(storage, legacyRawScope);
  assertCacheAbsent(storage, orphanCompanion);
  for (const retained of [office, admin, owner, customer, unscoped, unrelated]) {
    assertCachePresent(storage, retained);
  }
  assert.match(cache, /ELECTRICIAN_ALWAYS_PURGED_STORAGE_KEYS[\s\S]*"jr-os-fleet"/i);
  assert.match(
    cache,
    /role === "electrician"[\s\S]*storageKey === "jr-os-fleet"[\s\S]*return records\.length \? \[\] : records/i,
  );
  const identityPurge = identity.indexOf("purgeElectricianFleetCollectionCaches(window.localStorage)");
  const identityPublish = identity.indexOf("snapshot = next", identity.indexOf("function emit"));
  assert.ok(identityPurge >= 0 && identityPublish > identityPurge, "dormant caches must purge before an identity becomes observable");
  assert.match(identity.slice(identity.indexOf("function emit"), identityPurge), /effectiveCloudMode\(\) !== "local"/);
  assert.doesNotMatch(identity.slice(identity.indexOf("function emit"), identityPurge), /next\.identity/);
  assert.match(identity.slice(identity.indexOf("function emit"), identityPublish), /try[\s\S]*purgeElectricianFleetCollectionCaches[\s\S]*catch/);
  const policyIndex = adapter.indexOf("roleProjectionCachePolicy({ storageKey, role: cacheRole, mode, generation: cachedGeneration })");
  const offlineIndex = adapter.indexOf('if (mode === "local" || !navigator.onLine) return local');
  assert.ok(policyIndex >= 0 && offlineIndex > policyIndex, "fleet caches must purge before offline fallback");
});

test("electrician fleet routes and mutations remain denied without breaking field materials", () => {
  for (const path of ["/assets", "/planner", "/stock"]) assert.equal(canAccessPath("electrician", path), false);
  assert.equal(canAccessPath("electrician", "/field/materials"), true);
  assert.doesNotMatch(fieldMaterials, /jr-os-fleet/i);
  assert.deepEqual(
    collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-fleet"),
    { kind: "deny" },
  );
  assert.deepEqual(
    collectionCloudMutationRoute("cloud_collections", "office", "jr-os-fleet"),
    { kind: "direct" },
  );
});

test("live RLS coverage proves complete fleet records remain office-only", () => {
  for (const phrase of [
    "Service should seed a pre-migration fleet projection",
    "Office should retain complete fleet records",
    "Assigned electrician must not read fleet records from the field projection",
    "Co-assigned electrician must not read fleet records from the field projection",
    "Electrician without an active field identity must not read fleet records",
    "Tenant B electrician must not read its own organisation fleet records",
    "Customers must not read fleet records from the field projection",
    "Electrician must not read canonical fleet records",
    "Customers must not read canonical fleet records",
    "Another organisation must not read canonical fleet records",
    "Electrician direct fleet writes must fail closed",
    "Field collection RPC must reject fleet writes",
    "Office should retain fleet tombstone history",
    "Tombstoning fleet records must remove the stale field projection",
    "Electrician must not read deleted fleet records",
  ]) assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
});

test("recovery, guidance and deployment marker retain the fleet boundary", () => {
  const certificateDefaultsBoundary = recovery.indexOf("20260903144000_keep_field_certificate_defaults_office_only.sql");
  const fleetBoundary = recovery.indexOf(migrationName);
  assert.ok(certificateDefaultsBoundary >= 0 && fleetBoundary > certificateDefaultsBoundary);
  assert.match(
    recovery.slice(fleetBoundary - 100, fleetBoundary + migrationName.length + 50),
    /begin;[\s\S]*\\ir[\s\S]*commit;/i,
  );
  assert.match(setup, /fleet registrations[\s\S]*staff assignments[\s\S]*compliance dates[\s\S]*private notes remain office-only/i);
  assert.match(rlsGuide, /fleet records remain office-only[\s\S]*vehicle\s+registrations[\s\S]*private notes/i);
  assert.match(migration, new RegExp(`'${migrationName.replaceAll(".", "\\.")}'`, "i"));
  assert.match(migration, /security invoker[\s\S]*set search_path = ''/i);
  assert.match(
    migration,
    /revoke execute on function public\.jr_os_deployed_migration\(\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(migration, /grant execute on function public\.jr_os_deployed_migration\(\)[\s\S]*to service_role/i);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});
