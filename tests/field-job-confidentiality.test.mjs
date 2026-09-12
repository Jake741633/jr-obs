import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260813230319_protect_field_job_confidentiality.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");

function functionBody(name) {
  const start = migration.indexOf(`create or replace function ${name}`);
  const end = migration.indexOf("revoke execute on function", start);
  assert.ok(start >= 0 && end > start, `Expected a bounded ${name} definition`);
  return migration.slice(start, end);
}

const fieldJobPayload = functionBody("private.jr_field_job_payload");
const privateCollectionClassification = functionBody("private.jr_field_cloud_collection_has_private_fields");
const fieldCollectionPayload = functionBody("private.jr_field_cloud_payload");
const fieldPayloadMerge = functionBody("private.jr_merge_field_cloud_payload");
const timelineStart = fieldCollectionPayload.indexOf("when 'jr-os-job-timeline' then");
const timelineEnd = fieldCollectionPayload.indexOf("when 'jr-os-job-material-usage' then", timelineStart);
const timelinePayload = fieldCollectionPayload.slice(timelineStart, timelineEnd);

test("final field job projection omits mixed-purpose notes while retaining operational fields", () => {
  for (const key of [
    "id",
    "title",
    "customerId",
    "builderId",
    "siteAddress",
    "status",
    "startDate",
    "targetCompletionDate",
    "priority",
    "assignedTo",
    "contacts",
    "requiredCertificateTypes",
  ]) {
    assert.match(fieldJobPayload, new RegExp(`'${key}'`));
  }
  assert.doesNotMatch(fieldJobPayload, /'notes'/i);
  assert.doesNotMatch(fieldJobPayload, /quoteSnapshot|unitPrice|internalNotes|originalContractValue|value/i);
});

test("existing field job rows are rebuilt from the confidential final helper", () => {
  assert.match(
    migration,
    /update public\.field_jobs projection[\s\S]*from \([\s\S]*private\.jr_field_job_payload\(source\.payload\)[\s\S]*from public\.jobs source[\s\S]*projection\.id = redacted\.id/i,
  );
  assert.match(migration, /projection\.payload is distinct from redacted\.payload/i);
});

test("field timeline projection masks a variation classified by either trusted discriminator", () => {
  assert.match(privateCollectionClassification, /'jr-os-job-timeline'/i);
  assert.match(timelinePayload, /'eventType', record_payload -> 'eventType'/i);
  assert.match(timelinePayload, /'sourceType', record_payload -> 'sourceType'/i);
  assert.match(timelinePayload, /record_payload ->> 'eventType'[\s\S]*= 'variation'/i);
  assert.match(timelinePayload, /record_payload ->> 'sourceType'[\s\S]*= 'jobvariation'/i);
  assert.match(timelinePayload, /pg_catalog\.btrim\(pg_catalog\.lower\(coalesce\(record_payload ->> 'eventType'/i);
  assert.match(timelinePayload, /pg_catalog\.btrim\(pg_catalog\.lower\(coalesce\(record_payload ->> 'sourceType'/i);
  assert.match(timelinePayload, /or[\s\S]*'Variation status updated\.'/i);
  assert.doesNotMatch(
    timelinePayload.slice(timelinePayload.indexOf("'note'")),
    /then\s+record_payload\s*->\s*'note'/i,
    "a variation branch must never return its source note",
  );
});

test("the guarded timeline merge preserves variation classification for future safe mutation paths", () => {
  assert.match(fieldPayloadMerge, /collection_key_value = 'jr-os-job-timeline'/i);
  for (const discriminator of ["old_payload ->> 'eventType'", "old_payload ->> 'sourceType'", "new_payload ->> 'eventType'", "new_payload ->> 'sourceType'"]) {
    assert.ok(fieldPayloadMerge.includes(discriminator), `merge guard must inspect ${discriminator}`);
  }
  assert.equal((fieldPayloadMerge.match(/pg_catalog\.btrim\(pg_catalog\.lower/g) ?? []).length, 4);
  assert.match(fieldPayloadMerge, /- array\['note', 'eventType', 'sourceType'\]::text\[\]/i);
  assert.match(fieldPayloadMerge, /old_payload \|\| \([\s\S]*private\.jr_field_cloud_payload/i);
});

test("existing field timeline rows are reprojected without changing canonical office rows", () => {
  assert.match(
    migration,
    /update public\.field_cloud_collections projection[\s\S]*private\.jr_field_cloud_payload\(source\.collection_key, source\.payload\)[\s\S]*from public\.cloud_collections source[\s\S]*source\.collection_key = 'jr-os-job-timeline'/i,
  );
  assert.doesNotMatch(migration, /update public\.cloud_collections\s/i);
});

test("confidentiality helpers remain private and deployment recovery publishes the exact migration", () => {
  for (const signature of [
    "private.jr_field_job_payload(jsonb)",
    "private.jr_field_cloud_collection_has_private_fields(text)",
    "private.jr_field_cloud_payload(text, jsonb)",
    "private.jr_merge_field_cloud_payload(text, jsonb, jsonb)",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke execute on function ${signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*from public, anon, authenticated, service_role`, "i"),
    );
  }
  assert.match(recovery, new RegExp(migrationName.replaceAll(".", "\\."), "i"));
  assert.match(migration, new RegExp(`'migration',\\s*'${migrationName.replaceAll(".", "\\.")}'`, "i"));
  assert.match(migration, /security invoker[\s\S]*grant execute on function public\.jr_os_deployed_migration\(\)[\s\S]*to service_role/i);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});

test("live RLS runner proves canonical office retention and field redaction", () => {
  for (const phrase of [
    "Office should retain canonical accepted-quote notes",
    "Field job projection must omit mixed commercial notes",
    "Office should retain the canonical variation financial note",
    "Field timeline projection must mask variation financial notes",
    "Field timeline projection must omit every variation price marker",
    "Another organisation must not read the field timeline projection",
  ]) {
    assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }
});
