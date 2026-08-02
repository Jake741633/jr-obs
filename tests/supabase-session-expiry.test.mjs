import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../lib/supabase/client.ts", import.meta.url), "utf8");

test("stored Supabase sessions fail closed when the access token is missing or blank", () => {
  assert.match(
    source,
    /const hasAccessToken = typeof session\.access_token === "string" && session\.access_token\.trim\(\)\.length > 0;/,
  );
  assert.match(source, /if \(!hasAccessToken \|\| hasExpired\) \{[\s\S]*?removeItem\(sessionKey\);[\s\S]*?return null;/);
});

test("stored Supabase sessions are removed when expires_at is reached", () => {
  assert.match(
    source,
    /const expiresAt = typeof session\.expires_at === "number" && Number\.isFinite\(session\.expires_at\)[\s\S]*?session\.expires_at[\s\S]*?: undefined;/,
  );
  assert.match(
    source,
    /const hasExpired = expiresAt !== undefined && expiresAt <= Math\.floor\(Date\.now\(\) \/ 1000\);/,
  );
});

test("malformed stored session JSON is cleared rather than reused", () => {
  assert.match(
    source,
    /catch \{\s*window\.localStorage\.removeItem\(sessionKey\);\s*return null;\s*\}/,
  );
});

test("valid unexpired stored sessions are returned", () => {
  assert.match(source, /return session as SupabaseSession;/);
});

test("authenticated cloud requests reject missing or expired sessions before fetch", () => {
  assert.match(
    source,
    /const session = readSupabaseSession\(\);\s*if \(authenticated\) \{\s*if \(!session\) \{\s*throw new Error\("Your cloud session has expired\. Sign in again to continue\."\);\s*\}/,
  );
  assert.ok(
    source.indexOf("const session = readSupabaseSession();") < source.indexOf("const response = await fetch("),
    "session validation must happen before the network request",
  );
});

test("valid authenticated sessions send the bearer token only inside the validated branch", () => {
  assert.match(
    source,
    /if \(authenticated\) \{[\s\S]*?if \(!session\) \{[\s\S]*?throw new Error\([\s\S]*?\);[\s\S]*?\}[\s\S]*?headers\.set\("Authorization", `Bearer \$\{session\.access_token\}`\);[\s\S]*?\}/,
  );
});

test("unauthenticated auth endpoints do not require or send a bearer token", () => {
  assert.match(source, /export async function supabaseFetch\(path: string, init: RequestInit = \{\}, authenticated = true\)/);
  assert.doesNotMatch(
    source,
    /if \(!session\) \{\s*throw new Error\("Your cloud session has expired\. Sign in again to continue\."\);\s*\}\s*const headers/,
  );
});
