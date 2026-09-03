import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canAccessPath } from "../lib/cloud/permissions.ts";
import {
  ELECTRICIAN_STOCK_LOCATION_PROJECTION_CACHE_GENERATION,
  roleProjectionCacheGeneration,
  roleProjectionCachePolicy,
  sanitizeRoleProjectionCache,
} from "../lib/cloud/roleProjectionCache-core.mjs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260903163000_redact_field_stock_locations.sql", import.meta.url),
  "utf8",
);
const cacheTypes = readFileSync(new URL("../lib/cloud/roleProjectionCache-core.d.mts", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const fieldMaterials = readFileSync(new URL("../app/field/materials/page.tsx", import.meta.url), "utf8");
const liveRls = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const integrationGuide = readFileSync(new URL("../docs/SUPABASE_RLS_INTEGRATION_TESTS.md", import.meta.url), "utf8");

function functionBody(source, name) {
  const start = source.indexOf(`create or replace function ${name}`);
  const end = source.indexOf("revoke execute on function", start);
  assert.ok(start >= 0 && end > start, `Expected ${name} in migration`);
  return source.slice(start, end);
}

test("field stock-location projection exposes only IDs and names", () => {
  const projector = functionBody(migration, "private.jr_field_cloud_payload");
  const branchMatch = projector.match(/when 'jr-os-stock-locations' then([\s\S]*?)\n    else record_payload/);
  assert.ok(branchMatch, "Expected an explicit stock-location projector branch");
  const projectedPairs = [...branchMatch[1].matchAll(/'([^']+)', record_payload -> '([^']+)'/g)]
    .map((match) => [match[1], match[2]]);
  assert.deepEqual(projectedPairs, [["id", "id"], ["name", "name"]]);
  assert.doesNotMatch(branchMatch[1], /type|vehicleId|notes|createdAt|updatedAt|future/i);

  for (const preservedBranch of [
    "jr-os-surveys",
    "jr-os-job-progress",
    "jr-os-job-packs",
    "jr-os-job-variations",
    "jr-os-job-timeline",
    "jr-os-job-material-usage",
  ]) assert.match(projector, new RegExp(`when '${preservedBranch}' then`));

  const privateFields = functionBody(migration, "private.jr_field_cloud_collection_has_private_fields");
  assert.match(privateFields, /'jr-os-stock-locations'/);
  assert.match(migration, /lock table public\.cloud_collections in share row exclusive mode;[\s\S]*lock table public\.field_cloud_collections in share row exclusive mode;/i);
  assert.match(
    migration,
    /update public\.field_cloud_collections projection[\s\S]*private\.jr_field_cloud_payload\(source\.collection_key, source\.payload\)[\s\S]*source\.collection_key = 'jr-os-stock-locations'/i,
  );
  assert.match(migration, /'20260903163000_redact_field_stock_locations\.sql'/);
});

test("electrician stock-location caches purge complete legacy payloads", () => {
  const completeRecord = {
    id: "location-1",
    name: "Field van",
    type: "Van",
    vehicleId: "vehicle-private",
    notes: "Gate key is held in the private office drawer",
    createdAt: "2026-09-03T12:00:00.000Z",
    updatedAt: "2026-09-03T12:00:00.000Z",
    futureOfficeField: "private",
  };
  const legacyRecords = [null, "invalid", completeRecord];

  assert.equal(ELECTRICIAN_STOCK_LOCATION_PROJECTION_CACHE_GENERATION, "20260903163000");
  assert.equal(
    roleProjectionCacheGeneration({ storageKey: "jr-os-stock-locations", role: "electrician" }),
    ELECTRICIAN_STOCK_LOCATION_PROJECTION_CACHE_GENERATION,
  );
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-stock-locations", role: "electrician", mode: "cloud" }), "purge");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-stock-locations", role: "electrician", mode: "migration", generation: "old" }), "purge");
  assert.equal(
    roleProjectionCachePolicy({
      storageKey: "jr-os-stock-locations",
      role: "electrician",
      mode: "cloud",
      generation: ELECTRICIAN_STOCK_LOCATION_PROJECTION_CACHE_GENERATION,
    }),
    "keep",
  );

  const sanitized = sanitizeRoleProjectionCache({
    storageKey: "jr-os-stock-locations",
    role: "electrician",
    mode: "cloud",
    records: legacyRecords,
  });
  assert.deepEqual(sanitized, [{ id: "location-1", name: "Field van" }]);
  assert.equal(completeRecord.notes, "Gate key is held in the private office drawer", "sanitizing must not mutate the canonical-shaped source");
  assert.strictEqual(
    sanitizeRoleProjectionCache({ storageKey: "jr-os-stock-locations", role: "electrician", mode: "local", records: legacyRecords }),
    legacyRecords,
  );
  assert.strictEqual(
    sanitizeRoleProjectionCache({ storageKey: "jr-os-stock-locations", role: "office", mode: "cloud", records: legacyRecords }),
    legacyRecords,
  );
  assert.equal(roleProjectionCacheGeneration({ storageKey: "jr-os-stock-locations", role: "office" }), undefined);
  assert.match(cacheTypes, /ELECTRICIAN_STOCK_LOCATION_PROJECTION_CACHE_GENERATION: "20260903163000"/);
});

