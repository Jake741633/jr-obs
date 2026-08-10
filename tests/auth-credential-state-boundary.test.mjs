import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cloudPage = readFileSync(new URL("../app/cloud/page.tsx", import.meta.url), "utf8");
const recoveryGate = readFileSync(new URL("../components/PasswordRecoveryGate.tsx", import.meta.url), "utf8");
const accessGuard = readFileSync(new URL("../components/CloudAccessGuard.tsx", import.meta.url), "utf8");

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const nextFunction = source.indexOf("\n  function ", start + 1);
  const nextAsyncFunction = source.indexOf("\n  async function ", start + 1);
  const candidates = [nextFunction, nextAsyncFunction].filter((index) => index !== -1);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

test("account actions clear submitted secrets without erasing later input revisions", () => {
  const action = functionBody(cloudPage, "runAccountAction");
  const finallyIndex = action.indexOf("finally");
  const awaitIndex = action.indexOf("await action(operationIsCurrent)");

  assert.match(action, /let succeeded = false/);
  assert.match(action, /succeeded = true/);
  assert.ok(finallyIndex >= 0, "account cleanup must run from finally");
  assert.match(action, /const operationIsCurrent = \(\) => Boolean\(operationCoordinatorRef\.current\?\.isCurrent\(operation\)\)/);
  assert.match(action, /passwordRevisionRef\.current === submittedPasswordRevision[\s\S]*passwordRevisionRef\.current \+= 1[\s\S]*setPassword\(""\)/);
  assert.ok(action.indexOf('setPassword("")') < awaitIndex, "submitted password must clear before the request can finish");
  assert.match(action, /succeeded && emailRevisionRef\.current === submittedEmailRevision/);
  assert.match(action, /clearSubmittedValue\(current, submittedEmail, currentRevision, submittedEmailRevision\)/);
  assert.ok(action.indexOf("await refreshAccountUser()", finallyIndex) > finallyIndex);
  assert.doesNotMatch(action.slice(finallyIndex), /setPassword\(""\)/);
});

test("logout clears controlled credentials before the asynchronous session teardown", () => {
  const signOut = functionBody(cloudPage, "signOut");
  const actionIndex = signOut.indexOf('await runAccountAction("sign-out", (operationIsCurrent) => signOutCloudUser(expectedOwnership, operationIsCurrent)');

  assert.ok(actionIndex >= 0, "logout must use the guarded account action");
  assert.ok(signOut.indexOf("clearAccountInputs()") < actionIndex);
  assert.ok(signOut.indexOf("const expectedOwnership = captureSupabaseSessionOwnership()") < actionIndex);
  assert.match(cloudPage, /onClick=\{\(\) => void signOut\(\)\}/);
  assert.match(accessGuard, /pathname === "\/cloud"/);
});

test("recovery secrets clear when session ownership changes and after a successful update", () => {
  const clear = functionBody(recoveryGate, "clearRecoverySecrets");
  const sessionChange = functionBody(recoveryGate, "handleSessionChange");
  const update = functionBody(recoveryGate, "updatePassword");
  const passwordUpdate = update.indexOf('await supabaseFetch("/auth/v1/user"');
  const secretClear = update.indexOf("clearRecoverySecrets()", passwordUpdate);
  const signOut = update.indexOf("await signOutCloudUser(startingOwnership)", passwordUpdate);

  assert.match(clear, /setPassword\(""\)/);
  assert.match(clear, /setConfirmation\(""\)/);
  assert.match(sessionChange, /clearRecoverySecrets\(\);\s*if \(hasRecoverySession\(\)\)/);
  assert.ok(passwordUpdate >= 0 && secretClear > passwordUpdate && signOut > secretClear);
  assert.match(update, /sameSupabaseSessionOwnership\([\s\S]*startingOwnership\.epoch/);
  assert.match(update, /const passwordUpdateStillOwned = operationIsCurrent\(\)[\s\S]*await signOutCloudUser\(startingOwnership\)[\s\S]*if \(!passwordUpdateStillOwned\) return/);
  assert.match(functionBody(recoveryGate, "returnToSignIn"), /clearRecoverySecrets\(\)/);
});
