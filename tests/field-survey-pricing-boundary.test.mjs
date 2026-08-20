import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const surveyPage = readFileSync(new URL("../app/surveys/[id]/page.tsx", import.meta.url), "utf8");
const fieldBoundary = readFileSync(
  new URL("../supabase/migrations/20260813235633_secure_field_mutation_boundary.sql", import.meta.url),
  "utf8",
);
const finalFieldWriter = readFileSync(
  new URL("../supabase/migrations/20260820170000_preserve_field_site_diary_progress.sql", import.meta.url),
  "utf8",
);

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return source.slice(start, end);
}

function surveyBranch(source, nextCollection) {
  return section(source, "when 'jr-os-surveys' then", `when '${nextCollection}' then`);
}

test("field survey write and read projections omit office labour rates", () => {
  const writer = section(
    finalFieldWriter,
    "create or replace function private.jr_field_collection_write_payload(",
    "revoke execute on function private.jr_field_collection_write_payload",
  );
  const projection = section(
    fieldBoundary,
    "create or replace function private.jr_field_cloud_payload(",
    "revoke execute on function private.jr_field_cloud_payload",
  );

  for (const source of [
    surveyBranch(writer, "jr-os-site-diaries"),
    surveyBranch(projection, "jr-os-job-packs"),
  ]) {
    assert.match(source, /'labourHours'/i);
    assert.doesNotMatch(source, /'labourRate'/i);
  }
});

test("field survey updates preserve the canonical office rate", () => {
  const updateBoundary = section(
    fieldBoundary,
    "-- Survey projection omits labourRate.",
    "update public.cloud_collections",
  );
  assert.match(updateBoundary, /safe_payload := canonical_record\.payload \|\|/i);
  assert.match(updateBoundary, /safe_payload - array\['photos', 'createdAt'\]::text\[\]/i);
});

test("field survey updates reject stale labour-rate handlers before mutation", () => {
  const update = section(surveyPage, "function update", "\n\n  function toggle");
  const guard = update.indexOf('if (fieldMode && "labourRate" in patch) return;');
  const mutation = update.indexOf("surveys.setItems");
  assert.ok(guard >= 0 && mutation > guard, "the field labour-rate guard must precede the optimistic write");
});

test("field survey UI records hours without exposing rate or labour value", () => {
  assert.match(
    surveyPage,
    /Labour hours<input[^>]*value=\{activeSurvey\.labourHours\}[^>]*onChange=\{\(e\) => update\(\{ labourHours:/,
  );
  assert.match(
    surveyPage,
    /fieldMode \? <p[^>]*>Field users can record labour hours\. Hourly rates and labour values are completed by the office\.<\/p> : <label[^>]*>Hourly rate \(£\)/,
  );
  assert.match(
    surveyPage,
    /\{!fieldMode \? <Card><p[^>]*>Labour value<\/p><p[^>]*>£\{\(activeSurvey\.labourHours \* activeSurvey\.labourRate\)\.toFixed\(2\)\}<\/p><\/Card> : null\}/,
  );
});

test("office and local survey pricing behavior remains available", () => {
  assert.match(surveyPage, /Hourly rate \(£\)<input[^>]*value=\{activeSurvey\.labourRate\}/);
  assert.match(surveyPage, /unitPrice: activeSurvey\.labourRate/);
  assert.match(surveyPage, /Generate draft quote/);
});
