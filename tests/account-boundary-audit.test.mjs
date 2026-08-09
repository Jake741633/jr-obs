import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const cloudSync = readFileSync(new URL("../lib/cloudSync.ts", import.meta.url), "utf8");
const signupMigration = readFileSync(new URL("../supabase/migrations/20260802_009_neutral_signup_defaults.sql", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");
const identity = readFileSync(new URL("../lib/cloud/useCloudIdentity.ts", import.meta.url), "utf8");
const privateFiles = readFileSync(new URL("../lib/cloud/privateFiles.ts", import.meta.url), "utf8");
const cloudAccessGuard = readFileSync(new URL("../components/CloudAccessGuard.tsx", import.meta.url), "utf8");
const aiPage = readFileSync(new URL("../app/ai/page.tsx", import.meta.url), "utf8");
const appData = readFileSync(new URL("../lib/appData.ts", import.meta.url), "utf8");
const settingsPage = readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8");

test("account changes preserve browser-resident business records", () => {
  assert.match(cloudSync, /export function clearLocalJrOsAccountData\(\)\s*\{\s*return 0;\s*\}/);
  assert.doesNotMatch(cloudSync, /for \(const key of keys\) window\.localStorage\.removeItem/);
  assert.match(cloudSync, /saveSupabaseSession\(null\)/);
});

test("new signups do not inherit Jake or JR Electrical Services metadata", () => {
  const signupStart = cloudSync.indexOf("export async function signUpWithEmail");
  const signupEnd = cloudSync.indexOf("export async function signOutCloudUser");
  const signup = cloudSync.slice(signupStart, signupEnd);
  assert.doesNotMatch(signup, /Jake Rinaldi/);
  assert.doesNotMatch(signup, /JR Electrical Services/);
  assert.match(signup, /New JR OS Business/);
  assert.match(signupMigration, /New JR OS Business/);
  assert.doesNotMatch(signupMigration, /'JR Electrical Services'/);
});

test("authenticated collection caches remain organisation and user scoped", () => {
  assert.match(adapter, /organisationStorageKey/);
  assert.match(adapter, /:organisation:/);
  assert.match(adapter, /export function accountStorageKey/);
  assert.match(storage, /const cacheUserId = userId/);
  assert.doesNotMatch(storage, /identity\?\.role === "customer" \? userId : undefined/);
  assert.match(storage, /activeStorageKey = organisationId \? accountStorageKey\(key, organisationId, cacheUserId\) : key/);
  assert.match(storage, /window\.localStorage\.setItem\(activeStorageKey/);
});

test("legacy restore writes only to the authenticated organisation cache", () => {
  assert.match(cloudSync, /const scopedKey = organisationStorageKey\(payload\.storageKey, organisationId\)/);
  assert.match(cloudSync, /window\.localStorage\.setItem\(scopedKey/);
});

test("typed migration ignores already scoped tenant caches", () => {
  assert.match(cloudSync, /!key\.includes\(":organisation:"\)/);
});

test("sync queue visibility and retries are restricted to the active organisation and user", () => {
  assert.match(repository, /const ACTIVE_ORGANISATION_KEY = "jr-os-active-organisation"/);
  assert.match(repository, /const ACTIVE_USER_KEY = "jr-os-active-user"/);
  assert.match(repository, /export function setActiveSyncIdentity/);
  assert.match(repository, /item\.organisationId === organisationId && \(!userId \|\| item\.userId === userId\)/);
  assert.match(repository, /const liveQueue = readAllSyncQueue\(\)/);
  assert.match(repository, /item\.organisationId !== organisationId \|\| item\.userId !== userId \|\| !originalIds\.has\(item\.id\)/);
  assert.match(repository, /const retained = remaining\.filter\(\(item\) => liveIds\.has\(item\.id\)\)/);
  assert.match(repository, /write\(QUEUE_KEY, nextQueue\)/);
  assert.match(repository, /entry\.id === itemId && entry\.organisationId === organisationId && \(!userId \|\| entry\.userId === userId\)/);
  assert.match(repository, /activeOrganisationId\(\) !== organisationId \|\| activeUserId\(\) !== userId/);
});

test("resolved identity controls active sync ownership and clears it during account changes", () => {
  assert.match(identity, /setActiveSyncIdentity\(next\.identity\?\.organisationId \?\? null, next\.identity\?\.userId \?\? null\)/);
  assert.match(identity, /emit\(\{ identity: null, isReady: false \}\)/);
});

test("cross-tab session replacement invalidates the previous tenant before loading the next identity", () => {
  assert.match(identity, /function handleStorageChange\(event: StorageEvent\)/);
  assert.match(identity, /if \(event\.key === "jr-os-supabase-session"\) void refreshCloudIdentity\(\);/);
  assert.match(identity, /export function refreshCloudIdentity\(\) \{\s*emit\(\{ identity: null, isReady: false \}\);\s*return loadIdentity\(true\);\s*\}/);
  assert.match(identity, /setActiveSyncIdentity\(next\.identity\?\.organisationId \?\? null, next\.identity\?\.userId \?\? null\)/);
});

test("suspended profiles cannot resolve an application identity or expose cached tenant data", () => {
  assert.match(identity, /active=eq\.true/);
  assert.match(identity, /select=organisation_id,role,customer_source_id,active/);
  assert.match(identity, /if \(!profile\?\.active \|\| !profile\?\.organisation_id \|\| !profile\?\.role\) return null;/);
});

test("secured workspace transient state resets when organisations or users change", () => {
  assert.match(cloudAccessGuard, /Fragment, type ReactNode/);
  assert.match(cloudAccessGuard, /<Fragment key=\{identity\.userId\}><Fragment key=\{identity\.organisationId\}>\{children\}<\/Fragment><\/Fragment>/);
});

test("AI-created CRM interactions attribute the signed-in user instead of Jake", () => {
  assert.match(aiPage, /useCloudIdentity\(\)/);
  assert.match(aiPage, /completedBy: identity\?\.email \?\? "JR OS user"/);
  assert.doesNotMatch(aiPage, /completedBy: "Jake"/);
});

test("authenticated backups include only the active organisation and exclude account internals", () => {
  assert.match(appData, /organisationStorageKey/);
  assert.match(appData, /organisationId\?: string/);
  assert.match(appData, /if \(organisationId && !key\.includes\(ORGANISATION_MARKER\)\) continue;/);
  assert.match(appData, /jr-os-supabase-session/);
  assert.match(appData, /jr-os-cloud-sync-queue/);
  assert.match(appData, /key\.startsWith\("jr-os-cloud-versions:"\)/);
  assert.match(appData, /This backup belongs to a different JR OS organisation/);
  assert.match(appData, /const destinationKey = organisationId \? organisationStorageKey\(key, organisationId\) : key/);
});

test("JR AI settings and backup actions use the resolved organisation identity", () => {
  assert.match(settingsPage, /useCloudIdentity\(\)/);
  assert.match(settingsPage, /organisationStorageKey\(profileKey, identity\.organisationId\)/);
  assert.match(settingsPage, /downloadJrOsBackup\(identity\?\.organisationId\)/);
  assert.match(settingsPage, /importJrOsBackup\(file, identity\?\.organisationId\)/);
  assert.doesNotMatch(settingsPage, /window\.localStorage\.getItem\(profileKey\)/);
  assert.doesNotMatch(settingsPage, /window\.localStorage\.setItem\(profileKey/);
});

test("private upload queue retries preserve every other organisation and user", () => {
  assert.match(privateFiles, /export function readPrivateUploadQueue\(organisationId\?: string, userId\?: string\)/);
  assert.match(privateFiles, /queue\.filter\(\(item\) => item\.organisationId === organisationId && \(!userId \|\| item\.userId === userId\)\)/);
  assert.match(privateFiles, /const preserved = allQueue\.filter\(\(item\) => item\.organisationId !== organisationId \|\| item\.userId !== userId\)/);
  assert.match(privateFiles, /const activeQueue = allQueue\.filter\(\(item\) => item\.organisationId === organisationId && item\.userId === userId\)/);
  assert.match(privateFiles, /writeQueue\(\[\.\.\.preserved, \.\.\.remaining\]\)/);
  assert.match(privateFiles, /flushPrivateFileUploadQueue\(identity\.organisationId, identity\.userId/);
});

test("private uploads and signed downloads reject cross-organisation object paths", () => {
  assert.match(privateFiles, /export function isOrganisationPrivateObjectPath/);
  assert.match(privateFiles, /The private file does not belong to the active organisation/);
  assert.match(privateFiles, /assertOrganisationPrivateObjectPath\(item\.organisationId, item\.objectPath\)/);
  assert.match(privateFiles, /signedPrivateDownloadUrl\(objectPath: string, organisationId: string/);
  assert.match(privateFiles, /assertOrganisationPrivateObjectPath\(organisationId, objectPath\)/);
  assert.match(privateFiles, /assertOrganisationPrivateObjectPath\(metadata\.organisation_id, metadata\.object_path\)/);
  assert.match(privateFiles, /signedPrivateDownloadUrl\(record\.privateStoragePath!, identity\.organisationId\)/);
});

test("signed attachment URLs cannot be reused after an organisation or user switch", () => {
  assert.match(privateFiles, /export function privateSignedUrlCacheKey\(organisationId: string, sourceId: string\)/);
  assert.match(privateFiles, /return JSON\.stringify\(\[organisationId, readSupabaseSession\(\)\?\.user\?\.id \?\? "", sourceId\]\)/);
  assert.match(privateFiles, /privateSignedUrlCacheKey\(identity\.organisationId, queued\.sourceId\)/);
  assert.match(privateFiles, /privateSignedUrlCacheKey\(identity\.organisationId, photo\.id\)/);
  assert.match(privateFiles, /privateSignedUrlCacheKey\(identity\.organisationId, record\.id\)/);
  assert.doesNotMatch(privateFiles, /signedUrls\[queued\.sourceId\]/);
  assert.doesNotMatch(privateFiles, /signedUrls\[photo\.id\]/);
  assert.doesNotMatch(privateFiles, /signedUrls\[record\.id\]/);
});
