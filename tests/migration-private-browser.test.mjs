import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const adapter = fs.readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const storage = fs.readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");

test("authenticated collection caches are scoped by the complete authorisation identity", () => {
  assert.match(adapter, /organisationStorageKey\(storageKey, organisationId\)/);
  assert.match(adapter, /return `\$\{storageKey\}:organisation:\$\{JSON\.stringify\(\[organisationId\]\)\}`/);
  assert.match(adapter, /export function accountStorageKey\(storageKey: string, organisationId: string, userId\?: string, role\?: string, customerSourceId\?: string\)/);
  assert.match(adapter, /return userId \? `\$\{organisationKey\}:account:\$\{JSON\.stringify\(\[userId, role \?\? null, customerSourceId \?\? null\]\)\}` : organisationKey/);
  assert.match(storage, /const cacheUserId = userId/);
  assert.doesNotMatch(storage, /identity\?\.role === "customer" \? userId : undefined/);
  assert.match(storage, /const cacheRole = identity\?\.role/);
  assert.match(storage, /const cacheCustomerSourceId = identity\?\.customerSourceId/);
  assert.match(storage, /const activeStorageKey = organisationId \? accountStorageKey\(key, organisationId, cacheUserId, cacheRole, cacheCustomerSourceId\) : key/);
});

test("migration mode never trusts a legacy unscoped cache for an authenticated organisation", () => {
  assert.match(adapter, /const scopedStorageKey = accountStorageKey\(storageKey, organisationId, cacheUserId, cacheRole, cacheCustomerSourceId\)/);
  assert.match(adapter, /const local = readLocal<T>\(scopedStorageKey\)/);
  assert.doesNotMatch(adapter, /const local = readLocal<T>\(storageKey\)/);
  assert.match(adapter, /legacy unscoped key is[\s\S]*never trusted/);
});

test("switching organisations, users, roles or customer assignments changes the active browser cache key", () => {
  const orgA = "jr-os-customers:organisation:[\"org-a\"]";
  const orgB = "jr-os-customers:organisation:[\"org-b\"]";
  const accountA = `${orgA}:account:${JSON.stringify(["user-a", "admin", null])}`;
  const accountB = `${orgA}:account:${JSON.stringify(["user-b", "admin", null])}`;
  const demotedAccountA = `${orgA}:account:${JSON.stringify(["user-a", "electrician", null])}`;
  const reassignedCustomerA = `${orgA}:account:${JSON.stringify(["user-a", "customer", "customer-b"])}`;
  assert.notEqual(orgA, orgB);
  assert.notEqual(accountA, accountB);
  assert.notEqual(accountA, demotedAccountA);
  assert.notEqual(accountA, reassignedCustomerA);
  assert.match(storage, /setIsReady\(false\)/);
  assert.match(storage, /\[activeStorageKey, cacheCustomerSourceId, cacheRole, cacheUserId, identityReady, key, mode, organisationId, target, userId\]/);
});

test("fresh browsers hydrate only tenant-filtered cloud records", () => {
  assert.match(adapter, /organisation_id=eq\.\$\{encodeURIComponent\(organisationId\)\}/);
  assert.match(adapter, /const cloudRecords = rows\.map\(\(row\) => row\.payload\)/);
  assert.match(adapter, /writeLocal\(scopedStorageKey, roleProjectionRecords\)/);
});

test("empty tenant cloud results do not fall back to another organisation's legacy data", () => {
  assert.match(adapter, /return roleProjectionRecords/);
  assert.doesNotMatch(adapter, /return readLocal<T>\(storageKey\)/);
  assert.doesNotMatch(storage, /window\.localStorage\.setItem\(key, JSON\.stringify\(items\)\)/);
  assert.match(storage, /window\.localStorage\.setItem\(activeStorageKey, JSON\.stringify\(items\)\)/);
});
