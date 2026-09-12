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

test("testing resets transient state across the full identity scope and revalidates active jobs", () => {
  assert.match(page, /import \{ FormEvent, useEffect, useMemo, useState \} from "react";/);
  assert.match(page, /const testingIdentityScopeKey = JSON\.stringify\(\[\s*identityState\.identity\?\.organisationId \?\? null,\s*identityState\.identity\?\.userId \?\? null,\s*identityState\.identity\?\.role \?\? null,\s*identityState\.identity\?\.customerSourceId \?\? null,\s*\]\);/);

  const resetEffect = page.slice(page.indexOf("useEffect(() => {"), page.indexOf("\n\n  const selectedJob"));
  assert.match(resetEffect, /queueMicrotask\(\(\) => \{/);
  assert.match(resetEffect, /setForm\(blankRecord\(\)\);/);
  assert.match(resetEffect, /setActionText\(""\);/);
  assert.match(resetEffect, /setMessage\(""\);/);
  assert.match(resetEffect, /setInteractionScopeKey\(testingIdentityScopeKey\);/);
  assert.match(page, /const interactionScopeReady = interactionScopeKey === testingIdentityScopeKey;/);
  assert.match(page, /identityState\.isReady && interactionScopeReady;/);

  const activeJobGuard = page.slice(page.indexOf("function activeJobForWrite"), page.indexOf("\n\n  function saveRecord"));
  assert.match(activeJobGuard, /activeJobs\.find\(\(job\) => job\.id === form\.jobId\)/);
  assert.match(activeJobGuard, /if \(!activeJob\)[\s\S]*return null;/);

  const writeActions = [
    page.slice(page.indexOf("function saveRecord"), page.indexOf("\n\n  function resume")),
    page.slice(page.indexOf("function markCertificateReady"), page.indexOf("\n\n  function prepareCertificateSummary")),
    page.slice(page.indexOf("function prepareCertificateSummary"), page.indexOf("\n\n  const ready")),
  ];
  for (const action of writeActions) {
    const guardIndex = action.indexOf("const activeJob = activeJobForWrite();");
    const persistIndex = action.indexOf("persistRecord(record);");
    assert.ok(guardIndex >= 0 && guardIndex < persistIndex, "each testing write must revalidate the current active job before persistence");
    assert.match(action, /jobId: activeJob\.id, customerId: activeJob\.customerId/);
  }
});
