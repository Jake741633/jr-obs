import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const surveysPage = readFileSync(new URL("../app/surveys/page.tsx", import.meta.url), "utf8");
const surveyDetailPage = readFileSync(new URL("../app/surveys/[id]/page.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260813235633_secure_field_mutation_boundary.sql", import.meta.url), "utf8");

test("field survey RPC requires an assigned canonical job", () => {
  assert.match(migration, /Field collection records must be bound to a job/);
  assert.match(migration, /The field record is not bound to an assigned active job/);
  assert.match(migration, /'jr-os-surveys'/);
});

test("electrician survey creation binds the first save to a selected job", () => {
  assert.match(surveysPage, /useCloudIdentity\(\)/);
  assert.match(surveysPage, /const fieldMode = identityState\.mode !== "local" && identityState\.identity\?\.role === "electrician"/);
  assert.match(surveysPage, /Choose one of your assigned jobs before creating a field survey/);
  assert.match(surveysPage, /survey\.jobId = job\.id/);
  assert.match(surveysPage, /survey\.customerId = job\.customerId/);
  assert.match(surveysPage, /surveys\.createItem\(survey\)/);
  assert.match(surveysPage, /Field surveys must be bound to an assigned job before the first cloud save/);
});

test("electrician survey updates keep the original job and customer binding read-only", () => {
  assert.match(surveyDetailPage, /if \(fieldMode && \("customerId" in patch \|\| "jobId" in patch\)\) return;/);
  assert.match(surveyDetailPage, /Customer<select[^>]*disabled=\{fieldMode\}[^>]*onChange=\{\(e\) => update\(\{ customerId:/);
  assert.match(surveyDetailPage, /Job<select[^>]*disabled=\{fieldMode\}[^>]*onChange=\{\(e\) => update\(\{ jobId:/);
  assert.match(surveyDetailPage, /Field survey customer and job links are fixed to the assigned job\. Ask the office to correct the assignment\./);
  assert.match(migration, /canonical_record\.job_source_id is distinct from canonical_job\.source_id/);
  assert.match(migration, /canonical_record\.customer_source_id is distinct from requested_customer_source_id/);
});

test("office survey creation retains the existing blank-survey flow", () => {
  assert.match(surveysPage, /!fieldMode \? <Button onClick=\{createSurvey\}/);
  assert.match(surveysPage, /const survey = blankSurvey\(surveys\.items\.length\)/);
  assert.match(surveyDetailPage, /disabled=\{fieldMode\}/);
});
