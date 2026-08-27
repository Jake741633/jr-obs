import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260820170000_preserve_field_site_diary_progress.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const advancedPage = readFileSync(new URL("../app/field/site-diary/page.tsx", import.meta.url), "utf8");
const basicPage = readFileSync(new URL("../app/field/page.tsx", import.meta.url), "utf8");
const model = readFileSync(new URL("../lib/models.ts", import.meta.url), "utf8");
const progressCore = readFileSync(new URL("../lib/siteDiaryDailyProgress-core.mjs", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return source.slice(start, end);
}

test("field site-diary payload retains only bounded operational additions", () => {
  const helper = section(
    migration,
    "create or replace function private.jr_field_site_diary_write_payload(",
    "revoke execute on function private.jr_field_site_diary_write_payload",
  );

  assert.match(helper, /language sql[\s\S]*immutable[\s\S]*set search_path = ''/i);
  assert.match(helper, /'completedBy', pg_catalog\.to_jsonb\(actor_name\)/i);
  assert.match(helper, /'staffPresent', pg_catalog\.jsonb_build_array\(team_member_source_id\)/i);
  assert.match(helper, /'createdAt', pg_catalog\.to_jsonb\(received_at\)/i);
  assert.match(helper, /'updatedAt', pg_catalog\.to_jsonb\(received_at\)/i);

  for (const field of ["plantAndEquipment", "deliveriesReceived", "toolboxTalks"]) {
    const fieldProjection = section(helper, `'${field}', case`, "else null");
    assert.match(fieldProjection, new RegExp(`jsonb_typeof\\(record_payload -> '${field}'\\) = 'string'`, "i"));
    assert.match(fieldProjection, new RegExp(`btrim\\(record_payload ->> '${field}'\\)`, "i"));
    assert.match(fieldProjection, /pg_catalog\.left\([\s\S]*4000/i);
  }

  for (const deniedField of [
    "engineerSignatureName",
    "engineerSignedAt",
    "customerSignOffName",
    "customerSignOffNotes",
    "customerSignedAt",
    "dailySummary",
    "photos",
    "photoDocumentIds",
  ]) {
    assert.doesNotMatch(helper, new RegExp(`record_payload\\s*->>?\\s*'${deniedField}'`, "i"));
  }
});

test("the final generic writer delegates diaries without weakening other collection contracts", () => {
  const writer = section(
    migration,
    "create or replace function private.jr_field_collection_write_payload(",
    "revoke execute on function private.jr_field_collection_write_payload",
  );

  assert.match(writer, /when 'jr-os-site-diaries' then\s*private\.jr_field_site_diary_write_payload\(\s*record_payload,\s*team_member_source_id,\s*actor_name,\s*received_at\s*\)/i);
  assert.match(writer, /when 'jr-os-surveys'/i);
  assert.match(writer, /when 'jr-os-job-tasks'/i);
  assert.match(writer, /when 'jr-os-job-timeline'/i);
  assert.match(writer, /'photos', '\[\]'::jsonb/i);
  assert.match(writer, /'assignedTo', pg_catalog\.to_jsonb\(team_member_source_id\)/i);
  assert.match(writer, /'eventType', pg_catalog\.to_jsonb\('Note'::text\)/i);
  assert.match(migration, /revoke execute on function private\.jr_field_site_diary_write_payload\(jsonb, text, text, timestamptz\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration, /revoke execute on function private\.jr_field_collection_write_payload\(text, jsonb, text, text, timestamptz\)[\s\S]*from public, anon, authenticated, service_role/i);
});

test("cloud diary UI submits supported detail and keeps acknowledgement evidence local-only", () => {
  const handler = section(advancedPage, "function saveDiary", "\n\n  if (!ready)");
  const base = section(handler, "const base: DailyProgressEntry", "const entry: DailyProgressEntry");
  const localEvidence = section(handler, "const entry: DailyProgressEntry", "const timelineEntry");

  for (const field of ["plantAndEquipment", "deliveriesReceived", "toolboxTalks"]) {
    assert.match(base, new RegExp(`${field}: form\\.${field}\\.trim\\(\\)`, "i"));
    assert.match(advancedPage, new RegExp(`label="[^"]+" maxLength=\\{4000\\} value=\\{form\\.${field}\\}`, "i"));
    assert.match(model, new RegExp(`${field}\\?: string`));
  }
  assert.doesNotMatch(base, /engineerSignatureName|engineerSignedAt|customerSignOffName|customerSignOffNotes|customerSignedAt|dailySummary|photoDocumentIds|photos:/i);
  assert.match(localEvidence, /cloudFieldMode \? base : \{/i);
  assert.match(localEvidence, /engineerSignatureName: form\.engineerSignatureName\.trim\(\)/i);
  assert.match(localEvidence, /customerSignOffName: form\.customerSignOffName\.trim\(\)/i);
  assert.match(localEvidence, /dailySummary: buildDailyProgressSummary\(base\)/i);
  assert.match(advancedPage, /cloudFieldMode \? <Card[\s\S]*Formal engineer and customer acknowledgements are not recorded by this field diary[\s\S]*: <Card[\s\S]*label="Engineer signature name"[\s\S]*label="Customer acknowledgement name"/i);
  assert.match(progressCore, /requireEngineerSignature = true/i);
  assert.match(handler, /dailyProgressWarnings\(entry, \{ requireEngineerSignature: !cloudFieldMode \}\)/i);
});

test("field diary messaging distinguishes unconfirmed cloud capture from local persistence", () => {
  assert.match(advancedPage, /Daily progress captured on this device; its diary record and separate job timeline note are awaiting cloud confirmation/i);
  assert.match(advancedPage, /The combined daily progress save is not fully cloud-confirmed/i);
  assert.match(advancedPage, /Daily progress saved and added to the job timeline/i);
  assert.match(advancedPage, /cloudFieldMode \? "Capture daily progress" : "Save daily progress"/i);
  assert.doesNotMatch(advancedPage, /Daily progress and a separate job timeline note queued for secure sync/i);
  assert.match(basicPage, /Site diary entry and a separate job timeline note queued for secure sync/i);
  assert.match(basicPage, /Site diary entry saved to the job record/i);
  assert.doesNotMatch(advancedPage, /setMessage\(`Daily progress saved and added to the job timeline/i);
});

test("live RLS coverage verifies diary reconciliation, evidence stripping and replay", () => {
  for (const phrase of [
    "Diary RPC must preserve bounded plant and equipment detail",
    "Diary RPC must preserve bounded delivery detail",
    "Diary RPC must preserve bounded toolbox-talk detail",
    "Diary RPC must bind the canonical actor name",
    "Diary RPC must replace browser-authored receipt timestamps",
    "Diary RPC must discard browser-authored acknowledgement evidence",
    "Field projection must retain the complete canonical diary payload",
    "Office reads must retain the complete canonical diary payload",
    "Diary response-loss retry should return the exact prior result",
    "Diary mutation id reuse with changed payload must fail",
    "Diary create-only retry with a fresh mutation id must collide",
    "Field site diaries must remain insert-only",
  ]) assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
});

test("recovery, guidance and deployment marker retain the final diary writer", () => {
  const readScope = recovery.indexOf("20260820163000_scope_field_site_diary_reads_to_assignments.sql");
  const writeFidelity = recovery.indexOf(migrationName);
  assert.ok(readScope >= 0 && writeFidelity > readScope);
  assert.match(recovery.slice(writeFidelity - 120, writeFidelity + migrationName.length + 50), /begin;[\s\S]*\\ir[\s\S]*commit;/i);
  assert.match(setup, /field diary writes preserve bounded plant, delivery and toolbox-talk notes while browser-authored acknowledgements, summaries and attachment references remain denied/i);
  assert.match(migration, new RegExp(`'${migrationName.replaceAll(".", "\\.")}'`));
});
