import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/field/snags/page.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260813235633_secure_field_mutation_boundary.sql", import.meta.url), "utf8");

test("field task RPC binds new tasks to the authenticated electrician", () => {
  assert.match(migration, /when 'jr-os-job-tasks'/);
  assert.match(migration, /'assignedTo', pg_catalog\.to_jsonb\(team_member_source_id\)/);
  assert.match(migration, /Only the assigned electrician may update this task/);
});

test("cloud snag creation mirrors the server-bound assignee", () => {
  assert.match(page, /useCloudIdentity\(\)/);
  assert.match(page, /const cloudFieldMode = identityState\.mode !== "local"/);
  assert.match(page, /assignedTo: cloudFieldMode \? operatorMember\?\.id : form\.assignedTo \|\| undefined/);
  assert.match(page, /label="Assigned to" value=\{operatorMember\?\.name \|\| "Resolving active engineer…"\} readOnly/);
  assert.match(page, /Your active team identity could not be resolved/);
});

test("cloud snag status controls fail closed for another assignee", () => {
  assert.match(page, /task\.assignedTo !== operatorMember\.id/);
  assert.match(page, /Only snags assigned to your active field account can be updated here/);
});

test("local snag mode retains manual assignment controls", () => {
  assert.match(page, /cloudFieldMode \? <InputField[\s\S]*? : <label[\s\S]*?<span>Assigned to<\/span><select value=\{form\.assignedTo\}/);
});
