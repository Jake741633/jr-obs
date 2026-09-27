import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_036_guard_private_file_record_bindings.sql", import.meta.url),
  "utf8",
);

test("private-file metadata validates existing customer, job and path ownership", () => {
  assert.match(
    migration,
    /from public\.private_files file[\s\S]*storage\.foldername\(file\.object_path\)[\s\S]*from public\.jobs job[\s\S]*job\.organisation_id = file\.organisation_id[\s\S]*job\.source_id = file\.job_source_id[\s\S]*job\.customer_source_id is not distinct from file\.customer_source_id/i,
  );
  assert.match(
    migration,
    /from public\.customers customer[\s\S]*customer\.organisation_id = file\.organisation_id[\s\S]*customer\.source_id = file\.customer_source_id/i,
  );
  assert.match(migration, /Cannot secure private-file bindings while invalid customer, job or object-path metadata exists/i);
});

test("new private-file metadata must use an active same-customer job", () => {
  assert.match(
    migration,
    /new\.customer_source_id is not null[\s\S]*from public\.customers customer[\s\S]*customer\.organisation_id = new\.organisation_id[\s\S]*customer\.source_id = new\.customer_source_id[\s\S]*customer\.deleted_at is null/i,
  );
  assert.match(
    migration,
    /from public\.jobs job[\s\S]*job\.organisation_id = new\.organisation_id[\s\S]*job\.source_id = new\.job_source_id[\s\S]*job\.customer_source_id is not distinct from new\.customer_source_id[\s\S]*job\.deleted_at is null/i,
  );
});

test("private-file object paths match their tenant and job scope", () => {
  assert.match(
    migration,
    /storage\.foldername\(new\.object_path\)\)\[1\] is distinct from new\.organisation_id::text/i,
  );
  assert.match(
    migration,
    /new\.job_source_id is null[\s\S]*storage\.foldername\(new\.object_path\)\)\[2\] is distinct from 'unassigned'/i,
  );
  assert.match(
    migration,
    /storage\.foldername\(new\.object_path\)\)\[2\] is distinct from 'jobs'[\s\S]*storage\.foldername\(new\.object_path\)\)\[3\] is distinct from new\.job_source_id/i,
  );
});

test("private-file binding guard is invoker-safe, trigger-only and recovery-ready", () => {
  assert.match(
    migration,
    /create or replace function private\.guard_jr_private_file_record_binding\(\)[\s\S]*set search_path = ''/i,
  );
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(
    migration,
    /revoke execute on function private\.guard_jr_private_file_record_binding\(\)[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /create trigger private_files_record_binding_guard\s+before insert on public\.private_files\s+for each row execute function private\.guard_jr_private_file_record_binding\(\)/is,
  );
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});
