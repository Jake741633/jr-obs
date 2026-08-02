import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const cloudSync = readFileSync(new URL("../lib/cloudSync.ts", import.meta.url), "utf8");
const signupMigration = readFileSync(new URL("../supabase/migrations/20260802_009_neutral_signup_defaults.sql", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");
const identity = readFileSync(new URL("../lib/cloud/useCloudIdentity.ts", import.meta.url), "utf8");

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

test("authenticated collection caches remain organisation scoped", () => {
  assert.match(adapter, /organisationStorageKey/);
  assert.match(adapter, /:organisation:/);
  assert.match(storage, /activeStorageKey = organisationId \? organisationStorageKey/);
  assert.match(storage, /window\.localStorage\.setItem\(activeStorageKey/);
});

test("legacy restore writes only to the authenticated organisation cache", () => {
  assert.match(cloudSync, /const scopedKey = organisationStorageKey\(payload\.storageKey, organisationId\)/);
  assert.match(cloudSync, /window\.localStorage\.setItem\(scopedKey/);
});

test("typed migration ignores already scoped tenant caches", () => {
  assert.match(cloudSync, /!key\.includes\(":organisation:"\)/);
});

test("sync queue visibility and retries are restricted to the active organisation", () => {
  assert.match(repository, /const ACTIVE_ORGANISATION_KEY = "jr-os-active-organisation"/);
  assert.match(repository, /export function setActiveSyncOrganisation/);
  assert.match(repository, /return readAllSyncQueue\(\)\.filter\(\(item\) => item\.organisationId === organisationId\)/);
  assert.match(repository, /const preserved = allQueue\.filter\(\(item\) => item\.organisationId !== organisationId\)/);
  assert.match(repository, /write\(QUEUE_KEY, \[\.\.\.preserved, \.\.\.remaining\]\)/);
  assert.match(repository, /entry\.id === itemId && entry\.organisationId === organisationId/);
});

test("resolved identity controls the active sync organisation and clears it during account changes", () => {
  assert.match(identity, /setActiveSyncOrganisation\(next\.identity\?\.organisationId \?\? null\)/);
  assert.match(identity, /emit\(\{ identity: null, isReady: false \}\)/);
});
