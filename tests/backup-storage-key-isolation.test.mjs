import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appData = readFileSync(new URL("../lib/appData.ts", import.meta.url), "utf8");

test("authenticated backup exports recognise encoded organisation storage suffixes", () => {
  assert.match(appData, /const suffix = organisationStorageKey\("", organisationId\)/);
  assert.match(appData, /key\.endsWith\(organisationStorageKey\("", organisationId\)\)/);
  assert.doesNotMatch(appData, /const suffix = `\$\{ORGANISATION_MARKER\}\$\{organisationId\}`/);
  assert.doesNotMatch(appData, /key\.endsWith\(`\$\{ORGANISATION_MARKER\}\$\{organisationId\}`\)/);
});
