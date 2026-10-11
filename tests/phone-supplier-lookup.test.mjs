import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as ownership from "../lib/supabase/sessionOwnership-core.mjs";

function compile(path, deps = {}, globals = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module: mod, exports: mod.exports, URL, Error, AbortController, ...globals, require(name) { assert.ok(name in deps, name); return deps[name]; } });
  return mod.exports;
}
const lookup = compile("../lib/supplierLookup.ts");
const jsx = (type, props) => ({ type, props });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);
const result = (patch = {}) => ({ supplier: "CEF", stockCode: "C1", name: "Cable", manufacturer: "Maker", exactMatch: true, message: "Check the product with the supplier.", productUrl: "https://www.cef.co.uk/product/cable", searchUrl: "https://www.cef.co.uk/search?q=C1", ...patch });
const event = { preventDefault() {} };

function harness({ session = { access_token: "test-token" }, epoch = "epoch-1" } = {}) {
  const state = [], effects = [], cleanups = [], requests = [], timers = new Map();
  let cursor = 0, timerId = 0, blurred = 0;
  const Component = compile("../app/field/material-lookup/page.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; }, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (next) => { state[i] = typeof next === "function" ? next(state[i]) : next; }]; }, useEffect(fn) { const i = cursor++; if (!(i in state)) { state[i] = true; effects.push(fn); } } },
    "lucide-react": {}, "../../../components/ui/Button": { Button: "Button" }, "../../../components/ui/Card": { Card: "Card" }, "../../../components/ui/PageHeader": { PageHeader: "PageHeader" },
    "../../../lib/supabase/client": { readSupabaseSession: () => session, readSupabaseSessionOwnershipEpoch: () => epoch },
    "../../../lib/supabase/sessionOwnership-core.mjs": ownership, "../../../lib/supplierLookup": lookup,
  }, { fetch(url, init) { return new Promise((resolve, reject) => requests.push({ url, init, resolve, reject })); }, setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); } }).default;
  const render = () => { cursor = 0; const tree = Component(); nodes(tree).find(n => n.type === "input").props.ref.current = { blur() { blurred++; } }; effects.splice(0).forEach(fn => cleanups.push(fn())); return tree; };
  const input = () => nodes(render()).find(n => n.type === "input");
  const select = () => nodes(render()).find(n => n.type === "select");
  const button = (label) => nodes(render()).find(n => n.type === "Button" && text(n) === label);
  return { render, requests, timers, input, select, button, blurred: () => blurred,
    code(value) { input().props.onChange({ target: { value } }); }, supplier(value) { select().props.onChange({ target: { value } }); },
    handler() { return nodes(render()).find(n => n.type === "form").props.onSubmit; }, submit() { return this.handler()(event); },
    busy() { return nodes(render()).find(n => n.type === "form").props["aria-busy"]; },
    result() { return nodes(render()).find(n => n.props["aria-label"] === "Supplier lookup result"); },
    finish(index, payload = result(), ok = true) { requests[index].resolve({ ok, json: async () => payload }); },
    identity(next, nextEpoch = epoch) { session = next; epoch = nextEpoch; },
    unmount() { cleanups.splice(0).forEach(fn => fn?.()); },
  };
}

test("phone lookup has labelled 48px controls, code keyboard hints and announced feedback", async () => {
  const h = harness(); assert.equal(nodes(h.render()).filter(n => n.type === "label").length, 2);
  assert.deepEqual(nodes(h.render()).filter(n => n.type === "label").map(n => text(n.props.children[0])), ["Supplier", "Stock or product code"]);
  for (const control of [h.input(), h.select(), h.button("Find product")]) assert.match(control.props.className, /min-h-12/);
  assert.equal(h.input().props.maxLength, 80); assert.equal(h.input().props.enterKeyHint, "search"); assert.equal(h.input().props.autoCapitalize, "none"); assert.equal(h.input().props.autoComplete, "off");
  await h.submit(); assert.equal(h.requests.length, 0); assert.equal(h.blurred(), 0); assert.match(text(h.render()), /1–80 characters/); assert.ok(nodes(h.render()).some(n => n.props.role === "status"));
  h.code("x".repeat(81)); await h.submit(); assert.equal(h.requests.length, 0);
});

test("signed-out and recovery sessions cannot request products and keep the editable code", async () => {
  for (const session of [null, { access_token: "test", is_password_recovery: true }]) {
    const h = harness({ session }); h.code("C1"); await h.submit(); assert.equal(h.requests.length, 0); assert.equal(h.busy(), false); assert.equal(h.input().props.value, "C1"); assert.match(text(h.render()), /Sign in before/);
  }
});

