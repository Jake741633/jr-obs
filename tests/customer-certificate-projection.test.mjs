import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_057_customer_issued_certificate_projection.sql", import.meta.url),
  "utf8",
);
const fieldBoundaryMigration = readFileSync(
  new URL("../supabase/migrations/20260903104633_keep_field_certificates_office_only.sql", import.meta.url),
  "utf8",
);
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const portal = readFileSync(new URL("../app/customer-portal/page.tsx", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");

test("customers read certificates through an issued-only projection", () => {
  assert.match(migration, /create table if not exists public\.customer_certificates/i);
  assert.match(migration, /coalesce\(new\.payload ->> 'status', ''\) <> 'Issued'/i);
  assert.match(migration, /coalesce\(certificate\.payload ->> 'status', ''\) = 'Issued'/i);
  assert.match(migration, /private\.current_jr_role\(\) = 'customer'/i);
  assert.match(migration, /customer_source_id = private\.current_customer_source_id\(\)/i);
  assert.match(collections, /certificates:\s*"customer_certificates"/i);
});

test("the historical customer projection excludes customers from canonical rows", () => {
  const historicalPolicy = migration.match(/create policy certificates_select[\s\S]*?;\n/i)?.[0] ?? "";
  assert.doesNotMatch(historicalPolicy, /customer/i);
});

test("canonical certificate rows are office-only after the field handoff", () => {
  const selectPolicy = /create policy certificates_select[\s\S]*?;\n/i.exec(fieldBoundaryMigration)?.[0] ?? "";
  assert.match(fieldBoundaryMigration, /drop policy if exists certificates_select on public\.certificates/i);
  assert.match(selectPolicy, /for select to authenticated/i);
  assert.match(selectPolicy, /organisation_id\s*=\s*private\.current_organisation_id\(\)/i);
  assert.match(selectPolicy, /private\.can_manage_office_data\(\)/i);
  assert.doesNotMatch(selectPolicy, /electrician|customer/i);
  assert.doesNotMatch(selectPolicy, /deleted_at/i, "Office certificate history must retain the existing tombstone visibility contract");
  assert.doesNotMatch(fieldBoundaryMigration, /customer_certificates_customer_select/i);
});

test("customer certificate payload omits internal structured observation metadata", () => {
  assert.match(migration, /create or replace function private\.jr_customer_certificate_payload/i);
  for (const field of [
    "number",
    "type",
    "status",
    "installationAddress",
    "inspectorName",
    "inspectionDate",
    "outcome",
    "observations",
    "externalPdfUrl",
  ]) {
    assert.match(migration, new RegExp(`'${field}'`));
  }
  const payloadFunction = /create or replace function private\.jr_customer_certificate_payload[\s\S]*?\$\$;/i.exec(migration)?.[0] ?? "";
  assert.doesNotMatch(payloadFunction, /structuredObservations/i);
  assert.doesNotMatch(payloadFunction, /sourceText/i);
  assert.doesNotMatch(payloadFunction, /confidence/i);
});

test("projection is trigger-maintained and removes non-issued or deleted rows", () => {
  assert.match(migration, /after insert or update or delete on public\.certificates/i);
  assert.match(migration, /new\.deleted_at is not null/i);
  assert.match(migration, /delete from public\.customer_certificates where id = new\.id/i);
  assert.match(migration, /delete from public\.customer_certificates where id = old\.id/i);
});

test("portal retains issued-only presentation as defence in depth", () => {
  assert.match(portal, /certificate\.status === "Issued"/i);
});

test("schema-only recovery reapplies the customer certificate boundary", () => {
  const customerProjection = recovery.indexOf("20260809_057_customer_issued_certificate_projection.sql");
  const officeBoundary = recovery.indexOf("20260903104633_keep_field_certificates_office_only.sql");
  assert.ok(customerProjection >= 0, "Recovery must include the issued-only customer projection");
  assert.ok(officeBoundary > customerProjection, "Recovery must apply the office-only canonical policy after the historical policy");
});
