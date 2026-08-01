import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const helper = await readFile(new URL("../lib/cloud/cutover.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/cloud/cutover/page.tsx", import.meta.url), "utf8");
const navigation = await readFile(new URL("../components/navigation.ts", import.meta.url), "utf8");

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

test("cutover page exposes the authenticated organisation and a manual check", () => {
  assert.match(page, /identity\.organisationId/);
  assert.match(page, /runCloudCutoverCheck/);
  assert.match(page, /Check local against cloud/);
  assert.match(page, /Not ready for cloud mode/);
});

test("cloud cutover page is reachable from navigation", () => {
  assert.match(navigation, /Cloud Cutover Check/);
  assert.match(navigation, /\/cloud\/cutover/);
});
