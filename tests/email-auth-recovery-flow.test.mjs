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
  assert.match(cloudSync, /if \(authType === "recovery"\) \{[\s\S]*window\.location\.replace\("\/auth\/update-password"\);[\s\S]*return null;/);
  assert.match(supabaseClient, /if \(params\.get\("type"\) !== "recovery"\) return;/);
  assert.match(supabaseClient, /window\.location\.replace\("\/auth\/update-password"\)/);
});

test("verification callbacks persist the authenticated user before tenant resolution", () => {
  assert.match(cloudSync, /const user = session\.user \?\? await getCurrentCloudUser\(\)/);
  assert.match(cloudSync, /if \(user && !session\.user\) \{[\s\S]*saveSupabaseSession\(\{ \.\.\.session, user \}\);[\s\S]*identityChanged\(\);[\s\S]*\}/);
  assert.match(cloudSync, /return user;/);
});

test("sign-out clears tenant replay ownership before remote logout", () => {
  assert.match(
    cloudSync,
    /export async function signOutCloudUser\(\) \{\s*if \(typeof window !== "undefined"\) window\.localStorage\.removeItem\("jr-os-active-organisation"\);\s*try \{ await supabaseFetch\("\/auth\/v1\/logout", \{ method: "POST" \}\); \}/s,
  );
  assert.match(
    cloudSync,
    /finally \{\s*saveSupabaseSession\(null\);\s*identityChanged\(\);\s*\}/s,
  );
});
