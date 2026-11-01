import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";
import { canAccessPath } from "../lib/cloud/permissions.ts";
import {
  roleProjectionCachePolicy,
  sanitizeRoleProjectionCache,
} from "../lib/cloud/roleProjectionCache-core.mjs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260827001445_keep_field_rams_office_only.sql", import.meta.url),
  "utf8",
);
const previousReadableCollections = readFileSync(
  new URL("../supabase/migrations/20260826121246_keep_field_completion_records_office_only.sql", import.meta.url),
  "utf8",
);
const finalPolicy = readFileSync(
  new URL("../supabase/migrations/20260826123514_hide_field_finance_timeline_activity.sql", import.meta.url),
  "utf8",
);
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return source.slice(start, end);
}

const readableCollections = section(
  migration,
  "create or replace function private.jr_electrician_collection_is_readable",
  "revoke execute on function private.jr_electrician_collection_is_readable",
);

test("the final electrician readable allowlist keeps RAMS office-only", () => {
  assert.match(previousReadableCollections, /'jr-os-rams'/i);
  assert.doesNotMatch(readableCollections, /'jr-os-rams'/i);
  for (const storageKey of ["jr-os-surveys", "jr-os-job-packs", "jr-os-job-timeline", "jr-os-job-progress"]) {
    assert.match(readableCollections, new RegExp(`'${storageKey}'`, "i"));
  }
  assert.match(finalPolicy, /private\.jr_electrician_collection_is_readable\(collection_key\)/i);
  assert.match(finalPolicy, /else true/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.field_cloud_collections/i);
});

test("electrician RAMS caches purge and sanitize before offline fallback", () => {
  const records = [{ id: "rams-private", risks: [{ hazard: "Private site hazard" }] }];
  for (const mode of ["cloud", "migration"]) {
    assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-rams", role: "electrician", mode }), "purge");
    assert.deepEqual(sanitizeRoleProjectionCache({ storageKey: "jr-os-rams", role: "electrician", mode, records }), []);
  }
  assert.strictEqual(sanitizeRoleProjectionCache({ storageKey: "jr-os-rams", role: "electrician", mode: "local", records }), records);
  assert.strictEqual(sanitizeRoleProjectionCache({ storageKey: "jr-os-rams", role: "office", mode: "cloud", records }), records);
});

test("electrician RAMS routes and mutations remain denied", () => {
  assert.equal(canAccessPath("electrician", "/rams"), false);
  assert.deepEqual(
    collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-rams"),
    { kind: "deny" },
  );
});

test("live RLS coverage proves every RAMS field read fails closed", () => {
  for (const phrase of [
    "Office should retain complete RAMS evidence",
    "Assigned electrician must not read RAMS from the field projection",
    "Co-assigned electrician must not read RAMS from the field projection",
    "Electrician must not read unassigned RAMS",
    "Electrician must not read unbound RAMS",
    "Electrician must not read another organisation's RAMS",
    "Electrician must not read RAMS after its canonical job is deleted",
    "Electrician direct RAMS writes must fail closed",
    "Read-only field collections must remain denied",
  ]) {
    assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }
});

test("recovery and deployment guidance retain the RAMS boundary", () => {
  assert.match(recovery, /20260827001445_keep_field_rams_office_only\.sql/);
  assert.match(setup, /canonical RAMS records[\s\S]*remain office-only until a dedicated secure field contract exists/i);
  assert.match(migration, /'migration',\s*'20260827001445_keep_field_rams_office_only\.sql'/i);
  assert.match(migration, /revoke execute on function private\.jr_electrician_collection_is_readable\(text\)[\s\S]*from public, anon, authenticated, service_role/i);
});