test("a lookup uses the submitted code, verified endpoint and existing bearer session without catalogue writes", async () => {
  const h = harness(); h.code(" C1 "); const promise = h.submit();
  assert.equal(h.blurred(), 1); assert.equal(h.busy(), true); assert.equal(h.requests[0].url, "/api/materials/lookup");
  assert.equal(h.requests[0].init.headers.Authorization, "Bearer test-token"); assert.equal(h.requests[0].init.method, "POST"); assert.deepEqual(JSON.parse(h.requests[0].init.body), { supplier: "CEF", stockCode: "C1" });
  h.finish(0, result({ publicPrice: 123.45 })); await promise;
  assert.equal(h.busy(), false); assert.match(text(h.result()), /CEF · C1.*Cable.*Supplier code match/); assert.doesNotMatch(text(h.result()), /123\.45/);
  assert.equal(nodes(h.result()).find(n => n.type === "a").props.href, result().productUrl); assert.match(text(h.result()), /not placed an order/); assert.equal(h.timers.size, 0);
});

test("repeated submit callbacks cannot start concurrent identical requests", async () => {
  const h = harness(); h.code("C1"); const callback = h.handler(); const first = callback(event); await callback(event);
  assert.equal(h.requests.length, 1); assert.equal(h.busy(), true); h.finish(0); await first;
});

test("editing code aborts old requests and an old response cannot replace a newer result", async () => {
  const h = harness(); h.code("C1"); const oldCallback = h.handler(); const old = oldCallback(event);
  h.code("C2"); assert.equal(h.requests[0].init.signal.aborted, true); assert.equal(h.busy(), false); assert.equal(h.result(), undefined); await oldCallback(event); assert.equal(h.requests.length, 1);
  const current = h.submit(); h.finish(0); await old; assert.equal(h.busy(), true); assert.equal(h.result(), undefined);
  h.finish(1, result({ stockCode: "C2", name: "Current cable" })); await current; assert.match(text(h.result()), /C2.*Current cable/);
});

test("supplier changes clear displayed results and invalidate earlier async completions", async () => {
  const h = harness(); h.code("C1"); const first = h.submit(); h.finish(0); await first; h.supplier("Screwfix"); assert.equal(h.result(), undefined); assert.equal(h.input().props.value, "C1");
  const pending = h.submit(); h.supplier("TLC Direct"); assert.equal(h.requests[1].init.signal.aborted, true);
  h.finish(1, result({ supplier: "Screwfix", searchUrl: "https://www.screwfix.com/search?search=C1", productUrl: undefined })); await pending;
  assert.equal(h.result(), undefined); assert.equal(h.select().props.value, "TLC Direct"); assert.equal(h.busy(), false);
});

test("editing away and back to the same code still invalidates the original callback", async () => {
  const h = harness(); h.code("C1"); const stale = h.handler(); const old = stale(event); h.code("other"); h.code("C1"); await stale(event); assert.equal(h.requests.length, 1);
  const current = h.submit(); h.finish(1, result({ name: "New result" })); await current; h.finish(0, result({ name: "Old result" })); await old; assert.match(text(h.result()), /New result/); assert.doesNotMatch(text(h.result()), /Old result/);
});

test("cancel keeps supplier and code, clears busy state, and allows a safe retry", async () => {
  const h = harness(); h.code("C1"); const old = h.submit(); const cancel = h.button("Cancel lookup"); assert.match(cancel.props.className, /min-h-12/); cancel.props.onClick();
  assert.equal(h.input().props.value, "C1"); assert.equal(h.select().props.value, "CEF"); assert.equal(h.busy(), false); assert.match(text(h.render()), /Lookup cancelled/); assert.equal(h.timers.size, 0);
  const retry = h.submit(); h.requests[0].reject(new Error("Old failure")); await old; assert.equal(h.busy(), true); assert.doesNotMatch(text(h.render()), /Old failure/); h.finish(1); await retry; assert.ok(h.result());
});

test("clear lookup aborts a pending response and does not change the chosen supplier", async () => {
  const h = harness(); h.supplier("Screwfix"); h.code("C1"); const pending = h.submit(); const clear = h.button("Clear lookup"); assert.match(clear.props.className, /min-h-12/); clear.props.onClick();
  assert.equal(h.input().props.value, ""); assert.equal(h.select().props.value, "Screwfix"); assert.equal(h.requests[0].init.signal.aborted, true); h.finish(0); await pending; assert.equal(h.result(), undefined); assert.equal(h.busy(), false);
});

