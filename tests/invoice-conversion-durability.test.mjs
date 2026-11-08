import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as billing from "../lib/depositBilling-core.mjs";
import * as projections from "../lib/cloud/roleProjectionCache-core.mjs";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";
const workflow = loadLocalTs(new URL("../lib/workflow.ts", import.meta.url));
const payments = loadLocalTs(new URL("../lib/payments.ts", import.meta.url));
const privateFiles = loadLocalTs(new URL("../lib/cloud/privateFiles.ts", import.meta.url), {
  react: {}, "../supabase/client": {}, "./client": {}, "./config": {}, "./repository": {},
});
const conversionPath = new URL("../lib/quoteConversion.ts", import.meta.url);
const conversion = existsSync(conversionPath) ? loadLocalTs(conversionPath) : {};
const plain = value => JSON.parse(JSON.stringify(value));
function actions(path, names, context) {
  const ast = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), found = [];
  function walk(node) { if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) found.push(node.getText(ast)); ts.forEachChild(node, walk); } walk(ast);
  vm.createContext(context); vm.runInContext(ts.transpileModule(found.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context); return context;
}

test("conversion reload resumes an unchanged quote whose optional attachments were absent", () => {
  const source = { ...quote }; delete source.attachments;
  const h = conversionActions(); h.collections.pricing.state.records = [source]; h.collections.pricing.state.fail = true;
  const first = conversion.convertAcceptedQuote(source, h.collections); assert.equal(first.complete, false); assert.equal(h.collections.jobs.items.length, 1);
  h.collections.pricing.state.fail = false;
  const resumed = conversion.convertAcceptedQuote(source, h.collections);
  assert.equal(resumed.complete, true, resumed.message); assert.equal(h.collections.jobs.items.length, 1); assert.equal(h.collections.timeline.items.length, 2); assert.equal(h.collections.jobDocuments.items.length, 0);
});
test("conversion recovery does not treat an explicitly invalid attachment value as an absent optional field", () => {
  const source = { ...quote }; delete source.attachments;
  const h = conversionActions(); h.collections.pricing.state.records = [source]; h.collections.pricing.state.fail = true; conversion.convertAcceptedQuote(source, h.collections);
  const changed = { ...source, attachments: null }; h.collections.pricing.state.records = [changed]; h.collections.pricing.state.fail = false;
  const resumed = conversion.convertAcceptedQuote(changed, h.collections); assert.equal(resumed.complete, false); assert.equal(h.collections.pricing.items[0].jobId, undefined);
});
test("conversion reload reconciles inline bytes stripped by the real cloud sanitizer without another child", () => {
  const h = conversionActions(); h.collections.pricing.state.fail = true; conversion.convertAcceptedQuote(quote, h.collections);
  h.collections.jobDocuments.state.records = plain(h.collections.jobDocuments.items.map(record => privateFiles.cloudSafeFileRecord("jr-os-job-documents", record)));
  assert.equal(h.collections.jobDocuments.items[0].dataUrl, undefined); h.collections.pricing.state.fail = false;
  const resumed = conversion.convertAcceptedQuote(quote, h.collections);
  assert.equal(resumed.complete, true, resumed.message); assert.equal(h.collections.jobDocuments.state.creates.length, 1); assert.equal(h.collections.jobDocuments.items[0].dataUrl, quote.attachments[0].dataUrl);
});
test("conversion reload accepts only transport metadata bound to the same organisation job and document", () => {
  for (const change of ["valid", "organisation", "job", "document", "bytes", "external", "name", "ambiguous"]) {
    const h = conversionActions(); h.collections.pricing.state.fail = true; conversion.convertAcceptedQuote(quote, h.collections);
    const expected = h.collections.jobDocuments.items[0], safe = privateFiles.cloudSafeFileRecord("jr-os-job-documents", expected);
    const stored = { ...safe, privateStoragePath: privateFiles.privateObjectPath("org", expected.jobId, expected.id, expected.fileName), privateFileId: "file-row", privateUploadState: "Synced", signedDownloadUrl: "blob:synthetic-hydration" };
    if (change === "organisation") stored.privateStoragePath = privateFiles.privateObjectPath("other-org", expected.jobId, expected.id, expected.fileName);
    if (change === "job") stored.privateStoragePath = privateFiles.privateObjectPath("org", "other-job", expected.id, expected.fileName);
    if (change === "document") stored.privateStoragePath = privateFiles.privateObjectPath("org", expected.jobId, "other-document", expected.fileName);
    if (change === "bytes") stored.dataUrl = "data:text/plain;base64,Qg==";
    if (change === "external") stored.externalUrl = "https://example.com/substituted-file";
    if (change === "name") stored.name = "Changed document";
    h.collections.jobDocuments.state.records = change === "ambiguous" ? [stored, { ...stored }] : [stored]; h.collections.pricing.state.fail = false;
    const resumed = conversion.convertAcceptedQuote(quote, h.collections, { expectedPrivatePath: document => privateFiles.privateObjectPath("org", document.jobId, document.id, document.fileName) });
    assert.equal(resumed.complete, change === "valid", `${change}: ${resumed.message}`); assert.equal(h.collections.jobDocuments.state.creates.length, 1);
    if (change !== "valid") assert.equal(h.collections.pricing.items[0].jobId, undefined);
    else assert.equal(h.collections.jobDocuments.items[0].privateStoragePath, stored.privateStoragePath);
  }
});
test("private-byte confirmation failure keeps conversion partial and retries the same saved child before linking", () => {
  const h = conversionActions(); let blocked = true; const confirmations = [];
  const options = { confirmPrivateBytes(document) { confirmations.push(document); if (blocked) throw new Error("Synthetic private queue quota"); } };
  const first = conversion.convertAcceptedQuote(quote, h.collections, options);
  assert.equal(first.complete, false); assert.equal(h.collections.pricing.items[0].jobId, undefined); assert.match(first.message, /incomplete.*private file bytes/i);
  assert.equal(h.collections.jobs.state.creates.length, 1); assert.equal(h.collections.jobDocuments.state.creates.length, 1); assert.equal(confirmations.length, 1);
  blocked = false; const resumed = conversion.convertAcceptedQuote(quote, h.collections, options);
  assert.equal(resumed.complete, true, resumed.message); assert.equal(h.collections.jobDocuments.state.creates.length, 1); assert.equal(confirmations.length, 2); assert.equal(confirmations[0].id, confirmations[1].id);
});
function store(initial = []) {
  const state = { records: plain(initial), creates: [], updates: [], renderWrites: 0, fail: false, afterWrite: false, beforeUpdate: null };
  return { state, isReady: true, get items() { return state.records; },
    setItems(update) { state.renderWrites++; state.records = update(state.records); },
    createItem(record) { if (state.fail && !state.afterWrite) throw new Error("Synthetic storage failure"); if (state.records.some(item => item.id === record.id)) throw new Error("Duplicate identity"); state.records = [record, ...state.records]; state.creates.push(record); if (state.fail) throw new Error("Synthetic acknowledgement failure"); return record; },
    updateItem(id, update) { state.beforeUpdate?.(); if (state.fail && !state.afterWrite) throw new Error("Synthetic storage failure"); const index = state.records.findIndex(item => item.id === id); if (index < 0) throw new Error("Missing record"); const item = update(state.records[index]); if (item !== state.records[index]) { state.updates.push(item); state.records = state.records.map((record, i) => i === index ? item : record); } if (state.fail) throw new Error("Synthetic acknowledgement failure"); return item; },
  };
}
const invoice = { id: "invoice", number: "INV-0001", title: "Works", jobId: "job", customerId: "customer", status: "Sent", items: [{ id: "line", quantity: 1, unitPrice: 100 }], vatEnabled: false, vatRate: 20, amountPaid: 0 };
function invoiceActions() {
  const invoices = store([invoice]), timeline = store(); let message = "";
  const context = actions("../app/invoices/page.tsx", ["canUpdateInvoice", "invoiceTotal", "recordPayment", "addInvoiceMilestone", "saveInvoiceChange", "updateStatus", "submit", "retryInvoiceMilestone"], {
    ...workflow,
    ...billing, ...payments, Error, invoices, timeline, latestInvoices: { current: { items: invoices.items, payments: [], ready: true, createItem: invoices.createItem, updateItem: invoices.updateItem, timeline } },
    statuses: ["Draft", "Sent", "Part paid", "Paid", "Overdue", "Cancelled"], makeId: prefix => prefix, setReviewMessage(value) { message = value; }, window: { prompt: () => "100", alert() {} },
    pendingMilestone: null, setPendingMilestone(value) { context.pendingMilestone = typeof value === "function" ? value(context.pendingMilestone) : value; },
  });
  return { context, invoices, timeline, message: () => message };
}
test("invoice payment and status storage failures preserve the saved record and do not emit milestones", () => {
  for (const action of ["payment", "status"]) {
    const h = invoiceActions(); h.invoices.state.fail = true;
    if (action === "payment") h.context.recordPayment(invoice); else h.context.updateStatus(invoice, "Paid");
    assert.equal(h.invoices.state.renderWrites, 0); assert.equal(h.invoices.items[0].amountPaid, 0); assert.equal(h.invoices.items[0].status, "Sent"); assert.equal(h.timeline.items.length, 0); assert.match(h.message(), /could not|failure|review|saved/i);
    h.invoices.state.fail = false; if (action === "payment") h.context.recordPayment(invoice); else h.context.updateStatus(invoice, "Paid");
    assert.equal(h.invoices.items[0].status, "Paid"); assert.equal(h.invoices.items[0].amountPaid, 100); assert.equal(h.timeline.items.length, 1);
  }
});
test("a milestone failure reports that the invoice was saved and can retry without duplicate invoice changes", () => {
  const h = invoiceActions(); h.timeline.state.fail = true; h.context.recordPayment(invoice);
  assert.equal(h.invoices.items[0].amountPaid, 100); assert.equal(h.invoices.state.updates.length, 1); assert.equal(h.timeline.items.length, 0); assert.match(h.message(), /saved.*milestone/i);
  h.timeline.state.fail = false; h.context.updateStatus(h.invoices.items[0], "Paid");
  assert.equal(h.invoices.state.updates.length, 1); assert.equal(h.timeline.items.length, 1);
  h.context.updateStatus(h.invoices.items[0], "Paid"); assert.equal(h.timeline.items.length, 1);
});
test("invoice updater rechecks a changed durable source rather than overwriting its newer amount", () => {
  const h = invoiceActions(); h.invoices.state.beforeUpdate = () => { h.invoices.state.records = [{ ...invoice, amountPaid: 25, notes: "New saved note" }]; };
  h.context.recordPayment(invoice); assert.equal(h.invoices.state.updates.length, 0); assert.equal(h.invoices.items[0].amountPaid, 25); assert.equal(h.invoices.items[0].notes, "New saved note"); assert.equal(h.timeline.items.length, 0); assert.match(h.message(), /changed|review/i);
});
test("invoice creation reports a failed optional milestone after saving the invoice without another creation", () => {
  const h = invoiceActions(); h.invoices.state.records = []; h.context.latestInvoices.current.items = []; h.timeline.state.fail = true;
  const job = { id: "job", customerId: "customer", title: "Callout" };
  Object.assign(h.context, { form: { title: "Callout", customerId: "customer", builderId: "", jobId: "job", issueDate: "2026-11-01", dueDate: "2026-11-08", vatRate: "0" }, items: invoice.items, importedQuote: null, selectedManualJob: job,
    latestQuotes: { current: [] }, latestManualBilling: { current: { jobs: [job], customers: [{ id: "customer" }], builders: [] } }, formOwner: { current: h.invoices.createItem }, reset() {}, setError() {} });
  h.context.submit({ preventDefault() {} });
  assert.equal(h.invoices.state.creates.length, 1); assert.equal(h.timeline.state.renderWrites, 0); assert.equal(h.timeline.items.length, 0); assert.match(h.message(), /saved.*milestone/i);
  h.context.submit({ preventDefault() {} }); assert.equal(h.invoices.state.creates.length, 1);
  h.timeline.state.fail = false; h.context.retryInvoiceMilestone(); assert.equal(h.timeline.items.length, 1); assert.equal(h.invoices.state.creates.length, 1); assert.equal(h.context.pendingMilestone, null);
});

