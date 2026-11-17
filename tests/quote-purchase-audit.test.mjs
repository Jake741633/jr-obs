import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";

const workflow = loadLocalTs(new URL("../lib/workflow.ts", import.meta.url));
const lines = loadLocalTs(new URL("../lib/quoteDraftLines.ts", import.meta.url));
const engine = loadLocalTs(new URL("../lib/quoteEngine.ts", import.meta.url));
function actions(path, names, context) {
  const ast = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  function walk(node) { if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) found.push(node.getText(ast)); ts.forEachChild(node, walk); }
  walk(ast);
  const code = ts.transpileModule(found.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.createContext(context); vm.runInContext(code, context); return context;
}
const material = { id: "m1", name: "Twin socket", manufacturer: "MK", supplier: "CEF", stockCode: "CEF-SOCKET", supplierUrl: "https://www.cef.co.uk/catalogue/products/socket", tradeCost: 10 };
const sourceLine = { id: "material-line", category: "Materials", description: "Twin socket MK (CEF-SOCKET)", materialId: "m1", supplier: "CEF", stockCode: "CEF-SOCKET", quantity: 2, unitCost: 10, unitPrice: 12 };
const source = { id: "q1", number: "Q-0001", title: "Sockets", type: "Quote", items: [sourceLine] };
function purchases({ document = source, materials = [material], lists = [] } = {}) {
  const state = { saved: [], message: "", failed: false }; let seq = 0;
  const context = actions("../app/purchases/page.tsx", ["materialMatch", "createFromDocument"], {
    ...workflow, creationVersion: 0, creationGeneration: { current: 0 }, creationDraft: { current: null }, priceRestricted: false, ready: true,
    sourceDocuments: [document], selectedDocumentId: document.id, selectedJobId: "", jobs: { items: [] }, materials: { items: materials },
    purchaseLists: { items: lists, createItem(item) { state.saved.push(item); } }, makeId: prefix => `${prefix}-${++seq}`,
    setCreationFailed(value) { state.failed = value; }, setSelectedDocumentId() {}, setSelectedJobId() {}, setFocusedListId() {}, setInvalidListLink() {}, setMessage(value) { state.message = value; },
  });
  return { state, create() { context.createFromDocument(); } };
}

test("normal quote quantity edits cost all hourly overhead while other billing modes retain their time allowance", () => {
  for (const mode of ["Hours", "Days", "Fixed", "Per Point"]) {
    let items = [{ id: "labour", category: "Labour", quantity: 1, unitCost: 20, unitPrice: 100, labourMode: mode, labourHours: mode === "Hours" ? 1 : 12 }];
    const context = actions("../app/quotes/page.tsx", ["updateLine"], { ...lines, setItems(update) { items = update(items); }, setSuccess() {} });
    context.updateLine("labour", { quantity: 8 });
    assert.equal(items[0].labourHours, mode === "Hours" ? 8 : 12, mode);
    assert.equal(items[0].unitCost, 20); assert.equal(items[0].unitPrice, 100);
    const result = engine.calculateQuoteProfitability(items, { contingencyPercent: 0, travelCost: 0, travelPrice: 0, parkingCost: 0, parkingPrice: 0 }, [{ active: true, frequency: "Annual", amount: 16500 }], { workingDaysPerYear: 220, billableHoursPerDay: 7.5 });
    assert.equal(result.overheadCost, mode === "Hours" ? 80 : 120);
  }
});

