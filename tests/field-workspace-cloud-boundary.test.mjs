import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/field/page.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260813235633_secure_field_mutation_boundary.sql", import.meta.url), "utf8");

test("private completion and document writes remain unavailable to field cloud sessions", () => {
  assert.match(migration, /File metadata and object writes cannot safely prove assigned-job ownership/);
  assert.match(migration, /private\.can_manage_office_data\(\)/);
  assert.match(page, /Completion photos and sign-off packs are read-only for field cloud sessions/);
  assert.match(page, /cloudFieldMode \? <Card>/);
});

test("legacy field diary binds attribution to the active account instead of an editable fixed name", () => {
  assert.match(page, /useCloudIdentity\(\)/);
  assert.match(page, /fieldOperatorName\(\{/);
  assert.match(page, /completedBy: operatorName/);
  assert.match(page, /label="Completed by" value=\{operatorName\} readOnly aria-readonly="true"/);
  assert.doesNotMatch(page, /completedBy: "Jake"/);
  assert.doesNotMatch(page, /uploadedBy: "Jake"/);
  assert.doesNotMatch(page, /form\.completedBy/);
});

test("legacy field workspace does not emit a duplicate client status timeline in cloud mode", () => {
  assert.match(page, /if \(!cloudFieldMode && result\.timelineEntry\)/);
});

test("starting a visit only advances a scheduled job to first fix", () => {
  assert.match(page, /normaliseJobStatus\(job\.status\) === "Scheduled"/);
  assert.match(page, /updateJobStatus\(job\.id, "First fix"\)/);
});

test("cloud completion UI fails closed rather than claiming unsupported persistence", () => {
  const match = page.match(/async function saveCompletionPack\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(match, "saveCompletionPack should exist");
  assert.match(match[1], /if \(cloudFieldMode\)/);
  assert.match(page, /JR OS will not claim a customer sign-off or completion photo was saved/);
});
