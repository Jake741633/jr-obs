import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { nodes, text } from "./helpers/customer-page-harness.mjs";
import { savedIdentityIndex } from "../lib/assistantIdentity.ts";
import * as permissions from "../lib/cloud/permissions.ts";
import * as fieldPolicy from "../lib/cloud/fieldMutationPolicy-core.mjs";
import * as links from "../lib/cloud/fieldJobDocumentCapability-core.mjs";
import { photoFileError } from "../lib/jobMediaCapture.ts";

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const source = compile("../components/jobs/JobMediaCapture.tsx");
const prepared = { fileName: "photo-optimised.jpg", mimeType: "image/jpeg", dataUrl: "data:image/jpeg;base64,YWJj" };
function harness() {
  const slots = [], effects = [], writes = [], attempts = [], uploads = []; let cursor = 0, sequence = 0, createFailure = false, uploadFailure = false;
  let prepare = async () => prepared;
  const identity = { mode: "cloud", isReady: true, identity: { organisationId: "org-1", userId: "user-1", role: "owner" } };
  const props = { jobId: "job /?#", jobs: { isReady: true, items: [{ id: "job /?#", title: "Kitchen" }] }, documents: { isReady: true, items: [], createItem(record) { attempts.push(record); if (typeof createFailure === "function" ? createFailure(record) : createFailure) throw new Error("Queue full"); assert.ok(!props.documents.items.some(item => item.id === record.id)); props.documents.items = [...props.documents.items, record]; writes.push(record); } } };
  const changed = (prior, deps) => !prior || deps.some((item, index) => !Object.is(item, prior.deps[index]));
  const useState = value => { const index = cursor++; if (!(index in slots)) slots[index] = typeof value === "function" ? value() : value; return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }]; };
  const deps = {
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    react: { useState, useRef: value => useState({ current: value })[0], useMemo(fn, deps) { const index = cursor++; if (changed(slots[index], deps)) slots[index] = { deps, value: fn() }; return slots[index].value; }, useLayoutEffect(fn, deps) { const index = cursor++, old = slots[index]; if (changed(old, deps)) { const next = { deps, cleanup: old?.cleanup }; slots[index] = next; effects.push(() => { next.cleanup?.(); next.cleanup = fn(); }); } } },
    "../ui/Button": { Button: "Button" }, "../ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" }, "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => identity }, "../../lib/cloud/permissions": permissions, "../../lib/cloud/fieldMutationPolicy-core.mjs": fieldPolicy, "../../lib/cloud/fieldJobDocumentCapability-core.mjs": links, "../../lib/assistantIdentity": { savedIdentityIndex },
    "../../lib/jobMediaCapture": { photoFileError, prepareJobPhoto: file => prepare(file) }, "../../lib/storage": { makeId: () => `doc-${++sequence}` },
    "../../lib/cloud/privateFiles": { dataUrlByteSize: () => 3, privateObjectPath: (org, job, id, name) => `${org}/${job}/${id}/${name}`, queuePrivateFileUpload(item) { if (typeof uploadFailure === "function" ? uploadFailure(item) : uploadFailure) throw new Error("Photo cache is full"); uploads.push(item); } },
  };
  const mod = { exports: {} }; vm.runInNewContext(source, { module: mod, exports: mod.exports, Error, Date, require: name => { assert.ok(name in deps, name); return deps[name]; } });
  function render() { cursor = 0; const tree = mod.exports.JobMediaCapture(props); effects.splice(0).forEach(fn => fn()); return tree; }
  const form = () => nodes(render()).find(node => node.type === "form");
  return { props, identity, writes, attempts, uploads, render,
    field(label, value) { const field = nodes(render()).find(node => node.props.label === label); assert.ok(field, label); if (value !== undefined) field.props.onChange({ target: { value } }); return field; },
    kind(value) { nodes(render()).find(node => node.type === "select").props.onChange({ target: { value } }); },
    photo(file = { name: "photo.jpg", type: "image/jpeg", size: 5_000_000 }) { nodes(render()).find(node => node.type === "input" && node.props.type === "file").props.onChange({ target: { value: "photo", files: [file] } }); },
    photos(files) { nodes(render()).find(node => node.type === "input" && node.props.type === "file" && !node.props.capture).props.onChange({ target: { value: "photos", files } }); },
    button(label) { return nodes(render()).find(node => node.type === "Button" && (text(node) === label || node.props["aria-label"] === label)); },
    submitHandler: () => form().props.onSubmit, async save() { await this.submitHandler()({ preventDefault() {} }); render(); },
    failCreate(value) { createFailure = value; }, failUpload(value) { uploadFailure = value; }, prepare(fn) { prepare = fn; }, account(patch) { Object.assign(identity.identity, patch); render(); }, unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test("job media form provides independent camera and library actions with honest video-link and notes labels", () => {
  const h = harness(), inputs = nodes(h.render()).filter(node => node.type === "input" && node.props.type === "file");
  assert.equal(inputs.length, 2); assert.equal(inputs[0].props.capture, "environment"); assert.equal(inputs[1].props.capture, undefined); assert.match(text(h.render()), /smaller photo copy/);
  h.kind("video"); assert.match(text(h.render()), /Video-file uploads and automatic speech or video analysis are not connected yet/); assert.equal(h.writes.length, 0);
});

const photo = (name, size = 5_000_000) => ({ name, type: "image/jpeg", size });
const prepareNamed = async file => ({ ...prepared, fileName: file.name.replace(/\.jpg$/, "-optimised.jpg") });

test("a reviewed library selection saves each photo with the shared notes and exact job", async () => {
  const h = harness(); h.prepare(prepareNamed);
  const library = nodes(h.render()).find(node => node.type === "input" && node.props.type === "file" && !node.props.capture);
  assert.equal(library.props.multiple, true);
  h.photos([photo("board.jpg"), photo("route.jpg"), photo("room.jpg")]);
  h.field("Evidence name", "Kitchen survey"); h.field("What was shown or said", "Six downlights requested"); await h.save();
  assert.equal(h.writes.length, 3); assert.equal(h.uploads.length, 3);
  assert.equal(new Set(h.writes.map(item => item.id)).size, 3);
  assert.deepEqual(h.writes.map(item => item.name), ["Kitchen survey (1)", "Kitchen survey (2)", "Kitchen survey (3)"]);
  assert.deepEqual(h.writes.map(item => item.fileName), ["board-optimised.jpg", "route-optimised.jpg", "room-optimised.jpg"]);
  for (const item of h.writes) { assert.equal(item.jobId, "job /?#"); assert.match(item.notes, /Six downlights requested/); }
  assert.match(text(h.render()), /3 photos saved on this device/);
});

test("batch preparation is sequential and repeated taps cannot start another save", async () => {
  const h = harness(), started = [], pending = []; h.photos([photo("one.jpg"), photo("two.jpg")]);
  h.prepare(file => { started.push(file.name); return new Promise(resolve => pending.push(() => resolve({ ...prepared, fileName: file.name }))); });
  const submit = h.submitHandler(), saving = submit({ preventDefault() {} }); await submit({ preventDefault() {} });
  assert.deepEqual(started, ["one.jpg"]); assert.match(text(h.render()), /Preparing photo 1 of 2/);
  pending.shift()(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, ["one.jpg", "two.jpg"]); assert.equal(h.uploads.length, 1); assert.match(text(h.render()), /Preparing photo 2 of 2/);
  pending.shift()(); await saving; await submit({ preventDefault() {} }); assert.equal(h.writes.length, 2); assert.equal(h.uploads.length, 2);
});

test("a partial batch retries only unsaved records with stable identities and preparation", async () => {
  const h = harness(), preparedNames = []; h.prepare(async file => { preparedNames.push(file.name); return prepareNamed(file); });
  h.photos([photo("one.jpg"), photo("two.jpg"), photo("three.jpg")]); h.failCreate(record => record.fileName.startsWith("two"));
  await h.save(); assert.equal(h.writes.length, 1); assert.equal(h.uploads.length, 1); const failedId = h.attempts[1].id;
  assert.match(text(h.render()), /1 of 3 photos saved/);
  h.failCreate(false); await h.save();
  assert.equal(h.writes.length, 3); assert.equal(h.uploads.length, 3); assert.equal(h.writes[1].id, failedId);
  assert.deepEqual(preparedNames, ["one.jpg", "two.jpg", "three.jpg"]);
});

test("a partial batch preserves a saved record while retrying its photo bytes", async () => {
  const h = harness(); h.prepare(prepareNamed); h.photos([photo("one.jpg"), photo("two.jpg"), photo("three.jpg")]);
  h.failUpload(item => item.fileName.startsWith("two")); await h.save(); assert.equal(h.writes.length, 2); assert.equal(h.uploads.length, 1);
  h.field("Evidence name", "Changed"); assert.equal(h.field("Evidence name").props.value, "one");
  assert.equal(h.button("Remove two.jpg").props.disabled, true);
  h.failUpload(false); await h.save(); assert.equal(h.writes.length, 3); assert.equal(h.uploads.length, 3);
  assert.equal(new Set(h.uploads.map(item => item.sourceId)).size, 3);
});

test("an unreadable unsaved photo can be removed after partial success so remaining photos can save", async () => {
  const h = harness(); h.prepare(file => file.name === "bad.jpg" ? Promise.reject(new Error("Cannot decode this photo")) : prepareNamed(file));
  h.photos([photo("one.jpg"), photo("bad.jpg"), photo("three.jpg")]); await h.save();
  assert.equal(h.writes.length, 1); assert.match(text(h.render()), /bad.jpg/);
  h.button("Remove bad.jpg").props.onClick(); await h.save();
  assert.equal(h.writes.length, 2); assert.equal(h.uploads.length, 2); assert.equal(h.writes[1].name, "one (3)");
  assert.match(text(h.render()), /2 photos saved on this device/);
});

test("batch preflight rejects every invalid selection before replacing the existing draft", async () => {
  for (const files of [Array.from({ length: 9 }, (_, i) => photo(`${i}.jpg`)), Array.from({ length: 5 }, (_, i) => photo(`${i}.jpg`, 25 * 1024 * 1024)), [photo("fine.jpg"), { name: "bad.mp4", type: "video/mp4", size: 100 }]]) {
    const h = harness(); h.prepare(prepareNamed); h.photo(photo("keep.jpg")); h.photos(files);
    assert.ok(nodes(h.render()).some(node => node.props.role === "alert")); await h.save();
    assert.equal(h.writes.length, 1); assert.equal(h.writes[0].fileName, "keep-optimised.jpg");
  }
});

test("an account or job change during a later photo cannot attach the remaining batch", async () => {
  for (const change of [h => h.account({ organisationId: "other" }), h => h.account({ userId: "other" }), h => h.account({ role: "electrician" }), h => { h.props.jobs.items = []; h.render(); }, h => h.unmount()]) {
    const h = harness(); let finish; h.photos([photo("one.jpg"), photo("two.jpg"), photo("three.jpg")]);
    h.prepare(file => file.name === "two.jpg" ? new Promise(resolve => { finish = resolve; }) : prepareNamed(file));
    const saving = h.save(); await new Promise(resolve => setImmediate(resolve)); assert.equal(h.uploads.length, 1); assert.equal(typeof finish, "function");
    change(h); finish(prepared); await saving; assert.equal(h.writes.length, 1); assert.equal(h.uploads.length, 1);
  }
});

test("camera captures accumulate and stale remove callbacks cannot alter a replacement selection", async () => {
  const h = harness(); h.prepare(prepareNamed); h.photo(photo("one.jpg")); h.photo(photo("two.jpg"));
  const remove = h.button("Remove one.jpg"); assert.ok(remove); h.photos([photo("replacement.jpg")]); remove.props.onClick();
  await h.save(); assert.equal(h.writes.length, 1); assert.equal(h.writes[0].fileName, "replacement-optimised.jpg");
  const camera = harness(); camera.prepare(prepareNamed); camera.photo(photo("one.jpg")); camera.photo(photo("two.jpg")); await camera.save(); assert.equal(camera.writes.length, 2);
});

test("removing then adding photos keeps record names unique, even when a File object repeats", async () => {
  const h = harness(); h.prepare(prepareNamed); h.photo(photo("one.jpg")); h.photo(photo("two.jpg"));
  h.button("Remove one.jpg").props.onClick(); h.photo(photo("three.jpg")); await h.save();
  assert.equal(new Set(h.writes.map(item => item.name)).size, 2);
  const same = photo("same.jpg"), repeated = harness(); repeated.prepare(prepareNamed); repeated.photos([same, same]); await repeated.save();
  assert.equal(repeated.writes.length, 2); assert.equal(new Set(repeated.writes.map(item => item.id)).size, 2);
});
test("photos are queued durably with exact job and account before successful confirmation", async () => {
  const h = harness(); h.photo(); h.field("What was shown or said", "Six kitchen downlights requested"); await h.save();
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].jobId, "job /?#"); assert.equal(h.writes[0].category, "Photo"); assert.equal(h.writes[0].mimeType, "image/jpeg"); assert.match(h.writes[0].notes, /entered by user/);
  assert.equal(h.uploads.length, 1); assert.equal(h.uploads[0].organisationId, "org-1"); assert.equal(h.uploads[0].sourceId, h.writes[0].id); assert.equal(h.uploads[0].jobSourceId, "job /?#"); assert.match(text(h.render()), /Evidence saved on this device/);
});
test("failed photo record save retains the prepared file and retries one stable identity", async () => {
  const h = harness(); let preparations = 0; h.prepare(async () => { preparations++; return prepared; }); h.photo(); h.failCreate(true); await h.save(); const first = h.attempts[0];
  assert.equal(h.uploads.length, 0); assert.match(text(h.render()), /draft is still here/); h.failCreate(false); await h.save(); assert.equal(h.writes.length, 1); assert.equal(h.writes[0].id, first.id); assert.equal(preparations, 1);
});
test("failed photo byte persistence retains its saved record and retries only the photo queue", async () => {
  const h = harness(); h.photo(); h.failUpload(true); await h.save(); assert.equal(h.writes.length, 1); assert.equal(h.uploads.length, 0); assert.match(text(h.render()), /job record is saved, but the photo still needs/);
  h.field("Evidence name", "Must not overwrite saved record"); assert.equal(h.field("Evidence name").props.value, "photo"); h.failUpload(false); await h.save(); assert.equal(h.writes.length, 1); assert.equal(h.uploads.length, 1);
});
test("photo retry refuses a deleted or altered evidence record", async () => {
  for (const change of [h => { h.props.documents.items = []; }, h => { h.props.documents.items = [{ ...h.writes[0], jobId: "another-job" }]; }]) {
    const h = harness(); h.photo(); h.failUpload(true); await h.save(); change(h); h.render(); h.failUpload(false); await h.save(); assert.equal(h.writes.length, 1); assert.equal(h.uploads.length, 0); assert.match(text(h.render()), /saved evidence record changed/);
  }
});
test("video links retain exact HTTPS URLs and entered speech notes without fabricated transcription", async () => {
  const h = harness(); h.kind("video"); h.field("Evidence name", "Kitchen walkthrough"); h.field("Video link", "https://files.example.test/videos/kitchen?id=1"); h.field("What was shown or said", "Customer asks for two new sockets"); await h.save();
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].externalUrl, "https://files.example.test/videos/kitchen?id=1"); assert.equal(h.writes[0].dataUrl, ""); assert.match(h.writes[0].notes, /Site video link.*\n.*\nSite notes \/ spoken details \(entered by user\)/); assert.equal(h.uploads.length, 0);
  for (const link of ["http://example.test", "javascript:alert(1)", "https://user:password@example.test/video"]) { const invalid = harness(); invalid.kind("video"); invalid.field("Evidence name", "Video"); invalid.field("Video link", link); await invalid.save(); assert.equal(invalid.writes.length, 0); }
});
test("async preparation cannot attach evidence after account, job, role or source changes", async () => {
  for (const change of [h => h.account({ organisationId: "other" }), h => h.account({ userId: "other" }), h => h.account({ role: "electrician" }), h => { h.props.jobs.items = []; h.render(); }, h => { h.props.jobs.items = [h.props.jobs.items[0], h.props.jobs.items[0]]; h.render(); }, h => { h.props.jobId = "other"; h.render(); }, h => h.unmount(), h => { h.identity.isReady = false; h.render(); }]) {
    const h = harness(); let resolve; h.prepare(() => new Promise(done => { resolve = done; })); h.photo(); const submit = h.submitHandler(), saving = submit({ preventDefault() {} }); change(h); resolve(prepared); await saving; assert.equal(h.writes.length, 0); assert.equal(h.uploads.length, 0);
  }
});
test("repeated save taps and stale form callbacks cannot create duplicate evidence", async () => {
  const h = harness(); let resolve; h.prepare(() => new Promise(done => { resolve = done; })); h.photo(); const submit = h.submitHandler(), saving = submit({ preventDefault() {} }); await submit({ preventDefault() {} }); resolve(prepared); await saving; await submit({ preventDefault() {} }); assert.equal(h.writes.length, 1);
  const changed = harness(); changed.photo(); const stale = changed.submitHandler(); changed.field("Evidence name", "Reviewed name"); await stale({ preventDefault() {} }); assert.equal(changed.writes.length, 0);
});
test("office and local permissions apply and source photos reject invalid or excessive files", async () => {
  for (const role of ["electrician", "customer", "unknown"]) { const h = harness(); h.account({ role }); assert.equal(h.render(), null); }
  const h = harness(); h.identity.mode = "local"; h.photo(); await h.save(); assert.equal(h.writes.length, 1); assert.equal(h.uploads.length, 0);
  for (const file of [{ name: "video.mp4", type: "video/mp4", size: 100 }, { name: "photo.jpg", type: "image/jpeg", size: 26 * 1024 * 1024 }, { name: "empty.jpg", type: "image/jpeg", size: 0 }]) assert.ok(photoFileError(file));
});

