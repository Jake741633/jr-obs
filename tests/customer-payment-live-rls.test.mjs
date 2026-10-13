import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const runnerSource = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");
const integrationSource = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");

const invoiceSeed = '      ["invoices", invoiceA, { status: "Draft", total: 1200 }],';
const safeInvoiceSeed = [
  '      ["invoices", invoiceA, {',
  '        status: "Sent", number: "INV-PAY-SEC-001", title: "Payment visibility invoice",',
  '        issueDate: "2026-08-09", dueDate: "2026-08-23", vatEnabled: false, vatRate: 0,',
  '        items: [{ id: source("payment-invoice-line"), description: "Work", category: "Labour", quantity: 1, unitPrice: 500 }],',
  '        amountPaid: 0, notes: "", paymentDetails: "", paymentTermsText: "Due within 14 days",',
  '        createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z",',
  '      }],',
].join("\n");

const paymentSeed = '      ["payments", paymentA, { amount: 200, method: "Bank transfer" }],';
const safePaymentSeed = [
  '      ["payments", paymentA, {',
  '        invoiceId: invoiceA, paymentDate: "2026-08-10", amount: 200, method: "Bank transfer",',
  '        reference: "PRIVATE-RECON-REF", notes: "Internal reconciliation note", type: "Payment",',
  '        reconciliationStatus: "Needs review", createdAt: "2026-08-10T00:00:00.000Z",',
  '      }],',
].join("\n");

const customerBillingReads = [
  '    const customerInvoice = await listRecords(accounts.A.customer, "invoices", `select=source_id&source_id=eq.${invoiceA}`);',
  '    await expectAllowed(customerInvoice, "Customer invoice query should execute");',
  '    assert.equal(customerInvoice.payload.length, 1, "Customer must retain own invoice reads");',
  '    const customerPayment = await listRecords(accounts.A.customer, "payments", `select=source_id&source_id=eq.${paymentA}`);',
  '    await expectAllowed(customerPayment, "Customer payment query should execute");',
  '    assert.equal(customerPayment.payload.length, 1, "Customer must retain own payment reads");',
].join("\n");

