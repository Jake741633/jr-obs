import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";
import { nodes, text } from "./helpers/customer-page-harness.mjs";
import * as scopeHelpers from "../lib/connectedQuoteScope.mjs";
import * as ownership from "../lib/supabase/sessionOwnership-core.mjs";
import { savedIdentityIndex } from "../lib/assistantIdentity.ts";
import { privateBridgeHarness } from "./helpers/private-file-bridge-harness.mjs";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";
const quotePhotos = loadLocalTs(new URL("../lib/quotePhotos.ts", import.meta.url));
const evidenceHelpers = existsSync(new URL("../lib/jobPhotoEvidence.ts", import.meta.url)) ? await import("../lib/jobPhotoEvidence.ts") : {};
const savedPhoto = { id: "doc-1", jobId: "job-1", category: "Photo", name: "Kitchen board", fileName: "board.jpg", mimeType: "image/jpeg", dataUrl: "data:image/jpeg;base64,/9j/2Q==", notes: "Customer requested six downlights.", uploadedAt: "2026-10-13T12:00:00Z", uploadedBy: "Jake", createdAt: "2026-10-13T12:00:00Z" };

const source = ts.transpileModule(readFileSync(new URL("../components/ai/ConnectedQuoteAssistant.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const clipModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/quoteClip.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: clipModule, exports: clipModule.exports, Error, Set, Number, Math });
const aiHelp = existsSync(new URL("../components/ai/AiConnectionHelp.tsx", import.meta.url)) ? (() => {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../components/ai/AiConnectionHelp.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module: mod, exports: mod.exports, require: name => { assert.equal(name, "react/jsx-runtime"); return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }; } });
  return mod.exports;
})() : {};
const draft = { title: "Kitchen", summary: "Two sockets requested.", scope: ["Confirm two socket positions."], questions: ["Confirm cable route."], exclusions: ["Heating-controls wiring excluded."] };
function harness() {
  let cursor = 0, epoch = 1, session = { access_token: "token", user: { id: "user-1" } }, fetcher = async () => new Response(JSON.stringify({ draft })), prepare = async () => ({ dataUrl: "data:image/jpeg;base64,/9j/2Q==" });
  const slots = [], effects = [], calls = [], applies = [], builds = [], savedReads = [], preparedFiles = [];
  let readSaved = async () => new File(["photo"], "board.jpg", { type: "image/jpeg" });
  const identity = { mode: "cloud", isReady: true, identity: { organisationId: "org-1", userId: "user-1", role: "owner" } };
  const props = { notes: "Two kitchen sockets", contextKey: "job-1", ready: true, jobEvidence: { jobId: "job-1", title: "Kitchen", documents: [{ ...savedPhoto }], ready: true }, onApply: (...args) => applies.push(args), onBuildDraft: (...args) => builds.push(args) };
  const useState = initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; };
  const changed = (old, deps) => !old || !deps || deps.some((value, i) => !Object.is(value, old.deps?.[i]));
  const dependencies = {
    "react/jsx-runtime": { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) },
    react: { useState, useRef: value => useState({ current: value })[0], useMemo(fn, deps) { const i = cursor++; if (changed(slots[i], deps)) slots[i] = { value: fn(), deps }; return slots[i].value; }, useLayoutEffect(fn, deps) { const i = cursor++, old = slots[i]; if (changed(old, deps)) { const next = { deps, cleanup: old?.cleanup }; slots[i] = next; effects.push(() => { next.cleanup?.(); next.cleanup = fn(); }); } } },
    "../ui/Button": { Button: "Button" }, "../ui/FormField": { TextareaField: "TextareaField" },
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => identity },
    "../../lib/supabase/client": { captureSupabaseSessionOwnership: () => ({ session, epoch }), readSupabaseSession: () => session, readSupabaseSessionOwnershipEpoch: () => epoch },
    "../../lib/supabase/sessionOwnership-core.mjs": ownership,
    "../../lib/jobMediaCapture": { photoFileError: file => file.type === "image/jpeg" ? "" : "Choose a photo", prepareJobPhoto: file => prepare(file) },
    "../../lib/quotePhotos": { ...quotePhotos, prepareQuotePhoto: (file, signal) => { preparedFiles.push({ file, signal }); return prepare(file); } },
    "next/image": { default: "Image" },
    "../../lib/connectedQuoteScope.mjs": scopeHelpers,
    "../../lib/quoteClip": clipModule.exports,
    "./QuoteClipInput": { QuoteClipInput: "QuoteClipInput", ClipFrames: "ClipFrames" },
    "./AiConnectionHelp": { ...aiHelp, AiConnectionHelp: "AiConnectionHelp", AiRecoveryNotice: "AiRecoveryNotice" },
    "../../lib/assistantIdentity": { savedIdentityIndex },
    "../../lib/jobPhotoEvidence": { ...evidenceHelpers, readSavedJobPhoto: (...args) => { savedReads.push(args); return readSaved(...args); } },
    "../jobs/JobDocumentBrowser": { JobDocumentBrowser: "JobDocumentBrowser", JobPhotoPreview: "JobPhotoPreview" },
  };
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, Error, JSON, AbortController, window: { location: { origin: "https://preview.example.com" } }, require: key => { assert.ok(key in dependencies, key); return dependencies[key]; }, fetch: async (url, init) => { calls.push({ url, init }); return fetcher(); } });
  function render() { cursor = 0; const tree = mod.exports.ConnectedQuoteAssistant(props); effects.splice(0).forEach(fn => fn()); return tree; }
  function button(label) { const b = nodes(render()).find(node => node.type === "Button" && text(node).includes(label)); assert.ok(b, label); return b; }
  function evidenceAction(withPhoto = true, record = props.jobEvidence.documents[0]) {
    const panel = nodes(render()).find(node => node.type === "JobDocumentBrowser"); assert.ok(panel, "Saved job evidence picker exists");
    const cards = panel.props.children([record]);
    const button = nodes(cards).find(node => node.type === "Button" && text(node) === (withPhoto ? "Use photo and notes" : "Use saved notes"));
    assert.ok(button, "Saved evidence action exists"); return button.props.onClick;
  }
  function photos(files) { nodes(render()).find(node => node.type === "input" && node.props.type === "file" && !node.props.capture).props.onChange({ target: { files, value: "" } }); render(); }
  return { props, identity, calls, applies, builds, preparedFiles, savedReads, render, button, evidenceAction, photos,
    saved(withPhoto = true) { evidenceAction(withPhoto)(); render(); }, readSaved(fn) { readSaved = fn; },
    fetch(fn) { fetcher = fn; }, prepare(fn) { prepare = fn; },
    photo() { photos([{ name: "kitchen.jpg", type: "image/jpeg", size: 100 }]); },
    clipPanel() { const panel = nodes(render()).find(node => node.type === "QuoteClipInput"); assert.ok(panel, "clip panel exists"); return panel; },
    async preparePhotos() { await button("Prepare photos").props.onClick(); render(); },
    async run() { const b = nodes(render()).find(node => node.type === "Button" && text(node).includes("Prepare photos")); if (b && !b.props.disabled) await b.props.onClick(); await button("Review with AI").props.onClick(); render(); },
    review() { nodes(render()).find(node => node.type === "input" && node.props.type === "checkbox").props.onChange({ target: { checked: true } }); render(); },
    account(patch) { Object.assign(identity.identity, patch); render(); },
    changeSession() { epoch++; session = { access_token: "new-token", user: { id: "other-user" } }; },
    recover() { session = { ...session, is_password_recovery: true }; },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test("connected scope requires an explicit send, review and apply without writing a quote", async () => {
  const h = harness(); h.render(); assert.equal(h.calls.length, 0); h.photo(); assert.equal(h.calls.length, 0);
  await h.run(); assert.equal(h.calls.length, 1); const body = JSON.parse(h.calls[0].init.body);
  assert.deepEqual(body, { operation: "draft", notes: "Two kitchen sockets", consent: true, photos: ["data:image/jpeg;base64,/9j/2Q=="] });
  assert.equal(h.button("Use reviewed scope").props.disabled, true); assert.equal(h.applies.length, 0);
  h.review(); const apply = h.button("Use reviewed scope").props.onClick; apply(); apply();
  assert.equal(h.applies.length, 1); assert.equal(h.applies[0][0], "Two kitchen sockets"); assert.match(h.applies[0][1], /Confirm cable route/);
});
test("roles, local mode and password recovery cannot call the AI service", async () => {
  for (const role of ["customer", "electrician", "unknown"]) { const h = harness(); h.account({ role }); assert.equal(h.render(), null); assert.equal(h.calls.length, 0); }
  const h = harness(); h.recover(); await h.run(); assert.equal(h.calls.length, 0); assert.match(text(h.render()), /Sign in/);
  const local = harness(); local.identity.mode = "local"; assert.equal(local.button("Review with AI").props.disabled, true);
});
test("photo preparation is discarded after account, notes, selection or readiness changes", async () => {
  for (const change of [h => h.account({ organisationId: "other" }), h => h.account({ role: "customer" }), h => { h.props.notes = "Changed source"; h.render(); }, h => { h.props.contextKey = "job-2"; h.render(); }, h => { h.props.ready = false; h.render(); }, h => h.changeSession(), h => h.unmount()]) {
    const h = harness(); let done; h.prepare(() => new Promise(resolve => { done = resolve; })); h.photo(); const pending = h.preparePhotos(); change(h); done({ dataUrl: "data:image/jpeg;base64,/9j/2Q==" }); await pending; assert.equal(h.calls.length, 0); assert.equal(h.applies.length, 0);
  }
});
test("stale responses and stale apply callbacks cannot replace newer notes", async () => {
  const h = harness(); let done; h.fetch(() => new Promise(resolve => { done = resolve; })); const running = h.run(); h.props.notes = "Different job details"; h.render(); done(new Response(JSON.stringify({ draft }))); await running; assert.ok(!text(h.render()).includes("Confirm cable route"));
  const current = harness(); await current.run(); current.review(); const apply = current.button("Use reviewed scope").props.onClick;
  current.props.notes = "Newer notes"; current.render(); apply(); assert.equal(current.applies.length, 0);
});
test("double taps make one request and clear cancels a pending answer", async () => {
  const h = harness(); let done; h.fetch(() => new Promise(resolve => { done = resolve; })); const run = h.button("Review with AI").props.onClick;
  const pending = run(); await run(); assert.equal(h.calls.length, 1); h.button("Clear AI review").props.onClick(); done(new Response(JSON.stringify({ draft }))); await pending; assert.ok(!text(h.render()).includes("Confirm cable route"));
});
test("billing failures preserve notes and connection checks do not submit source material", async () => {
  const h = harness(); h.fetch(async () => new Response(JSON.stringify({ code: "billing_required", error: "OpenAI API credit is exhausted." }), { status: 402 })); await h.run(); assert.match(text(h.render()), /credit is exhausted/); assert.equal(h.props.notes, "Two kitchen sockets"); assert.equal(h.applies.length, 0);
  h.fetch(async () => new Response(JSON.stringify({ configured: true, message: "Server configured; credit checked on review." })));
  await h.button("Check connection").props.onClick(); assert.deepEqual(JSON.parse(h.calls[1].init.body), { operation: "status" });
});

test("connected AI help is available without a request and management guidance follows the account role", () => {
  for (const role of ["owner", "admin", "office"]) {
    const h = harness(); h.account({ role }); const setup = nodes(h.render()).find(node => node.type === "AiConnectionHelp"); assert.ok(setup); assert.equal(setup.props.canManage, role !== "office");
    assert.equal(h.clipPanel().props.canManageAi, role !== "office"); assert.equal(h.calls.length, 0);
  }
});

test("AI failures offer recovery for the exact safe code without losing notes or retrying automatically", async () => {
  for (const code of ["billing_required", "spend_limit_reached", "usage_limit_reached", "quota_required", "not_configured", "connection_failed"]) {
    const h = harness(); h.fetch(async () => new Response(JSON.stringify({ code, error: "Please review your account." }), { status: 402 })); await h.run();
    const help = nodes(h.render()).find(node => node.type === "AiRecoveryNotice"); assert.ok(help, code); assert.equal(help.props.code, code); assert.equal(help.props.canManage, true); assert.equal(h.calls.length, 1); assert.equal(h.props.notes, "Two kitchen sockets"); assert.equal(h.applies.length, 0);
    h.props.notes = "New site notes"; h.render(); assert.ok(!nodes(h.render()).some(node => node.type === "AiRecoveryNotice"));
  }
  for (const code of ["rate_limited", "provider_unavailable", "https://evil.example/pay", { billing_required: true }]) {
    const h = harness(); h.fetch(async () => new Response(JSON.stringify({ code, error: "Unavailable" }), { status: 429 })); await h.run(); assert.ok(!nodes(h.render()).some(node => node.type === "AiRecoveryNotice")); assert.equal(h.calls.length, 1);
  }
});

test("office billing guidance asks the owner, and successful free status checks never claim funded AI", async () => {
  const h = harness(); h.account({ role: "office" }); h.fetch(async () => new Response(JSON.stringify({ code: "billing_required", error: "Credit exhausted" }), { status: 402 })); await h.run();
  assert.equal(nodes(h.render()).find(node => node.type === "AiRecoveryNotice").props.canManage, false);
  h.fetch(async () => new Response(JSON.stringify({ configured: true }))); await h.button("Check connection").props.onClick();
  assert.ok(!nodes(h.render()).some(node => node.type === "AiRecoveryNotice")); assert.match(text(h.render()), /API credit and model access are checked when you request a review/); assert.equal(h.calls.length, 2); assert.deepEqual(JSON.parse(h.calls[1].init.body), { operation: "status" });
});

test("stale billing failures cannot attach recovery actions to changed notes or accounts", async () => {
  for (const change of [h => { h.props.notes = "Other notes"; h.render(); }, h => h.account({ organisationId: "other" }), h => h.changeSession(), h => h.unmount()]) {
    const h = harness(); let finish; h.fetch(() => new Promise(resolve => { finish = resolve; })); const pending = h.run(); change(h); finish(new Response(JSON.stringify({ code: "billing_required", error: "Old failure" }), { status: 402 })); await pending;
    assert.ok(!nodes(h.render()).some(node => node.type === "AiRecoveryNotice")); assert.doesNotMatch(text(h.render()), /Old failure/);
  }
});

const clipEvidence = { transcript: "Add a pendant by the window.", frames: [{ dataUrl: "data:image/jpeg;base64,/9j/2Q==", seconds: 3 }], duration: 30 };
const photoFile = name => ({ name, type: "image/jpeg", size: 100 });
test("gallery batches append, prepare locally, preview and remove exact photos before an explicit send", async () => {
  const h = harness();
  const picker = nodes(h.render()).find(node => node.type === "input" && node.props.type === "file" && !node.props.capture);
  assert.equal(picker.props.multiple, true);
  h.photos([photoFile("board.jpg"), photoFile("route.jpg")]); h.photos([photoFile("room.jpg")]);
  assert.match(text(h.render()), /board.jpg/); assert.match(text(h.render()), /room.jpg/); assert.equal(h.calls.length, 0);
  h.button("Remove photo 2").props.onClick(); await h.preparePhotos();
  assert.deepEqual(h.preparedFiles.map(item => item.file.name), ["board.jpg", "room.jpg"]);
  assert.equal(nodes(h.render()).filter(node => node.type === "Image").length, 2); assert.equal(h.calls.length, 0);
  await h.button("Review with AI").props.onClick();
  assert.equal(JSON.parse(h.calls[0].init.body).photos.length, 2); assert.equal(h.calls.length, 1);
});
test("invalid and excessive photo batches preserve the previous photos and recording", async () => {
  for (const incoming of [[photoFile("bad.jpg"), { name: "bad.mp4", size: 50, type: "video/mp4" }], Array(6).fill(photoFile("extra.jpg"))]) {
    const h = harness(); h.photo(); h.clipPanel().props.onUse(clipEvidence); h.render(); h.photos(incoming);
    assert.ok(nodes(h.render()).some(node => node.props.role === "alert"));
    await h.run(); const sent = JSON.parse(h.calls[0].init.body); assert.equal(sent.photos.length, 1); assert.deepEqual(sent.frames, clipEvidence.frames);
  }
});
test("a recording handoff over the combined limit is rejected without consuming it or dropping photos", async () => {
  const h = harness(); h.photos(Array.from({ length: 4 }, (_, i) => photoFile(`${i}.jpg`)));
  const accepted = h.clipPanel().props.onUse({ ...clipEvidence, frames: [0, 1, 2].map(seconds => ({ ...clipEvidence.frames[0], seconds })) }); h.render();
  assert.equal(accepted, false); assert.match(text(h.render()), /at most six/);
  await h.run(); const body = JSON.parse(h.calls[0].init.body); assert.equal(body.photos.length, 4); assert.equal(body.frames, undefined);
});
test("removing a photo cancels pending preparation and its old review request cannot send", async () => {
  const h = harness(); h.photos([photoFile("one.jpg"), photoFile("two.jpg")]);
  let finish; h.prepare(() => new Promise(resolve => { finish = resolve; }));
  const review = h.button("Review with AI").props.onClick, pending = h.preparePhotos();
  h.button("Remove photo 1").props.onClick(); h.render();
  assert.equal(h.preparedFiles[0].signal.aborted, true);
  finish({ dataUrl: "data:image/jpeg;base64,/9j/2Q==" }); await pending; await review();
  assert.equal(h.calls.length, 0); assert.equal(h.preparedFiles.length, 1); assert.doesNotMatch(text(h.render()), /one.jpg/);
});
test("an arriving photo cancels pending preparation and requires reviewing the complete new selection", async () => {
  const h = harness(); h.photo(); let finish; h.prepare(() => new Promise(resolve => { finish = resolve; }));
  const oldReview = h.button("Review with AI").props.onClick, pending = h.preparePhotos();
  h.photos([photoFile("added.jpg")]); assert.equal(h.preparedFiles[0].signal.aborted, true); assert.match(text(h.render()), /added.jpg/);
  finish({dataUrl:"data:image/jpeg;base64,/9j/2Q=="}); await pending; await oldReview(); assert.equal(h.calls.length,0);
  h.prepare(async()=>({dataUrl:"data:image/jpeg;base64,/9j/2Q=="})); await h.run(); assert.equal(JSON.parse(h.calls[0].init.body).photos.length,2);
});
test("an arriving photo cancels a pending AI answer without applying the old evidence", async () => {
  const h=harness();h.photo();await h.preparePhotos();let finish;h.fetch(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=h.button("Review with AI").props.onClick;const running=pending();h.photos([photoFile("added.jpg")]);
  assert.equal(h.calls[0].init.signal.aborted,true);finish(new Response(JSON.stringify({draft})));await running;
  assert.equal(h.applies.length,0);assert.equal(h.builds.length,0);assert.doesNotMatch(text(h.render()),/Confirm cable route/);assert.match(text(h.render()),/added.jpg/);
});
test("correcting a rejected combination preserves the recording component and accepts all six images", async()=>{
  const h=harness();h.photos(Array.from({length:4},(_,i)=>photoFile(`${i}.jpg`)));
  const before=h.clipPanel(), video={...clipEvidence,frames:[0,1,2].map(seconds=>({...clipEvidence.frames[0],seconds}))};
  assert.equal(before.props.onUse(video),false);h.render();h.button("Remove photo 1").props.onClick();const after=h.clipPanel();
  assert.equal(after.key,before.key);assert.equal(after.props.context,before.props.context);assert.equal(after.props.onUse(video),true);h.render();
  await h.run();const body=JSON.parse(h.calls[0].init.body);assert.equal(body.photos.length,3);assert.equal(body.frames.length,3);
});
test("local photo preparation blocks clip actions while retaining the recording context", async()=>{
  const h=harness();h.photo();const before=h.clipPanel();let finish;h.prepare(()=>new Promise(resolve=>{finish=resolve;}));const pending=h.preparePhotos();
  const blocked=h.clipPanel();assert.equal(blocked.key,before.key);assert.equal(blocked.props.context,before.props.context);assert.equal(blocked.props.enabled,true);assert.equal(blocked.props.blocked,true);
  finish({dataUrl:"data:image/jpeg;base64,/9j/2Q=="});await pending;assert.equal(h.clipPanel().props.blocked,false);
});
test("a broken later photo keeps the batch available without sending a partial review", async () => {
  const h = harness(); h.photos([photoFile("one.jpg"), photoFile("two.jpg")]);
  h.prepare(async file => { if (file.name === "two.jpg") throw new Error("Unreadable photo"); return { dataUrl: "data:image/jpeg;base64,/9j/2Q==" }; });
  await h.preparePhotos(); await h.button("Review with AI").props.onClick(); assert.equal(h.calls.length, 0);
  assert.match(text(h.render()), /two.jpg/); assert.ok(nodes(h.render()).some(node => node.props.role === "alert"));
});
test("checked scope builds exactly once from the edited review and never invokes notes-only apply", async () => {
  const h = harness(); await h.run(); assert.equal(h.button("Build labour & materials draft").props.disabled, true);
  nodes(h.render()).find(node => node.type === "TextareaField").props.onChange({ target: { value: "Proposed scope\n- Install six downlights" } }); h.render(); h.review();
  const build = h.button("Build labour & materials draft").props.onClick; build(); build();
  assert.deepEqual(h.builds, [["Two kitchen sockets", "Proposed scope\n- Install six downlights"]]); assert.equal(h.applies.length, 0);
});
test("old build callbacks cannot apply after changed sources, context, readiness or session", async () => {
  for (const change of [h => { h.props.notes = "Other notes"; h.render(); }, h => h.photo(), h => { h.props.contextKey = "other"; h.render(); }, h => { h.props.ready = false; h.render(); }, h => h.changeSession(), h => h.unmount()]) {
    const h = harness(); await h.run(); h.review(); const build = h.button("Build labour & materials draft").props.onClick; change(h); build(); assert.equal(h.builds.length, 0);
  }
});
test("removing the reviewed recording preserves the chosen photographs", async () => {
  const h = harness(); h.photo(); h.clipPanel().props.onUse(clipEvidence); h.render(); h.button("Remove recording").props.onClick();
  await h.run(); const body = JSON.parse(h.calls[0].init.body); assert.equal(body.photos.length, 1); assert.equal(body.frames, undefined); assert.doesNotMatch(body.notes, /Reviewed speech/);
});
test("reviewed clip evidence joins typed notes and sampled frames only on the explicit scope request", async () => {
  const h = harness(); h.clipPanel().props.onUse(clipEvidence); h.render(); assert.equal(h.calls.length, 0); assert.equal(h.props.notes, "Two kitchen sockets");
  await h.run(); const body = JSON.parse(h.calls[0].init.body); assert.match(body.notes, /Two kitchen sockets/); assert.match(body.notes, /Reviewed speech from site recording/); assert.match(body.notes, /pendant/); assert.deepEqual(body.frames, clipEvidence.frames); assert.equal(body.photo, undefined);
});
test("old clip handoffs cannot change a new parent input or a running scope request", async () => {
  for (const change of [h => { h.props.notes = "Changed job notes"; h.render(); }, h => h.photo(), h => { h.props.contextKey = "job-2"; h.render(); }, h => { h.props.ready = false; h.render(); }]) {
    const h = harness(), use = h.clipPanel().props.onUse; change(h); use(clipEvidence); assert.doesNotMatch(text(h.render()), /pendant/);
  }
  const h = harness(), use = h.clipPanel().props.onUse; let done; h.fetch(() => new Promise(resolve => { done = resolve; })); const pending = h.run(); use(clipEvidence); done(new Response(JSON.stringify({ draft }))); await pending; assert.doesNotMatch(JSON.stringify(h.calls), /pendant/);
});
test("chosen photos accompany clip evidence and oversized combined notes cannot be submitted", async () => {
  const h = harness(); h.clipPanel().props.onUse(clipEvidence); h.render(); h.photo(); await h.run(); assert.deepEqual(JSON.parse(h.calls[0].init.body).frames, clipEvidence.frames); assert.equal(JSON.parse(h.calls[0].init.body).photos.length, 1);
  const long = harness(); long.clipPanel().props.onUse({ ...clipEvidence, transcript: "x".repeat(12000) }); long.render(); assert.match(text(long.render()), /12,000/); assert.equal(long.calls.length, 0);
});

test("saved job photo and notes are visible and sent only by the explicit review action", async () => {
  const h = harness(); h.saved(); assert.equal(h.calls.length, 0); assert.equal(h.savedReads.length, 0);
  assert.match(text(h.render()), /Customer requested six downlights/); assert.equal(h.props.notes, "Two kitchen sockets");
  await h.run(); assert.equal(h.savedReads.length, 1); assert.equal(h.calls.length, 1);
  const body = JSON.parse(h.calls[0].init.body);
  assert.match(body.notes, /Two kitchen sockets/); assert.match(body.notes, /Saved job evidence: Kitchen board/); assert.match(body.notes, /Customer requested six downlights/);
  assert.equal(body.photo, savedPhoto.dataUrl); assert.equal(body.frames, undefined); assert.equal(h.applies.length, 0);
});

test("saved notes can be used without reading photo bytes or following a video link", async () => {
  const h = harness(); h.props.jobEvidence.documents = [{ ...savedPhoto, category: "Other", dataUrl: "", externalUrl: "https://video.example/clip", notes: "Spoken details entered by user: six lights." }];
  h.saved(false); await h.run(); assert.equal(h.savedReads.length, 0); assert.equal(h.calls.length, 1);
  const body = JSON.parse(h.calls[0].init.body); assert.match(body.notes, /six lights/); assert.equal(body.photo, undefined); assert.doesNotMatch(h.calls[0].init.body, /video\.example/);
});

test("changed, removed, ambiguous or not-ready saved evidence cannot be submitted", async () => {
  for (const change of [
    h => { h.props.jobEvidence.documents[0] = { ...savedPhoto, notes: "Changed" }; },
    h => { h.props.jobEvidence.documents = []; },
    h => { h.props.jobEvidence.documents.push({ ...savedPhoto, jobId: "other" }); },
    h => { h.props.jobEvidence.ready = false; },
    h => { h.props.jobEvidence.documents[0] = { ...savedPhoto, dataUrl: "data:image/jpeg;base64,YWJj" }; },
    h => { h.props.jobEvidence.documents[0] = { ...savedPhoto, privateStoragePath: "changed/path" }; },
  ]) {
    const h = harness(); h.saved(); change(h); h.render(); assert.equal(h.button("Review with AI").props.disabled, true);
    await h.run(); assert.equal(h.calls.length, 0); assert.equal(h.savedReads.length, 0); assert.match(text(h.render()), /Saved evidence changed or is unavailable/);
  }
});

test("stale saved-record buttons cannot select replacement, cross-job or duplicate records", async () => {
  for (const replacement of [{ ...savedPhoto, notes: "Changed" }, { ...savedPhoto, jobId: "job-2" }]) {
    const h = harness(), choose = h.evidenceAction(); h.props.jobEvidence.documents = [replacement]; h.render(); choose(); await h.run(); assert.equal(h.savedReads.length, 0); assert.doesNotMatch(h.calls[0].init.body, /Saved job evidence/);
  }
  const h = harness(), choose = h.evidenceAction(); h.props.jobEvidence.documents.push({ ...savedPhoto, jobId: "job-2" }); h.render(); choose(); await h.run(); assert.equal(h.savedReads.length, 0);
});

test("source and account changes during saved photo loading discard the pending request", async () => {
  for (const change of [h => { h.props.jobEvidence.documents = []; h.render(); }, h => h.account({ organisationId: "other" }), h => h.changeSession(), h => h.unmount()]) {
    const h = harness(); h.saved(); let finish; h.readSaved(() => new Promise(resolve => { finish = resolve; }));
    const pending = h.run(); change(h); finish(new File(["photo"], "board.jpg", { type: "image/jpeg" })); await pending;
    assert.equal(h.calls.length, 0); assert.equal(h.applies.length, 0);
  }
});

test("saved-source changes discard old responses and apply callbacks", async () => {
  const h = harness(); h.saved(); let finish; h.fetch(() => new Promise(resolve => { finish = resolve; })); const pending = h.run(); await new Promise(resolve => setImmediate(resolve));
  h.props.jobEvidence.documents = []; h.render(); finish(new Response(JSON.stringify({ draft }))); await pending; assert.doesNotMatch(text(h.render()), /Confirm cable route/);
  const reviewed = harness(); reviewed.saved(); await reviewed.run(); reviewed.review(); const apply = reviewed.button("Use reviewed scope").props.onClick;
  reviewed.props.jobEvidence.documents = []; reviewed.render(); apply(); assert.equal(reviewed.applies.length, 0);
});

test("photo and clip choices replace saved evidence, and connection checks never read its bytes", async () => {
  const h = harness(); h.saved(); h.photo(); await h.run(); assert.equal(h.savedReads.length, 0); assert.doesNotMatch(h.calls[0].init.body, /Saved job evidence/);
  const clip = harness(); clip.saved(); clip.clipPanel().props.onUse(clipEvidence); clip.render(); await clip.run(); assert.equal(clip.savedReads.length, 0); assert.doesNotMatch(clip.calls[0].init.body, /Saved job evidence/);
  const status = harness(); status.saved(); await status.button("Check connection").props.onClick(); assert.equal(status.savedReads.length, 0); assert.deepEqual(JSON.parse(status.calls[0].init.body), { operation: "status" });
});

test("long saved notes are rejected before any photo read or paid request", async () => {
  const h = harness(); h.props.jobEvidence.documents[0].notes = "x".repeat(12000); h.saved(); assert.match(text(h.render()), /12,000/); assert.equal(h.calls.length, 0); assert.equal(h.savedReads.length, 0);
});

test("saved evidence remains hidden until the loaded office identity and job are available", () => {
  const h = harness(); h.identity.isReady = false; assert.ok(!nodes(h.render()).some(node => node.type === "JobDocumentBrowser"));
  h.identity.isReady = true; h.props.jobEvidence = undefined; assert.match(text(h.render()), /Choose an existing job/);
  const page = readFileSync(new URL("../app/ai/quote-builder/page.tsx", import.meta.url), "utf8");
  assert.match(page, /evidenceJob = savedIdentityIndex\(jobs\.items\)\.unique\.get\(jobId\)/);
  assert.match(page, /jobEvidence=\{evidenceJob \? \{ jobId: evidenceJob\.id, title: evidenceJob\.title, documents: jobDocuments\.items, ready: jobDocuments\.isReady \} : undefined\}/);
});

test("reselecting a replaced private attachment sends photo B and never the cached photo A", async t => {
  const a = { ...savedPhoto, dataUrl: "", privateStoragePath: "org-1/job-1/photo-a.jpg", privateFileId: "file-a" };
  const b = { ...a, privateStoragePath: "org-1/job-1/photo-b.jpg", privateFileId: "file-b", notes: "Replacement photo notes" };
  const bridge = privateBridgeHarness([a]); bridge.render();
  const h = harness(); h.props.jobEvidence.documents = await bridge.settled(); h.saved();
  t.mock.method(globalThis, "fetch", async url => { const blob = bridge.blobs.get(url); assert.ok(blob, "Only a bridge-created blob is read"); return new Response(blob); });
  h.readSaved(evidenceHelpers.readSavedJobPhoto);
  h.prepare(async file => ({ dataUrl: `data:image/jpeg;base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}` }));
  await h.run(); const photoA = JSON.parse(h.calls[0].init.body).photo;
  bridge.props.items = [b]; h.props.jobEvidence.documents = bridge.render(); h.render();
  assert.equal(h.props.jobEvidence.documents[0].signedDownloadUrl, undefined, "The old attachment URL must not hydrate the replacement");
  assert.equal(h.button("Review with AI").props.disabled, true);
  h.props.jobEvidence.documents = await bridge.settled(); h.render(); h.saved(); await h.run();
  const body = JSON.parse(h.calls[1].init.body);
  assert.notEqual(body.photo, photoA); assert.equal(Buffer.from(body.photo.split(",")[1], "base64").toString(), b.privateStoragePath);
  assert.match(body.notes, /Replacement photo notes/); assert.equal(bridge.downloads.length, 2);
  bridge.unmount();
});
