import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const filename = "20260912184426_allow_management_planner_tombstone_returns.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${filename}`, import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const live = readFileSync(new URL("./planner-team-live-rls.test.mjs", import.meta.url), "utf8");

test("planner tombstone policy only adds authenticated same-tenant management reads", () => {
  const policy = migration.slice(0, migration.indexOf("create or replace function public.jr_os_deployed_migration"));
  assert.equal((policy.match(/create policy/gi) ?? []).length, 1);
  assert.match(policy, /create policy planner_entries_management_tombstones_select\s+on public\.planner_entries\s+for select to authenticated\s+using \(\s*deleted_at is not null\s+and organisation_id = private\.current_organisation_id\(\)\s+and private\.can_manage_business\(\)\s*\);/i);
  assert.doesNotMatch(policy, /drop policy if exists planner_entries_select\b|for (all|insert|update|delete)\b|grant\s|disable row level security/i);
});

test("schema-only recovery installs the planner tombstone correction after earlier policies", () => {
  const entry = `begin;\n\\ir ../migrations/${filename}\ncommit;`;
  assert.ok(recovery.includes(entry));
  assert.ok(recovery.indexOf(entry) > recovery.indexOf("20260903163000_redact_field_stock_locations.sql"));
});

test("live planner coverage retains tombstone write assertions and checks excluded readers", () => {
  for (const phrase of [
    "Owner should tombstone completed planner history before permanent member deletion",
    "Completed history tombstone must affect one row",
    "Owner should tombstone cancelled planner history before permanent member deletion",
    "Cancelled history tombstone must affect one row",
    "Owner and admin should retain same-tenant planner tombstone acknowledgements",
    "Assigned electrician", "Cross-tenant owner", "must not read planner tombstones",
  ]) assert.ok(live.includes(phrase), `Missing live assertion: ${phrase}`);
});
