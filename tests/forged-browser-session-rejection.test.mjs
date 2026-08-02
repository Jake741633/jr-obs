import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(new URL("../lib/cloud/client.ts", import.meta.url), "utf8");

test("expired and malformed browser sessions fail closed", () => {
  assert.match(client, /if \(session\.expiresAt <= Date\.now\(\)\) \{/);
  assert.match(client, /window\.localStorage\.removeItem\(SESSION_KEY\);\s*return null;/s);
  assert.match(client, /catch \{\s*window\.localStorage\.removeItem\(SESSION_KEY\);\s*return null;\s*\}/s);
});

test("rest and storage requests use the validated session loader", () => {
  assert.match(client, /cloudSelect[\s\S]*cloudSession\.load\(\) \|\| undefined/);
  assert.match(client, /cloudInsert[\s\S]*cloudSession\.load\(\) \|\| undefined/);
  assert.match(client, /cloudUpsert[\s\S]*cloudSession\.load\(\) \|\| undefined/);
  assert.match(client, /cloudPatch[\s\S]*cloudSession\.load\(\) \|\| undefined/);
  assert.match(client, /cloudDelete[\s\S]*cloudSession\.load\(\) \|\| undefined/);
  assert.match(client, /createSignedUpload[\s\S]*cloudSession\.load\(\) \|\| undefined/);
  assert.match(client, /createSignedDownload[\s\S]*cloudSession\.load\(\) \|\| undefined/);
});

test("rejected sessions cannot supply an authorization bearer token", () => {
  assert.match(client, /Authorization`, `Bearer \$\{session\?\.accessToken \|\| cloudConfig\.anonKey\}`/);
  assert.doesNotMatch(client, /JSON\.parse\(window\.localStorage\.getItem\(SESSION_KEY\)[\s\S]*requestHeaders\(/);
});