test("photo preparation resizes, uses JPEG and revokes temporary image URLs on success or decode failure", async () => {
  for (const fail of [false, true]) {
    const revoked = [], sizes = [], mod = { exports: {} }; let canvas;
    const FakeImage = class { naturalWidth = 4000; naturalHeight = 3000; set src(value) { assert.equal(value, "blob:source"); queueMicrotask(() => fail ? this.onerror() : this.onload()); } };
    const FakeReader = class { readAsDataURL() { this.result = prepared.dataUrl; this.onload(); } };
    vm.runInNewContext(compile("../lib/jobMediaCapture.ts"), { module: mod, exports: mod.exports, Error, Image: FakeImage, FileReader: FakeReader, URL: { createObjectURL: () => "blob:source", revokeObjectURL: url => revoked.push(url) }, document: { createElement: () => canvas = { getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob(done, type) { sizes.push([canvas.width, canvas.height, type]); done({ size: 500_000 }); } } } });
    if (fail) await assert.rejects(mod.exports.prepareJobPhoto({ name: "source.heic", type: "image/heic", size: 5e6 }), /could not open/);
    else { const result = await mod.exports.prepareJobPhoto({ name: "source.jpg", type: "image/jpeg", size: 5e6 }); assert.equal(result.fileName, "source-optimised.jpg"); assert.deepEqual(sizes, [[1600, 1200, "image/jpeg"]]); }
    assert.deepEqual(revoked, ["blob:source"]);
  }
});
