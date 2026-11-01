import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_034_guard_portal_record_bindings.sql", import.meta.url),
  "utf8",
);
const finalMigration = readFileSync(
  new URL("../supabase/migrations/20260810_062_guard_portal_target_bindings.sql", import.meta.url),
  "utf8",
);

test("final portal binding guard is private, definer-safe and not directly callable", () => {
  assert.match(
    finalMigration,
    /create or replace function private\.guard_jr_portal_record_binding\(\)[\s\S]*language plpgsql[\s\S]*security definer[\s\S]*set search_path = ''/i,
  );
  assert.match(
    finalMigration,
    /revoke execute on function private\.guard_jr_portal_record_binding\(\)[\s\S]*from public, anon, authenticated/i,
  );
});

test("portal customer and job bindings cannot change after insert", () => {
  assert.match(
    finalMigration,
    /if tg_op = 'UPDATE'[\s\S]*new\.customer_source_id is distinct from old\.customer_source_id[\s\S]*new\.job_source_id is distinct from old\.job_source_id[\s\S]*errcode = '42501'/i,
  );
});

test("non-null portal jobs must be active and match tenant and customer", () => {
  assert.match(
    finalMigration,
    /new\.job_source_id is not null[\s\S]*from public\.jobs job[\s\S]*job\.organisation_id = new\.organisation_id[\s\S]*job\.source_id = new\.job_source_id[\s\S]*job\.customer_source_id is not distinct from new\.customer_source_id[\s\S]*job\.deleted_at is null[\s\S]*errcode = '42501'/i,
  );
});

for (const table of ["portal_approvals", "portal_requests"]) {
  test(`${table} enforces the shared binding guard on insert and update`, () => {
    assert.match(
      migration,
      new RegExp(`create trigger ${table}_binding_guard\\s+before insert or update on public\\.${table}\\s+for each row execute function private\\.guard_jr_portal_record_binding\\(\\)`, "is"),
    );
  });
}

test("PostgREST reloads after portal trigger installation", () => {
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});