test("normal decorated quote materials retain their exact purchase identity and product reference", () => {
  const h = purchases(); h.create(); const item = h.state.saved[0].items[0];
  assert.equal(item.materialId, "m1"); assert.equal(item.supplier, "CEF"); assert.equal(item.stockCode, "CEF-SOCKET"); assert.equal(item.supplierUrl, material.supplierUrl); assert.equal(item.unitCost, 10);
});
test("purchase creation refuses ambiguous material identities and ambiguous legacy name matches", () => {
  for (const [line, materials] of [[sourceLine, [material, { ...material }]], [{ ...sourceLine, materialId: undefined, description: "Twin socket" }, [material, { ...material, id: "m2" }]]]) {
    const h = purchases({ document: { ...source, items: [line] }, materials }); h.create();
    assert.equal(h.state.saved.length, 0); assert.match(h.state.message, /ambiguous|unique|duplicate|review/i);
  }
});
test("purchase numbers do not collide after deleting a middle list", () => {
  const h = purchases({ lists: [{ id: "p1", number: "PO-0001" }, { id: "p3", number: "PO-0003" }] }); h.create();
  assert.equal(h.state.saved[0].number, "PO-0004");
});
test("both purchase entry points resolve the saved wholesaler after a preferred supplier change", () => {
  const changed = { ...material, supplier: "TLC Direct", stockCode: "TLC-SOCKET", supplierUrl: "https://www.tlc-direct.co.uk/Products/socket.html", supplierOptions: [{ id: "old-cef", supplier: material.supplier, stockCode: material.stockCode, supplierUrl: material.supplierUrl }] };
  const h = purchases({ materials: [changed] }); h.create();
  const generated = workflow.createPurchaseListFromPricingDocument({ document: source, materials: [changed], purchaseLists: [], purchaseListId: "p", now: "2026-11-08", createId: prefix => prefix });
  for (const item of [h.state.saved[0].items[0], generated.items[0]]) {
    assert.equal(item.supplier, "CEF"); assert.equal(item.stockCode, "CEF-SOCKET"); assert.equal(item.supplierUrl, material.supplierUrl);
  }
});
test("an unavailable saved product reference never borrows another wholesaler URL or same-name material identity", () => {
  for (const materials of [[{ ...material, supplier: "TLC", stockCode: "TLC-SOCKET", supplierUrl: "https://example.com/tlc" }], [{ ...material, id: "replacement" }]]) {
    const generated = workflow.createPurchaseListFromPricingDocument({ document: source, materials, purchaseLists: [], purchaseListId: "p", now: "2026-11-08", createId: prefix => prefix });
    const item = generated.items[0]; assert.equal(item.materialId, "m1"); assert.equal(item.supplier, "CEF"); assert.equal(item.stockCode, "CEF-SOCKET"); assert.equal(item.supplierUrl, undefined);
  }
});

