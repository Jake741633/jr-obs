import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { nodes, text } from "./helpers/customer-page-harness.mjs";
import * as scopeHelpers from "../lib/connectedQuoteScope.mjs";
import * as ownership from "../lib/supabase/sessionOwnership-core.mjs";

const source = ts.transpileModule(readFileSync(new URL("../components/ai/ConnectedQuoteAssistant.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const draft = { title: "Kitchen", summary: "Two sockets requested.", scope: ["Confirm two socket positions."], questions: ["Confirm cable route."], exclusions: ["Heating-controls wiring excluded."] };
function harness() {
  let cursor = 0, epoch = 1, session = { access_token: "token", user: { id: "user-1" } }, fetcher = async () => new Response(JSON.stringify({ draft })), prepare = async () => ({ dataUrl: "data:image/jpeg;base64,/9j/2Q==" });
  const slots = [], effects = [], calls = [], applies = [];
  const identity = { mode: "cloud", isReady: true, identity: { organisationId: "org-1", userId: "user-1", role: "owner" } };
  const props = { notes: "Two kitchen sockets", contextKey: "job-1", ready: true, onApply: (...args) => applies.push(args) };
  const useState = initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; };
  const changed = (old, deps) => !old || !deps || deps.some((value, i) => !Object.is(value, old.deps?.[i]));
  const dependencies = {
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    react: { useState, useRef: value => useState({ current: value })[0], useMemo(fn, deps) { const i = cursor++; if (changed(slots[i], deps)) slots[i] = { value: fn(), deps }; return slots[i].value; }, useLayoutEffect(fn, deps) { const i = cursor++, old = slots[i]; if (changed(old, deps)) { const next = { deps, cleanup: old?.cleanup }; slots[i] = next; effects.push(() => { next.cleanup?.(); next.cleanup = fn(); }); } } },
    "../ui/Button": { Button: "Button" }, "../ui/FormField": { TextareaField: "TextareaField" },
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => identity },
    "../../lib/supabase/client": { captureSupabaseSessionOwnership: () => ({ session, epoch }), readSupabaseSession: () => session, readSupabaseSessionOwnershipEpoch: () => epoch },
    "../../lib/supabase/sessionOwnership-core.mjs": ownership,
    "../../lib/jobMediaCapture": { photoFileError: file => file.type === "image/jpeg" ? "" : "Choose a photo", prepareJobPhoto: file => prepare(file) },
    "../../lib/connectedQuoteScope.mjs": scopeHelpers,
  };
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, Error, JSON, AbortController, require: key => { assert.ok(key in dependencies, key); return dependencies[key]; }, fetch: async (url, init) => { calls.push({ url, init }); return fetcher(); } });
  function render() { cursor = 0; const tree = mod.exports.ConnectedQuoteAssistant(props); effects.splice(0).forEach(fn => fn()); return tree; }
  function button(label) { const b = nodes(render()).find(node => node.type === "Button" && text(node).includes(label)); assert.ok(b, label); return b; }
  return { props, identity, calls, applies, render, button,
    fetch(fn) { fetcher = fn; }, prepare(fn) { prepare = fn; },
    photo() { nodes(render()).find(node => node.type === "input" && node.props.type === "file").props.onChange({ target: { files: [{ name: "kitchen.jpg", type: "image/jpeg", size: 100 }], value: "" } }); render(); },
    async run() { await button("Review with AI").props.onClick(); render(); },
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
  assert.deepEqual(body, { operation: "draft", notes: "Two kitchen sockets", consent: true, photo: "data:image/jpeg;base64,/9j/2Q==" });
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
    const h = harness(); let done; h.prepare(() => new Promise(resolve => { done = resolve; })); h.photo(); const pending = h.run(); change(h); done({ dataUrl: "data:image/jpeg;base64,/9j/2Q==" }); await pending; assert.equal(h.calls.length, 0); assert.equal(h.applies.length, 0);
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
