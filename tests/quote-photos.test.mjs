import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";
import * as media from "../lib/jobMediaCapture.ts";

const path = new URL("../lib/quotePhotos.ts", import.meta.url);
const source = existsSync(path) ? ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText : "";
const file = (name = "room.jpg", size = 5000000, type = "image/jpeg") => ({ name, size, type });
const jpeg = "data:image/jpeg;base64,/9j/2Q==";
function harness({ decode = "ok", size = 200000, read = "ok" } = {}) {
  const revoked = [], encodes = [], images = [], readers = [], timers = new Map(); let timer = 0, canvas;
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, Error, Math, Number,
    require(name) { assert.equal(name, "./jobMediaCapture"); return media; },
    setTimeout(fn) { const id = ++timer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    Image: class { naturalWidth = 4000; naturalHeight = 3000; constructor() { images.push(this); } set src(value) { if (value && decode !== "stall") queueMicrotask(() => decode === "bad" ? this.onerror?.() : this.onload?.()); } },
    FileReader: class { constructor() { readers.push(this); } readAsDataURL() { if (read !== "stall") { this.result = jpeg; queueMicrotask(() => this.onload?.()); } } abort() {} },
    URL: { createObjectURL: () => "blob:photo", revokeObjectURL: value => revoked.push(value) },
    document: { createElement(name) { assert.equal(name, "canvas"); return canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob(done, type, quality) { encodes.push([canvas.width, canvas.height, type, quality]); if (size !== "stall") queueMicrotask(() => done(size === null ? null : { size: typeof size === "function" ? size(encodes.length) : size })); } }; } },
  });
  return { ...mod.exports, revoked, encodes, timers, image: () => images.at(-1), reader: () => readers.at(-1), expire() { [...timers.values()].forEach(fn => fn()); } };
}

test("photo selection validates the whole batch and leaves room for every video frame", () => {
  const h = harness(); assert.equal(typeof h.quotePhotoSelectionError, "function");
  assert.equal(h.quotePhotoSelectionError(Array(6).fill(file())), null);
  assert.equal(h.quotePhotoSelectionError(Array(3).fill(file()), 3), null);
  for (const [files, count] of [[Array(7).fill(file()), 0], [Array(4).fill(file()), 3], [Array(5).fill(file("big.jpg", 25 * 1024 * 1024)), 0], [[file("large.jpg", 25 * 1024 * 1024 + 1)], 0], [[file("video.mp4", 50, "video/mp4")], 0], [[file("empty.jpg", 0)], 0]]) {
    assert.equal(typeof h.quotePhotoSelectionError(files, count), "string");
  }
});
test("quote photos are downsampled to bounded JPEGs and temporary resources are released", async () => {
  const h = harness(); assert.equal(typeof h.prepareQuotePhoto, "function");
  const result = await h.prepareQuotePhoto(file("board.heic", 5e6, "image/heic"));
  assert.equal(result.dataUrl, jpeg); assert.equal(result.mimeType, "image/jpeg");
  assert.equal(h.encodes[0][0], 1280); assert.equal(h.encodes[0][1], 960); assert.equal(h.encodes[0][2], "image/jpeg");
  assert.deepEqual(h.revoked, ["blob:photo"]); assert.equal(h.timers.size, 0);
  assert.equal(h.image().onload, null); assert.equal(h.reader().onload, null);
});
test("oversized encodings retry at a smaller dimension rather than exceed the API image limit", async () => {
  const h = harness({ size: attempt => attempt < 4 ? 250001 : 250000 }); assert.equal(typeof h.prepareQuotePhoto, "function");
  await h.prepareQuotePhoto(file()); assert.equal(h.encodes.length, 4);
  assert.ok(h.encodes[3][0] < h.encodes[0][0]); assert.deepEqual(h.revoked, ["blob:photo"]);
  const failure = harness({ size: 250001 }); await assert.rejects(failure.prepareQuotePhoto(file()), /smaller|crop/i); assert.deepEqual(failure.revoked, ["blob:photo"]);
});
test("bad images and cancelled or stalled work release resources without yielding a usable image", async () => {
  const broken = harness({ decode: "bad" }); assert.equal(typeof broken.prepareQuotePhoto, "function");
  await assert.rejects(broken.prepareQuotePhoto(file()), /open|read/i); assert.deepEqual(broken.revoked, ["blob:photo"]);
  for (const stage of [{ decode: "stall" }, { size: "stall" }, { read: "stall" }]) {
    const h = harness(stage), controller = new AbortController(), pending = h.prepareQuotePhoto(file(), controller.signal);
    await new Promise(resolve => setImmediate(resolve)); controller.abort(); await assert.rejects(pending, /cancelled/i);
    assert.deepEqual(h.revoked, ["blob:photo"]); assert.equal(h.timers.size, 0);
  }
  const h = harness({ decode: "stall" }), pending = h.prepareQuotePhoto(file()); h.expire();
  await assert.rejects(pending, /too long|timed out/i); assert.deepEqual(h.revoked, ["blob:photo"]);
});
