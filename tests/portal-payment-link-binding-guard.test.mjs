import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { portalPaymentLinkForInvoice } from "../lib/customerPortal-core.mjs";
import { paymentTargetForInvoice } from "../lib/payments-core.mjs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260810_066_bind_portal_payment_links.sql", import.meta.url),
  "utf8",
);
const finalFinanceMigration = readFileSync(
  new URL("../supabase/migrations/20260814091500_project_customer_portal_finance.sql", import.meta.url),
  "utf8",
);
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const payments = readFileSync(new URL("../app/payments/page.tsx", import.meta.url), "utf8");
const portal = readFileSync(new URL("../app/customer-portal/page.tsx", import.meta.url), "utf8");
const paymentModel = readFileSync(new URL("../lib/payments.ts", import.meta.url), "utf8");
const portalModel = readFileSync(new URL("../lib/customerPortal.ts", import.meta.url), "utf8");

test("payment-link target lookup is private and account-bound before canonical reads", () => {
  assert.match(migration, /create or replace function private\.guard_jr_portal_payment_link_binding\(\)/i);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(
    migration,
    /revoke execute on function private\.guard_jr_portal_payment_link_binding\(\)[\s\S]*from public, anon, authenticated/i,
  );
  const guard = migration.slice(
    migration.indexOf("create or replace function private.guard_jr_portal_payment_link_binding"),
    migration.indexOf("revoke execute on function private.guard_jr_portal_payment_link_binding"),
  );
  const authorization = guard.indexOf("not private.has_active_auth_session()");
  const invoiceLookup = guard.indexOf("from public.invoices invoice");
  assert.ok(authorization >= 0 && authorization < invoiceLookup, "session and profile authorization must precede the definer invoice lookup");
  assert.match(
    guard.slice(authorization, invoiceLookup),
    /profile\.id = auth\.uid\(\)[\s\S]*profile\.organisation_id = new\.organisation_id[\s\S]*profile\.active[\s\S]*profile\.role in \('owner', 'admin', 'office'\)/i,
  );
});

test("outstanding-balance checks authorize scope before reading office billing rows", () => {
  assert.match(migration, /create or replace function private\.jr_customer_invoice_has_outstanding_balance\(\s*record_organisation_id uuid,\s*record_customer_source_id text,\s*record_invoice_source_id text\s*\)/i);
  assert.match(migration, /stable[\s\S]*security definer[\s\S]*set search_path = ''/i);
  const helper = migration.slice(
    migration.indexOf("create or replace function private.jr_customer_invoice_has_outstanding_balance"),
    migration.indexOf("create or replace function private.guard_jr_portal_payment_link_binding"),
  );
  assert.match(helper, /not private\.has_active_auth_session\(\)[\s\S]*profile\.organisation_id = record_organisation_id[\s\S]*profile\.customer_source_id is not distinct from record_customer_source_id/i);
  assert.ok(helper.indexOf("from public.profiles profile") < helper.indexOf("from public.invoices invoice"));
  assert.match(helper, /invoice\.payload ->> 'status' in \('Sent', 'Part paid', 'Overdue'\)/i);
  assert.match(helper, /from public\.payments payment[\s\S]*payment\.organisation_id = record_organisation_id[\s\S]*payment\.customer_source_id is not distinct from record_customer_source_id/i);
  assert.match(helper, /when payment\.payload ->> 'type' = 'Refund'[\s\S]*return invoice_gross > greatest\(0, recorded_paid, allocated_paid\)/i);
  assert.match(helper, /grant execute on function private\.jr_customer_invoice_has_outstanding_balance\(uuid,text,text\)[\s\S]*to authenticated, service_role/i);
});

