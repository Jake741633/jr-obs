import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/electrical-calculators/cable-sizing/page.tsx", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const identity = readFileSync(new URL("../lib/cloud/useCloudIdentity.ts", import.meta.url), "utf8");
const guard = readFileSync(new URL("../components/CloudAccessGuard.tsx", import.meta.url), "utf8");

test("cable-sizing history is scoped to the full resolved authorisation identity", () => {
  assert.match(page, /useCloudIdentity\(\)/);
  assert.match(page, /accountStorageKey\(STORAGE_KEY, identity\.organisationId, identity\.userId, identity\.role, identity\.customerSourceId\)/);
  assert.match(adapter, /JSON\.stringify\(\[organisationId\]\)/);
  assert.match(adapter, /JSON\.stringify\(\[userId, role \?\? null, customerSourceId \?\? null\]\)/);
  assert.match(page, /useState<RecentCalculation\[\]>\(\[\]\)/);
  assert.doesNotMatch(page, /useState<RecentCalculation\[\]>\(readRecentCalculations\)/);
});

test("unresolved and switched identities cannot render the previous account history", () => {
  assert.match(page, /const historyReady = identityReady && activeHistoryKey !== null && loadedHistoryKey === activeHistoryKey/);
  assert.match(page, /const visibleRecent = historyReady \? recent : \[\]/);
  assert.match(page, /if \(!identityReady \|\| !activeHistoryKey\) \{\s*setRecent\(\[\]\);\s*setLoadedHistoryKey\(null\)/);
  assert.match(page, /\[activeHistoryKey, identityReady\]/);
  assert.match(identity, /emit\(\{ identity: null, isReady: false \}\)/);
  assert.match(guard, /<Fragment key=\{workspaceIdentityKey\}>\{children\}<\/Fragment>/);
});

test("authenticated history never reads, writes, removes, or claims the legacy raw key", () => {
  assert.match(page, /readRecentCalculations\(storageKey: string\)/);
  assert.match(page, /window\.localStorage\.getItem\(storageKey\)/);
  assert.match(page, /readRecentCalculations\(activeHistoryKey\)/);
  assert.match(page, /if \(!historyReady \|\| !activeHistoryKey\) return;/);
  assert.match(page, /window\.localStorage\.setItem\(activeHistoryKey, JSON\.stringify\(updated\)\)/);
  assert.match(page, /window\.localStorage\.removeItem\(activeHistoryKey\)/);
  assert.doesNotMatch(page, /window\.localStorage\.(?:getItem|setItem|removeItem)\(STORAGE_KEY/);
});

test("every account tuple component changes the browser history key", () => {
  const scoped = (organisationId, userId, role, customerSourceId = null) =>
    `history:organisation:${JSON.stringify([organisationId])}:account:${JSON.stringify([userId, role, customerSourceId])}`;
  const base = scoped("org-a", "user-a", "owner");

  assert.notEqual(base, scoped("org-b", "user-a", "owner"));
  assert.notEqual(base, scoped("org-a", "user-b", "owner"));
  assert.notEqual(base, scoped("org-a", "user-a", "electrician"));
  assert.notEqual(scoped("org-a", "user-a", "customer", "customer-a"), scoped("org-a", "user-a", "customer", "customer-b"));
  assert.equal(base, scoped("org-a", "user-a", "owner"));
});
