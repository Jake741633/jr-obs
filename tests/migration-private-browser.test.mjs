import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const adapter = fs.readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const storage = fs.readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");

test("authenticated collection caches are scoped by organisation and restricted account", () => {
  assert.match(adapter, /organisationStorageKey\(storageKey, organisationId\)/);
  assert.match(adapter, /return `\$\{storageKey\}:organisation:\$\{JSON\.stringify\(\[organisationId\]\)\}`/);
  assert.match(adapter, /export function accountStorageKey\(storageKey: string, organisationId: string, userId\?: string\)/);
  assert.match(adapter, /return userId \? `\$\{organisationKey\}:account:\$\{JSON\.stringify\(\[userId\]\)\}` : organisationKey/);
  assert.match(storage, /const cacheUserId = identity\?\.role === "customer" \? userId : undefined/);
  assert.match(storage, /const activeStorageKey = organisationId \? accountStorageKey\(key, organisationId, cacheUserId\) : key/);
});

test("migration mode never trusts a legacy unscoped cache for an authenticated organisation", () => {
  assert.match(adapter, /const scopedStorageKey = accountStorageKey\(storageKey, organisationId, cacheUserId\)/);
  assert.match(adapter, /const local = readLocal<T>\(scopedStorageKey\)/);
  assert.doesNotMatch(adapter, /const local = readLocal<T>\(storageKey\)/);
  assert.match(adapter, /legacy unscoped key is[\s\S]*never trusted/);
});

test("switching organisations or restricted accounts changes the active browser cache key", () => {
  const orgA = "jr-os-customers:organisation:[\"org-a\"]";
  const orgB = "jr-os-customers:organisation:[\"org-b\"]";
  const customerA = `${orgA}:account:[\"user-a\"]`;
  const customerB = `${orgA}:account:[\"user-b\"]`;
  assert.notEqual(orgA, orgB);
  assert.notEqual(customerA, customerB);
  assert.match(storage, /setIsReady\(false\)/);
  assert.match(storage, /\[activeStorageKey, cacheUserId, identityReady, key, mode, organisationId, target, userId\]/);
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
