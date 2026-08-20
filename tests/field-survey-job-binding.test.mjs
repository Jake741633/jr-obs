import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const surveysPage = readFileSync(new URL("../app/surveys/page.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260813235633_secure_field_mutation_boundary.sql", import.meta.url), "utf8");

test("field survey RPC requires an assigned canonical job", () => {
  assert.match(migration, /Field collection records must be bound to a job/);
  assert.match(migration, /The field record is not bound to an assigned active job/);
  assert.match(migration, /'jr-os-surveys'/);
});

test("electrician survey creation binds the first save to a selected job", () => {
  assert.match(surveysPage, /useCloudIdentity\(\)/);
  assert.match(surveysPage, /const fieldMode = identity\?\.role === "electrician"/);
  assert.match(surveysPage, /Choose one of your assigned jobs before creating a field survey/);
  assert.match(surveysPage, /survey\.jobId = job\.id/);
  assert.match(surveysPage, /survey\.customerId = job\.customerId/);
  assert.match(surveysPage, /Field surveys must be bound to an assigned job before the first cloud save/);
});

test("office survey creation retains the existing blank-survey flow", () => {
  assert.match(surveysPage, /!fieldMode \? <Button onClick=\{createSurvey\}/);
  assert.match(surveysPage, /const survey = blankSurvey\(surveys\.items\.length\)/);
});
