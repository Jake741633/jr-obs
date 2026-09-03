import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_033_audit_sensitive_metadata_deletions.sql", import.meta.url),
  "utf8",
);

test("sensitive metadata deletion auditing is private and search-path locked", () => {
  assert.match(
    migration,
    /create or replace function private\.audit_jr_sensitive_metadata_delete\(\)[\s\S]*security definer[\s\S]*set search_path = ''/i,
  );
  assert.match(
    migration,
    /revoke execute on function private\.audit_jr_sensitive_metadata_delete\(\)[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function private\.audit_jr_sensitive_metadata_delete\(\)[\s\S]*to service_role/i,
  );
});

test("audit attribution is derived from OLD data and the authenticated actor", () => {
  assert.match(migration, /before_value jsonb := to_jsonb\(old\)/i);
  assert.match(migration, /organisation_value uuid := \(before_value->>'organisation_id'\)::uuid/i);
  assert.match(migration, /source_value text := coalesce\(before_value->>'source_id', before_value->>'id'\)/i);
  assert.match(
    migration,
    /insert into public\.audit_log[\s\S]*organisation_value,[\s\S]*auth\.uid\(\),[\s\S]*'record_deleted',[\s\S]*tg_table_name,[\s\S]*source_value,[\s\S]*before_value,[\s\S]*null/i,
  );
});

test("only DELETE trigger invocation is accepted", () => {
  assert.match(migration, /if tg_op <> 'DELETE'[\s\S]*raise exception/i);
});

for (const table of ["app_records", "private_files", "migration_markers"]) {
  test(`${table} hard deletes create immutable audit evidence`, () => {
    assert.match(
      migration,
      new RegExp(`create trigger ${table}_delete_audit\\s+after delete on public\\.${table}\\s+for each row execute function private\\.audit_jr_sensitive_metadata_delete\\(\\)`, "is"),
    );
  });
}

test("PostgREST reloads after audit trigger installation", () => {
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});
