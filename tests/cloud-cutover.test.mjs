import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const helper = await readFile(new URL("../lib/cloud/cutover.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/cloud/cutover/page.tsx", import.meta.url), "utf8");
const navigation = await readFile(new URL("../components/navigation.ts", import.meta.url), "utf8");
const identityHook = await readFile(new URL("../lib/cloud/useCloudIdentity.ts", import.meta.url), "utf8");
const cloudSync = await readFile(new URL("../lib/cloudSync.ts", import.meta.url), "utf8");

test("cutover check reads Supabase directly while preserving local data", () => {
  assert.match(helper, /cloudSelect/);
  assert.match(helper, /organisation_id=eq\./);
  assert.match(helper, /deleted_at=is\.null/);
  assert.doesNotMatch(helper, /localStorage\.removeItem/);
  assert.doesNotMatch(helper, /localStorage\.clear/);
});

test("cutover report detects local-only records and unsafe queue states", () => {
  assert.match(helper, /localOnlyIds/);
  assert.match(helper, /Conflict/);
  assert.match(helper, /Failed/);
  assert.match(helper, /jr-os-private-file-upload-queue/);
  assert.match(helper, /readyForCloudMode: blockers\.length === 0/);
});

test("cutover page refreshes and exposes the authenticated organisation", () => {
  assert.match(page, /identity\.organisationId/);
  assert.match(page, /refreshIdentity/);
  assert.match(page, /Refresh signed-in account/);
  assert.match(page, /runCloudCutoverCheck/);
  assert.match(page, /Check local against cloud/);
  assert.match(page, /Not ready for cloud mode/);
});

test("shared identity reloads a persisted session and observes account changes", () => {
  assert.match(identityHook, /readSupabaseSession/);
  assert.match(identityHook, /hasPersistedSession/);
  assert.match(identityHook, /refreshCloudIdentity/);
  assert.match(identityHook, /jr-os-cloud-identity-changed/);
  assert.match(identityHook, /visibilitychange/);
  assert.match(identityHook, /jr-os-supabase-session/);
});

test("typed import records the common successful upload timestamp", () => {
  assert.match(cloudSync, /recordSuccessfulCloudUpload/);
  assert.match(cloudSync, /jr-os-last-cloud-sync/);
  assert.match(cloudSync, /jr-os-last-typed-cloud-sync/);
});

test("cloud cutover page is reachable from navigation", () => {
  assert.match(navigation, /Cloud Cutover Check/);
  assert.match(navigation, /\/cloud\/cutover/);
});
