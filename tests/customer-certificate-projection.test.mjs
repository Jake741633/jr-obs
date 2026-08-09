import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_057_customer_issued_certificate_projection.sql", import.meta.url),
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

test("complete certificate rows are no longer customer-readable", () => {
  assert.match(
    migration,
    /create policy certificates_select[\s\S]*private\.current_jr_role\(\) in \('owner', 'admin', 'office', 'electrician'\)/i,
  );
  assert.doesNotMatch(
    migration.match(/create policy certificates_select[\s\S]*?;\n/i)?.[0] ?? "",
    /customer/i,
  );
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
  assert.match(recovery, /20260809_057_customer_issued_certificate_projection\.sql/i);
});
