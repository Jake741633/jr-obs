import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { savedIdentityIndex } from "../lib/assistantIdentity.ts";
import * as permissions from "../lib/cloud/permissions.ts";
import * as photoEvidence from "../lib/jobPhotoEvidence.ts";
import { nodes, text } from "./helpers/customer-page-harness.mjs";

const file = new URL("../components/jobs/JobDocumentBrowser.tsx", import.meta.url);
const origin = "https://preview.example.com";
const jpeg = "data:image/jpeg;base64,YWJj";
const blob = `blob:${origin}/7a4fffb3-6a59-431b-a126-6adf3583ed51`;
const document = (id, patch = {}) => ({ id, jobId: "job-1", category: "Photo", name: `Site ${id}`, fileName: `${id}.jpg`, mimeType: "image/jpeg", dataUrl: jpeg, notes: "Kitchen downlights", uploadedBy: "Jake", uploadedAt: "2026-10-13T12:00:00Z", ...patch });

function harness(exportName = "JobDocumentBrowser", props = {}) {
  assert.ok(existsSync(file), "Saved job document browser is implemented");
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const slots = []; let cursor = 0, identitySubscriptions = 0;
  const identity = { mode: "cloud", isReady: true, identity: { role: "owner", organisationId: "org-1", userId: "user-1" } };
  props.identityState = identity;
  const useState = value => { const index = cursor++; if (!(index in slots)) slots[index] = typeof value === "function" ? value() : value; return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }]; };
  const dependencies = {
    react: { useState, useMemo: fn => fn() },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "next/image": { default: "Image" }, "../ui/Button": { Button: "Button" }, "../ui/FormField": { InputField: "InputField" },
    "../../lib/jobPhotoEvidence": photoEvidence, "../../lib/assistantIdentity": { savedIdentityIndex }, "../../lib/cloud/permissions": permissions,
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => { identitySubscriptions += 1; return identity; } },
  };
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, URL, Date, window: { location: { origin } }, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  function render() { cursor = 0; return mod.exports[exportName](props); }
  return { props, identity, exports: mod.exports, render, identitySubscriptions: () => identitySubscriptions,
    button(label) { const node = nodes(render()).find(node => node.type === "Button" && text(node) === label); assert.ok(node, label); return node; },
    search(value) { nodes(render()).find(node => node.props.label === "Search job documents").props.onChange({ target: { value } }); },
    filter(value) { nodes(render()).find(node => node.type === "select").props.onChange({ target: { value } }); },
  };
}
function browser(items) {
  let shown = [];
  const h = harness("JobDocumentBrowser", { documents: items, jobId: "job-1", children: records => { shown = records; return records.map(record => ({ type: "Record", props: { children: record.id } })); } });
  return { ...h, ids() { shown = []; h.render(); return Array.from(shown, item => item.id); } };
}

test("saved document identities stay exact to the job and withhold globally ambiguous records", () => {
  const h = browser([document("good"), document("elsewhere", { jobId: "job-2" }), document("duplicate"), document("duplicate", { jobId: "job-2" }), document(" ")]);
  assert.deepEqual(h.ids(), ["good"]);
  assert.match(text(h.render()), /2 records need source review/);
  assert.equal(h.props.documents.length, 5);
});

test("documents show recent records progressively and keep invalid dates last", () => {
  const items = Array.from({ length: 10 }, (_, i) => document(`${i}`, { uploadedAt: `2026-10-${String(i + 1).padStart(2, "0")}T12:00:00Z` }));
  const h = browser([...items, document("uncertain", { uploadedAt: "unknown" })]);
  assert.deepEqual(h.ids(), ["9", "8", "7", "6", "5", "4", "3", "2"]);
  h.button("Show more documents").props.onClick(); assert.equal(h.ids().length, 11); assert.equal(h.ids().at(-1), "uncertain");
  assert.equal(h.exports.jobDocumentDateLabel("bad"), "Date unavailable");
});

test("multiword search joins saved evidence fields and filters reset progressive loading", () => {
  const h = browser([...Array.from({ length: 12 }, (_, i) => document(`${i}`)), document("certificate", { category: "Certificate", name: "Completion", fileName: "test.pdf", notes: "Circuit test", uploadedBy: "Sam" })]);
  h.button("Show more documents").props.onClick(); assert.equal(h.ids().length, 13);
  h.search("JAKE downLIGHTS"); assert.equal(h.ids().length, 8);
  h.filter("other"); assert.deepEqual(h.ids(), []); assert.match(text(h.render()), /No matching documents/);
  h.button("Clear filters").props.onClick(); assert.equal(h.ids().length, 8);
  h.search("sam test.pdf"); assert.deepEqual(h.ids(), ["certificate"]);
  h.filter("photos"); assert.deepEqual(h.ids(), []);
});

