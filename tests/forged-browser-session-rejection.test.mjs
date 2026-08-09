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
  assert.match(client, /uploadPrivateObject[\s\S]*cloudSession\.load\(\) \|\| undefined/);
  assert.match(client, /downloadPrivateObject[\s\S]*const session = cloudSession\.load\(\)/);
});

test("rejected sessions cannot downgrade protected requests to anonymous access", () => {
  assert.match(client, /if \(authenticated && !session\) throw new Error\("Your cloud session has expired\. Sign in again to continue\."\)/);
  assert.match(client, /if \(session\) result\.set\("Authorization", `Bearer \$\{session\.accessToken\}`\);/);
  assert.doesNotMatch(client, /Bearer \$\{session\?\.accessToken \|\| cloudConfig\.anonKey\}/);
  assert.doesNotMatch(client, /requestHeaders\(\s*normalizeSession\(JSON\.parse\(window\.localStorage\.getItem\(SESSION_KEY\)/);
});

test("recovery sessions cannot use the duplicate cloud client to reach business data", () => {
  assert.match(client, /is_password_recovery\?: boolean/);
  assert.match(client, /isPasswordRecovery: value\.is_password_recovery === true/);
  assert.match(client, /authenticated && session\?\.isPasswordRecovery && !allowPasswordRecovery/);
  assert.match(client, /if \(!session\?\.refreshToken \|\| session\.isPasswordRecovery\) return null/);
});
