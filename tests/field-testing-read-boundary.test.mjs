import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  purgeRoleProjectionCacheStorage,
  roleProjectionCachePolicy,
  roleProjectionCacheStorageKeys,
  sanitizeRoleProjectionCache,
} from "../lib/cloud/roleProjectionCache-core.mjs";

const historicalPolicy = readFileSync(
  new URL("../supabase/migrations/20260803_017_customer_typed_table_reads.sql", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/20260903121755_keep_field_electrical_testing_office_only.sql", import.meta.url),
  "utf8",
);
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const collections = readFileSync(new URL("../lib/cloud/coreBusinessCollections.ts", import.meta.url), "utf8");
const migrationPolicy = readFileSync(new URL("../lib/cloud/migrationStoragePolicy-core.mjs", import.meta.url), "utf8");
const testingPage = readFileSync(new URL("../app/field/testing/page.tsx", import.meta.url), "utf8");
const progress = readFileSync(new URL("../components/MobileTestingProgress.tsx", import.meta.url), "utf8");
const jobsPage = readFileSync(new URL("../app/field/jobs/page.tsx", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");

test("canonical electrical testing reads are office-only after the historical staff policy", () => {
  assert.match(historicalPolicy, /'electrical_testing_records'/i);
  assert.match(historicalPolicy, /current_jr_role\(\) in \(''owner'',''admin'',''office'',''electrician''\)/i);
  assert.match(migration, /drop policy if exists electrical_testing_records_select on public\.electrical_testing_records/i);
  const selectPolicy = /create policy electrical_testing_records_select[\s\S]*?;\n/i.exec(migration)?.[0] ?? "";
  assert.match(selectPolicy, /for select to authenticated/i);
  assert.match(selectPolicy, /organisation_id\s*=\s*private\.current_organisation_id\(\)/i);
  assert.match(selectPolicy, /\(select private\.can_manage_office_data\(\)\)/i);
  assert.doesNotMatch(selectPolicy, /electrician|customer/i);
  assert.doesNotMatch(selectPolicy, /deleted_at/i, "Office testing history must retain tombstone visibility");
  assert.doesNotMatch(
    migration,
    /electrical_testing_records_(?:insert|update|delete)/i,
    "The additive migration must not rewrite established write policies",
  );
});

test("electrician canonical electrical testing caches have a fail-closed policy", () => {
  const records = [{ id: "testing-1", circuits: [{ notes: "Complete private test evidence" }] }];
  for (const storageKey of ["jr-os-electrical-testing", "jr-os-electrical-testing-records"]) {
    for (const mode of ["cloud", "migration"]) {
      assert.equal(roleProjectionCachePolicy({ storageKey, role: "electrician", mode }), "purge");
      assert.deepEqual(sanitizeRoleProjectionCache({ storageKey, role: "electrician", mode, records }), []);
    }
    assert.strictEqual(sanitizeRoleProjectionCache({ storageKey, role: "electrician", mode: "local", records }), records);
    assert.strictEqual(sanitizeRoleProjectionCache({ storageKey, role: "office", mode: "cloud", records }), records);
  }
});

test("field testing physically scrubs both exact electrician cache families", () => {
  const canonicalKeys = ["jr-os-electrical-testing", "jr-os-electrical-testing-records"];
  const accountScope = (storageKey, role) => `${storageKey}:organisation:${JSON.stringify(["org-a"])}:account:${JSON.stringify(["user-a", role, null])}`;
  const electricianScope = (storageKey) => accountScope(storageKey, "electrician");
  const officeScope = accountScope(canonicalKeys[0], "office");
  const draftScope = accountScope("jr-os-field-electrical-testing-drafts", "electrician");
  const retained = new Map([
    [officeScope, "office-records"],
    [draftScope, "field-drafts"],
  ]);
  for (const canonicalKey of canonicalKeys) {
    for (const cacheKey of roleProjectionCacheStorageKeys(electricianScope(canonicalKey))) {
      retained.set(cacheKey, "private-testing-data");
    }
  }
  const storage = { removeItem(key) { retained.delete(key); } };

  for (const canonicalKey of canonicalKeys) purgeRoleProjectionCacheStorage(storage, electricianScope(canonicalKey));

  for (const canonicalKey of canonicalKeys) {
    for (const cacheKey of roleProjectionCacheStorageKeys(electricianScope(canonicalKey))) {
      assert.equal(retained.has(cacheKey), false, cacheKey);
    }
  }
  assert.equal(retained.get(officeScope), "office-records");
  assert.equal(retained.get(draftScope), "field-drafts");
  assert.deepEqual(roleProjectionCacheStorageKeys(""), []);
  assert.match(adapter, /export function accountStorageKey\(storageKey: string, organisationId: string, userId\?: string, role\?: string, customerSourceId\?: string\)/);
  assert.match(adapter, /JSON\.stringify\(\[userId, role \?\? null, customerSourceId \?\? null\]\)/);
});

test("every field testing consumer uses one account-scoped device-local draft collection", () => {
  assert.match(collections, /export const fieldElectricalTestingDraftStorageKey = "jr-os-field-electrical-testing-drafts";/);
  assert.match(collections, /export function useFieldElectricalTestingCollection\(\)/);
  assert.match(collections, /mode !== "local" && identity\?\.role === "electrician"/);
  assert.match(collections, /\? fieldElectricalTestingDraftStorageKey\s*:\s*coreBusinessStorageKeys\.electricalTesting;/);
  assert.match(collections, /for \(const canonicalStorageKey of \[coreBusinessStorageKeys\.electricalTesting, "jr-os-electrical-testing-records"\]\)/);
  assert.match(collections, /purgeRoleProjectionCacheStorage\([\s\S]*window\.localStorage,[\s\S]*accountStorageKey\(/);
  assert.doesNotMatch(migrationPolicy, /jr-os-field-electrical-testing-drafts/);
  for (const consumer of [testingPage, progress, jobsPage]) {
    assert.match(consumer, /useFieldElectricalTestingCollection\(\)/);
    assert.doesNotMatch(consumer, /useElectricalTestingCollection\(\)/);
  }
  assert.doesNotMatch(testingPage, /canonicalRecords|fieldDraftRecords/);
});

test("live RLS coverage proves field denial and office retention", () => {
  for (const phrase of [
    "Electrician must not read complete electrical testing records",
    "Office should retain complete electrical testing records",
    "Customer must not read complete electrical testing records",
    "Another organisation must not read complete electrical testing records",
    "Office should retain electrical testing tombstone history",
    "Electrician must not read deleted electrical testing records",
  ]) {
    assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }
});

test("recovery and setup guidance retain the electrical testing boundary", () => {
  const certificateBoundary = recovery.indexOf("20260903104633_keep_field_certificates_office_only.sql");
  const testingBoundary = recovery.indexOf("20260903121755_keep_field_electrical_testing_office_only.sql");
  assert.ok(testingBoundary > certificateBoundary, "Recovery must apply the latest testing policy after historical read policies");
  assert.match(
    recovery,
    /begin;\s*\\ir \.\.\/migrations\/20260903121755_keep_field_electrical_testing_office_only\.sql\s*commit;/i,
  );
  assert.match(setup, /canonical electrical testing rows[\s\S]*remain office-only[\s\S]*device-local drafts/i);
  assert.match(migration, /'migration',\s*'20260903121755_keep_field_electrical_testing_office_only\.sql'/i);
});