function quoteEdit() {
  const original = { ...source, title: "Original", items: [{ ...sourceLine }], customerId: "customer", siteAddress: "Site", vatEnabled: false, vatRate: 20, status: "Accepted", notes: "Original note", terms: "Terms", revisions: [], preserved: "Unrelated field" };
  const state = { records: [original], writes: 0, reset: false, error: "", fail: false };
  const collection = { isReady: true, get items() { return state.records; }, setItems(update) { state.writes++; state.records = update(state.records); }, updateItem(id, update) { if (state.fail) throw new Error("Quote storage failed"); const index = state.records.findIndex(item => item.id === id); const next = update(state.records[index]); state.writes++; state.records = state.records.map((item, i) => i === index ? next : item); } };
  const context = {
    ...workflow, Error, documents: collection, latestDocuments: { current: { active: true, documents: collection } }, editingSource: { current: null }, customers: { isReady: true }, builders: { isReady: true },
    creationGeneration: { current: 0 }, creationAttempt: { current: null }, setCreationVersion() {},
    form: {}, items: [], editingId: null, quoteSettingsStore: { items: [] }, defaultQuotePricingSettings: {}, blankFixedPriceWorkflow: {},
    setForm(value) { context.form = value; }, setItems(value) { context.items = value; }, setPricing(value) { context.pricing = value; }, setPaymentTerms(value) { context.paymentTerms = value; }, setFixedPriceWorkflow(value) { context.fixedPriceWorkflow = value; }, setAttachments(value) { context.attachments = value; }, setEditingId(value) { context.editingId = value; },
    setSavePackName() {}, setSuccess() {}, setShowForm() {}, setError(value) { state.error = value; }, reset() { state.reset = true; }, profitability: {}, makeId: () => "revision", window: { scrollTo() {} },
  };
  actions("../app/quotes/page.tsx", ["startEdit", "submit"], context); context.startEdit(original); context.form.title = "My title edit";
  return { state, context, original, save() { context.submit({ preventDefault() {} }); } };
}
for (const change of ["changed", "duplicate", "deleted", "not-ready", "collection"]) {
  test(`quote edit refuses a ${change} saved source without clearing the draft`, () => {
    const h = quoteEdit();
    if (change === "changed") h.state.records = [{ ...h.original, items: [{ ...sourceLine, unitPrice: 200 }], notes: "Latest note" }];
    if (change === "duplicate") h.state.records = [h.original, { ...h.original }];
    if (change === "deleted") h.state.records = [];
    if (change === "not-ready") h.context.documents.isReady = false;
    if (change === "collection") h.context.latestDocuments.current.documents = { ...h.context.documents, updateItem() { throw new Error("Wrong collection"); } };
    const before = structuredClone(h.state.records); h.save();
    assert.equal(h.state.writes, 0); assert.equal(h.state.reset, false); assert.deepEqual(h.state.records, before); assert.match(h.state.error, /changed|review|unavailable|loading|account|ambiguous/i);
  });
}
test("current quote edits retain status and unrelated fields and recover from a failed durable save", () => {
  const h = quoteEdit(); h.state.fail = true; h.save();
  assert.equal(h.state.writes, 0); assert.equal(h.state.reset, false); assert.match(h.state.error, /Quote storage failed/);
  h.state.fail = false; h.save();
  assert.equal(h.state.writes, 1); assert.equal(h.state.reset, true); assert.equal(h.state.records[0].status, "Accepted"); assert.equal(h.state.records[0].preserved, "Unrelated field"); assert.equal(h.state.records[0].title, "My title edit"); assert.equal(h.state.records[0].revisions.length, 1); assert.equal(h.state.records[0].revisions[0].title, "Original");
});

test("AI material ordering reports ambiguous catalogue references without purchase or timeline writes", () => {
  let message = "", writes = 0;
  const context = actions("../app/ai/page.tsx", ["orderMaterials"], {
    ...workflow, Error, pricing: { items: [{ ...source, jobId: "job" }] }, materials: { items: [material, { ...material }] },
    purchaseLists: { items: [], setItems() { writes++; } }, timeline: { setItems() { writes++; } }, makeId: prefix => prefix, setMessage(value) { message = value; },
  });
  assert.doesNotThrow(() => context.orderMaterials("q1")); assert.equal(writes, 0); assert.match(message, /review|ambiguous/i);
});

