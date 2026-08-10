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

test("every account action clears the submitted password and successful actions clear the email", () => {
  const action = functionBody(cloudPage, "runAccountAction");
  const finallyIndex = action.indexOf("finally");

  assert.match(action, /let succeeded = false/);
  assert.match(action, /succeeded = true/);
  assert.ok(finallyIndex >= 0, "account cleanup must run from finally");
  assert.ok(action.indexOf('if (succeeded) setEmail("")', finallyIndex) > finallyIndex);
  assert.ok(action.indexOf('setPassword("")', finallyIndex) > finallyIndex);
  assert.ok(action.indexOf("await getCurrentCloudUser()", finallyIndex) > finallyIndex);
});

test("logout clears controlled credentials before the asynchronous session teardown", () => {
  const signOut = functionBody(cloudPage, "signOut");
  const actionIndex = signOut.indexOf("await runAccountAction(signOutCloudUser");

  assert.ok(actionIndex >= 0, "logout must use the guarded account action");
  assert.ok(signOut.indexOf('setEmail("")') < actionIndex);
  assert.ok(signOut.indexOf('setPassword("")') < actionIndex);
  assert.match(cloudPage, /onClick=\{\(\) => void signOut\(\)\}/);
  assert.match(accessGuard, /pathname === "\/cloud"/);
});

test("recovery secrets clear when session ownership changes and after a successful update", () => {
  const clear = functionBody(recoveryGate, "clearRecoverySecrets");
  const sessionChange = functionBody(recoveryGate, "handleSessionChange");
  const update = functionBody(recoveryGate, "updatePassword");
  const passwordUpdate = update.indexOf('await supabaseFetch("/auth/v1/user"');
  const secretClear = update.indexOf("clearRecoverySecrets()", passwordUpdate);
  const signOut = update.indexOf("await signOutCloudUser()", passwordUpdate);

  assert.match(clear, /setPassword\(""\)/);
  assert.match(clear, /setConfirmation\(""\)/);
  assert.match(sessionChange, /clearRecoverySecrets\(\);\s*if \(hasRecoverySession\(\)\)/);
  assert.ok(passwordUpdate >= 0 && secretClear > passwordUpdate && signOut > secretClear);
  assert.match(functionBody(recoveryGate, "returnToSignIn"), /clearRecoverySecrets\(\)/);
});
