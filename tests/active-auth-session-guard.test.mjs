import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_037_enforce_active_auth_sessions.sql", import.meta.url),
  "utf8",
);
const recovery = readFileSync(
  new URL("../supabase/recovery/after_schema_only.sql", import.meta.url),
  "utf8",
);

test("authorization checks require the JWT session to remain active", () => {
  assert.match(
    migration,
    /create or replace function private\.has_active_auth_session\(\)[\s\S]*security definer[\s\S]*set search_path = ''/i,
  );
  assert.match(
    migration,
    /from auth\.sessions session[\s\S]*session\.id::text = \(auth\.jwt\(\) ->> 'session_id'\)[\s\S]*session\.user_id = \(select auth\.uid\(\)\)/i,
  );
});

test("all tenant and role roots fail closed after session revocation", () => {
  for (const helper of [
    "current_jr_role",
    "current_customer_source_id",
    "is_organisation_member",
    "current_organisation_id",
    '"current_role"',
  ]) {
    const escaped = helper.replaceAll('"', '\\"');
    assert.match(
      migration,
      new RegExp(`create or replace function private\\.${escaped}[\\s\\S]*?private\\.has_active_auth_session\\(\\)[\\s\\S]*?\\$\\$;`, "i"),
      `${helper} must require an active Supabase session`,
    );
  }
});

test("session validation is internal-only and schema-only recovery applies it", () => {
  assert.match(
    migration,
    /revoke execute on function private\.has_active_auth_session\(\)\s+from public, anon, authenticated, service_role/i,
  );
  assert.match(recovery, /20260809_037_enforce_active_auth_sessions\.sql/i);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});
