import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cloudPage = readFileSync(new URL("../app/cloud/page.tsx", import.meta.url), "utf8");
const cloudSync = readFileSync(new URL("../lib/cloudSync.ts", import.meta.url), "utf8");

test("cloud sync exports the email verification helper used by the account page", () => {
  assert.match(cloudSync, /export\s+async\s+function\s+completeEmailVerificationFromUrl\s*\(/);
  assert.match(cloudPage, /completeEmailVerificationFromUrl/);
});

test("email verification remains client guarded and completes from an effect", () => {
  assert.match(cloudPage, /^"use client";/);
  assert.match(cloudPage, /useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]*completeEmailVerificationFromUrl\s*\(/);
  assert.match(cloudSync, /if\s*\(typeof window === "undefined"\)\s*return null;/);
});

test("verification completion restores the saved session and clears auth details", () => {
  const helperStart = cloudSync.indexOf("export async function completeEmailVerificationFromUrl");
  assert.notEqual(helperStart, -1);
  const helperSource = cloudSync.slice(helperStart);
  assert.match(helperSource, /saveSupabaseSession\s*\(/);
  assert.match(helperSource, /identityChanged\s*\(\s*\)/);
  assert.match(helperSource, /clearAuthParamsFromUrl\s*\(\s*\)/);
  assert.match(cloudSync, /function\s+clearAuthParamsFromUrl\s*\([\s\S]*window\.history\.replaceState/);
});

test("email verification sessions are revoked before normal business sign-in", () => {
  assert.match(
    cloudSync,
    /if \(authType\) \{[\s\S]*await signOutTemporaryCloudSession\(storedOwnership\)[\s\S]*requiresPasswordSignIn: true/,
  );
  assert.match(
    cloudSync,
    /async function revokeCapturedCloudSession\(expectedOwnership: SupabaseSessionOwnership, scope: "global" \| "local"\) \{[\s\S]*Authorization: `Bearer \$\{accessToken\}`[\s\S]*\}, false\)[\s\S]*async function signOutTemporaryCloudSession[\s\S]*revokeCapturedCloudSession\(expectedOwnership, "local"\)[\s\S]*activeSessionMatches\(expectedOwnership\)[\s\S]*saveSupabaseSession\(null\)/,
  );
  assert.match(
    cloudPage,
    /verification\?\.requiresPasswordSignIn[\s\S]*Email verified\. Sign in with your password to open JR OS\./,
  );
});
