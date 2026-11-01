import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260809_028_customer_portal_job_binding.sql", import.meta.url), "utf8");

for (const [policy, table] of [
  ["portal_approvals_customer_insert", "portal_approvals"],
  ["portal_requests_customer_insert", "portal_requests"],
]) {
  test(`${policy} binds customer submissions to the authenticated actor`, () => {
    const start = migration.indexOf(`create policy ${policy}`);
    assert.notEqual(start, -1);
    const next = migration.indexOf("create policy ", start + 14);
    const body = migration.slice(start, next === -1 ? undefined : next);
    assert.match(body, /created_by = auth\.uid\(\)/i);
    assert.match(body, /updated_by = auth\.uid\(\)/i);
  });

  test(`${policy} accepts only jobs belonging to the same customer`, () => {
    const start = migration.indexOf(`create policy ${policy}`);
    assert.notEqual(start, -1);
    const next = migration.indexOf("create policy ", start + 14);
    const body = migration.slice(start, next === -1 ? undefined : next);
    assert.match(body, /from public\.jobs j/i);
    assert.match(body, /j\.organisation_id = public\.current_organisation_id\(\)/i);
    assert.match(body, new RegExp(`j\\.source_id = ${table}\\.job_source_id`, "i"));
    assert.doesNotMatch(body, /j\.source_id = job_source_id\b/i);
    assert.match(body, /j\.customer_source_id = public\.current_customer_source_id\(\)/i);
    assert.match(body, /j\.deleted_at is null/i);
  });
}
