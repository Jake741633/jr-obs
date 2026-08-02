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

test("verification completion restores the saved session and publishes identity changes", () => {
  const helperStart = cloudSync.indexOf("export async function completeEmailVerificationFromUrl");
  assert.notEqual(helperStart, -1);
  const helperSource = cloudSync.slice(helperStart);
  assert.match(helperSource, /saveSupabaseSession\s*\(/);
  assert.match(helperSource, /identityChanged\s*\(\s*\)/);
  assert.match(helperSource, /history\.replaceState/);
});
