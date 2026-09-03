import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260803_011_generic_collection_role_guard.sql", import.meta.url), "utf8");

test("generic cloud collection writes are authorised by collection key", () => {
  assert.match(migration, /create or replace function public\.can_write_cloud_collection\(collection_key_value text\)/i);
  assert.match(migration, /public\.current_jr_role\(\) in \('owner','admin','office'\) then true/i);
  assert.match(migration, /public\.current_jr_role\(\) = 'electrician'/i);
  assert.match(migration, /public\.can_write_cloud_collection\(collection_key\)/i);
});

test("electricians retain only field-operational generic collections", () => {
  for (const key of [
    "jr-os-surveys",
    "jr-os-rams",
    "jr-os-job-packs",
    "jr-os-job-variations",
    "jr-os-job-timeline",
    "jr-os-site-diaries",
    "jr-os-site-diary",
    "jr-os-job-tasks",
    "jr-os-job-progress",
    "jr-os-job-material-usage",
    "jr-os-job-completion",
  ]) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
});

test("sensitive generic collections are not granted to electricians", () => {
  for (const key of [
    "jr-os-business-profile",
    "jr-os-bank-details",
    "jr-os-vat-settings",
    "jr-os-business-overheads",
    "jr-os-labour-rates",
    "jr-os-payment-terms-templates",
    "jr-os-business-terms-templates",
    "jr-os-ai-learning-memory",
    "jr-os-customer-profiles",
    "jr-os-customer-interactions",
    "jr-os-leads",
    "jr-os-lead-activities",
  ]) {
    assert.doesNotMatch(migration, new RegExp(`'${key}'`));
  }
});

test("insert and update policies preserve tenant and actor checks", () => {
  assert.match(migration, /public\.is_organisation_member\(organisation_id\)/i);
  assert.match(migration, /created_by = auth\.uid\(\)/i);
  assert.match(migration, /updated_by = auth\.uid\(\)/i);
  assert.match(migration, /for update[\s\S]*using \([\s\S]*can_write_cloud_collection\(collection_key\)[\s\S]*with check/i);
});
