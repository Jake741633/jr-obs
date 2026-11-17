import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";
import { buildJobCompletionWarnings } from "../lib/jobCompletion-core.mjs";

const workflow = loadLocalTs(new URL("../lib/workflow.ts", import.meta.url));
const business = loadLocalTs(new URL("../lib/businessSettings.ts", import.meta.url));
const commandCentre = loadLocalTs(new URL("../lib/aiCommandCentre.ts", import.meta.url));
const now = "2026-11-01T12:00:00Z";
const quote = { id: "quote", number: "Q-0001", title: "Works", type: "Quote", status: "Accepted", customerId: "customer", jobId: "job", vatEnabled: true, vatRate: 20, items: [{ id: "scope", category: "Labour", description: "Works", quantity: 1, unitPrice: 1000 }], profitability: { sellingPrice: 1000 }, createdAt: now, updatedAt: now };
const deposit = { id: "deposit", number: "INV-0001", purpose: "Deposit", depositRequirementId: "requirement", quoteId: "quote", jobId: "job", customerId: "customer", status: "Sent", vatEnabled: true, vatRate: 20, items: [{ id: "deposit-line", category: "Other", description: "Deposit", quantity: 1, unitPrice: 250 }], amountPaid: 0 };

function functions(path, names) {
  const source = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const visit = node => { if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) found.push(node.getText(source)); ts.forEachChild(node, visit); };
  visit(source);
  return ts.transpileModule(found.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

function importHarness(initialInvoices = [deposit]) {
  let sequence = 0;
  const state = { form: { title: "", issueDate: "2026-11-01", dueDate: "2026-11-08", amountPaid: "0" }, items: [], error: "", writes: [], importedQuote: null, durableWrites: 0 };
  const context = {
    ...workflow, ...business, Date, JSON, Error, quotes: { items: [quote] }, latestQuotes: { current: [quote] },
    jobs: { items: [{ id: "job", title: "Callout", customerId: "customer", status: "Complete" }] },
    latestManualBilling: { current: { jobs: [{ id: "job", title: "Callout", customerId: "customer", status: "Complete" }], customers: [{ id: "customer" }], builders: [] } },
    selectedManualJob: null, setSelectedManualJob(value) { context.selectedManualJob = value; },
    invoices: { items: initialInvoices, setItems(update) { state.writes.push(update(context.latestInvoices.current.items)); }, createItem(item) { if (state.failure) throw new Error(state.failure); state.durableWrites++; state.writes.push([item, ...context.latestInvoices.current.items]); } },
    latestInvoices: { current: { items: initialInvoices, ready: true } },
    makeId: prefix => `${prefix}-${++sequence}`, addDays: () => "2026-11-08",
    timeline: { items: [], isReady: true, createItem(item) { context.timeline.items = [item, ...context.timeline.items]; return item; } }, reset() {}, setReviewMessage() {}, setPendingMilestone() {},
    setForm(update) { state.form = typeof update === "function" ? update(state.form) : update; context.form = state.form; },
    setItems(items) { state.items = items; context.items = items; },
    setImportedQuote(value) { state.importedQuote = value; context.importedQuote = value; },
    setError(value) { state.error = value; }, importedQuote: null,
  };
  context.latestInvoices.current.createItem = context.invoices.createItem;
  context.latestInvoices.current.timeline = context.timeline;
  context.formOwner = { current: context.invoices.createItem };
  vm.createContext(context);
  vm.runInContext(functions("../app/invoices/page.tsx", ["importQuote", "selectJob", "submit", "addInvoiceMilestone"]), context);
  return { state, context, import() { context.importQuote("quote"); }, selectJob(id) { context.selectJob(id); }, save() { context.submit({ preventDefault() {} }); } };
}

test("accepted quote import creates a linked final draft after an issued deposit", () => {
  const h = importHarness(); h.import(); h.save();
  assert.equal(h.state.error, ""); assert.equal(h.state.writes.length, 1);
  const final = h.state.writes[0][0];
  assert.equal(final.purpose, "Final");
  assert.deepEqual(Array.from(final.appliedDepositInvoiceIds), ["deposit"]);
  assert.equal(workflow.invoiceTotal(final), 900);
  assert.equal(final.quoteId, "quote"); assert.equal(final.jobId, "job");
  assert.equal(h.state.durableWrites, 1);
});

test("durable final save failure leaves the form available with a visible error", () => {
  const h = importHarness(); h.import(); h.state.failure = "Device storage full"; h.save();
  assert.equal(h.state.writes.length, 0); assert.match(h.state.error, /Device storage full/);
});

test("a manually linked job cannot bypass the final invoice flow", () => {
  const h = importHarness();
  h.context.form = { title: "Another final", customerId: "customer", jobId: "job", issueDate: "2026-11-01", dueDate: "2026-11-08", vatEnabled: true, vatRate: "20", amountPaid: "0" };
  h.context.items = [{ id: "manual-line", category: "Labour", description: "Works", quantity: 1, unitPrice: 1000 }];
  h.save(); assert.equal(h.state.writes.length, 0); assert.match(h.state.error, /job|quote|final/i);
});

test("an ordinary unquoted callout saves a linked manual invoice and blocks duplicate clicks", () => {
  for (const existing of [[], [{ ...deposit, status: "Cancelled" }]]) {
    const h = importHarness(existing); h.context.latestQuotes.current = []; h.context.quotes.items = [];
    h.context.setForm({ title: "Callout invoice", customerId: "customer", builderId: "", issueDate: "2026-11-01", dueDate: "2026-11-08", vatEnabled: false, vatRate: "20", amountPaid: "0" });
    h.context.items = [{ id: "manual-line", category: "Labour", description: "Callout", quantity: 1, unitPrice: 99 }];
    h.selectJob("job"); h.save(); h.save();
    assert.equal(h.state.writes.length, 1); const saved = h.state.writes[0][0];
    assert.equal(saved.jobId, "job"); assert.equal(saved.customerId, "customer"); assert.equal(saved.purpose, undefined); assert.equal(workflow.invoiceTotal(saved), 99);
  }
});

test("manual job save rejects changed missing ambiguous quoted or previously billed jobs", () => {
  for (const change of ["changed", "missing", "duplicate", "customer", "ambiguous-customer", "source-quote", "snapshot", "accepted-quote", "deposit", "final", "unknown"]) {
    const h = importHarness([]); h.context.latestQuotes.current = []; h.context.quotes.items = [];
    h.context.setForm({ title: "Callout invoice", customerId: "customer", builderId: "", issueDate: "2026-11-01", dueDate: "2026-11-08", vatEnabled: false, vatRate: "20", amountPaid: "0" });
    h.context.items = [{ id: "manual-line", category: "Labour", description: "Callout", quantity: 1, unitPrice: 99 }]; h.selectJob("job");
    const current = h.context.latestManualBilling.current, job = current.jobs[0];
    if (change === "changed") current.jobs = [{ ...job, title: "Changed callout" }];
    if (change === "missing") current.jobs = [];
    if (change === "duplicate") current.jobs = [job, { ...job }];
    if (change === "customer") current.customers = [];
    if (change === "ambiguous-customer") current.customers = [{ id: "customer" }, { id: "customer" }];
    if (change === "source-quote") current.jobs = [{ ...job, sourceQuoteId: "quote" }];
    if (change === "snapshot") current.jobs = [{ ...job, quoteSnapshot: { quoteId: "quote" } }];
    if (change === "accepted-quote") h.context.latestQuotes.current = [quote];
    if (["deposit", "final", "unknown"].includes(change)) h.context.latestInvoices.current.items = [{ ...deposit, purpose: change === "unknown" ? undefined : change === "final" ? "Final" : "Deposit" }];
    h.save(); assert.equal(h.state.writes.length, 0, change); assert.match(h.state.error, /review|quote|job|changed/i);
  }
});

test("retained final handlers and forms cannot write into a changed account collection", () => {
  const h = importHarness(); h.import(); h.context.latestInvoices.current.createItem = () => assert.fail("Wrong account write"); h.save();
  assert.equal(h.state.writes.length, 0); assert.match(h.state.error, /account|changed|new invoice/i);
});

test("imported final draft rejects deleting its deposit deduction or changing its VAT and linkage", () => {
  for (const change of ["deduction", "vat", "job", "customer"]) {
    const h = importHarness(); h.import();
    if (change === "deduction") h.context.items = h.state.items.filter(item => item.unitPrice >= 0);
    if (change === "vat") h.context.form = { ...h.state.form, vatEnabled: false };
    if (change === "job") h.context.form = { ...h.state.form, jobId: "other-job" };
    if (change === "customer") h.context.form = { ...h.state.form, customerId: "other-customer" };
    h.save(); assert.equal(h.state.writes.length, 0, change); assert.match(h.state.error, /review|import/i);
  }
});

test("saving imported final rechecks billing changes and rejects stale retained submit handlers", () => {
  for (const invoices of [[{ ...deposit, status: "Cancelled" }], [deposit, { ...deposit, id: "extra", number: "INV-0002" }], [deposit, { ...deposit, id: "final", purpose: "Final" }], [{ ...deposit, status: "Paid" }]]) {
    const h = importHarness(); h.import(); h.context.latestInvoices.current.items = invoices; h.save();
    assert.equal(h.state.writes.length, 0); assert.match(h.state.error, /review|import|changed/i);
  }
});

test("an invoice imported before a later deposit cannot save an undeducted final", () => {
  const h = importHarness([]); h.import(); h.context.latestInvoices.current.items = [deposit]; h.save();
  assert.equal(h.state.writes.length, 0); assert.match(h.state.error, /review|import|changed/i);
});

test("a retained final save handler cannot create another invoice before the next render", () => {
  const h = importHarness(); h.import(); h.save(); h.save();
  assert.equal(h.state.writes.length, 1); assert.match(h.state.error, /review|import|changed/i);
});

test("standalone manual drafts retain their lines and optional purpose", () => {
  const h = importHarness([]);
  h.context.form = { title: "Manual works", customerId: "customer", issueDate: "2026-11-01", dueDate: "2026-11-08", vatEnabled: false, vatRate: "20", amountPaid: "0" };
  h.context.items = [{ id: "manual-line", category: "Labour", description: "Manual works", quantity: 1, unitPrice: 99 }];
  h.save(); assert.equal(h.state.writes.length, 1); assert.equal(h.state.writes[0][0].purpose, undefined); assert.equal(workflow.invoiceTotal(h.state.writes[0][0]), 99);
});

test("a refreshed accepted quote requires importing its current scope before saving", () => {
  const h = importHarness(); h.import(); h.context.latestQuotes.current = [{ ...quote, title: "Changed" }]; h.save();
  assert.equal(h.state.writes.length, 0); assert.match(h.state.error, /review|import|changed/i);
});

test("edited imported scope cannot silently change its saved balance rounding adjustment", () => {
  const h = importHarness(); h.import();
  h.context.items = h.state.items.map(item => item.unitPrice > 0 ? { ...item, unitPrice: 250.001 } : item);
  h.save(); assert.equal(h.state.writes.length, 0); assert.match(h.state.error, /rounding|import/i);
});

test("completion still requests a final after a sent or paid explicit deposit", () => {
  for (const status of ["Sent", "Paid", "Part paid", "Overdue"]) {
    assert.ok(buildJobCompletionWarnings({ invoices: [{ ...deposit, status }] }).some(warning => warning.code === "missing-final-invoice"));
  }
  assert.equal(buildJobCompletionWarnings({ invoices: [{ ...deposit, purpose: "Final", status: "Draft" }] }).some(warning => warning.code === "missing-final-invoice"), false);
  assert.ok(buildJobCompletionWarnings({ invoices: [{ ...deposit, purpose: "Final", status: "Cancelled" }] }).some(warning => warning.code === "missing-final-invoice"));
});

test("AI recommendations keep a deposit-only completed job available for its final", () => {
  const recommendations = commandCentre.buildSmartRecommendations({ jobs: [{ id: "job", title: "Works", status: "Complete" }], documents: [], invoices: [deposit], certificates: [], reminders: [], now: new Date(now) });
  assert.ok(recommendations.some(item => item.id === "completed-without-invoice"));
});

test("office and AI generation durably create one final even when the same handler runs twice", () => {
  for (const path of ["../app/jobs/[id]/page.tsx", "../app/ai/page.tsx"]) {
    const job = { id: "job", title: "Works", status: "Complete", sourceQuoteId: "quote", customerId: "customer", value: 1200 };
    let saved, message = "", sequence = 0, durableWrites = 0;
    const context = { ...workflow, ...business, Date, job, jobs: { items: [job] }, sourceQuote: quote, financeRestricted: false, linkedInvoices: [deposit], linkedVariations: [], quotes: { items: [quote] }, pricing: { items: [quote] }, variations: { items: [], setItems() {} }, timeline: { items: [], setItems() {} }, invoices: { items: [deposit], setItems(update) { saved = update([deposit])[0]; }, createItem(invoice) { durableWrites++; saved = invoice; } }, paymentTermsStore: { items: [] }, bankStore: { items: [] }, bankDetailsStore: { items: [] }, makeId: prefix => `${prefix}-${++sequence}`, setMessage(value) { message = value; }, setInvoiceMessage(value) { message = value; } };
    context.finalCreationState = { current: { invoices: context.invoices, jobs: context.jobs.items, quotes: path.includes("/ai/") ? context.pricing.items : context.quotes.items, variations: context.variations.items, ready: true } };
    vm.runInNewContext(`${functions(path, ["generateInvoice"])}\ngenerateInvoice("job"); generateInvoice("job");`, context);
    assert.ok(saved, `${path}: ${message}`); assert.equal(saved.purpose, "Final"); assert.equal(workflow.invoiceTotal(saved), 900); assert.equal(durableWrites, 1);
  }
});
