import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const appData = readFileSync(new URL("../lib/appData.ts", import.meta.url), "utf8");
const settingsPage = readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8");

test("authenticated exports include only the active organisation", () => {
  assert.match(appData, /export function exportJrOsData\(organisationId\?: string\)/);
  assert.match(appData, /collectOrganisationBusinessData\(window\.localStorage, organisationId\)/);
  assert.match(appData, /collectLegacyAggregateData\(window\.localStorage\)/);
  assert.match(appData, /return \{ version: 1, exportedAt: new Date\(\)\.toISOString\(\), app: "JR OS", organisationId, data \}/);
});

test("authenticated restore requires an exact organisation identity", () => {
  assert.match(appData, /if \(organisationId && parsed\.organisationId !== organisationId\)/);
  assert.match(appData, /This backup belongs to a different JR OS organisation/);
  assert.doesNotMatch(appData, /organisationId && parsed\.organisationId && parsed\.organisationId !== organisationId/);
});

test("restore cannot inject internal or already-scoped storage keys", () => {
  assert.match(appData, /isLegacyAggregateStorageKey\(key\)/);
  assert.match(appData, /const destinationKey = organisationId \? organisationStorageKey\(key, organisationId\) : key/);
  assert.doesNotMatch(appData, /key\.startsWith\(JR_OS_STORAGE_PREFIX\)/);
});

test("settings backup actions use the resolved organisation identity", () => {
  assert.match(settingsPage, /downloadJrOsBackup\(identity\?\.organisationId\)/);
  assert.match(settingsPage, /importJrOsBackup\(file, identity\?\.organisationId\)/);
});
