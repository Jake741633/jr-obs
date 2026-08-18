import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/field/site-diary/page.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260813235633_secure_field_mutation_boundary.sql", import.meta.url), "utf8");

test("site diary server binds internal staff presence to the authenticated field identity", () => {
  assert.match(migration, /when 'jr-os-site-diaries'/);
  assert.match(migration, /'completedBy', pg_catalog\.to_jsonb\(actor_name\)/);
  assert.match(migration, /'staffPresent', pg_catalog\.jsonb_build_array\(team_member_source_id\)/);
  assert.match(migration, /'otherStaffPresent'/);
});

test("cloud site diary UI does not offer internal staff identities the server will discard", () => {
  assert.match(page, /const serverBoundLabour = identityState\.mode !== "local"/);
  assert.match(page, /staffPresent: serverBoundLabour \? \[\] : form\.staffPresent/);
  assert.match(page, /Cloud diaries bind internal staff presence to the authenticated engineer/);
  assert.match(page, /Additional labour \/ subcontractors/);
  assert.match(page, /if \(serverBoundLabour\) return/);
});

test("local diary mode retains manual team attendance controls", () => {
  assert.match(page, /serverBoundLabour \? <div[\s\S]*? : <div className="grid gap-2">/);
  assert.match(page, /toggleStaff\(member\.id\)/);
  assert.match(page, /form\.staffPresent\.includes\(member\.id\)/);
});
