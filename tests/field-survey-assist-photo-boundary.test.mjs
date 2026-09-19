import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const assistPage = readFileSync(new URL("../app/surveys/[id]/assist/page.tsx", import.meta.url), "utf8");
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

test("field survey photo writes remain outside the approved server boundaries", () => {
  const writer = section(
    finalFieldWriter,
    "create or replace function private.jr_field_collection_write_payload(",
    "revoke execute on function private.jr_field_collection_write_payload",
  );
  const surveyWriter = section(writer, "when 'jr-os-surveys' then", "when 'jr-os-site-diaries' then");
  assert.match(surveyWriter, /'photos',\s*'\[\]'::jsonb/i);
  assert.doesNotMatch(surveyWriter, /'photos',\s*record_payload\s*->\s*'photos'/i);

  const fileWriter = section(
    fieldBoundary,
    "create or replace function private.jr_can_write_private_file(",
    "revoke execute on function private.jr_can_write_private_file",
  );
  assert.match(fileWriter, /private\.can_manage_office_data\(\)/i);
  assert.doesNotMatch(fileWriter, /electrician|can_manage_field_data/i);
  const objectInsert = section(
    fieldBoundary,
    "drop policy if exists jr_private_insert on storage.objects",
    "drop policy if exists legacy_files_staff_insert on storage.objects",
  );
  assert.match(objectInsert, /create policy jr_private_insert[\s\S]*private\.can_manage_office_data\(\)/i);
  assert.doesNotMatch(objectInsert, /electrician|can_manage_field_data/i);
});

test("survey assist detects the cloud electrician read-only boundaries", () => {
  assert.match(assistPage, /useCloudIdentity\(\)/);
  assert.match(
    assistPage,
    /const fieldSuggestionRestricted = identityState\.mode !== "local" && identityState\.identity\?\.role === "electrician"/,
  );
  assert.match(
    assistPage,
    /const fieldPhotoRestricted = identityState\.mode !== "local" && identityState\.identity\?\.role === "electrician"/,
  );
  assert.match(
    assistPage,
    /Survey suggestions are read-only for field users because assigned surveys can be office-authored\. Ask the office to apply the draft after review\./,
  );
  assert.match(
    assistPage,
    /Board photo uploads are read-only for field users until a dedicated assigned-job upload route is available\. Ask the office to add new survey photos\./,
  );
});

test("restricted suggestion handling returns before every optimistic side effect", () => {
  const handler = section(assistPage, "function applySuggestions", "\n\n  function addBoardPhoto");
  const guard = handler.indexOf("if (fieldSuggestionRestricted) return;");
  assert.ok(guard >= 0, "field suggestion restriction must return from the handler");

  for (const sideEffect of ["update({", 'setSaved("Suggestions applied']) {
    assert.ok(handler.indexOf(sideEffect) > guard, `${sideEffect} must remain behind the restriction guard`);
  }
});

test("the survey RPC retains its creator-bound update contract", () => {
  const writer = section(
    fieldBoundary,
    "create or replace function public.jr_field_save_collection(",
    "revoke execute on function public.jr_field_save_collection",
  );
  assert.match(writer, /canonical_record\.created_by is distinct from field_identity\.actor_user_id/i);
  assert.match(writer, /Only the electrician who created this survey may update it/i);
  assert.match(writer, /using errcode = '42501'/i);
});

test("field users retain read-only suggestions and existing assigned photo reads", () => {
  assert.match(assistPage, /function applySuggestions\(\)/);
  assert.match(assistPage, /This field view does not change the survey\./);
  assert.match(assistPage, /fieldSuggestionRestricted \? <p[^>]*>\{fieldSuggestionHandoffMessage\}<\/p> : <Button[^>]*onClick=\{applySuggestions\}[^>]*>[\s\S]*Apply approved draft/);
  assert.match(assistPage, /Existing assigned survey photos remain available to review\./);
  assert.match(assistPage, /survey\.photos\.filter\(\(photo\) => photo\.category === "Consumer unit"\)\.map/);
  assert.match(
    assistPage,
    /fieldPhotoRestricted \? <p[^>]*>\{fieldPhotoHandoffMessage\}<\/p> : <label[^>]*>[\s\S]*Add board photo/,
  );
});

test("office and local survey mutations remain available", () => {
  assert.match(assistPage, /identityState\.mode !== "local"/);
  assert.match(assistPage, /<Button onClick=\{applySuggestions\} disabled=\{!transcript\.trim\(\)\}>/);
  assert.match(assistPage, /<input className="hidden" type="file" accept="image\/\*" capture="environment" onChange=\{addBoardPhoto\} \/>/);
  assert.match(assistPage, /update\(\(currentSurvey\) => \(\{ photos: \[\.\.\.currentSurvey\.photos, photo\] \}\), requestedScopeKey\)/);
  assert.match(assistPage, /reader\.readAsDataURL\(file\)/);
});

test("restricted board photo handling returns before every optimistic side effect", () => {
  const handler = section(assistPage, "function addBoardPhoto", "\n\n  return <div");
  const guard = handler.indexOf("if (fieldPhotoRestricted)");
  const guardReturn = handler.indexOf("return;", guard);
  assert.ok(guard >= 0 && guardReturn > guard, "field photo restriction must return from the handler");
  assert.match(handler.slice(guard, guardReturn), /event\.target\.value = ""/);

  for (const sideEffect of [
    "input.files",
    "new FileReader",
    "reader.readAsDataURL",
    "update((currentSurvey)",
    'setSaved("Board photo added.',
  ]) {
    assert.ok(handler.indexOf(sideEffect) > guardReturn, `${sideEffect} must remain behind the restriction guard`);
  }
});
