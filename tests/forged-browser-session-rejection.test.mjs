import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(new URL("../lib/cloud/client.ts", import.meta.url), "utf8");
const supabaseClient = readFileSync(new URL("../lib/supabase/client.ts", import.meta.url), "utf8");

test("expired and malformed browser sessions fail closed", () => {
  assert.match(client, /load\(\): CloudSession \| null \{\s*return normalizeSession\(readSupabaseSession\(\)\)/);
  assert.match(supabaseClient, /const hasExpired = expiresAt !== undefined && expiresAt <= Math\.floor\(Date\.now\(\) \/ 1000\)/);
  assert.match(supabaseClient, /if \(!hasAccessToken \|\| hasExpired\) \{\s*clearStoredSupabaseSession\(\);\s*return null/);
  assert.match(supabaseClient, /catch \{\s*clearStoredSupabaseSession\(\);\s*return null/);
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
  assert.match(supabaseClient, /is_password_recovery\?: boolean/);
  assert.match(client, /isPasswordRecovery: value\.is_password_recovery === true/);
  assert.match(client, /authenticated && session\?\.isPasswordRecovery && !allowPasswordRecovery/);
  assert.match(client, /if \(!session\?\.refreshToken \|\| session\.isPasswordRecovery \|\| session\.accessToken !== activeSession\?\.accessToken\) return null/);
});
