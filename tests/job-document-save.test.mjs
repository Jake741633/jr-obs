import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { strictHttpsJobDocumentUrl } from "../lib/cloud/fieldJobDocumentCapability-core.mjs";
import { privateUploadHarness } from "./helpers/private-file-upload-harness.mjs";

const pageUrl = new URL("../app/jobs/[id]/page.tsx", import.meta.url);
const page = ts.createSourceFile(pageUrl.pathname, readFileSync(pageUrl, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = new Set(["publishDocumentDraft", "setDocumentError", "documentWriteIsCurrent", "toggleDocumentForm", "changeDocumentForm", "chooseFile", "addDocument", "documentDownloadUrl"]);
const declarations = [];
function visit(node) {
  if ((ts.isFunctionDeclaration(node) && handlers.has(node.name?.text))
    || (ts.isVariableStatement(node) && node.declarationList.declarations.some(({ name }) => ["jobDocumentStorageKey", "documentRecordFields"].includes(name.getText(page))))) {
    declarations.push(node.getText(page));
  }
  ts.forEachChild(node, visit);
}
visit(page);
const actions = ts.transpileModule(declarations.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

const pdfData = "data:application/pdf;base64,cGRm";
const pdf = { name: "site-rams.pdf", size: 3, type: "application/pdf" };
const event = { preventDefault() {} };

function jobDocumentHarness({ mode = "cloud", file = pdf, link = "" } = {}) {
  const files = privateUploadHarness(), records = [], creates = [], readers = [];
  let saveFailure, afterWrite = false, sequence = 0, sessionUser = files.authorization.userId;
  const scope = { jobId: "job-1", mode, authorization: mode === "local" ? null : files.authorization };
  const context = {
    Date, Error, strictHttpsJobDocumentUrl, documentScope: scope, jobId: scope.jobId,
    documentMutationRestricted: false, documentHandoffMessage: "Document writes are restricted.",
    documentWriteState: { current: { scope, ready: true, jobs: [{ id: scope.jobId }], documents: {
      items: records,
      createItem(record) {
        creates.push(record);
        if (saveFailure && !afterWrite) throw saveFailure;
        assert.ok(!records.some(item => item.id === record.id));
        records.push(record);
        if (saveFailure) throw saveFailure;
        return record;
      },
    } } },
    draftRef: { current: null }, fileReaderRef: { current: null },
    blankDocument: { name: "", category: "Certificate", externalUrl: "", notes: "", uploadedBy: "Jake" },
    setDocumentDraft(draft) { context.renderedDraft = draft; },
    setDocumentSaveFeedback(feedback) { context.feedback = feedback; },
    makeId(prefix) { return `${prefix}-${++sequence}`; },
    activeSyncAuthorizationMatches: () => true,
    readSupabaseSession: () => ({ user: { id: sessionUser } }),
    cloudSafeFileRecord: files.api.cloudSafeFileRecord,
    validatePrivateFile: files.api.validatePrivateFile,
    persistPrivateFileRecordBytes: files.api.persistPrivateFileRecordBytes,
    privateObjectPath: files.api.privateObjectPath,
    queuedDocuments: [],
    FileReader: class {
      constructor() { readers.push(this); }
      readAsDataURL(value) { this.file = value; }
      finish() { this.result = pdfData; this.onload(); }
      fail() { this.onerror(); }
    },
  };
  vm.runInNewContext(actions, context);
  function render() {
    const draft = context.draftRef.current;
    context.currentDocumentDraft = draft;
    context.documentForm = draft?.form;
    context.selectedFile = draft?.file;
  }
  context.toggleDocumentForm();
  render();
  context.changeDocumentForm({ name: "Site RAMS", category: "RAMS", notes: "Use the customer entrance", externalUrl: link });
  render();
  if (file) context.chooseFile({ target: { files: [file] } });
  render();

  return {
    context, records, creates, readers, files, render,
    submit() { render(); return context.addDocument(event); },
    draft() { return context.draftRef.current; },
    feedback() { return context.feedback; },
    failMetadata(error, persisted = false) { saveFailure = error; afterWrite = persisted; },
    setSessionUser(id) { sessionUser = id; },
  };
}

test("job documents retain the draft through metadata failure and retry the same record without re-reading the file", async () => {
  const h = jobDocumentHarness();
  h.failMetadata(new Error("Synthetic collection quota"));
  const first = h.submit(); h.readers[0].finish(); await first;
  assert.equal(h.feedback().error, true);
  assert.equal(h.draft().file, pdf);
  assert.equal(h.draft().form.notes, "Use the customer entrance");
  assert.equal(h.records.length, 0);
  assert.equal(h.files.pending().length, 0);

  h.failMetadata(null);
  await h.submit();
  assert.equal(h.readers.length, 1);
  assert.equal(h.creates.length, 2);
  assert.equal(h.creates[0].id, h.creates[1].id);
  assert.equal(h.records.length, 1);
  assert.equal(h.records[0].dataUrl, undefined);
  assert.equal(h.files.pending()[0].dataUrl, pdfData);
  assert.equal(h.draft(), null);
  assert.equal(h.feedback().error, false);
});

test("private file quota keeps the confirmed metadata and original file until same-ID byte confirmation", async () => {
  const h = jobDocumentHarness();
  h.files.blocked.add(h.files.api.PRIVATE_FILE_UPLOAD_QUEUE_KEY);
  const first = h.submit(); h.readers[0].finish(); await first;
  assert.equal(h.records.length, 1);
  assert.equal(h.records[0].dataUrl, undefined);
  assert.equal(h.files.pending().length, 0);
  assert.equal(h.feedback().error, true);
  assert.equal(h.draft().file, pdf);
  assert.equal(h.draft().attempt.metadataSaved, true);

  h.files.blocked.clear();
  await h.submit();
  assert.equal(h.creates.length, 1);
  const queued = h.files.pending()[0];
  assert.equal(queued.sourceId, h.records[0].id);
  assert.equal(queued.jobSourceId, "job-1");
  assert.equal(queued.dataUrl, pdfData);
  assert.equal(h.draft(), null);
});

test("a lost metadata acknowledgement is recoverable only for the same saved document", async () => {
  for (const changed of [false, true]) {
    const h = jobDocumentHarness();
    h.failMetadata(new Error("Synthetic lost acknowledgement"), true);
    const first = h.submit(); h.readers[0].finish(); await first;
    assert.equal(h.records.length, 1);
    if (changed) h.records[0] = { ...h.records[0], notes: "A newer document was saved" };
    h.failMetadata(null);
    await h.submit();
    assert.equal(h.creates.length, 1);
    assert.equal(h.feedback().error, changed);
    assert.equal(h.files.pending().length, changed ? 0 : 1);
  }
});

test("a late file read cannot write to a retired account, job or session", async () => {
  for (const retire of [
    h => { h.context.documentWriteState.current.scope = { ...h.context.documentScope, jobId: "job-2" }; h.context.draftRef.current = null; },
    h => { h.context.documentWriteState.current.scope = { ...h.context.documentScope, authorization: { ...h.files.authorization, userId: "user-2" } }; h.context.draftRef.current = null; },
    h => h.setSessionUser("user-2"),
  ]) {
    const h = jobDocumentHarness();
    const pending = h.submit();
    retire(h);
    h.readers[0].finish();
    await pending;
    assert.equal(h.creates.length, 0);
    assert.equal(h.files.pending().length, 0);
    assert.equal(h.feedback(), null);
  }
});

test("repeated submissions use one file reader and a read failure keeps the selection editable", async () => {
  const h = jobDocumentHarness();
  const first = h.submit();
  await h.submit();
  assert.equal(h.readers.length, 1);
  h.readers[0].fail();
  await first;
  assert.equal(h.feedback().error, true);
  assert.equal(h.draft().file, pdf);
  assert.equal(h.draft().attempt, undefined);
  const retry = h.submit(); h.readers[1].finish(); await retry;
  assert.equal(h.creates.length, 1);
});

test("local files remain downloadable and an HTTPS link alone requires no private bytes", async () => {
  const local = jobDocumentHarness({ mode: "local" });
  const saved = local.submit(); local.readers[0].finish(); await saved;
  assert.equal(local.records[0].dataUrl, pdfData);
  assert.equal(local.files.pending().length, 0);
  assert.equal(local.context.documentDownloadUrl(local.records[0]), pdfData);

  const link = jobDocumentHarness({ file: null, link: "https://example.test/rams.pdf" });
  await link.submit();
  assert.equal(link.records[0].externalUrl, "https://example.test/rams.pdf");
  assert.equal(link.files.pending().length, 0);
});

test("queued previews require the exact job, document, file and object path and do not alter metadata", async () => {
  const h = jobDocumentHarness();
  const save = h.submit(); h.readers[0].finish(); await save;
  const document = h.records[0], queued = h.files.pending()[0];
  h.context.queuedDocuments = [queued];
  assert.equal(h.context.documentDownloadUrl(document), pdfData);
  for (const change of [{ jobSourceId: "job-2" }, { objectPath: "other/file.pdf" }, { fileName: "other.pdf" }, { dataUrl: null }]) {
    h.context.queuedDocuments = [{ ...queued, ...change }];
    assert.equal(h.context.documentDownloadUrl(document), undefined);
  }
  h.context.queuedDocuments = [queued, queued];
  assert.equal(h.context.documentDownloadUrl(document), undefined);
  h.context.queuedDocuments = [queued];
  h.context.documentMutationRestricted = true;
  assert.equal(h.context.documentDownloadUrl(document), undefined);
  assert.equal(document.dataUrl, undefined);
});