function freshQuote() {
  const state = { records: [], durable: new Map(), attempts: [], renderWrites: 0, resets: 0, error: "", failure: "before" }; let seq = 0;
  const collection = {
    isReady: true, get items() { return state.records; },
    setItems(update) { state.renderWrites++; state.records = update(state.records); },
    createItem(record) {
      state.attempts.push(record);
      if (state.failure === "before") throw new Error("Quote storage failed");
      state.durable.set(record.id, record);
      if (state.failure === "visible") state.records = [record];
      if (state.failure) throw new Error("Quote acknowledgement lost");
      state.records = [record, ...state.records.filter(item => item.id !== record.id)]; return record;
    },
  };
  const context = actions("../app/quotes/page.tsx", ["quoteSaveSnapshot", "submit"], {
    ...workflow, Error, documents: collection, latestDocuments: { current: { active: true, documents: collection } },
    creationVersion: 0, creationGeneration: { current: 0 }, creationAttempt: { current: null },
    form: { title: "Sockets", customerId: "customer", siteAddress: "Site", type: "Quote", vatRate: "0", notes: "Retain these notes" }, items: [{ ...sourceLine }], editingId: null,
    pricing: {}, profitability: {}, attachments: [], fixedPriceWorkflow: {}, paymentTerms: {}, makeId: prefix => `${prefix}-${++seq}`,
    setError(value) { state.error = value; }, reset() { state.resets++; context.creationGeneration.current++; },
  });
  return { state, context, save() { context.submit({ preventDefault() {} }); } };
}
test("fresh quote persistence failure keeps the complete draft and retries through durable creation", () => {
  const h = freshQuote(); h.save();
  assert.equal(h.state.resets, 0); assert.equal(h.state.renderWrites, 0); assert.equal(h.state.records.length, 0); assert.match(h.state.error, /Quote storage failed/);
  assert.equal(h.context.form.notes, "Retain these notes"); assert.equal(h.context.items[0].quantity, 2);
  h.state.failure = null; h.save();
  assert.equal(h.state.durable.size, 1); assert.equal(h.state.resets, 1); assert.equal(h.state.attempts.length, 2); assert.equal(h.state.attempts[0].id, h.state.attempts[1].id);
  assert.equal(h.state.records[0].number, "Q-0001"); assert.equal(h.state.records[0].status, "Draft");
  h.save(); assert.equal(h.state.attempts.length, 2); assert.equal(h.state.durable.size, 1);
});
test("uncertain fresh quote acknowledgements retain one candidate identity and recover visible exact saved records", () => {
  for (const failure of ["hidden", "visible"]) {
    const h = freshQuote(); h.state.failure = failure; h.save();
    assert.equal(h.state.resets, 0); assert.equal(h.state.durable.size, 1);
    const candidate = h.state.attempts[0]; h.state.failure = null; h.save();
    assert.equal(h.state.durable.size, 1); assert.equal(h.state.records.length, 1); assert.equal(h.state.records[0].id, candidate.id); assert.equal(h.state.records[0].createdAt, candidate.createdAt);
    assert.equal(h.state.attempts.length, failure === "visible" ? 1 : 2); assert.equal(h.state.resets, 1);
  }
});
test("fresh quote retries refuse changed or duplicate saved candidate identities", () => {
  for (const duplicate of [false, true]) {
    const h = freshQuote(); h.state.failure = "visible"; h.save(); const saved = h.state.records[0];
    h.state.records = duplicate ? [saved, { ...saved }] : [{ ...saved, notes: "Changed saved version" }]; h.state.failure = null; h.save();
    assert.equal(h.state.attempts.length, 1); assert.equal(h.state.resets, 0); assert.match(h.state.error, /review|changed|duplicate/i);
  }
});
test("an unpersisted quote retry refreshes its number when another quote takes it while retaining its identity", () => {
  const h = freshQuote(); h.save(); const candidate = h.state.attempts[0];
  h.state.records = [{ ...candidate, id: "other-quote", title: "Another saved quote" }]; h.state.failure = null; h.save();
  assert.equal(h.state.records[0].id, candidate.id); assert.equal(h.state.records[0].number, "Q-0002");
  assert.equal(h.state.records[1].id, "other-quote"); assert.equal(h.state.records[1].number, "Q-0001"); assert.equal(h.state.resets, 1);
});
test("an exact persisted quote candidate retains its original number when later quotes already exist", () => {
  const h = freshQuote(); h.state.failure = "visible"; h.save(); const candidate = h.state.attempts[0];
  h.state.records.push({ ...candidate, id: "other-quote", number: "Q-0002" }); h.state.failure = null; h.save();
  assert.equal(h.state.attempts.length, 1); assert.equal(h.state.records[0].id, candidate.id); assert.equal(h.state.records[0].number, "Q-0001"); assert.equal(h.state.resets, 1);
});
