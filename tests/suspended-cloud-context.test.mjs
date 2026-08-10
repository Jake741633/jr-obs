import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cloudSync = readFileSync(new URL("../lib/cloudSync.ts", import.meta.url), "utf8");

test("cloud context excludes suspended profiles", () => {
  assert.match(
    cloudSync,
    /\/rest\/v1\/profiles\?id=eq\.\$\{encodeURIComponent\(userId\)\}&active=eq\.true&select=organisation_id,role,customer_source_id,active/,
  );
  assert.match(
    cloudSync,
    /if \(!profile\?\.active \|\| !profile\?\.organisation_id\) throw new Error\("Your JR OS organisation profile is not active or ready yet\."\)/,
  );
  assert.match(
    cloudSync,
    /return profile as \{ organisation_id: string; role: string; customer_source_id: string \| null; active: true \}/,
  );
  assert.match(cloudSync, /customerSourceId: profile\.customer_source_id \|\| undefined/);
});

test("migration and restore operations resolve their tenant through guarded cloud context", () => {
  assert.match(cloudSync, /export async function migrateLocalDataToCloud\(operationIsCurrent\?: CloudOperationOwnershipGuard, expectedContext\?: CloudOperationExpectedContext\): Promise<CloudSyncResult> \{\s*const \{ user, organisationId, role \} = await getCloudContext\(operationIsCurrent, expectedContext\)/s);
  assert.match(cloudSync, /export async function migrateTypedLocalDataToCloud[\s\S]*const \{ user, organisationId, role \} = await getCloudContext\(operationIsCurrent, expectedContext\)/);
  assert.match(cloudSync, /export async function restoreCloudDataToLocal\(operationIsCurrent\?: CloudOperationOwnershipGuard, expectedContext\?: CloudOperationExpectedContext\) \{\s*const \{ user, organisationId, role, customerSourceId \} = await getCloudContext\(operationIsCurrent, expectedContext\)/s);
  assert.match(cloudSync, /const current = await getCloudContext\(operationIsCurrent, expectedContext\);[\s\S]*sameAccountStorageContext\(startingContext,/);
  assert.ok((cloudSync.match(/assertCloudPageOperationCurrent\(operationIsCurrent\)/g) ?? []).length >= 12);
});
