import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260809_027_legacy_backup_office_scope.sql", import.meta.url), "utf8");
const cloudSync = readFileSync(new URL("../lib/cloudSync.ts", import.meta.url), "utf8");
const cloudPage = readFileSync(new URL("../app/cloud/page.tsx", import.meta.url), "utf8");

test("legacy aggregate backup reads require active office authority", () => {
  assert.match(migration, /drop policy if exists app_records_staff_select on public\.app_records/i);
  assert.match(migration, /create policy app_records_office_select on public\.app_records[\s\S]*for select to authenticated/i);
  assert.match(migration, /organisation_id = public\.current_organisation_id\(\)/i);
  assert.match(migration, /public\.can_manage_office_data\(\)/i);
  const selectPolicy = migration.slice(migration.indexOf("create policy app_records_office_select"));
  assert.doesNotMatch(selectPolicy, /electrician|customer/i);
});

test("all callable migration and restore paths enforce the same role boundary", () => {
  assert.match(cloudSync, /const cloudMigrationRoles = \["owner", "admin", "office"\] as const/);
  assert.match(cloudSync, /function assertCloudMigrationRole\(role: string \| undefined\)/);
  assert.match(cloudSync, /migrateLocalDataToCloud[\s\S]*const \{ user, organisationId, role \} = await getCloudContext\(operationIsCurrent, expectedContext\);\s*assertCloudMigrationRole\(role\);/);
  assert.match(cloudSync, /migrateTypedLocalDataToCloud[\s\S]*const \{ user, organisationId, role \} = await getCloudContext\(operationIsCurrent, expectedContext\);\s*assertCloudMigrationRole\(role\);/);
  assert.match(cloudSync, /restoreCloudDataToLocal[\s\S]*const \{ user, organisationId, role, customerSourceId \} = await getCloudContext\(operationIsCurrent, expectedContext\);[\s\S]*assertCloudMigrationRole\(role\);/);
  assert.match(cloudSync, /const current = await getCloudContext\(operationIsCurrent, expectedContext\);[\s\S]*sameAccountStorageContext\(startingContext,/);
  assert.match(cloudSync, /isLegacyAggregateStorageKey\(payload\.storageKey\)/);
  assert.match(cloudSync, /accountStorageKey\(payload\.storageKey, organisationId, user\.id, role, customerSourceId\)/);
});

test("field and customer sessions cannot enable migration controls", () => {
  assert.match(cloudPage, /const \{ identity, isReady: identityReady \} = useCloudIdentity\(\)/);
  assert.match(cloudPage, /matchedCloudPageIdentity\(identity, accountUser, identitySession\)/);
  assert.match(cloudPage, /const settledOwnerMatchesDisplay = Boolean\(displayOwnerKey && settledIdentity\?\.key === displayOwnerKey\)/);
  assert.match(cloudPage, /const migrationUnavailable = !configured \|\| !displayIdentity \|\| !identityReady \|\| !settledOwnerMatchesDisplay \|\| !canManageCloudMigration\(displayIdentity\.role\) \|\| operationBusy/);
  assert.equal((cloudPage.match(/disabled=\{migrationUnavailable\}/g) ?? []).length, 3);
  assert.match(cloudPage, /const retryUnavailable = !configured \|\| !displayIdentity \|\| !identityReady \|\| !settledOwnerMatchesDisplay \|\| operationBusy/);
  assert.match(cloudPage, /disabled=\{retryUnavailable\}/);
  assert.match(cloudPage, /disabled=\{operationBusy\}/);
});
