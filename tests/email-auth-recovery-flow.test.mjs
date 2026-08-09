import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cloudSync = await readFile(new URL("../lib/cloudSync.ts", import.meta.url), "utf8");
const supabaseClient = await readFile(new URL("../lib/supabase/client.ts", import.meta.url), "utf8");

test("direct email sign-up uses the GoTrue REST payload shape", () => {
  assert.match(cloudSync, /email:\s*normalisedEmail/);
  assert.match(cloudSync, /password,\s*\n\s*data:\s*\{\s*full_name:/);
  assert.doesNotMatch(cloudSync, /options:\s*redirectTo/);
  assert.match(supabaseClient, /\/auth\/v1\/signup/);
  assert.match(supabaseClient, /redirect_to=/);
});

test("email sign-in and sign-up normalise account addresses consistently", () => {
  assert.match(cloudSync, /function normaliseAuthEmail\(email: string\)/);
  assert.match(cloudSync, /email:\s*normaliseAuthEmail\(email\),\s*password/);
  assert.match(cloudSync, /const normalisedEmail = normaliseAuthEmail\(email\)/);
});

test("recovery links cannot complete as ordinary verification sessions", () => {
  assert.match(cloudSync, /const authType = hash\.get\("type"\) \|\| url\.searchParams\.get\("type"\)/);
  assert.match(cloudSync, /authType === "recovery"\s*\? \{ \.\.\.session, is_password_recovery: true \}/);
  assert.match(cloudSync, /if \(authType === "recovery"\) \{[\s\S]*requiresPasswordSignIn: false/);
  assert.doesNotMatch(cloudSync, /window\.location\.replace\("\/auth\/update-password"\)/);
  assert.doesNotMatch(supabaseClient, /consumePasswordRecoveryRedirect/);
});

test("non-verification callbacks persist the authenticated user before tenant resolution", () => {
  assert.match(cloudSync, /const user = storedSession\.user \?\? await getCurrentCloudUser\(\)/);
  assert.match(cloudSync, /if \(user && !storedSession\.user\) \{[\s\S]*saveSupabaseSession\(\{ \.\.\.storedSession, user \}\);[\s\S]*identityChanged\(\);[\s\S]*\}/);
  assert.match(cloudSync, /return \{ user, requiresPasswordSignIn: false \} satisfies EmailVerificationResult;/);
});

test("email verification sessions require a normal sign-in before tenant resolution", () => {
  assert.match(
    cloudSync,
    /if \(authType\) \{[\s\S]*await signOutTemporaryCloudSession\(\)[\s\S]*requiresPasswordSignIn: true/,
  );
});

test("sign-out clears tenant replay ownership before remote logout", () => {
  assert.match(
    cloudSync,
    /export async function signOutCloudUser\(\) \{[\s\S]*"jr-os-active-organisation"[\s\S]*"jr-os-active-user"[\s\S]*"jr-os-active-role"[\s\S]*"jr-os-active-customer-source"[\s\S]*supabaseFetch\("\/auth\/v1\/logout\?scope=global", \{ method: "POST" \}\)/,
  );
  assert.match(
    cloudSync,
    /finally \{\s*saveSupabaseSession\(null\);\s*identityChanged\(\);\s*\}/s,
  );
});

test("password recovery sessions cannot call business APIs", () => {
  assert.match(supabaseClient, /const recoveryAction = path === "\/auth\/v1\/user" && method === "PUT"/);
  assert.match(supabaseClient, /const recoverySignOut = path\.startsWith\("\/auth\/v1\/logout"\) && method === "POST"/);
  assert.match(supabaseClient, /if \(session\.is_password_recovery && !recoveryAction && !recoverySignOut\) \{\s*throw new Error\("Complete password recovery before accessing JR OS data\."\)/);
  assert.match(cloudSync, /if \(!session\?\.access_token \|\| session\.is_password_recovery\) return null/);
});
