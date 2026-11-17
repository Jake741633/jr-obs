import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";

const { certificatePdfHtml, createCertificateDraft } = loadLocalTs(new URL("../lib/complianceCertificates.ts", import.meta.url));

const page = ts.createSourceFile("certificates-page.tsx", readFileSync(new URL("../app/certificates/page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "printCertificate") handler = node;
  ts.forEachChild(node, visit);
}
visit(page);
assert.ok(handler, "The certificate page must expose its print handler");
const source = ts.transpileModule(`${handler.getText(page)}\nprintCertificate;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function harness({ absent = false, blocked = false, failure = "", closeFailure = false } = {}) {
  const events = [], messages = [], opens = [];
  const customer = { id: "customer-1", name: "Preview customer", address: "1 Customer Road" };
  const job = { id: "job-1", title: "Preview installation", customerId: customer.id, siteAddress: "2 Site Road" };
  const invoice = { id: "invoice-1", number: "INV-PREVIEW" };
  const form = absent ? null : createCertificateDraft({ id: "certificate-1", number: "CERT-PREVIEW", type: "Electrical Installation Certificate", inspectorName: "Preview inspector", customer, job, invoice });
  let contents = "", opener, closed = false;
  const privateError = new Error("Private customer secret: internal-preview-failure");
  const fail = stage => { if (failure === stage) throw privateError; };
  const document = {
    open() { events.push("clear"); contents = ""; },
    write(html) { events.push("write"); contents = html; fail("write"); },
    close() { events.push("document-close"); fail("document-close"); },
  };
  const popup = {
    get opener() { return opener; },
    set opener(value) { events.push("detach"); fail("detach"); if (failure !== "detach-ignored") opener = value; },
    get document() { events.push("document-access"); fail("document-access"); return document; },
    focus() { events.push("focus"); fail("focus"); },
    print() { events.push("print"); fail("print"); },
    close() { events.push("close"); if (closeFailure) throw privateError; closed = true; contents = ""; },
  };
  const window = {
    open(url, target, features = "") {
      events.push("open"); opens.push({ url, target, features }); fail("open");
      // Documented window.open contract: noopener returns null; noreferrer implies noopener.
      if (blocked || features.split(",").some(feature => ["noopener", "noreferrer"].includes(feature.trim()))) return null;
      return popup;
    },
  };
  opener = window;
  const print = vm.runInNewContext(source, { window, form, certificatePdfHtml, customers: { items: [customer] }, jobs: { items: [job] }, invoices: { items: [invoice] }, setMessage: value => messages.push(value) });
  return { print, events, messages, opens, contents: () => contents, closed: () => closed, opener: () => opener };
}

test("PDF-ready opens the generated certificate HTML and prints it", () => {
  const h = harness(); h.print();
  assert.equal(h.opens.length, 1);
  assert.equal(h.opens[0].url, "");
  assert.equal(h.opens[0].target, "_blank");
  assert.match(h.contents(), /<title>CERT-PREVIEW<\/title>/);
  assert.match(h.contents(), /Preview customer/);
  assert.match(h.contents(), /Preview installation/);
  assert.match(h.contents(), /INV-PREVIEW/);
  assert.deepEqual(h.events.filter(event => ["write", "document-close", "focus", "print"].includes(event)), ["write", "document-close", "focus", "print"]);
  assert.equal(h.closed(), false);
  assert.ok(h.messages.every(message => !message));
});

test("PDF-ready detaches the opener before any certificate document access or write", () => {
  const h = harness(); h.print();
  assert.equal(h.opener(), null);
  assert.ok(h.events.indexOf("detach") >= 0);
  assert.ok(h.events.indexOf("detach") < h.events.indexOf("document-access"));
  assert.ok(h.events.indexOf("detach") < h.events.indexOf("write"));
});

test("a blocked certificate popup retains actionable feedback", () => {
  const h = harness({ blocked: true });
  assert.doesNotThrow(h.print);
  assert.deepEqual(h.events, ["open"]);
  assert.deepEqual(h.messages, ["Allow pop-ups to open the PDF-ready certificate."]);
});

test("printing without a selected certificate opens no window", () => {
  const h = harness({ absent: true }); h.print();
  assert.deepEqual(h.events, []);
  assert.deepEqual(h.messages, []);
});

for (const failure of ["open", "detach", "detach-ignored", "document-access", "write", "document-close", "focus", "print"]) {
  test(`certificate preview ${failure} failures close the incomplete preview and hide private errors`, () => {
    const h = harness({ failure });
    assert.doesNotThrow(h.print);
    assert.equal(h.closed(), failure !== "open");
    assert.equal(h.contents(), "");
    if (["detach", "detach-ignored", "document-access"].includes(failure)) assert.ok(!h.events.includes("write"));
    assert.equal(h.messages.length, 1);
    assert.match(h.messages[0], /certificate preview could not be opened/i);
    assert.doesNotMatch(h.messages[0], /Private customer secret|internal-preview-failure/);
  });
}

test("failed printing clears private preview contents even when closing the window fails", () => {
  const h = harness({ failure: "print", closeFailure: true });
  assert.doesNotThrow(h.print);
  assert.ok(h.events.includes("write"));
  assert.ok(h.events.includes("clear"));
  assert.ok(h.events.includes("close"));
  assert.equal(h.contents(), "");
  assert.match(h.messages[0], /certificate preview could not be opened/i);
});
