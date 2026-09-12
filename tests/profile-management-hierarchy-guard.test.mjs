import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_040_enforce_profile_management_hierarchy.sql", import.meta.url),
  "utf8",
);
const recovery = readFileSync(
  new URL("../supabase/recovery/after_schema_only.sql", import.meta.url),
  "utf8",
);

test("profile user, organisation and creation identities are immutable", () => {
  assert.match(migration, /new\.id is distinct from old\.id[\s\S]*new\.organisation_id is distinct from old\.organisation_id/i);
  assert.match(migration, /new\.created_at is distinct from old\.created_at/i);
  assert.match(migration, /errcode = '42501'/i);
});

test("users cannot change their own protected membership fields", () => {
  assert.match(
    migration,
    /protected_membership_changed := new\.role is distinct from old\.role[\s\S]*new\.active is distinct from old\.active[\s\S]*new\.customer_source_id is distinct from old\.customer_source_id/i,
  );
  assert.match(migration, /if auth\.uid\(\) = old\.id then[\s\S]*if protected_membership_changed then[\s\S]*errcode = '42501'/i);
});

test("owner and admin management hierarchy is enforced server-side", () => {
  assert.match(migration, /actor_role not in \('owner', 'admin'\)[\s\S]*actor_organisation_id is distinct from old\.organisation_id/i);
  assert.match(migration, /if old\.role = 'owner' then[\s\S]*Owner memberships cannot be managed/i);
  assert.match(migration, /if new\.role = 'owner' then[\s\S]*owner role cannot be assigned/i);
  assert.match(migration, /actor_role = 'admin'[\s\S]*old\.role = 'admin' or new\.role = 'admin'/i);
});

test("customer portal scope resolves to an active same-organisation customer", () => {
  assert.match(migration, /new\.role <> 'customer' and new\.customer_source_id is not null/i);
  assert.match(
    migration,
    /new\.role = 'customer'[\s\S]*new\.active = true[\s\S]*from public\.customers customer[\s\S]*customer\.organisation_id = new\.organisation_id[\s\S]*customer\.source_id = new\.customer_source_id[\s\S]*customer\.deleted_at is null/i,
  );
});

test("profile management is private and schema-only recovery applies it", () => {
  assert.match(migration, /create or replace function private\.guard_jr_profile_management\(\)[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /revoke execute on function private\.guard_jr_profile_management\(\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /drop function if exists public\.prevent_profile_privilege_escalation\(\)/i);
  assert.match(recovery, /20260809_040_enforce_profile_management_hierarchy\.sql/i);
});
