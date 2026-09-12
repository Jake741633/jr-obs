import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");
const identity = readFileSync(new URL("../lib/cloud/useCloudIdentity.ts", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");

test("offline queue items are tagged with their complete authorisation context", () => {
  assert.match(repository, /export interface SyncQueueItem<[^>]*> \{[^}]*organisationId: string;[^}]*userId\?: string;[^}]*role\?: string;[^}]*customerSourceId\?: string;/s);
  assert.match(repository, /syncQueueItemId\(safeItem\.organisationId, safeItem\.userId, safeItem\.role, safeItem\.customerSourceId, safeItem\.table, safeItem\.collectionKey, safeItem\.sourceId, queuedAt, mutationId\)/);
  assert.match(repository, /coalesceQueue\(queue, next\)/);
  assert.match(adapter, /queueChange\(\{[^}]*userId, role: cacheRole, customerSourceId: cacheCustomerSourceId \}\)/);
});

test("suspended, deleted or reassigned memberships fail live replay preflight", () => {
  assert.match(repository, /const sessionUserId = readSupabaseSession\(\)\?\.user\?\.id/);
  assert.match(repository, /profiles\?id=eq\.\$\{encodeURIComponent\(expected\.userId\)\}&active=eq\.true&select=organisation_id,role,customer_source_id,active/);
  assert.match(repository, /if \(!live \|\| !sameSyncAuthorization\(live, expected\)\) \{/);
  assert.match(repository, /setActiveSyncIdentity\(null, null, null, null\)/);
  assert.match(repository, /window\.dispatchEvent\(new Event\("jr-os-cloud-identity-changed"\)\)/);
});

test("offline queue identities cannot collide when values contain separators", () => {
  assert.match(repository, /export function syncQueueItemId\(organisationId: string, userId: string \| undefined, role: string \| undefined, customerSourceId: string \| undefined, table: string, collectionKey: string \| undefined, sourceId: string, queuedAt: number, mutationId\?: string\)/);
  assert.match(repository, /return JSON\.stringify\(\[organisationId, userId \?\? null, role \?\? null, customerSourceId \?\? null, table, collectionKey \|\| "typed", sourceId, queuedAt, mutationId \?\? null\]\)/);
  assert.doesNotMatch(repository, /id: `\$\{item\.organisationId\}:\$\{item\.table\}:/);
});

test("queue reads and replay are restricted to the active authorisation context", () => {
  assert.match(repository, /function activeOrganisationId\(\)/);
  assert.match(repository, /function activeUserId\(\)/);
  assert.match(repository, /function activeRole\(\)/);
  assert.match(repository, /function activeCustomerSourceId\(\)/);
  assert.match(repository, /return readAllSyncQueue\(\)\.filter\(\(item\) => queueItemMatchesAuthorization\(item, authorization\)\)/);
  assert.match(repository, /const queue = allQueue\.filter\(\(item\) => queueItemMatchesAuthorization\(item, authorization\)\)/);
  assert.match(repository, /await revalidateSyncAuthorization\(authorization\)/);
  assert.match(repository, /tenantRecordQuery\(\{ organisationId: item\.organisationId, sourceId: item\.sourceId/);
});

test("identity changes abort an in-flight replay before foreign writes", () => {
  const guards = repository.match(/if \(!activeSyncAuthorizationMatches\(authorization\)\)/g) ?? [];
  assert.ok(guards.length >= 2, "replay must check the full authorisation context before and after remote reads");
  assert.match(repository, /remaining\.push\(\.\.\.queue\.slice\(processed\)\);\s*break;/s);
  assert.match(repository, /remaining\.push\(item, \.\.\.queue\.slice\(processed\)\);\s*break;/s);
});

test("replay preserves queues owned by other authorisation contexts", () => {
  assert.match(repository, /const nextQueue = mergeProcessedQueue\(liveQueue, queue, remaining\)/);
  assert.match(repository, /if \(activeSyncAuthorizationMatches\(authorization\)\) syncStatus\.set\(statusForQueue\(activeRemaining\)\)/);
});

test("failed retries stay bound to their original tenant", () => {
  assert.match(repository, /attempts: item\.attempts \+ 1,[\s\S]*state: isCloudConflictError\(error\) \? "Conflict" : "Failed"/);
  assert.match(repository, /const nextQueue = mergeProcessedQueue\(liveQueue, queue, remaining\)/);
  assert.doesNotMatch(repository, /organisationId:\s*activeOrganisationId\(\)/);
});

test("sign-out clears active replay ownership", () => {
  assert.match(identity, /setActiveSyncIdentity\([\s\S]*next\.identity\?\.organisationId[\s\S]*next\.identity\?\.userId[\s\S]*next\.identity\?\.role[\s\S]*next\.identity\?\.customerSourceId/);
  assert.match(repository, /else window\.localStorage\.removeItem\(ACTIVE_ORGANISATION_KEY\)/);
  assert.match(repository, /else window\.localStorage\.removeItem\(ACTIVE_USER_KEY\)/);
  assert.match(repository, /else window\.localStorage\.removeItem\(ACTIVE_ROLE_KEY\)/);
  assert.match(repository, /else window\.localStorage\.removeItem\(ACTIVE_CUSTOMER_SOURCE_KEY\)/);
  assert.match(repository, /if \(!authorization\) return \{ processed: 0, cleared: 0, remaining: 0, conflicts: 0, failed: 0 \}/);
});