test("timeout releases a stalled request, preserves input, and ignores its eventual success", async () => {
  const h = harness(); h.code("C1"); const pending = h.submit(); const timer = [...h.timers.values()][0]; assert.equal(timer.ms, 20_000); timer.fn();
  assert.equal(h.busy(), false); assert.equal(h.input().props.value, "C1"); assert.match(text(h.render()), /took too long/); assert.equal(h.requests[0].init.signal.aborted, true); h.finish(0); await pending; assert.equal(h.result(), undefined);
});

test("unmount cancels the request and old handlers cannot send another lookup", async () => {
  const h = harness(); h.code("C1"); const callback = h.handler(); const pending = callback(event); h.unmount(); assert.equal(h.requests[0].init.signal.aborted, true); assert.equal(h.timers.size, 0); await callback(event); assert.equal(h.requests.length, 1); h.finish(0); await pending; assert.equal(h.result(), undefined);
});

test("session or ownership changes cannot expose an earlier response, including switching away and back", async () => {
  for (const [session, epoch] of [[null, "epoch-1"], [{ access_token: "other" }, "epoch-1"], [{ access_token: "test-token" }, "epoch-2"], [{ access_token: "test-token", is_password_recovery: true }, "epoch-1"]]) {
    const h = harness(); h.code("C1"); const pending = h.submit(); h.identity(session, epoch); h.finish(0); await pending; assert.equal(h.result(), undefined); assert.equal(h.busy(), false); assert.match(text(h.render()), /sign-in changed/);
  }
});

test("server errors and malformed JSON keep inputs and allow retry without stale results", async () => {
  const h = harness(); h.code("C1"); const denied = h.submit(); h.finish(0, { error: "Supplier lookups are not permitted for this account." }, false); await denied;
  assert.match(text(h.render()), /not permitted/); assert.equal(h.result(), undefined); assert.equal(h.input().props.value, "C1");
  const broken = h.submit(); h.requests[1].resolve({ ok: true, json: async () => { throw new Error("Invalid response"); } }); await broken; assert.equal(h.busy(), false); assert.equal(h.result(), undefined);
  const retry = h.submit(); h.finish(2); await retry; assert.ok(h.result());
});

test("non-exact metadata uses supplier search and never presents the suggested product as a code match", async () => {
  const h = harness(); h.code("C1"); const pending = h.submit(); h.finish(0, result({ exactMatch: false, name: "Possible product" })); await pending;
  assert.match(text(h.result()), /Not an exact code match/); assert.equal(nodes(h.result()).find(n => n.type === "a").props.href, result().searchUrl); assert.match(text(h.result()), /Open supplier search/);
});

test("response validation rejects mismatched identities, malformed fields and off-supplier links", () => {
  for (const payload of [null, [], {}, result({ supplier: "Screwfix" }), result({ stockCode: "C2" }), result({ exactMatch: "yes" }), result({ message: null }), result({ name: {} }), result({ manufacturer: [] }), result({ searchUrl: "javascript:alert(1)" }), result({ productUrl: "https://example.com/product" }), result({ productUrl: "http://www.cef.co.uk/product" }), result({ productUrl: "https://www.cef.co.uk:8443/product" }), result({ productUrl: "https://name:password@www.cef.co.uk/product" }), result({ productUrl: "https://www.cef.co.uk.evil.example/product" })]) assert.throws(() => lookup.supplierLookupResult(payload, "CEF", "C1"), /response/);
  for (const [supplier, url] of [["CEF", "https://cef.co.uk/search"], ["Screwfix", "https://www.screwfix.com/search"], ["TLC Direct", "https://www.tlc-direct.co.uk/Search"]]) {
    const payload = result({ supplier, searchUrl: url, productUrl: undefined, publicPrice: 300 }); const before = structuredClone(payload); const checked = lookup.supplierLookupResult(payload, supplier, "C1"); assert.equal(checked.searchUrl, url); assert.equal("publicPrice" in checked, false); assert.deepEqual(payload, before);
  }
});

test("a mismatched successful payload cannot become a visible product", async () => {
  const h = harness(); h.code("C1"); const pending = h.submit(); h.finish(0, result({ stockCode: "C2" })); await pending; assert.equal(h.result(), undefined); assert.match(text(h.render()), /does not match this lookup/); assert.equal(h.busy(), false);
});
