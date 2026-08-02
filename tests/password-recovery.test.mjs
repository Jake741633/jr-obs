import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const gate = fs.readFileSync(new URL("../components/PasswordRecoveryGate.tsx", import.meta.url), "utf8");
const layout = fs.readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("Supabase recovery links require a new password before JR OS renders", () => {
  assert.match(gate, /hash\.get\("type"\) === "recovery"/);
  assert.match(gate, /completeEmailVerificationFromUrl/);
  assert.match(gate, /Set a new password/);
  assert.match(gate, /Confirm new password/);
  assert.match(gate, /\/auth\/v1\/user/);
  assert.match(gate, /method: "PUT"/);
  assert.match(gate, /JSON\.stringify\(\{ password \}\)/);
  assert.match(gate, /signOutCloudUser/);
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