test("safe stock-location labels remain available after one online cache refresh", () => {
  const legacy = [{ id: "location-1", name: "Field van", notes: "private" }];
  const firstOfflineRead = roleProjectionCachePolicy({
    storageKey: "jr-os-stock-locations",
    role: "electrician",
    mode: "cloud",
    generation: "pre-projection",
  }) === "purge" ? [] : legacy;
  assert.deepEqual(firstOfflineRead, [], "an old complete cache must fail closed until reconnect");

  const fetched = sanitizeRoleProjectionCache({
    storageKey: "jr-os-stock-locations",
    role: "electrician",
    mode: "cloud",
    records: legacy,
  });
  const laterOfflineRead = roleProjectionCachePolicy({
    storageKey: "jr-os-stock-locations",
    role: "electrician",
    mode: "cloud",
    generation: ELECTRICIAN_STOCK_LOCATION_PROJECTION_CACHE_GENERATION,
  }) === "keep"
    ? sanitizeRoleProjectionCache({ storageKey: "jr-os-stock-locations", role: "electrician", mode: "cloud", records: fetched })
    : [];
  assert.deepEqual(laterOfflineRead, [{ id: "location-1", name: "Field van" }]);
  assert.match(adapter, /const roleProjectionRecords = sanitizeRoleProjectionCache\(\{ storageKey, role: cacheRole, mode, records: cloudRecords \}\)/);
  assert.match(adapter, /writeLocal\(scopedStorageKey, roleProjectionRecords\)[\s\S]*projectionGenerationKey\(scopedStorageKey\), projectionGeneration/);
});

test("field stock-location UI consumes only the projected label contract", () => {
  assert.match(fieldMaterials, /locations\.items\.map\(\(item\) => \[item\.id, item\.name\]\)/);
  assert.doesNotMatch(fieldMaterials, /location\.type|location\.vehicleId|location\.notes|location\.createdAt|location\.updatedAt/);
  assert.equal(canAccessPath("electrician", "/field/materials"), true);
  assert.equal(canAccessPath("electrician", "/stock"), false);
  assert.equal(canAccessPath("office", "/stock"), true);
});

test("live RLS suite verifies exact stock-location payloads", () => {
  for (const requiredPhrase of [
    "Field stock-location projection must expose exactly the ID and display name",
    "Office must retain the canonical stock-location vehicle link",
    "Office must retain canonical stock-location notes",
    "Unknown canonical stock-location fields must remain office-only",
    "Customers must not read field stock-location projections",
    "Shared stock-location projection must remain exact for another field worker",
    "Another organisation must not read the stock-location projection",
    "Field stock-location projection must refresh the exact safe label",
    "Electrician must not read a tombstoned stock-location projection",
  ]) assert.match(liveRls, new RegExp(requiredPhrase.replaceAll(" ", "\\s+"), "i"));
  assert.match(liveRls, /collectionKey === "jr-os-stock-locations" \? null : customerA/);
  assert.match(liveRls, /collectionKey === "jr-os-stock-locations" \? null : jobA/);
});

test("recovery and deployment guidance retain the stock-location boundary", () => {
  const fleetIndex = recovery.indexOf("20260903153000_keep_field_fleet_office_only.sql");
  const locationIndex = recovery.indexOf("20260903163000_redact_field_stock_locations.sql");
  assert.ok(fleetIndex >= 0 && locationIndex > fleetIndex);
  assert.match(recovery, /begin;\s*\\ir \.\.\/migrations\/20260903163000_redact_field_stock_locations\.sql\s*commit;/i);
  assert.match(setup, /stock-location projections expose only the stable ID and display name/i);
  assert.match(integrationGuide, /projection contains exactly the stable ID and display name/i);
});
