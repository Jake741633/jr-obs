import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fieldOperatorMemberId } from "../lib/siteDiaryIdentity-core.mjs";

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

test("field survey creation requires exactly one active team identity before persistence", () => {
  const members = [
    { id: "field-1", email: "field@example.com", status: "Active", role: "electrician" },
    { id: "inactive", email: "former@example.com", status: "Suspended", role: "electrician" },
  ];
  const identity = { email: "FIELD@example.com" };
  assert.equal(fieldOperatorMemberId({ identity, teamMembers: members, mode: "cloud" }), "field-1");
  assert.equal(fieldOperatorMemberId({ identity: { email: "missing@example.com" }, teamMembers: members, mode: "cloud" }), "");
  assert.equal(fieldOperatorMemberId({ identity: { email: "former@example.com" }, teamMembers: members, mode: "cloud" }), "");
  assert.equal(fieldOperatorMemberId({ identity, teamMembers: [...members, { ...members[0], id: "duplicate" }], mode: "cloud" }), "");

  assert.match(surveysPage, /useSurveysCollection, useTeamCollection/);
  assert.match(surveysPage, /const team = useTeamCollection\(\);/);
  assert.match(surveysPage, /fieldOperatorMemberId\(\{\s*identity: identityState\.identity,\s*teamMembers: team\.items,\s*mode: identityState\.mode,?\s*\}\)/);
  assert.match(surveysPage, /const fieldSurveyIdentityBlocked = fieldMode && !fieldSurveyOperatorMemberId;/);
  assert.match(surveysPage, /\|\| \(fieldMode && !team\.isReady\)/);

  const createSurvey = surveysPage.slice(
    surveysPage.indexOf("async function createSurvey"),
    surveysPage.indexOf("\n\n  const filtered"),
  );
  const identityGuard = createSurvey.indexOf("if (fieldSurveyIdentityBlocked)");
  assert.ok(identityGuard >= 0);
  assert.match(createSurvey.slice(identityGuard), /if \(fieldSurveyIdentityBlocked\) \{\s*setMessage\(unresolvedFieldSurveyIdentityMessage\);\s*return;\s*\}/);
  for (const sideEffect of ["blankSurvey(", "beginCreationOperation(", "setUnconfirmedSurveyId(", "persistSurveyBeforeNavigation({", "surveys.createItem("]) {
    assert.ok(identityGuard < createSurvey.indexOf(sideEffect), `${sideEffect} must follow the exact-one field identity guard`);
  }

  const retrySurvey = surveysPage.slice(
    surveysPage.indexOf("async function retrySurveyConfirmation"),
    surveysPage.indexOf("\n\n  async function createSurvey"),
  );
  const retryIdentityGuard = retrySurvey.indexOf("if (fieldSurveyIdentityBlocked) return;");
  assert.ok(retryIdentityGuard >= 0);
  for (const sideEffect of ["beginCreationOperation(", "confirmSurveyBeforeNavigation({"]) {
    assert.ok(retryIdentityGuard < retrySurvey.indexOf(sideEffect), `${sideEffect} must follow the retry identity guard`);
  }
  assert.match(surveysPage, /<Button onClick=\{createSurvey\} disabled=\{!newSurveyJobId \|\| creating \|\| Boolean\(unconfirmedSurveyId\) \|\| fieldSurveyIdentityBlocked\}>/);
  assert.match(surveysPage, /onClick=\{retrySurveyConfirmation\} disabled=\{creating \|\| fieldSurveyIdentityBlocked\}/);
  assert.match(surveysPage, /fieldSurveyIdentityBlocked \? <p role="alert"[^>]*>\{unresolvedFieldSurveyIdentityMessage\}<\/p> : null/);
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
