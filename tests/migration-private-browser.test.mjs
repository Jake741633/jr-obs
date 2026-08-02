import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const adapter = fs.readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const storage = fs.readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");

test("authenticated collection caches are scoped by organisation", () => {
  assert.match(adapter, /organisationStorageKey\(storageKey, organisationId\)/);
  assert.match(adapter, /return `\$\{storageKey\}:organisation:\$\{organisationId\}`/);
  assert.match(storage, /const activeStorageKey = organisationId \? organisationStorageKey\(key, organisationId\) : key/);
});

test("migration mode never trusts a legacy unscoped cache for an authenticated organisation", () => {
  assert.match(adapter, /const scopedStorageKey = organisationStorageKey\(storageKey, organisationId\)/);
  assert.match(adapter, /const local = readLocal<T>\(scopedStorageKey\)/);
  assert.doesNotMatch(adapter, /const local = readLocal<T>\(storageKey\)/);
  assert.match(adapter, /legacy unscoped key is[\s\S]*never trusted/);
});

test("switching organisations changes the active browser cache key", () => {
  const orgA = "jr-os-customers:organisation:org-a";
  const orgB = "jr-os-customers:organisation:org-b";
  assert.notEqual(orgA, orgB);
  assert.match(storage, /setIsReady\(false\)/);
  assert.match(storage, /\[activeStorageKey, identityReady, key, mode, organisationId, target, userId\]/);
});

test("fresh browsers hydrate only tenant-filtered cloud records", () => {
  assert.match(adapter, /organisation_id=eq\.\$\{organisationId\}/);
  assert.match(adapter, /const cloudRecords = rows\.map\(\(row\) => row\.payload\)/);
  assert.match(adapter, /writeLocal\(scopedStorageKey, cloudRecords\)/);
});

test("empty tenant cloud results do not fall back to another organisation's legacy data", () => {
  assert.match(adapter, /return cloudRecords/);
  assert.doesNotMatch(adapter, /return readLocal<T>\(storageKey\)/);
  assert.doesNotMatch(storage, /window\.localStorage\.setItem\(key, JSON\.stringify\(items\)\)/);
  assert.match(storage, /window\.localStorage\.setItem\(activeStorageKey, JSON\.stringify\(items\)\)/);
});
