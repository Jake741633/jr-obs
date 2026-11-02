import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const filename = "20261101085426_project_customer_quote_total.sql";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read(`supabase/migrations/${filename}`);

test("customer total migration publishes one scalar and keeps the customer allowlist", () => {
  const projection = migration.slice(migration.indexOf("create or replace function private.jr_customer_pricing_payload"), migration.indexOf("-- Update only already-visible projections"));
  assert.match(projection, /'customerNetTotal', pg_catalog\.to_jsonb\(private\.jr_customer_quote_net_total\(record_payload\)\)/);
  for (const key of ["unitCost", "pricingSettings", "profitability", "internalNotes", "revisions"]) assert.doesNotMatch(projection, new RegExp(`'${key}'`));
  assert.match(migration, /revoke execute on function private\.jr_customer_quote_net_total\(jsonb\)\s+from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /(?:create|drop) policy|grant .*customer_pricing_documents|update public\.pricing_documents\s/i);
});

test("legacy projection uses round-trip doubles in quote-engine operation order", () => {
  const helper = migration.slice(migration.indexOf("create or replace function private.jr_customer_quote_net_total"), migration.indexOf("revoke execute on function private.jr_customer_quote_net_total"));
  assert.match(helper, /line_total double precision := 0/);
  assert.match(helper, /set extra_float_digits = 3/);
  assert.match(helper, /return pg_catalog\.to_jsonb\(result\)::text::numeric/);
  assert.match(helper, /exception when numeric_value_out_of_range then\s+return null/);
});

test("existing customer projection refresh remains transactional and version-bound", () => {
  assert.match(migration, /^begin;$/m);
  assert.match(migration, /^commit;$/m);
  assert.match(migration, /lock table public\.pricing_documents, public\.customer_pricing_documents/);
  assert.match(migration, /update public\.customer_pricing_documents projection\s+set payload = private\.jr_customer_pricing_payload\(pricing\.payload\)/);
  for (const predicate of ["pricing.id = projection.id", "pricing.organisation_id = projection.organisation_id", "pricing.version = projection.version", "pricing.customer_source_id = projection.customer_source_id", "pricing.job_source_id is not distinct from projection.job_source_id", "pricing.deleted_at is null", "projection.deleted_at is null", "private.jr_customer_pricing_status_is_visible(pricing.payload)"]) assert.ok(migration.includes(predicate), predicate);
});

test("recovery and frozen upgrade inventory include the exact total migration", () => {
  const recovery = read("supabase/recovery/after_schema_only.sql");
  assert.ok(recovery.includes(`\\ir ../migrations/${filename}`));
  const manifest = JSON.parse(read("docs/security/supabase-upgrade-manifest-2026-09-19.json"));
  assert.equal(manifest.pending_count, manifest.pending_migrations.length);
  const entry = manifest.pending_migrations.find(item => item.file === `supabase/migrations/${filename}`);
  assert.equal(entry.file, `supabase/migrations/${filename}`);
  assert.equal(entry.sha256, createHash("sha256").update(migration).digest("hex"));
});

test("isolated PostgreSQL rehearsals exercise existing quote totals and access boundaries", () => {
  const common = read("scripts/supabase-rehearsal/common.mjs");
  assert.match(common, /await checkCustomerQuoteTotals\(connection, actors\)/);
  const coverage = read("scripts/supabase-rehearsal/customer-quote-totals.mjs");
  for (const evidence of ["zero", "legacy", "invalid-snapshot", "overflow-lines", "Out-of-JavaScript-range", "Reprojection must preserve all canonical quote data and versions", "Reprojection must preserve visible row identities and approval document versions", "Customer may read only their visible tenant quote", "Private line cost must remain absent", "Customer projection writes must stay denied"]) assert.ok(coverage.includes(evidence), evidence);
});
