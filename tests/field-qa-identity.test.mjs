import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/field/qa/page.tsx", import.meta.url), "utf8");

test("field QA resets transient state across the full identity scope", () => {
  assert.match(page, /const qaIdentityScopeKey = JSON\.stringify\(\[\s*identityState\.identity\?\.organisationId \?\? null,\s*identityState\.identity\?\.userId \?\? null,\s*identityState\.identity\?\.role \?\? null,\s*identityState\.identity\?\.customerSourceId \?\? null,\s*identityState\.mode,\s*\]\);/);

  const resetEffect = page.slice(page.indexOf("useEffect(() => {"), page.indexOf("\n\n  const visibleJobId"));
  assert.match(resetEffect, /let active = true;/);
  assert.match(resetEffect, /queueMicrotask\(\(\) => \{/);
  assert.match(resetEffect, /if \(!active\) return;/);
  assert.match(resetEffect, /draft\.current = null;/);
  assert.match(resetEffect, /setForm\(blankForm\);/);
  assert.match(resetEffect, /setSelectedJobId\(""\);/);
  assert.match(resetEffect, /setMessage\(""\);/);
  assert.match(resetEffect, /setInteractionScopeKey\(qaIdentityScopeKey\);/);
  assert.match(resetEffect, /return \(\) => \{ active = false; \};/);
  assert.match(page, /const interactionScopeReady = interactionScopeKey === qaIdentityScopeKey;/);
  assert.match(page, /identityState\.isReady && interactionScopeReady;/);
});

test("field QA revalidates the current active job before creating canonical evidence", () => {
  const createInspection = page.slice(page.indexOf("function createInspection"), page.indexOf("\n\n  function toggleCheck"));
  const fieldGuardIndex = createInspection.indexOf("if (!canWrite()) return;");
  const requestedJobIndex = createInspection.indexOf("const requestedJobId = form.jobId || visibleJobId;");
  const activeJobIndex = createInspection.indexOf("const activeJob = activeJobFor(requestedJobId);");
  const missingJobIndex = createInspection.indexOf("if (!activeJob)");
  const buildIndex = createInspection.indexOf("buildQaInspection");
  const persistIndex = createInspection.indexOf("inspections.createItem");

  assert.ok(fieldGuardIndex >= 0 && fieldGuardIndex < requestedJobIndex, "cloud electricians must remain read-only before job selection is accepted");
  assert.ok(requestedJobIndex < activeJobIndex && activeJobIndex < missingJobIndex, "the requested job must be resolved from the current active-job collection");
  assert.ok(missingJobIndex < buildIndex && buildIndex < persistIndex, "a missing current job must fail closed before a QA write");
  assert.match(page, /function activeJobFor[\s\S]*jobIndex\.unique\.get\(jobId\)[\s\S]*activeJobs\.includes\(job\)/);
  assert.match(createInspection, /if \(!activeJob\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(createInspection, /jobId: activeJob\.id/);
  assert.match(createInspection, /setSelectedJobId\(activeJob\.id\);/);
  assert.match(createInspection, /setForm\(\{ \.\.\.blankForm, jobId: activeJob\.id, inspectorId: form\.inspectorId \}\);/);
});
