import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const appData = readFileSync(new URL("../lib/appData.ts", import.meta.url), "utf8");
const settingsPage = readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8");

test("authenticated exports include only the exact active account context", () => {
  assert.match(appData, /export function exportJrOsData\(context: AccountStorageContext\)/);
  assert.match(appData, /collectAccountBusinessData\(window\.localStorage, context\)/);
  assert.match(appData, /collectLegacyAggregateData\(window\.localStorage\)/);
  assert.match(appData, /organisationId: context\.organisationId/);
  assert.doesNotMatch(appData, /collectOrganisationBusinessData/);
});

test("authenticated restore requires an exact organisation and revalidates the account after file reads", () => {
  assert.match(appData, /if \(!isCompleteAccountStorageContext\(context\)\)/);
  assert.match(appData, /if \(parsed\.organisationId !== context\.organisationId\)/);
  assert.match(appData, /This backup belongs to a different JR OS organisation/);
  assert.match(appData, /const currentContext = await resolveCurrentContext\(\)/);
  assert.match(appData, /if \(!sameAccountStorageContext\(context, currentContext\)\)/);
  assert.match(appData, /active JR OS account changed before the backup could be restored/);

  const fileRead = appData.indexOf("await file.text()");
  const currentContextRead = appData.indexOf("await resolveCurrentContext()");
  const contextGuard = appData.indexOf("if (!sameAccountStorageContext(context, currentContext))");
  const writeLoop = appData.indexOf("Object.entries(parsed.data).forEach");
  assert.ok(fileRead < currentContextRead);
  assert.ok(currentContextRead < contextGuard);
  assert.ok(contextGuard < writeLoop);
});

test("restore cannot inject internal or already-scoped storage keys", () => {
  assert.match(appData, /const scope = backupStorageScope\(key\)/);
  assert.match(appData, /accountStorageKey\(key, context\.organisationId, context\.userId, context\.role, context\.customerSourceId\)/);
  assert.match(appData, /organisationStorageKey\(key, context\.organisationId\)/);
  assert.doesNotMatch(appData, /key\.startsWith\(JR_OS_STORAGE_PREFIX\)/);
});

test("settings backup actions use and revalidate the resolved account identity", () => {
  assert.match(settingsPage, /downloadJrOsBackup\(identity\)/);
  assert.match(settingsPage, /importJrOsBackup\(file, identity, refreshIdentity\)/);
  assert.match(settingsPage, /if \(!identity\) throw new Error\("Sign in before restoring an authenticated backup\."\)/);
  assert.doesNotMatch(settingsPage, /identity\?\.organisationId/);
});
