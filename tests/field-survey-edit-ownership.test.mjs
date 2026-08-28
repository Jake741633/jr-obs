import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fieldSurveyEditAllowed } from "../lib/fieldSurveyOwnership-core.mjs";

const surveyPage = readFileSync(new URL("../app/surveys/[id]/page.tsx", import.meta.url), "utf8");

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return source.slice(start, end);
}

test("field survey ownership permits only an exact nonblank creator match", () => {
  assert.equal(fieldSurveyEditAllowed({ fieldMode: false }), true);
  assert.equal(fieldSurveyEditAllowed({ fieldMode: true, userId: "user-1", creatorId: "user-1" }), true);
  assert.equal(fieldSurveyEditAllowed({ fieldMode: true, userId: " user-1 ", creatorId: "user-1" }), true);
  assert.equal(fieldSurveyEditAllowed({ fieldMode: true, userId: "user-1", creatorId: "user-2" }), false);
  assert.equal(fieldSurveyEditAllowed({ fieldMode: true, userId: "user-1", creatorId: null }), false);
  assert.equal(fieldSurveyEditAllowed({ fieldMode: true, userId: "", creatorId: "user-1" }), false);
});

test("survey detail derives field ownership from the scoped envelope sidecar", () => {
  assert.match(surveyPage, /const fieldMode = identityState\.mode !== "local" && identityState\.identity\?\.role === "electrician"/);
  assert.match(surveyPage, /const surveyCreatorId = surveys\.createdBySourceId\[id\]/);
  assert.match(surveyPage, /fieldSurveyEditAllowed\(\{[\s\S]*fieldMode,[\s\S]*userId: identityState\.identity\?\.userId,[\s\S]*creatorId: surveyCreatorId/);
  assert.match(surveyPage, /the creator of this assigned survey could not be confirmed/);
  assert.match(surveyPage, /this assigned survey was created by another user/);
});

test("ownership denial returns before every optimistic survey write", () => {
  const update = section(surveyPage, "function update", "\n\n  function toggle");
  const guard = update.indexOf("if (surveyEditBlocked) return;");
  const mutation = update.indexOf("surveys.setItems");
  assert.ok(guard >= 0 && mutation > guard);
  assert.match(surveyPage, /<fieldset disabled=\{surveyEditBlocked\}/);
  assert.match(surveyPage, /disabled=\{surveyEditBlocked\} onChange=\{\(event\) => update\(\{ status:/);
  assert.match(section(surveyPage, "function addCircuit", "\n\n  function createQuote"), /if \(surveyEditBlocked\) return;/);
  assert.match(section(surveyPage, "function createQuote", "\n\n  return <div"), /if \(surveyEditBlocked\)[\s\S]*return;/);
});

test("office and local survey editing remain outside the creator gate", () => {
  assert.equal(fieldSurveyEditAllowed({ fieldMode: false, userId: "office", creatorId: "someone-else" }), true);
  assert.match(surveyPage, /fieldMode && \("customerId" in patch \|\| "jobId" in patch\)/);
  assert.match(surveyPage, /fieldMode && "labourRate" in patch/);
});