const quote = { id: 'quote / " literal', number: "Q-0001", type: "Quote", status: "Accepted", title: "Site works", customerId: "customer", siteAddress: "Site", items: [{ id: "line", description: "Works", category: "Other", quantity: 1, unitPrice: 100 }], vatEnabled: false, vatRate: 20, notes: "Scope", terms: "Terms", updatedAt: "2026-11-01T12:00:00Z", attachments: [{ id: "attachment", name: "Plan", fileName: "plan.txt", mimeType: "text/plain", dataUrl: "data:text/plain;base64,QQ==", createdAt: "2026-11-01T12:00:00Z" }] };
function conversionActions(page = "quotes", shared) {
  const collections = shared ?? { pricing: store([quote]), jobs: store(), timeline: store(), jobDocuments: store(), customers: store([{ id: "customer", address: "Site" }]), builders: store() };
  let message = "", seq = 0;
  const owner = { mode: "local", authorization: null };
  const state = { active: true, ...collections, owner };
  const context = actions(page === "quotes" ? "../app/quotes/page.tsx" : "../app/ai/page.tsx", [page === "quotes" ? "convertToJob" : "convertQuote"], {
    ...workflow, ...conversion, ...privateFiles, Error, ...collections, documents: collections.pricing, conversionOwner: owner, latestConversion: { current: state }, makeId: prefix => `${prefix}-${++seq}`, setPageMessage(value) { message = value; }, setMessage(value) { message = value; },
  });
  return { context, collections, message: () => message, convert(document = quote) { if (page === "quotes") context.convertToJob(document); else context.convertQuote(document.id); } };
}
for (const page of ["quotes", "ai"]) {
  test(`${page} confirms non-local private bytes under its exact owner before linking`, () => {
    const h = conversionActions(page), confirmations = []; let blocked = true;
    const authorization = { organisationId: "org", userId: "office-user", role: "office", customerSourceId: undefined };
    h.context.conversionOwner.mode = "cloud"; h.context.conversionOwner.authorization = authorization;
    h.context.persistPrivateFileRecordBytes = (key, record, owner) => { confirmations.push({ key, record, owner }); if (blocked) throw new Error("Synthetic private queue quota"); };
    h.convert(); assert.equal(h.collections.pricing.items[0].jobId, undefined); assert.match(h.message(), /incomplete.*private file bytes/i);
    assert.equal(confirmations.length, 1); assert.equal(confirmations[0].key, "jr-os-job-documents"); assert.equal(confirmations[0].owner, authorization);
    assert.equal(confirmations[0].record.dataUrl, quote.attachments[0].dataUrl);
    blocked = false; h.convert(); assert.equal(h.collections.jobs.state.creates.length, 1); assert.equal(h.collections.jobDocuments.state.creates.length, 1); assert.equal(h.collections.pricing.items[0].jobId, h.collections.jobs.items[0].id);
  });
  test(`${page} conversion durably creates and links one exact job with idempotent child records`, () => {
    const h = conversionActions(page); h.convert(); h.convert();
    assert.equal(h.collections.jobs.state.renderWrites, 0); assert.equal(h.collections.jobs.state.creates.length, 1); assert.equal(h.collections.pricing.items[0].jobId, h.collections.jobs.items[0].id);
    assert.equal(h.collections.timeline.items.length, 2); assert.equal(h.collections.jobDocuments.items.length, 1); assert.match(h.message(), /linked|converted|already|review/i);
    for (const record of [...h.collections.jobs.items, ...h.collections.timeline.items, ...h.collections.jobDocuments.items]) assert.match(record.id, /^[A-Za-z0-9_-]+$/, "conversion identities must survive private-path sanitization without collisions");
    const projected = projections.sanitizeRoleProjectionCache({ storageKey: "jr-os-jobs", role: "electrician", mode: "cloud", records: h.collections.jobs.items }); assert.equal(projected[0].quoteSnapshot, undefined);
  });
  for (const phase of ["jobs", "timeline", "jobDocuments", "pricing"]) {
    test(`${page} conversion ${phase} failure remains actionable and resumes the same candidate after reload`, () => {
      const h = conversionActions(page); h.collections[phase].state.fail = true; h.convert();
      assert.equal(h.collections.pricing.items[0].jobId, undefined); assert.match(h.message(), /incomplete|could not|review|retry/i);
      const firstJobId = h.collections.jobs.items[0]?.id; h.collections[phase].state.fail = false;
      const reopened = conversionActions(page, h.collections); reopened.convert();
      assert.equal(h.collections.jobs.items.length, 1); if (firstJobId) assert.equal(h.collections.jobs.items[0].id, firstJobId);
      assert.equal(h.collections.timeline.items.length, 2); assert.equal(h.collections.jobDocuments.items.length, 1); assert.equal(h.collections.pricing.items[0].jobId, h.collections.jobs.items[0].id);
    });
  }
  test(`${page} rejects changed source and ambiguous existing jobs without creating another record`, () => {
    const h = conversionActions(page); h.collections.timeline.state.fail = true; h.convert();
    const candidate = h.collections.jobs.items[0]; assert.ok(candidate); h.collections.timeline.state.fail = false;
    h.collections.pricing.state.records = [{ ...quote, notes: "Changed accepted scope" }];
    conversionActions(page, h.collections).convert(); assert.equal(h.collections.jobs.state.creates.length, 1); assert.equal(h.collections.pricing.items[0].jobId, undefined);
    h.collections.pricing.state.records = [quote]; h.collections.jobs.state.records.push({ ...candidate });
    conversionActions(page, h.collections).convert(); assert.equal(h.collections.jobs.state.creates.length, 1); assert.equal(h.collections.pricing.items[0].jobId, undefined);
  });
  test(`${page} resumes uncertain child acknowledgements and refuses changed child records`, () => {
    const h = conversionActions(page); h.collections.timeline.state.fail = true; h.collections.timeline.state.afterWrite = true; h.convert();
    assert.equal(h.collections.jobs.items.length, 1); assert.equal(h.collections.timeline.items.length, 1); assert.equal(h.collections.pricing.items[0].jobId, undefined);
    h.collections.timeline.state.fail = false; conversionActions(page, h.collections).convert();
    assert.equal(h.collections.timeline.items.length, 2); assert.equal(h.collections.jobs.state.creates.length, 1);
    const changed = conversionActions(page); changed.collections.jobDocuments.state.fail = true; changed.convert(); changed.collections.jobDocuments.state.fail = false;
    changed.collections.timeline.state.records[0] = { ...changed.collections.timeline.items[0], note: "Changed saved milestone" };
    conversionActions(page, changed.collections).convert(); assert.equal(changed.collections.pricing.items[0].jobId, undefined); assert.equal(changed.collections.jobDocuments.items.length, 0);
  });
  test(`${page} retained callbacks reject inactive or replaced collections and an updater race`, () => {
    for (const kind of ["inactive", "owner", "replaced", "race"]) {
      const h = conversionActions(page);
      if (kind === "inactive") h.context.latestConversion.current.active = false;
      if (kind === "owner") h.context.latestConversion.current.owner = { ...h.context.conversionOwner };
      if (kind === "replaced") h.context.latestConversion.current.jobs = { ...h.collections.jobs, createItem() { throw new Error("Wrong collection"); } };
      if (kind === "race") h.collections.pricing.state.beforeUpdate = () => { h.collections.pricing.state.records = [{ ...quote, notes: "New source" }]; };
      h.convert(); assert.equal(h.collections.pricing.items[0].jobId, undefined);
      if (kind !== "race") assert.equal(h.collections.jobs.items.length, 0); else assert.equal(h.collections.pricing.items[0].notes, "New source");
    }
  });
}