const safeCustomerBillingReads = [
  '    const customerBaseInvoice = await listRecords(accounts.A.customer, "invoices", `select=source_id&source_id=eq.${invoiceA}`);',
  '    await expectAllowed(customerBaseInvoice, "Customer base invoice query should fail closed");',
  '    assert.deepEqual(customerBaseInvoice.payload, [], "Customer must not read complete invoice rows while testing payments");',
  '    const customerInvoice = await listRecords(accounts.A.customer, "customer_invoices", `select=source_id&source_id=eq.${invoiceA}`);',
  '    await expectAllowed(customerInvoice, "Customer invoice projection query should execute");',
  '    assert.equal(customerInvoice.payload.length, 1, "The allocated payment invoice must be customer-visible");',
  '',
  '    const officeCompletePayment = await listRecords(accounts.A.office, "payments", `select=source_id,payload&source_id=eq.${paymentA}`);',
  '    await expectAllowed(officeCompletePayment, "Office complete payment query should execute");',
  '    assert.equal(officeCompletePayment.payload.length, 1, "Office should retain the complete payment row");',
  '    assert.equal(officeCompletePayment.payload[0].payload.reference, "PRIVATE-RECON-REF", "Office should retain payment references");',
  '    assert.equal(officeCompletePayment.payload[0].payload.notes, "Internal reconciliation note", "Office should retain payment notes");',
  '    assert.equal(officeCompletePayment.payload[0].payload.reconciliationStatus, "Needs review", "Office should retain reconciliation status");',
  '',
  '    const customerBasePayment = await listRecords(accounts.A.customer, "payments", `select=source_id,payload&source_id=eq.${paymentA}`);',
  '    await expectAllowed(customerBasePayment, "Customer base payment query should fail closed");',
  '    assert.deepEqual(customerBasePayment.payload, [], "Customer must not read complete payment rows");',
  '    const customerPayment = await listRecords(accounts.A.customer, "customer_payments", `select=source_id,payload&source_id=eq.${paymentA}`);',
  '    await expectAllowed(customerPayment, "Customer safe payment query should execute");',
  '    assert.equal(customerPayment.payload.length, 1, "Customer should retain allocated payment reads");',
  '    assert.equal(customerPayment.payload[0].payload.invoiceId, invoiceA);',
  '    assert.equal(customerPayment.payload[0].payload.amount, 200);',
  '    assert.equal(customerPayment.payload[0].payload.method, "Bank transfer");',
  '    assert.equal(customerPayment.payload[0].payload.type, "Payment");',
  '    assert.equal(customerPayment.payload[0].payload.reference, undefined, "Customer payment projection must omit internal references");',
  '    assert.equal(customerPayment.payload[0].payload.notes, undefined, "Customer payment projection must omit internal notes");',
  '    assert.equal(customerPayment.payload[0].payload.reconciliationStatus, undefined, "Customer payment projection must omit reconciliation status");',
  '',
  '    const crossTenantPayment = await listRecords(accounts.B.customer, "customer_payments", `select=source_id&source_id=eq.${paymentA}`);',
  '    await expectAllowed(crossTenantPayment, "Cross-tenant customer payment query should execute safely");',
  '    assert.deepEqual(crossTenantPayment.payload, [], "Another organisation must not read the customer payment projection");',
  '',
  '    const otherCustomerInvoice = source("payment-other-customer-invoice");',
  '    await expectAllowed(',
  '      await insertRecord(accounts.A.office, "invoices", typedRecord(organisationA, otherCustomerInvoice, otherCustomerA, otherCustomerJobA, {',
  '        status: "Sent", number: "INV-PAY-OTHER", title: "Other customer invoice", issueDate: "2026-08-09", dueDate: "2026-08-23", vatEnabled: false, vatRate: 0, items: [], amountPaid: 0, notes: "", paymentDetails: "", paymentTermsText: "", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z",',
  '      })),',
  '      "Office should create another customer invoice for payment binding testing",',
  '    );',
  '    const crossCustomerPaymentId = source("payment-cross-customer-invoice");',
  '    await expectAllowed(',
  '      await insertRecord(accounts.A.office, "payments", typedRecord(organisationA, crossCustomerPaymentId, customerA, jobA, {',
  '        invoiceId: otherCustomerInvoice, paymentDate: "2026-08-10", amount: 75, method: "Card", reference: "PRIVATE", notes: "Wrong invoice customer", type: "Payment", reconciliationStatus: "Needs review", createdAt: "2026-08-10T00:00:00.000Z",',
  '      })),',
  '      "Office should retain the inconsistent allocation for internal review without projecting it",',
  '    );',
  '    const hiddenCrossCustomerPayment = await listRecords(accounts.A.customer, "customer_payments", `select=source_id&source_id=eq.${crossCustomerPaymentId}`);',
  '    await expectAllowed(hiddenCrossCustomerPayment, "Cross-customer invoice payment projection query should execute safely");',
  '    assert.deepEqual(hiddenCrossCustomerPayment.payload, [], "Payments must not project through an invoice belonging to another customer");',
  '',
  '    const draftInvoiceId = source("payment-draft-invoice");',
  '    await expectAllowed(',
  '      await insertRecord(accounts.A.office, "invoices", typedRecord(organisationA, draftInvoiceId, customerA, jobA, {',
  '        status: "Draft", number: "INV-PAY-DRAFT", title: "Draft invoice", issueDate: "2026-08-09", dueDate: "2026-08-23", vatEnabled: false, vatRate: 0, items: [], amountPaid: 0, notes: "", paymentDetails: "", paymentTermsText: "", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z",',
  '      })),',
  '      "Office should create a Draft invoice for payment visibility testing",',
  '    );',
  '    const draftPaymentId = source("payment-on-draft-invoice");',
  '    await expectAllowed(',
  '      await insertRecord(accounts.A.office, "payments", typedRecord(organisationA, draftPaymentId, customerA, jobA, {',
  '        invoiceId: draftInvoiceId, paymentDate: "2026-08-10", amount: 50, method: "Cash", reference: "PRIVATE-DRAFT", notes: "Draft invoice payment", type: "Payment", reconciliationStatus: "Allocated", createdAt: "2026-08-10T00:00:00.000Z",',
  '      })),',
  '      "Office should record a payment against a Draft invoice",',
  '    );',
  '    const hiddenDraftPayment = await listRecords(accounts.A.customer, "customer_payments", `select=source_id&source_id=eq.${draftPaymentId}`);',
  '    await expectAllowed(hiddenDraftPayment, "Draft-invoice customer payment query should execute safely");',
  '    assert.deepEqual(hiddenDraftPayment.payload, [], "Payments for Draft invoices must remain hidden from customers");',
  '',
  '    await expectDenied(',
  '      await insertRecord(accounts.A.customer, "customer_payments", {',
  '        organisation_id: organisationA, source_id: source("forged-customer-payment"), customer_source_id: customerA, version: 1, payload: { id: source("forged-customer-payment"), customerId: customerA, invoiceId: invoiceA, amount: 999, type: "Payment" }, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),',
  '      }),',
  '      "Customer must not write the customer payment projection",',
  '    );',
].join("\n");

for (const [label, snippet] of [
  ["invoice seed", invoiceSeed],
  ["payment seed", paymentSeed],
  ["customer billing read block", customerBillingReads],
]) {
  assert.equal(integrationSource.split(snippet).length - 1, 1, `Expected one ${label} anchor`);
}

const patchedIntegration = integrationSource
  .replace(invoiceSeed, safeInvoiceSeed)
  .replace(paymentSeed, safePaymentSeed)
  .replace(customerBillingReads, safeCustomerBillingReads);

for (const phrase of [
  "Customer must not read complete payment rows",
  "Customer should retain allocated payment reads",
  "Customer payment projection must omit internal references",
  "Customer payment projection must omit internal notes",
  "Customer payment projection must omit reconciliation status",
  "Another organisation must not read the customer payment projection",
  "Payments must not project through an invoice belonging to another customer",
  "Payments for Draft invoices must remain hidden from customers",
  "Customer must not write the customer payment projection",
]) {
  assert.match(patchedIntegration, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
}

test("live RLS runner proves customer payments expose allocation data only", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "jr-os-customer-payment-rls-"));
  const temporaryRunner = join(temporaryDirectory, "run-supabase-rls.integration.mjs");
  const temporaryIntegration = join(temporaryDirectory, "supabase-rls.integration.mjs");
  try {
    writeFileSync(temporaryRunner, runnerSource, "utf8");
    writeFileSync(temporaryIntegration, patchedIntegration, "utf8");
    const result = spawnSync(process.execPath, [temporaryRunner], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    assert.equal(result.status ?? 1, 0, "Customer payment live RLS wrapper should complete successfully");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
