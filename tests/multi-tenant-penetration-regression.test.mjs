import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");
const identity = readFileSync(new URL("../lib/cloud/useCloudIdentity.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");
const privateFiles = readFileSync(new URL("../lib/cloud/privateFiles.ts", import.meta.url), "utf8");
const appData = readFileSync(new URL("../lib/appData.ts", import.meta.url), "utf8");
const portal = readFileSync(new URL("../app/customer-portal/page.tsx", import.meta.url), "utf8");
const guard = readFileSync(new URL("../components/CloudAccessGuard.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("../lib/cloud/client.ts", import.meta.url), "utf8");
const supabaseClient = readFileSync(new URL("../lib/supabase/client.ts", import.meta.url), "utf8");

test("record enumeration cannot remove the organisation filter", () => {
  assert.match(adapter, /const readTable = collectionCloudReadTable\(table, cacheRole, collectionKey\)/);
  assert.match(adapter, /const select = networkOnly \? cloudSelectFresh : cloudSelect/);
  assert.match(adapter, /select<CloudEnvelope<T>>\(readTable, `select=\*&organisation_id=eq\.\$\{encodeURIComponent\(organisationId\)\}\$\{collectionFilter\}&deleted_at=is\.null`\)/);
  assert.match(adapter, /collection_key=eq\.\$\{encodeURIComponent\(collectionKey\)\}/);
  assert.match(adapter, /queueChange\(\{ table, storageKey: scopedStorageKey, operation: "upsert", organisationId, sourceId: record\.id/);
  assert.match(adapter, /queueChange\(\{ table, storageKey: scopedStorageKey, operation: "delete", organisationId, sourceId/);
});

test("browser cache tampering cannot alias two organisations or authorisation identities", () => {
  assert.match(adapter, /return `\$\{storageKey\}:organisation:\$\{JSON\.stringify\(\[organisationId\]\)\}`/);
  assert.match(adapter, /:account:\$\{JSON\.stringify\(\[userId, role \?\? null, customerSourceId \?\? null\]\)\}/);
  assert.match(storage, /accountStorageKey\(key, organisationId, cacheUserId, cacheRole, cacheCustomerSourceId\)/);
  assert.match(storage, /const cacheUserId = userId/);
  assert.doesNotMatch(storage, /identity\?\.role === "customer" \? userId : undefined/);
  assert.doesNotMatch(storage, /localStorage\.setItem\(key, JSON\.stringify\(items\)\)/);
});

test("offline queue replay cannot process another authorisation context after a switch", () => {
  assert.match(repository, /return readAllSyncQueue\(\)\.filter\(\(item\) => queueItemMatchesAuthorization\(item, authorization\)\)/);
  assert.match(repository, /if \(!activeSyncAuthorizationMatches\(authorization\)\)/);
  assert.match(repository, /const nextQueue = mergeProcessedQueue\(liveQueue, queue, remaining\)/);
  assert.match(repository, /entry\.id === itemId && queueItemMatchesAuthorization\(entry, authorization\)/);
  assert.match(repository, /await revalidateSyncAuthorization\(authorization\)/);
  assert.doesNotMatch(repository, /readAllSyncQueue\(\)\.forEach/);
});

test("stale identity responses cannot restore an earlier tenant", () => {
  assert.match(identity, /let identityRequestVersion = 0/);
  assert.match(identity, /const requestVersion = \+\+identityRequestVersion/);
  assert.match(identity, /requestVersion === identityRequestVersion/);
  assert.match(identity, /identityRequestVersion \+= 1/);
  assert.match(guard, /const workspaceIdentityKey = JSON\.stringify/);
  assert.match(guard, /<Fragment key=\{workspaceIdentityKey\}>/);
});

test("backup payloads cannot inject another tenant or internal sync state", () => {
  assert.match(appData, /parsed\.organisationId !== context\.organisationId/);
  assert.match(appData, /This backup belongs to a different JR OS organisation/);
  assert.match(appData, /backupStorageScope\(key\)/);
  assert.match(appData, /collectAccountBusinessData\(window\.localStorage, context\)/);
  assert.match(appData, /sameAccountStorageContext\(context, currentContext\)/);
  assert.match(appData, /claimLegacyMigrationStorage\(window\.localStorage, organisationId\)/);
  assert.match(appData, /accountStorageKey\(key, context\.organisationId, context\.userId, context\.role, context\.customerSourceId\)/);
  assert.match(appData, /organisationStorageKey\(key, context\.organisationId\)/);
});

test("private file path and authenticated download tampering fail full authorisation checks", () => {
  assert.match(privateFiles, /isOrganisationPrivateObjectPath/);
  assert.match(privateFiles, /assertOrganisationPrivateObjectPath\(organisationId, objectPath\)/);
  assert.match(privateFiles, /The private file does not belong to the active organisation/);
  assert.match(privateFiles, /privateDownloadCacheKey\(identity: CloudIdentity, sourceId: string\)/);
  assert.match(privateFiles, /return JSON\.stringify\(\[identity\.organisationId, identity\.userId, identity\.role, identity\.customerSourceId \?\? null, sourceId\]\)/);
});

test("customer sessions cannot select or mutate another customer record", () => {
  assert.match(portal, /identity\?\.role === "customer"/);
  assert.match(portal, /identity\.customerSourceId/);
  assert.match(portal, /const activeCustomerId = customerSession \? authenticatedCustomerId : selectedCustomerId/);
  assert.match(portal, /!customerPricing\.some\(\(item\) => item\.id === document\.id\)/);
  assert.match(portal, /requestJobId && !jobIds\.has\(requestJobId\)/);
  assert.doesNotMatch(portal, /customerSession \? selectedCustomerId/);
});

test("tenant-sensitive state is invalidated across identity and workspace changes", () => {
  assert.match(identity, /emit\(\{ identity: null, isReady: false \}\)/);
  assert.match(identity, /setActiveSyncIdentity\([\s\S]*next\.identity\?\.organisationId[\s\S]*next\.identity\?\.userId[\s\S]*next\.identity\?\.role[\s\S]*next\.identity\?\.customerSourceId/);
  assert.match(guard, /identity\.organisationId,[\s\S]*identity\.userId,[\s\S]*identity\.role,[\s\S]*identity\.customerSourceId/);
  assert.match(guard, /<Fragment key=\{workspaceIdentityKey\}>/);
  assert.match(storage, /\[activeStorageKey, cacheCustomerSourceId, cacheRole, cacheUserId, identityReady, key, mode, organisationId, target, userId\]/);
});

test("forged or expired browser sessions cannot reach cloud requests", () => {
  assert.match(client, /load\(\): CloudSession \| null \{\s*return normalizeSession\(readSupabaseSession\(\)\)/);
  assert.match(supabaseClient, /const hasExpired = expiresAt !== undefined && expiresAt <= Math\.floor\(Date\.now\(\) \/ 1000\)/);
  assert.match(supabaseClient, /clearStoredSupabaseSession\(\);\s*return null/);
  assert.match(client, /cloudSelect[\s\S]*cloudSession\.load\(\) \|\| undefined/);
  assert.match(client, /uploadPrivateObject[\s\S]*cloudSession\.load\(\) \|\| undefined/);
  assert.match(client, /downloadPrivateObject[\s\S]*const session = cloudSession\.load\(\)/);
  assert.doesNotMatch(client, /\/storage\/v1\/object\/(?:upload\/)?sign\//);
});
