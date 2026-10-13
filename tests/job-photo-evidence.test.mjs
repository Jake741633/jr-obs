import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const path = new URL("../lib/jobPhotoEvidence.ts", import.meta.url);
async function helpers() { assert.ok(existsSync(path), "Saved-photo reading is implemented"); return import(path); }
const origin = "https://preview.example.com";
const blobUrl = `blob:${origin}/7a4fffb3-6a59-431b-a126-6adf3583ed51`;
const record = { id: "doc-1", jobId: "job-1", name: "Board", category: "Photo", mimeType: "image/jpeg", fileName: "board.jpg", dataUrl: "data:image/jpeg;base64,/9j/2Q==", notes: "Six lights", createdAt: "2026-10-13", uploadedAt: "2026-10-13", uploadedBy: "Jake" };

test("saved raster data becomes a local File without a network call", async t => {
  const { readSavedJobPhoto } = await helpers();
  t.mock.method(globalThis, "fetch", () => { assert.fail("Saved data must be read locally"); });
  const file = await readSavedJobPhoto(record, origin, new AbortController().signal);
  assert.equal(file.name, "board.jpg"); assert.equal(file.type, "image/jpeg"); assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [255, 216, 255, 217]);
});

test("private bridge blobs are bounded and carry no credentials or redirects", async t => {
  const { readSavedJobPhoto } = await helpers(); let request;
  t.mock.method(globalThis, "fetch", async (url, options) => { request = { url, options }; return new Response(new Uint8Array([255, 216, 255, 217]), { headers: { "Content-Type": "image/jpeg", "Content-Length": "4" } }); });
  const controller = new AbortController(), file = await readSavedJobPhoto({ ...record, dataUrl: "", signedDownloadUrl: blobUrl }, origin, controller.signal);
  assert.equal(file.size, 4); assert.equal(request.url, blobUrl); assert.equal(request.options.credentials, "omit"); assert.equal(request.options.redirect, "error"); assert.equal(request.options.signal, controller.signal);
});

test("external, mismatched and unsupported photo sources are rejected before fetch", async t => {
  const { readSavedJobPhoto } = await helpers();
  t.mock.method(globalThis, "fetch", () => { assert.fail("Unsafe source must never be fetched"); });
  for (const patch of [{ dataUrl: "https://external.example/image.jpg" }, { dataUrl: "", externalUrl: "https://external.example/image.jpg" }, { dataUrl: "", signedDownloadUrl: blobUrl.replace(origin, "https://other.example") }, { mimeType: "image/svg+xml" }, { category: "Other" }]) {
    await assert.rejects(readSavedJobPhoto({ ...record, ...patch }, origin, new AbortController().signal), /unavailable|supported/i);
  }
});

test("failed, empty, wrong-type and over-limit blob bodies cannot become prepared evidence", async t => {
  const { readSavedJobPhoto } = await helpers(); let response;
  t.mock.method(globalThis, "fetch", async () => response);
  const fromBlob = () => readSavedJobPhoto({ ...record, dataUrl: "", signedDownloadUrl: blobUrl }, origin, new AbortController().signal);
  for (const value of [new Response("missing", { status: 404 }), new Response("", { headers: { "Content-Type": "image/jpeg" } }), new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } }), new Response("small", { headers: { "Content-Type": "image/jpeg", "Content-Length": String(26 * 1024 * 1024) } })]) { response = value; await assert.rejects(fromBlob()); }
  let cancelled = false;
  response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(26 * 1024 * 1024)); }, cancel() { cancelled = true; } }), { headers: { "Content-Type": "image/jpeg", "Content-Length": "1" } });
  await assert.rejects(fromBlob(), /25 MB/); assert.equal(cancelled, true);
});

test("cancellation blocks reading and never releases a borrowed private object URL", async t => {
  const { readSavedJobPhoto } = await helpers();
  t.mock.method(globalThis, "fetch", () => { assert.fail("Cancelled work must not fetch"); });
  t.mock.method(URL, "revokeObjectURL", () => { assert.fail("Only the private bridge owns this URL"); });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readSavedJobPhoto({ ...record, dataUrl: "", signedDownloadUrl: blobUrl }, origin, controller.signal), /cancelled/i);
});

test("evidence binding detects relevant source changes while notes-only use ignores photo hydration", async () => {
  const { sameSavedJobEvidence, savedJobEvidenceNotes } = await helpers();
  assert.equal(sameSavedJobEvidence(record, { ...record }, true, origin), true);
  for (const patch of [{ id: "other" }, { jobId: "other" }, { name: "Changed" }, { notes: "Changed" }, { dataUrl: "data:image/jpeg;base64,YWJj" }, { privateStoragePath: "new/path" }]) assert.equal(sameSavedJobEvidence(record, { ...record, ...patch }, true, origin), false);
  assert.equal(sameSavedJobEvidence(record, { ...record, dataUrl: "", signedDownloadUrl: blobUrl }, false, origin), true);
  assert.match(savedJobEvidenceNotes("Typed requirements", record, true), /Typed requirements[\s\S]*Saved job evidence: Board[\s\S]*Six lights/);
  assert.throws(() => savedJobEvidenceNotes("x".repeat(12000), record, false), /12,000/);
});
