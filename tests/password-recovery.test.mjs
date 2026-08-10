import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const gate = fs.readFileSync(new URL("../components/PasswordRecoveryGate.tsx", import.meta.url), "utf8");
const layout = fs.readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const cloudSync = fs.readFileSync(new URL("../lib/cloudSync.ts", import.meta.url), "utf8");
const supabaseClient = fs.readFileSync(new URL("../lib/supabase/client.ts", import.meta.url), "utf8");

test("Supabase recovery links require a new password before JR OS renders", () => {
  assert.match(gate, /hash\.get\("type"\) === "recovery" \|\| url\.searchParams\.get\("type"\) === "recovery"/);
  assert.match(gate, /completeEmailVerificationFromUrl/);
  assert.match(gate, /Set a new password/);
  assert.match(gate, /Confirm new password/);
  assert.match(gate, /\/auth\/v1\/user/);
  assert.match(gate, /method: "PUT"/);
  assert.match(gate, /JSON\.stringify\(\{ password \}\)/);
  assert.match(gate, /signOutCloudUser/);
});

test("recovery tokens cannot be consumed before the global application gate mounts", () => {
  assert.doesNotMatch(supabaseClient, /consumePasswordRecoveryRedirect/);
  assert.doesNotMatch(supabaseClient, /if \(typeof window !== "undefined"\) consumePasswordRecoveryRedirect\(\)/);
  const recoveryFlag = cloudSync.indexOf('is_password_recovery: true');
  const sessionSave = cloudSync.indexOf("saveSupabaseSession(storedSession)", recoveryFlag);
  const identityEvent = cloudSync.indexOf("identityChanged()", sessionSave);
  assert.ok(recoveryFlag !== -1 && sessionSave > recoveryFlag && identityEvent > sessionSave);
});

test("recovery-only sessions stay blocked across reloads and account changes in other tabs", () => {
  assert.match(supabaseClient, /is_password_recovery\?: boolean/);
  assert.match(gate, /readSupabaseSession\(\)\?\.is_password_recovery === true/);
  assert.match(gate, /if \(!recoveryCallback && !hasRecoverySession\(\)\)/);
  assert.match(gate, /window\.addEventListener\("jr-os-cloud-identity-changed", handleSessionChange\)/);
  assert.match(gate, /window\.addEventListener\("storage", handleSessionChange\)/);
  assert.match(gate, /event instanceof StorageEvent && event\.key !== "jr-os-supabase-session"/);
  assert.match(gate, /sessionBoundaryVersionRef\.current \+= 1/);
  assert.match(gate, /completeEmailVerificationFromUrl\(\(\) => active && sessionBoundaryVersionRef\.current === startingBoundaryVersion\)/);
  assert.match(gate, /sameSupabaseSessionOwnership\([\s\S]*startingOwnership\.epoch/);
  assert.match(gate, /window\.removeEventListener\("storage", handleSessionChange\)/);
  assert.match(cloudSync, /const startingSession = startingOwnership\.session;[\s\S]*if \(!startingSession\?\.access_token \|\| startingSession\.is_password_recovery\) return null/);
  assert.match(cloudSync, /revokeCapturedCloudSession\(expectedOwnership, "global"\)/);
});

test("successful recovery clears the privileged recovery session before unlocking sign-in", () => {
  const update = gate.indexOf('await supabaseFetch("/auth/v1/user"');
  const signOut = gate.indexOf("await signOutCloudUser(startingOwnership)", update);
  const complete = gate.indexOf('setState("complete")', signOut);
  assert.ok(update !== -1 && signOut > update && complete > signOut);
  assert.match(gate, /const passwordUpdateStillOwned = operationIsCurrent\(\)[\s\S]*await signOutCloudUser\(startingOwnership\)[\s\S]*if \(!passwordUpdateStillOwned\) return/);
  assert.doesNotMatch(gate, /async function returnToSignIn\(\) \{\s*await signOutCloudUser\(\)/);
});

test("password recovery gate wraps the application shell globally", () => {
  assert.match(layout, /PasswordRecoveryGate/);
  assert.match(layout, /<PasswordRecoveryGate><AppShell>/);
  assert.match(layout, /<\/AppShell><\/PasswordRecoveryGate>/);
});

test("recovery validates password length and matching confirmation", () => {
  assert.match(gate, /password\.length < 8/);
  assert.match(gate, /password !== confirmation/);
  assert.match(gate, /The passwords do not match/);
  assert.match(gate, /autoComplete="new-password"/);
});
