import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fieldOperatorName } from "../lib/siteDiaryIdentity-core.mjs";

const page = readFileSync(new URL("../app/field/testing/page.tsx", import.meta.url), "utf8");

test("field operator identity resolves only one signed-in active team member", () => {
  const teamMembers = [
    { name: "Office User", email: "office@example.com", role: "Office", status: "Active" },
    { name: "Field Engineer", email: "FIELD@example.com", role: "Electrician", status: "Active" },
    { name: "Former Engineer", email: "former@example.com", role: "Electrician", status: "Inactive" },
  ];

  assert.equal(fieldOperatorName({
    identity: { email: " field@example.com " },
    teamMembers,
    mode: "cloud",
  }), "Field Engineer");
  assert.equal(fieldOperatorName({
    identity: { email: "former@example.com" },
    teamMembers,
    mode: "cloud",
  }), "");
  assert.equal(fieldOperatorName({
    identity: { email: "missing@example.com" },
    teamMembers,
    mode: "cloud",
  }), "");
  assert.equal(fieldOperatorName({
    identity: { email: "field@example.com" },
    teamMembers: [...teamMembers, { name: "Duplicate", email: "field@example.com", role: "Electrician", status: "Active" }],
    mode: "cloud",
  }), "");
});

test("mobile testing binds inspector attribution to active account identity", () => {
  assert.match(page, /useCloudIdentity\(\)/);
  assert.match(page, /useTeamCollection\(\)/);
  assert.match(page, /fieldOperatorName\(\{/);
  assert.match(page, /inspectorName: operatorName/);
  assert.match(page, /label="Inspector" value=\{operatorName \|\| form\.inspectorName\} readOnly aria-readonly="true"/);
  assert.match(page, /identityState\.isReady/);
  assert.doesNotMatch(page, /inspectorName: "Jake"/);
  assert.doesNotMatch(page, /label="Inspector"[^\n]+onChange/);
});

test("testing actions fail closed when the active operator cannot be resolved", () => {
  const guardMatches = page.match(/if \(!operatorName\)/g) ?? [];
  assert.ok(guardMatches.length >= 3, "save, readiness and certificate evidence actions should require the active operator");
});
