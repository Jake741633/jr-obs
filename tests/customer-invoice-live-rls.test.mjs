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
  '        status: "Sent",',
  '        number: "INV-SEC-001",',
  '        title: "Customer-visible invoice",',
  '        issueDate: "2026-08-09",',
  '        dueDate: "2026-08-23",',
  '        vatEnabled: true,',
  '        vatRate: 20,',
  '        items: [{',
  '          id: source("invoice-line-a"),',
  '          description: "Customer-visible installation",',
  '          category: "Materials",',
  '          quantity: 2,',
  '          unitPrice: 60,',
  '          unitCost: 10,',
  '          supplier: "Staff-only supplier",',
  '          stockCode: "PRIVATE-STOCK",',
  '          materialId: source("private-material-a"),',
  '          labourRateId: source("private-labour-rate-a"),',
  '          labourMode: "Hours",',
  '          labourHours: 5,',
  '        }],',
  '        amountPaid: 0,',
  '        notes: "Customer-visible invoice note",',
  '        paymentDetails: "Customer-visible bank details",',
  '        paymentTermsText: "Due within 14 days",',
  '        builderId: source("private-builder-link"),',
  '        quoteId: source("private-quote-link"),',
  '        variationIds: [source("private-variation-link")],',
  '        paymentTermsTemplateId: source("private-payment-template"),',
  '        createdAt: "2026-08-09T00:00:00.000Z",',
  '        updatedAt: "2026-08-09T00:00:00.000Z",',
  '      }],',
].join("\n");

const customerInvoiceRead = [
  '    const customerInvoice = await listRecords(accounts.A.customer, "invoices", `select=source_id&source_id=eq.${invoiceA}`);',
  '    await expectAllowed(customerInvoice, "Customer invoice query should execute");',
  '    assert.equal(customerInvoice.payload.length, 1, "Customer must retain own invoice reads");',
].join("\n");

const safeCustomerInvoiceRead = [
  '    const officeCompleteInvoice = await listRecords(accounts.A.office, "invoices", `select=source_id,payload&source_id=eq.${invoiceA}`);',
  '    await expectAllowed(officeCompleteInvoice, "Office complete invoice query should execute");',
  '    assert.equal(officeCompleteInvoice.payload.length, 1, "Office should retain the complete invoice record");',
  '    assert.equal(officeCompleteInvoice.payload[0].payload.items[0].unitCost, 10, "Office should retain invoice unit costs");',
  '    assert.equal(officeCompleteInvoice.payload[0].payload.items[0].supplier, "Staff-only supplier", "Office should retain invoice supplier data");',
  '',
  '    const customerBaseInvoice = await listRecords(accounts.A.customer, "invoices", `select=source_id,payload&source_id=eq.${invoiceA}`);',
  '    await expectAllowed(customerBaseInvoice, "Customer base invoice query should fail closed");',
  '    assert.deepEqual(customerBaseInvoice.payload, [], "Customer must not read complete invoice records");',
  '',
  '    const customerInvoice = await listRecords(accounts.A.customer, "customer_invoices", `select=source_id,payload&source_id=eq.${invoiceA}`);',
  '    await expectAllowed(customerInvoice, "Customer safe invoice query should execute");',
  '    assert.equal(customerInvoice.payload.length, 1, "Customer should retain sent invoice reads");',
  '    assert.equal(customerInvoice.payload[0].payload.number, "INV-SEC-001");',
  '    assert.equal(customerInvoice.payload[0].payload.items[0].unitPrice, 60);',
  '    assert.equal(customerInvoice.payload[0].payload.items[0].unitCost, undefined, "Customer invoice projection must omit unit costs");',
  '    assert.equal(customerInvoice.payload[0].payload.items[0].supplier, undefined, "Customer invoice projection must omit supplier data");',
  '    assert.equal(customerInvoice.payload[0].payload.items[0].stockCode, undefined, "Customer invoice projection must omit stock codes");',
  '    assert.equal(customerInvoice.payload[0].payload.items[0].materialId, undefined, "Customer invoice projection must omit material IDs");',
  '    assert.equal(customerInvoice.payload[0].payload.items[0].labourRateId, undefined, "Customer invoice projection must omit labour-rate IDs");',
  '    assert.equal(customerInvoice.payload[0].payload.builderId, undefined, "Customer invoice projection must omit builder links");',
  '    assert.equal(customerInvoice.payload[0].payload.quoteId, undefined, "Customer invoice projection must omit quote links");',
  '    assert.equal(customerInvoice.payload[0].payload.paymentTermsTemplateId, undefined, "Customer invoice projection must omit internal payment template IDs");',
  '',
  '    const crossTenantInvoice = await listRecords(accounts.B.customer, "customer_invoices", `select=source_id&source_id=eq.${invoiceA}`);',
  '    await expectAllowed(crossTenantInvoice, "Cross-tenant customer invoice query should execute safely");',
  '    assert.deepEqual(crossTenantInvoice.payload, [], "Another organisation must not read the customer invoice projection");',
  '',
  '    const draftInvoice = source("invoice-draft-customer-hidden");',
  '    await expectAllowed(',
  '      await insertRecord(accounts.A.office, "invoices", typedRecord(organisationA, draftInvoice, customerA, jobA, {',
  '        status: "Draft", number: "INV-DRAFT", title: "Internal draft", items: [], vatEnabled: false, vatRate: 0, amountPaid: 0, notes: "", paymentDetails: "", issueDate: "2026-08-09", dueDate: "2026-08-23", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z",',
  '      })),',
  '      "Office should create a Draft invoice for customer visibility testing",',
  '    );',
  '    const hiddenDraftInvoice = await listRecords(accounts.A.customer, "customer_invoices", `select=source_id&source_id=eq.${draftInvoice}`);',
  '    await expectAllowed(hiddenDraftInvoice, "Draft customer invoice projection query should execute safely");',
  '    assert.deepEqual(hiddenDraftInvoice.payload, [], "Draft invoices must not appear in the customer projection");',
  '',
  '    await expectDenied(',
  '      await insertRecord(accounts.A.customer, "customer_invoices", {',
  '        organisation_id: organisationA, source_id: source("forged-customer-invoice"), customer_source_id: customerA, version: 1, payload: { id: source("forged-customer-invoice"), status: "Sent" }, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),',
  '      }),',
  '      "Customer must not write the customer invoice projection",',
  '    );',
].join("\n");

for (const [label, snippet] of [
  ["invoice seed", invoiceSeed],
  ["customer invoice read", customerInvoiceRead],
]) {
  assert.equal(integrationSource.split(snippet).length - 1, 1, `Expected one ${label} anchor`);
}

const patchedIntegration = integrationSource
  .replace(invoiceSeed, safeInvoiceSeed)
  .replace(customerInvoiceRead, safeCustomerInvoiceRead);

for (const phrase of [
  "Customer must not read complete invoice records",
  "Customer should retain sent invoice reads",
  "Customer invoice projection must omit unit costs",
  "Customer invoice projection must omit supplier data",
  "Customer invoice projection must omit stock codes",
  "Customer invoice projection must omit labour-rate IDs",
  "Another organisation must not read the customer invoice projection",
  "Draft invoices must not appear in the customer projection",
  "Customer must not write the customer invoice projection",
]) {
  assert.match(patchedIntegration, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
}

test("live RLS runner proves customer invoices expose selling data only", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "jr-os-customer-invoice-rls-"));
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
    assert.equal(result.status ?? 1, 0, "Customer invoice live RLS wrapper should complete successfully");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
