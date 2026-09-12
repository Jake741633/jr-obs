import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_043_restrict_electrician_office_reads.sql", import.meta.url),
  "utf8",
);
const stockMovementBoundary = readFileSync(
  new URL("../supabase/migrations/20260903132756_keep_field_stock_movements_office_only.sql", import.meta.url),
  "utf8",
);
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const liveRls = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");

const helperStart = migration.indexOf("create or replace function private.can_read_cloud_collection");
const helperEnd = migration.indexOf("revoke execute on function private.can_read_cloud_collection", helperStart);
const helper = migration.slice(helperStart, helperEnd);

test("generic read authorization is an internal fail-closed helper", () => {
  assert.match(helper, /returns boolean[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(helper, /private\.current_jr_role\(\) in \('owner', 'admin', 'office'\) then true/i);
  assert.match(helper, /private\.current_jr_role\(\) = 'electrician'/i);
  assert.match(helper, /else false/i);
  assert.match(
    migration,
    /revoke execute on function private\.can_read_cloud_collection\(text\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function private\.can_read_cloud_collection\(text\)[\s\S]*to authenticated, service_role/i,
  );
});

test("electricians retain only field-operational generic reads", () => {
  for (const key of [
    "jr-os-surveys",
    "jr-os-rams",
    "jr-os-job-packs",
    "jr-os-job-variations",
    "jr-os-job-timeline",
    "jr-os-site-diaries",
    "jr-os-job-tasks",
    "jr-os-job-progress",
    "jr-os-job-material-usage",
    "jr-os-job-completion",
    "jr-os-job-qa-inspections",
    "jr-os-stock-locations",
    "jr-os-fleet",
    "jr-os-certificate-defaults",
  ]) {
    assert.match(helper, new RegExp(`'${key}'`));
  }

  for (const key of [
    "jr-os-business-profile",
    "jr-os-bank-details",
    "jr-os-vat-settings",
    "jr-os-business-overheads",
    "jr-os-labour-rates",
    "jr-os-payment-terms-templates",
    "jr-os-ai-learning-memory",
    "jr-os-customer-profiles",
    "jr-os-customer-interactions",
    "jr-os-leads",
    "jr-os-lead-activities",
    "jr-os-portal-access",
  ]) {
    assert.doesNotMatch(helper, new RegExp(`'${key}'`));
  }
});

test("the final generic SELECT policy preserves tenant and customer portal scope", () => {
  const policyStart = migration.indexOf('create policy "cloud collections tenant read"');
  const policyEnd = migration.indexOf("-- These typed tables", policyStart);
  const policy = migration.slice(policyStart, policyEnd);

  assert.match(policy, /private\.is_organisation_member\(organisation_id\)/i);
  assert.match(policy, /private\.can_read_cloud_collection\(collection_key\)/i);
  assert.match(policy, /private\.current_jr_role\(\) = 'customer'/i);
  assert.match(policy, /customer_source_id = private\.current_customer_source_id\(\)/i);
  for (const key of [
    "jr-os-job-timeline",
    "jr-os-portal-payment-links",
    "jr-os-portal-photo-shares",
    "jr-os-portal-activity",
    "jr-os-deposit-requirements",
  ]) {
    assert.match(policy, new RegExp(`'${key}'`));
  }
});

test("the historical office-only typed boundary excluded then-supported field tables", () => {
  const officeOnly = migration.slice(migration.indexOf("-- These typed tables"), migration.indexOf("-- Invoice, payment"));
  assert.match(officeOnly, /'expenses'/i);
  assert.match(officeOnly, /'ai_recommendation_evidence'/i);
  assert.match(officeOnly, /private\.can_manage_office_data\(\)/i);
  for (const fieldTable of ["materials", "stock_items", "stock_movements", "purchase_lists", "team_members", "timesheets"]) {
    assert.doesNotMatch(officeOnly, new RegExp(`'${fieldTable}'`));
  }
});

test("the final focused boundary keeps canonical stock movement rows office-only", () => {
  assert.match(stockMovementBoundary, /drop policy if exists stock_movements_select on public\.stock_movements/i);
  assert.match(
    stockMovementBoundary,
    /create policy stock_movements_select[\s\S]*organisation_id = private\.current_organisation_id\(\)[\s\S]*\(select private\.can_manage_office_data\(\)\)/i,
  );
});

test("customer-facing finance and portal tables exclude electricians without breaking customer reads", () => {
  const customerScoped = migration.slice(migration.indexOf("-- Invoice, payment"), migration.indexOf("notify pgrst"));
  const policyBody = customerScoped.slice(customerScoped.indexOf("do $$"));
  for (const table of ["invoices", "payments", "portal_approvals", "portal_requests"]) {
    assert.match(customerScoped, new RegExp(`'${table}'`));
  }
  assert.match(customerScoped, /private\.can_manage_office_data\(\)/i);
  assert.match(customerScoped, /private\.current_jr_role\(\) = ''customer''/i);
  assert.match(customerScoped, /customer_source_id = private\.current_customer_source_id\(\)/i);
  assert.doesNotMatch(policyBody, /electrician/i);
});

test("recovery, deployment guidance and live RLS coverage retain the boundary", () => {
  assert.match(recovery, /20260809_043_restrict_electrician_office_reads\.sql/i);
  assert.match(setup, /electricians cannot query office-only finance, CRM history, settings or AI records directly/i);
  for (const phrase of [
    "Electrician must not read office-only typed data",
    "Electrician should retain field collection reads",
    "Electrician must not read office-only generic data",
    "Office should retain sensitive generic reads",
    "Customer must retain own invoice reads",
    "Electrician must not read customer portal workflow data",
  ]) {
    assert.match(liveRls, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }
});