test("empty folders and folders with unusable identities do not claim matching evidence exists", () => {
  assert.match(text(browser([]).render()), /No uploaded documents yet/);
  const h = browser([document("")]); assert.deepEqual(h.ids(), []); assert.match(text(h.render()), /1 record needs source review/);
});

test("photo source validation only accepts bounded raster data and same-origin bridge blobs", () => {
  const { photoPreviewSource: source } = harness().exports;
  assert.equal(source(document("a"), origin), jpeg);
  assert.equal(source(document("a", { dataUrl: "", signedDownloadUrl: blob }), origin), blob);
  assert.equal(source(document("a", { mimeType: "image/png", dataUrl: "data:image/png;base64,YWJj" }), origin), "data:image/png;base64,YWJj");
  for (const patch of [
    { dataUrl: "https://other.example/photo.jpg" }, { dataUrl: "data:image/svg+xml;base64,YWJj", mimeType: "image/svg+xml" },
    { dataUrl: jpeg + "#fragment" }, { dataUrl: "data:image/jpeg;base64," }, { dataUrl: "data:image/jpeg;base64,YWJ" },
    { dataUrl: "data:image/jpeg;base64," + "A".repeat(3 * 1024 * 1024) },
    { dataUrl: "", signedDownloadUrl: blob.replace(origin, "https://other.example") },
    { dataUrl: "", signedDownloadUrl: "blob:null/id" }, { dataUrl: "", signedDownloadUrl: `${blob}?token=1` },
    { category: "Other" }, { mimeType: "image/heic" }, { mimeType: "image/png" },
  ]) assert.equal(source(document("a", patch), origin), null, JSON.stringify(patch).slice(0, 160));
});

test("inline previews require loaded office or local authority and never follow external photo links", () => {
  const h = harness("JobPhotoPreview", { document: document("a") });
  assert.ok(nodes(h.render()).some(node => node.type === "Image"));
  for (const role of ["electrician", "customer", undefined]) { h.identity.identity.role = role; assert.equal(h.render(), null); }
  h.identity.mode = "local"; assert.ok(nodes(h.render()).some(node => node.type === "Image"));
  h.identity.isReady = false; assert.equal(h.render(), null);
  h.identity.isReady = true; h.props.document = document("external", { dataUrl: "", externalUrl: "https://other.example/photo.jpg" });
  assert.equal(nodes(h.render()).filter(node => node.type === "Image").length, 0); assert.match(text(h.render()), /Photo preview unavailable/);
});

test("filterable photo cards use page identity without mounting or cleaning up shared account listeners", () => {
  const h = harness("JobPhotoPreview", { document: document("a") });
  h.render(); h.identity.identity.role = "electrician"; assert.equal(h.render(), null);
  assert.equal(h.identitySubscriptions(), 0, "A card must not subscribe to the shared account listener lifecycle");
});

test("photo expansion, unavailable images and replacement sources have separate review states", () => {
  const h = harness("JobPhotoPreview", { document: document("a") });
  const oldImage = nodes(h.render()).find(node => node.type === "Image");
  h.button("View larger photo").props.onClick(); assert.ok(h.button("Show thumbnail"));
  oldImage.props.onError(); assert.match(text(h.render()), /Photo preview unavailable/);
  h.props.document = document("a", { dataUrl: "", signedDownloadUrl: blob });
  oldImage.props.onError();
  assert.equal(nodes(h.render()).find(node => node.type === "Image").props.src, blob);
  assert.ok(h.button("View larger photo"));
  assert.ok(nodes(h.render()).some(node => node.type === "a" && node.props.href === blob && node.props.download === "a.jpg"));
});

test("the job page scopes the browser to the current account and keeps live document actions", () => {
  const page = readFileSync(new URL("../app/jobs/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<JobDocumentBrowser key=\{JSON\.stringify\(\[identityState\.mode, identityState\.identity\?\.organisationId, identityState\.identity\?\.userId, identityState\.identity\?\.role, identityState\.identity\?\.customerSourceId, jobId\]\)\} jobId=\{jobId\} documents=\{documents\.items\}/);
  assert.match(page, /<JobPhotoPreview document=\{document\} identityState=\{identityState\}/);
  assert.match(page, /documentExternalLink\(document\)/);
});
