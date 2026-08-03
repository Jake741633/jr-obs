import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");
const identity = readFileSync(new URL("../lib/cloud/useCloudIdentity.ts", import.meta.url), "utf8");

test("offline queue items are tagged with their organisation", () => {
  assert.match(repository, /export interface SyncQueueItem<[^>]*> \{[^}]*organisationId: string;/s);
  assert.match(repository, /syncQueueItemId\(item\.organisationId, item\.table, item\.collectionKey, item\.sourceId, queuedAt\)/);
  assert.match(repository, /coalesceQueue\(queue, next\)/);
});

test("offline queue identities cannot collide when values contain separators", () => {
  assert.match(repository, /export function syncQueueItemId\(organisationId: string, table: string, collectionKey: string \| undefined, sourceId: string, queuedAt: number\)/);
  assert.match(repository, /return JSON\.stringify\(\[organisationId, table, collectionKey \|\| "typed", sourceId, queuedAt\]\)/);
  assert.doesNotMatch(repository, /id: `\$\{item\.organisationId\}:\$\{item\.table\}:/);
});

test("queue reads and replay are restricted to the active organisation", () => {
  assert.match(repository, /function activeOrganisationId\(\)/);
  assert.match(repository, /return readAllSyncQueue\(\)\.filter\(\(item\) => item\.organisationId === organisationId\)/);
  assert.match(repository, /const queue = allQueue\.filter\(\(item\) => item\.organisationId === organisationId\)/);
  assert.match(repository, /tenantRecordQuery\(\{ organisationId: item\.organisationId, sourceId: item\.sourceId/);
});

test("organisation changes abort an in-flight replay before foreign writes", () => {
  const guards = repository.match(/if \(activeOrganisationId\(\) !== organisationId\)/g) ?? [];
  assert.ok(guards.length >= 2, "replay must check tenant ownership before and after remote reads");
  assert.match(repository, /remaining\.push\(\.\.\.queue\.slice\(processed\)\);\s*break;/s);
  assert.match(repository, /remaining\.push\(item, \.\.\.queue\.slice\(processed\)\);\s*break;/s);
});

test("replay preserves queues owned by other organisations", () => {
  assert.match(repository, /const untouched = liveQueue\.filter\(\(item\) => item\.organisationId !== organisationId \|\| !originalIds\.has\(item\.id\)\)/);
  assert.match(repository, /const nextQueue = \[\.\.\.untouched, \.\.\.retained\]/);
  assert.match(repository, /if \(activeOrganisationId\(\) === organisationId\) syncStatus\.set\(statusForQueue\(activeRemaining\)\)/);
});

test("failed retries stay bound to their original tenant", () => {
  assert.match(repository, /remaining\.push\(\{ \.\.\.item, attempts: item\.attempts \+ 1, state: "Failed"/);
  assert.match(repository, /const retained = remaining\.filter\(\(item\) => liveIds\.has\(item\.id\)\)/);
  assert.doesNotMatch(repository, /organisationId:\s*activeOrganisationId\(\)/);
});

test("sign-out clears active replay ownership", () => {
  assert.match(identity, /setActiveSyncOrganisation\(next\.identity\?\.organisationId \?\? null\)/);
  assert.match(repository, /else window\.localStorage\.removeItem\(ACTIVE_ORGANISATION_KEY\)/);
  assert.match(repository, /if \(!organisationId\) return \{ processed: 0, cleared: 0, remaining: 0, conflicts: 0, failed: 0 \}/);
});