test("payment links resolve one exact live customer invoice", () => {
  assert.match(migration, /coalesce\(jsonb_typeof\(new\.payload -> 'invoiceId'\), ''\) <> 'string'/i);
  assert.match(
    migration,
    /from public\.invoices invoice[\s\S]*invoice\.organisation_id = new\.organisation_id[\s\S]*invoice\.source_id = target_invoice_id[\s\S]*invoice\.customer_source_id is not null[\s\S]*invoice\.deleted_at is null[\s\S]*invoice\.payload ->> 'status' in \('Sent', 'Part paid', 'Overdue'\)/i,
  );
  assert.match(migration, /if not private\.jr_customer_invoice_has_outstanding_balance\([\s\S]*Portal payment link invoice must have an outstanding balance/i);
  assert.match(
    migration,
    /new\.customer_source_id is distinct from target_customer_source_id[\s\S]*new\.job_source_id is distinct from target_job_source_id/i,
  );
  assert.match(migration, /new\.payload -> 'invoiceId' is distinct from old\.payload -> 'invoiceId'[\s\S]*errcode = '23514'/i);
});

test("legacy unbound links are canonicalized without permitting conflicting IDs", () => {
  assert.match(
    migration,
    /new_unbound := new\.customer_source_id is null[\s\S]*new\.job_source_id is null[\s\S]*jsonb_typeof\(new\.payload -> 'customerId'\)[\s\S]*jsonb_typeof\(new\.payload -> 'jobId'\)/i,
  );
  assert.match(
    migration,
    /if new_unbound then[\s\S]*new\.customer_source_id := target_customer_source_id[\s\S]*new\.job_source_id := target_job_source_id[\s\S]*jsonb_set\(new\.payload, '\{customerId\}'/i,
  );
  assert.match(migration, /update public\.cloud_collections link[\s\S]*from public\.customer_invoices invoice/i);
  assert.match(migration, /disable trigger cloud_collections_set_updated_at[\s\S]*enable trigger cloud_collections_set_updated_at/i);
  assert.match(migration, /create trigger a_portal_payment_link_binding_guard[\s\S]*before insert or update on public\.cloud_collections/i);
});

test("preflight, uniqueness and tombstone cleanup close historical ambiguity", () => {
  assert.match(migration, /lock table public\.cloud_collections, public\.customer_invoices[\s\S]*in share row exclusive mode/i);
  assert.match(migration, /Cannot secure portal payment link % because its invoice target is invalid/i);
  assert.match(migration, /having count\(\*\) > 1[\s\S]*Cannot secure duplicate active portal payment links/i);
  assert.match(
    migration,
    /create unique index if not exists cloud_collections_active_payment_invoice_unique[\s\S]*payload ->> ''invoiceId''[\s\S]*deleted_at is null[\s\S]*customer_source_id is not null/i,
  );
  assert.match(
    migration,
    /if new\.deleted_at is not null then[\s\S]*cleanup cannot rewrite its bindings[\s\S]*return new/i,
  );
  assert.ok(
    migration.indexOf("if new.deleted_at is not null") < migration.indexOf("Portal payment link requires a valid invoice target"),
    "unchanged cleanup must not depend on a legacy target still being valid",
  );
});

test("the historical raw-link policy required a configured HTTPS link and a current invoice projection", () => {
  const customerPolicy = migration.slice(migration.lastIndexOf('create policy "cloud collections tenant read"'));
  assert.match(customerPolicy, /collection_key = 'jr-os-portal-payment-links'[\s\S]*deleted_at is null/i);
  assert.match(customerPolicy, /payload -> 'providerConfigured' = 'true'::jsonb/i);
  assert.match(customerPolicy, /btrim\(payload ->> 'paymentUrl'\) ~\* '\^https:\/\//i);
  assert.match(
    customerPolicy,
    /from public\.customer_invoices invoice[\s\S]*invoice\.organisation_id = cloud_collections\.organisation_id[\s\S]*invoice\.source_id = cloud_collections\.payload ->> 'invoiceId'[\s\S]*invoice\.customer_source_id is not distinct from cloud_collections\.customer_source_id[\s\S]*invoice\.job_source_id is not distinct from cloud_collections\.job_source_id/i,
  );
  assert.match(customerPolicy, /private\.jr_customer_invoice_has_outstanding_balance\([\s\S]*cloud_collections\.payload ->> 'invoiceId'/i);
  assert.doesNotMatch(customerPolicy, /'jr-os-portal-payment-links'\s*,/i);
});

test("the final contract replaces raw link reads with a narrow dynamic projection", () => {
  const finalSourcePolicy = finalFinanceMigration.slice(
    finalFinanceMigration.lastIndexOf('drop policy if exists "cloud collections tenant read"'),
  );
  const projectionPolicy = finalFinanceMigration.slice(
    finalFinanceMigration.indexOf("create policy customer_portal_payment_links_customer_select"),
    finalFinanceMigration.indexOf('-- Customers now read only explicit projections.'),
  );
  assert.match(collections, /"jr-os-portal-payment-links": "customer_portal_payment_links"/i);
  assert.match(finalFinanceMigration, /create table if not exists public\.customer_portal_payment_links/i);
  assert.match(projectionPolicy, /from public\.customer_invoices invoice/i);
  assert.match(projectionPolicy, /private\.jr_customer_invoice_has_outstanding_balance/i);
  assert.match(finalSourcePolicy, /private\.can_manage_office_data\(\)/i);
  assert.doesNotMatch(finalSourcePolicy, /jr-os-portal-payment-links|current_jr_role\(\) = 'customer'/i);
});

test("staff writers and the portal UI carry the complete invoice ownership tuple", () => {
  for (const model of [paymentModel, portalModel]) {
    assert.match(model, /interface PortalPaymentLink \{[^}]*customerId: string;[^}]*jobId\?: string;[^}]*invoiceId: string;/i);
    assert.match(model, /providerName\?: string;/i);
  }
  assert.match(payments, /if \(!customerId\)[\s\S]*Assign the invoice to a customer/i);
  assert.match(payments, /\["Sent", "Part paid", "Overdue"\]\.includes\(invoice\.status\)/i);
  assert.match(payments, /invoiceHasOutstandingBalance\(invoice, payments\.items\)/i);
  assert.match(payments, /new URL\(paymentUrl\)[\s\S]*parsedUrl\.protocol !== "https:"/i);
  assert.match(payments, /existingLinkIsUnboundLegacy[\s\S]*!existingLinkIsUnboundLegacy[\s\S]*Retire its old payment link/i);
  assert.match(payments, /const record = \{[^}]*customerId,[^}]*jobId: invoice\.jobId,[^}]*invoiceId: invoice\.id/i);
  assert.match(portal, /invoiceHasOutstandingBalance\(invoice, payments\.items\) \? portalPaymentLinkForInvoice\(paymentLinks\.items, invoice, activeCustomerId\)/i);
  assert.match(paymentModel, /effectiveInvoicePaid[\s\S]*Math\.max\(recorded, allocatedPaid\(invoice\.id, payments\)\)/i);
  assert.match(paymentModel, /invoiceHasOutstandingBalance[\s\S]*\["Sent", "Part paid", "Overdue"\]/i);
});

