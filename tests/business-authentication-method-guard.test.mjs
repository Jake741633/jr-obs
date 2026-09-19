import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_038_restrict_verification_only_sessions.sql", import.meta.url),
  "utf8",
);
const recovery = readFileSync(
  new URL("../supabase/recovery/after_schema_only.sql", import.meta.url),
  "utf8",
);

test("business authorization reads signed authentication methods fail closed", () => {
  assert.match(
    migration,
    /from jsonb_array_elements\([\s\S]*jsonb_typeof\(auth\.jwt\(\) -> 'amr'\) = 'array'/i,
  );
  assert.match(migration, /when 'object' then authentication_method\.value ->> 'method'/i);
  assert.match(migration, /when 'string' then trim\(both '"' from authentication_method\.value::text\)/i);
  assert.match(migration, /else '\[\]'::jsonb/i);
});

test("ordinary business sign-ins are allowed but verification-only methods are not", () => {
  const allowedMethods = migration.match(/= any \(array\[([\s\S]*?)\]::text\[\]\)/i)?.[1] ?? "";
  for (const method of [
    "password",
    "email/signup",
    "oauth",
    "sso/saml",
    "passkey",
  ]) {
    assert.match(allowedMethods, new RegExp(`'${method.replace("/", "\\/")}'`, "i"));
  }
  for (const method of ["recovery", "otp", "magiclink", "invite", "email_change", "anonymous"]) {
    assert.doesNotMatch(allowedMethods, new RegExp(`'${method}'`, "i"));
  }
});

test("authentication method enforcement preserves revocation checks and recovery", () => {
  assert.match(
    migration,
    /from auth\.sessions session[\s\S]*session\.id::text = \(auth\.jwt\(\) ->> 'session_id'\)[\s\S]*session\.user_id = \(select auth\.uid\(\)\)/i,
  );
  assert.match(
    migration,
    /revoke execute on function private\.has_active_auth_session\(\)\s+from public, anon, authenticated, service_role/i,
  );
  assert.match(recovery, /20260809_038_restrict_verification_only_sessions\.sql/i);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});
