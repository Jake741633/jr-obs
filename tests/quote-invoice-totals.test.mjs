import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as variations from "../lib/jobManagement-core.mjs";
import * as billing from "../lib/depositBilling-core.mjs";

function loadModule(path, dependencies = {}) {
  const commonJsModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module: commonJsModule, exports: commonJsModule.exports, require: (name) => dependencies[name] });
  return commonJsModule.exports;
}
const business = loadModule("../lib/businessSettings.ts");
const workflow = loadModule("../lib/workflow.ts", { "./businessSettings": business, "./jobManagement-core.mjs": variations, "./depositBilling-core.mjs": billing });
const now = "2026-11-01T12:00:00.000Z";
let sequence = 0;
const createId = (prefix) => `${prefix}-${++sequence}`;
function quote(patch = {}) {
  return {
    id: "quote", number: "Q-0001", type: "Quote", status: "Accepted", title: "Site works", customerId: "customer",
    items: [
      { id: "work", category: "Labour", description: "Works", quantity: 1, unitPrice: 100 },
      { id: "permit", category: "Other", description: "Permit", quantity: 2, unitPrice: 15, unitCost: 0 },
    ],
    pricingSettings: { contingencyPercent: 10, materialMarkupPercent: 20, travelPrice: 40, travelCost: 10, parkingPrice: 20, parkingCost: 5 },
    profitability: { sellingPrice: 203 }, vatEnabled: true, vatRate: 20, notes: "", terms: "", createdAt: now, updatedAt: now,
    ...patch,
  };
}
function jobFrom(document) {
  return workflow.createJobFromAcceptedQuote({ document, jobId: "job", now, createId }).job;
}
function completedInvoice(job, liveQuote, extra = {}) {
  return workflow.createInvoiceFromCompletedJob({ job, quote: liveQuote, invoices: [], invoiceId: "invoice", now, createId, ...extra }).invoice;
}
const page = ts.createSourceFile("page.tsx", readFileSync(new URL("../app/invoices/page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let importAction;
function walk(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "importQuote") importAction = node;
  ts.forEachChild(node, walk);
}
walk(page);
function importedInvoiceState(document) {
  const state = { form: { issueDate: "2026-11-01" }, items: [], error: "" };
  const code = ts.transpileModule(importAction.getText(page), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`${code}\nimportQuote("quote");`, {
    ...workflow, quotes: { items: [document] }, invoices: { items: [] }, latestInvoices: { current: { items: [], ready: true } }, setImportedQuote() {}, makeId: createId, paymentTermsText: business.paymentTermsText,
    addDays: () => "2026-11-08", setForm: (update) => state.form = update(state.form),
    setItems: (items) => state.items = items, setError: (error) => state.error = error,
  });
  return state;
}
function importedInvoice(document) {
  const state = importedInvoiceState(document);
  assert.equal(state.error, "");
  return { ...state.form, items: state.items };
}

test("accepted quote import bills all allowances and VAT exactly once", () => {
  const document = quote();
  const invoice = importedInvoice(document);
  assert.equal(workflow.invoiceTotal(invoice), 243.6);
  assert.equal(invoice.items.length, 5);
  assert.equal(invoice.items.find((item) => item.description === "Permit").unitCost, 0);
});

test("missing and non-finite profitability calculate quote-level extras from raw lines", () => {
  for (const profitability of [undefined, { sellingPrice: NaN }, { sellingPrice: Infinity }]) {
    const document = quote({ profitability });
    assert.equal(workflow.pricingDocumentNetTotal(document), 203);
    assert.equal(workflow.pricingDocumentTotal(document), 243.6);
    assert.equal(jobFrom(document).value, 243.6);
    assert.equal(workflow.invoiceTotal(importedInvoice(document)), 243.6);
    assert.equal(workflow.invoiceTotal(completedInvoice(jobFrom(document), document)), 243.6);
  }
  assert.equal(workflow.pricingDocumentNetTotal(quote({ profitability: undefined, pricingSettings: undefined })), 130);
});

test("both invoice routes honour stale recorded totals including zero as an accepted fixed price", () => {
  for (const [sellingPrice, grossPence] of [[0, 0], [150, 18000], [203.01, 24361]]) {
    const document = quote({ profitability: { sellingPrice } });
    for (const invoice of [importedInvoice(document), completedInvoice(jobFrom(document), document)]) {
      assert.equal(invoice.items.length, 1);
      assert.match(invoice.items[0].description, /accepted scope.*fixed price/i);
      assert.equal(invoice.items[0].unitPrice, sellingPrice);
      assert.equal(Math.round(workflow.invoiceTotal(invoice) * 100), grossPence);
    }
  }
});

test("completed invoice uses the accepted snapshot including absent settings over a changed live quote", () => {
  const original = quote({ pricingSettings: undefined, profitability: undefined });
  const job = jobFrom(original);
  const invoice = completedInvoice(job, quote());
  assert.equal(workflow.invoiceTotal(invoice), 156);
  assert.equal(invoice.items.length, 2);
  assert.equal(workflow.invoiceTotal(completedInvoice(jobFrom(quote()), quote({ profitability: { sellingPrice: 500 } }))), 243.6);
  assert.equal(workflow.invoiceTotal(completedInvoice(jobFrom(quote({ profitability: { sellingPrice: 0 } })), quote())), 0);
});

test("completed invoice without source lines uses the aggregate job value without extras or repeated VAT", () => {
  const source = quote({ items: [], profitability: undefined });
  const job = { ...jobFrom(source), value: 243.6, originalContractValue: 243.6 };
  const invoice = completedInvoice(job, source);
  assert.equal(workflow.invoiceTotal(invoice), 243.6);
  assert.equal(invoice.items.length, 1);
});

test("accepted variations are added after fixed accepted scope without contingency on variations", () => {
  const document = quote({ profitability: { sellingPrice: 150 } });
  const variation = { id: "variation", jobId: "job", number: "VAR-001", title: "Extra socket", status: "Accepted", pricingMode: "Fixed price", fixedPrice: 25 };
  const invoice = completedInvoice(jobFrom(document), document, { variations: [variation] });
  assert.equal(invoice.items.length, 2);
  assert.equal(invoice.items[1].variationId, "variation");
  assert.equal(workflow.invoiceTotal(invoice), 210);
});

test("fixed accepted scope retains coverage of variations already present in its source lines", () => {
  const document = quote({ profitability: { sellingPrice: 150 } });
  document.items[1].variationId = "variation";
  const variation = { id: "variation", jobId: "job", number: "VAR-001", title: "Permit", status: "Accepted", pricingMode: "Fixed price", fixedPrice: 30 };
  const invoice = completedInvoice(jobFrom(document), document, { variations: [variation] });
  assert.equal(invoice.items.length, 1);
  assert.equal(workflow.invoiceTotal(invoice), 180);
  assert.ok(invoice.variationIds.includes("variation"));
});

test("historical missing snapshot items recover accepted price before live quote or job aggregate", () => {
  for (const items of [undefined, null, {}]) {
    const job = jobFrom(quote());
    job.quoteSnapshot.items = items;
    assert.equal(workflow.invoiceTotal(completedInvoice(job, quote({ profitability: { sellingPrice: 999 } }))), 243.6);
    job.quoteSnapshot.profitability = undefined;
    assert.equal(workflow.invoiceTotal(completedInvoice(job, quote({ profitability: { sellingPrice: 999 } }))), 243.6);
  }
});

test("itemisation must match both agreed net pence and VAT inclusive payable pence", () => {
  const document = quote({
    items: [{ id: "fractional", description: "Works", category: "Labour", quantity: 1, unitPrice: 100.003 }],
    pricingSettings: undefined, profitability: { sellingPrice: 100.0045 },
  });
  for (const invoice of [importedInvoice(document), completedInvoice(jobFrom(document), document)]) {
    assert.equal(invoice.items[0].unitPrice, 100.0045);
    assert.equal(Math.round(workflow.invoiceTotal(invoice) * 100), 12001);
  }
});

test("invalid aggregate prices require review before an invoice or imported draft is created", () => {
  for (const value of [-1, NaN, Infinity]) {
    const job = { ...jobFrom(quote()), value, originalContractValue: value, quoteSnapshot: undefined };
    assert.throws(() => completedInvoice(job), /review|valid/i);
  }
  const state = importedInvoiceState(quote({ profitability: { sellingPrice: -1 } }));
  assert.match(state.error, /review|valid/i);
  assert.equal(state.items.length, 0);
  assert.equal(state.form.quoteId, undefined);
  const missing = importedInvoiceState(quote({ items: undefined, profitability: undefined }));
  assert.match(missing.error, /review/i);
  assert.equal(missing.items.length, 0);
});

test("office and AI job actions report invalid agreed prices before writing an invoice", () => {
  for (const path of ["../app/jobs/[id]/page.tsx", "../app/ai/page.tsx"]) {
    const source = ts.createSourceFile("page.tsx", readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let action;
    function find(node) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === "generateInvoice") action = node;
      ts.forEachChild(node, find);
    }
    find(source);
    const code = ts.transpileModule(action.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const job = { id: "job", status: "Complete", title: "Works", value: NaN };
    let message = "";
    const report = (value) => message = value;
    const context = {
      ...workflow, job, jobs: { items: [job] }, sourceQuote: undefined,
      financeRestricted: false, linkedInvoices: [], linkedVariations: [],
      quotes: { items: [] }, pricing: { items: [] }, variations: { items: [] },
      invoices: { items: [], createItem() { assert.fail("Invalid prices must not write an invoice"); } },
      paymentTermsStore: { items: [] }, bankStore: { items: [] }, bankDetailsStore: { items: [] },
      defaultBankDetails: business.defaultBankDetails, makeId: createId, setMessage: report, setInvoiceMessage: report,
    };
    context.finalCreationState = { current: { invoices: context.invoices, jobs: context.jobs.items, quotes: path.includes("/ai/") ? context.pricing.items : context.quotes.items, variations: context.variations.items, ready: true } };
    assert.doesNotThrow(() => vm.runInNewContext(`${code}\ngenerateInvoice("job");`, context));
    assert.match(message, /review/i);
  }
});

test("legacy contingency and generated invoice lines retain the quote engine arithmetic", () => {
  const document = quote({
    items: [{ id: "work", description: "Works", category: "Labour", quantity: 1, unitPrice: 0.35 }],
    pricingSettings: { contingencyPercent: 10, travelPrice: 0, parkingPrice: 0 },
    profitability: undefined, vatEnabled: false,
  });
  assert.equal(workflow.pricingDocumentNetTotal(document), 0.38499999999999995);
  const invoice = importedInvoice(document);
  assert.equal(invoice.items[1].unitPrice, 0.034999999999999996);
  assert.equal(workflow.invoiceTotal(invoice), 0.38499999999999995);
});

test("invoice schedule comparison follows displayed currency rounding at fractional pennies", () => {
  const document = quote({
    items: [{ id: "work", description: "Works", category: "Labour", quantity: 1, unitPrice: 1.0049 }],
    pricingSettings: undefined, profitability: { sellingPrice: 1.005 }, vatEnabled: false,
  });
  for (const invoice of [importedInvoice(document), completedInvoice(jobFrom(document), document)]) {
    assert.equal(invoice.items[0].unitPrice, 1.005);
    assert.equal(new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(workflow.invoiceTotal(invoice)), "£1.01");
  }
});
