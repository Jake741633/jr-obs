import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cloudSync = readFileSync(new URL("../lib/cloudSync.ts", import.meta.url), "utf8");

test("legacy migration record identities cannot collide across tuple boundaries", () => {
  assert.match(cloudSync, /export function legacyMigrationRecordId\(organisationId: string, storageKey: string\)/);
  assert.match(cloudSync, /return JSON\.stringify\(\[organisationId, storageKey\]\)/);
  assert.match(cloudSync, /id: legacyMigrationRecordId\(organisationId, storageKey\)/);
  assert.doesNotMatch(cloudSync, /id: `\$\{organisationId\}:\$\{storageKey\}`/);

  const first = JSON.stringify(["org:a", "jr-os-b"]);
  const second = JSON.stringify(["org", "a:jr-os-b"]);
  assert.notEqual(first, second);
});