test("payment creation and reconciliation preserve the invoice customer boundary", () => {
  const invoices = [
    { id: "invoice-a", customerId: "customer-a" },
    { id: "invoice-b", customerId: "customer-b" },
    { id: "invoice-unassigned" },
  ];

  assert.deepEqual(paymentTargetForInvoice(invoices, undefined, "customer-a"), {
    invoiceId: undefined,
    customerId: "customer-a",
  });
  assert.deepEqual(paymentTargetForInvoice(invoices, "invoice-a", "customer-a"), {
    invoiceId: "invoice-a",
    customerId: "customer-a",
  });
  assert.deepEqual(paymentTargetForInvoice(invoices, "invoice-a", undefined), {
    invoiceId: "invoice-a",
    customerId: "customer-a",
  });
  assert.equal(paymentTargetForInvoice(invoices, "invoice-a", "customer-b"), undefined);
  assert.equal(paymentTargetForInvoice(invoices, "missing", "customer-a"), undefined);
  assert.equal(paymentTargetForInvoice(invoices, "invoice-unassigned", undefined), undefined);

  const savePayment = payments.slice(payments.indexOf("function savePayment"), payments.indexOf("function reallocatePayment"));
  const reallocatePayment = payments.slice(payments.indexOf("function reallocatePayment"), payments.indexOf("function reconcilePayment"));
  const reconcilePayment = payments.slice(payments.indexOf("function reconcilePayment"), payments.indexOf("function saveDeposit"));
  assert.match(savePayment, /paymentTargetForInvoice\(invoices\.items, form\.invoiceId, form\.customerId\)[\s\S]*customerId: target\.customerId[\s\S]*invoiceId: target\.invoiceId/i);
  assert.match(reallocatePayment, /paymentTargetForInvoice\(invoices\.items, nextInvoiceId, payment\.customerId\)[\s\S]*customerId: target\.customerId[\s\S]*invoiceId: target\.invoiceId/i);
  assert.match(reconcilePayment, /paymentTargetForInvoice\(invoices\.items, payment\.invoiceId, payment\.customerId\)[\s\S]*reconciliationStatus: "Reconciled"/i);
});

test("portal resolver accepts only exact or wholly-unbound legacy links", () => {
  const invoice = { id: "invoice-a", customerId: "customer-a", jobId: "job-a" };
  const exact = { id: "exact", invoiceId: "invoice-a", customerId: "customer-a", jobId: "job-a", providerConfigured: true, paymentUrl: "https://payments.example/invoice-a" };
  const legacy = { id: "legacy", invoiceId: "invoice-a", providerConfigured: true, paymentUrl: "https://payments.example/legacy-a" };
  assert.equal(portalPaymentLinkForInvoice([exact], invoice, "customer-a"), exact);
  assert.deepEqual(
    portalPaymentLinkForInvoice([legacy], invoice, "customer-a"),
    { ...legacy, customerId: "customer-a", jobId: "job-a" },
  );
  assert.equal(
    portalPaymentLinkForInvoice([{ ...legacy, customerId: "customer-b" }], invoice, "customer-a"),
    undefined,
  );
  assert.equal(
    portalPaymentLinkForInvoice([{ ...legacy, jobId: "job-b" }], invoice, "customer-a"),
    undefined,
  );
  assert.equal(portalPaymentLinkForInvoice([legacy], invoice, "customer-b"), undefined);
  assert.equal(portalPaymentLinkForInvoice([{ ...legacy, invoiceId: "invoice-b" }], invoice, "customer-a"), undefined);
  assert.equal(portalPaymentLinkForInvoice([{ ...exact, paymentUrl: "javascript:alert(1)" }], invoice, "customer-a"), undefined);
  assert.equal(portalPaymentLinkForInvoice([{ ...exact, paymentUrl: "http://payments.example/insecure" }], invoice, "customer-a"), undefined);
  assert.equal(portalPaymentLinkForInvoice([{ ...exact, providerConfigured: false }], invoice, "customer-a"), undefined);
});

test("schema-only recovery reapplies the payment-link boundary in migration order", () => {
  const publishedMarker = recovery.indexOf("20260810_065_publish_deployed_migration_version.sql");
  const paymentLink = recovery.indexOf("20260810_066_bind_portal_payment_links.sql");
  assert.ok(publishedMarker >= 0 && publishedMarker < paymentLink);
  assert.match(migration, /jr_os_deployed_migration[\s\S]*20260810_066_bind_portal_payment_links\.sql/i);
});
