import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../app/api/materials/lookup/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const headers = { Origin: "https://app.example.test", Authorization: "Bearer fixture-token", "Content-Type": "application/json" };
function request(body = JSON.stringify({ supplier: "CEF", stockCode: "C1" }), options = {}) {
  return new Request("https://app.example.test/api/materials/lookup", { method: "POST", headers, body, duplex: "half", ...options });
}
function route(fetchImpl) {
  const timers = new Map(), scheduled = [], mod = { exports: {} };
  vm.runInNewContext(compiled, {
    module: mod, exports: mod.exports, URL, AbortController, TextDecoder,
    process: { env: { NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://auth.example.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-key" } },
    require(name) { assert.equal(name, "next/server"); return { NextResponse: { json: Response.json } }; },
    fetch: fetchImpl,
    setTimeout(fn, ms) { const id = Symbol(); timers.set(id, { fn, ms }); scheduled.push({ fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { handle: mod.exports.POST, timers, scheduled, expire() { for (const { fn } of [...timers.values()]) fn(); } };
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function settles(task) {
  let timer;
  try {
    const result = await Promise.race([task, new Promise(resolve => { timer = setTimeout(() => resolve(null), 500); })]);
    assert.ok(result, "the route must settle after cancellation or its deadline");
    return result;
  } finally { clearTimeout(timer); }
}
async function fixture(t, stalledStage, status = 200) {
  const calls = [], signals = []; let markStarted, markClosed;
  const started = new Promise(resolve => { markStarted = resolve; });
  const closed = new Promise(resolve => { markClosed = resolve; });
  const server = createServer((req, res) => {
    const phase = req.url.startsWith("/auth/") ? "auth" : req.url.startsWith("/rest/") ? "profile" : "supplier";
    calls.push(phase);
    if (stalledStage === `${phase}-headers`) { markStarted(); return; }
    res.writeHead(stalledStage === `${phase}-body` ? status : 200, { "Content-Type": phase === "supplier" ? "text/html" : "application/json" });
    if (stalledStage === `${phase}-body`) { res.on("close", () => markClosed(true)); res.write(phase === "supplier" ? "<html>" : "{"); markStarted(); return; }
    res.end(phase === "auth" ? '{"id":"fixture-user"}' : phase === "profile" ? '[{"role":"office","active":true}]' : '<script type="application/ld+json">{"@type":"Product","sku":"C1","name":"Cable"}</script>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const h = route((url, init) => {
    const target = new URL(url);
    assert.ok(["auth.example.test", "www.cef.co.uk", "www.screwfix.com", "www.tlc-direct.co.uk"].includes(target.hostname));
    signals.push(init.signal);
    // Only remap the fixture authority; native fetch owns cancellation and body reads.
    return fetch(`http://127.0.0.1:${server.address().port}${target.pathname}${target.search}`, init);
  });
  return { ...h, calls, signals, started, closed };
}

for (const stage of ["auth-headers", "auth-body", "profile-headers", "profile-body", "supplier-headers", "supplier-body"]) {
  test(`caller cancellation stops native ${stage} reads without a successful fallback`, async t => {
    const h = await fixture(t, stage), controller = new AbortController();
    const pending = h.handle(request(undefined, { signal: controller.signal }));
    await h.started; controller.abort();
    const response = await settles(pending);
    assert.equal(response.status, 499);
    assert.deepEqual(await response.json(), { error: "Supplier lookup cancelled." });
    assert.equal(h.calls.length, stage.startsWith("auth") ? 1 : stage.startsWith("profile") ? 2 : 3);
    assert.equal(h.timers.size, 0);
  });
  test(`one lookup deadline stops native ${stage} reads`, async t => {
    const h = await fixture(t, stage), pending = h.handle(request());
    await h.started; h.expire();
    const response = await settles(pending);
    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), { error: "Supplier lookup took too long. Try again." });
    assert.equal(h.calls.length, stage.startsWith("auth") ? 1 : stage.startsWith("profile") ? 2 : 3);
    assert.equal(h.timers.size, 0);
  });
}

test("an already abandoned lookup performs no authentication or supplier work", async () => {
  let calls = 0; const h = route(() => { calls++; throw new Error("must not fetch"); }), controller = new AbortController();
  controller.abort();
  assert.equal((await h.handle(request(undefined, { signal: controller.signal }))).status, 499);
  assert.equal(calls, 0); assert.equal(h.timers.size, 0);
});

test("the deadline also cancels a stalled incoming body before supplier work", async t => {
  const h = await fixture(t); let cancelled = false, bodyController;
  const body = new ReadableStream({ start(controller) { bodyController = controller; controller.enqueue(new TextEncoder().encode('{"supplier":')); }, cancel() { cancelled = true; } });
  t.after(() => { if (!cancelled) bodyController.close(); });
  const pending = h.handle(request(body));
  while (h.calls.length < 2) await delay(1);
  // Allow the completed profile response to advance to the incoming body read.
  await delay(10); h.expire();
  assert.equal((await settles(pending)).status, 504);
  assert.equal(cancelled, true); assert.deepEqual(h.calls, ["auth", "profile"]); assert.equal(h.timers.size, 0);
});

test("caller cancellation also cancels an incoming body that never finishes", async t => {
  const h = await fixture(t), controller = new AbortController(); let cancelled = false, bodyController;
  const body = new ReadableStream({ start(value) { bodyController = value; value.enqueue(new TextEncoder().encode('{"supplier":')); }, cancel() { cancelled = true; } });
  t.after(() => { if (!cancelled) bodyController.close(); });
  const pending = h.handle(request(body, { signal: controller.signal }));
  while (h.calls.length < 2) await delay(1);
  await delay(10); controller.abort();
  assert.equal((await settles(pending)).status, 499);
  assert.equal(cancelled, true); assert.deepEqual(h.calls, ["auth", "profile"]); assert.equal(h.timers.size, 0);
});

test("streaming lookup bodies over 2048 bytes are rejected before upload completion or supplier work", async t => {
  const h = await fixture(t); let cancelled = false, bodyController;
  const body = new ReadableStream({ start(controller) { bodyController = controller; controller.enqueue(new TextEncoder().encode('{"supplier":"CEF","stockCode":"C1","unused":"' + "x".repeat(2049))); }, cancel() { cancelled = true; } });
  t.after(() => { if (!cancelled) bodyController.close(); });
  const response = await settles(h.handle(request(body, { headers: { ...headers, "Content-Length": "1" } })));
  assert.equal(response.status, 413); assert.equal(cancelled, true);
  assert.deepEqual(h.calls, ["auth", "profile"]); assert.equal(h.timers.size, 0);
});

test("malformed, non-object and unexpected-field lookup bodies never reach suppliers", async t => {
  const h = await fixture(t);
  for (const body of ["{", "null", "[]", JSON.stringify({ supplier: "CEF", stockCode: "C1", unused: true })]) {
    assert.equal((await h.handle(request(body))).status, 400);
  }
  assert.ok(h.calls.every(phase => phase !== "supplier")); assert.equal(h.timers.size, 0);
});

test("the request byte boundary accepts complete JSON at 2048 bytes and rejects 2049", async t => {
  const h = await fixture(t), json = '{"supplier":"CEF","stockCode":"C1"}';
  assert.equal((await h.handle(request(json.padEnd(2048)))).status, 200);
  assert.equal((await h.handle(request(json.padEnd(2049)))).status, 413);
  assert.deepEqual(h.calls, ["auth", "profile", "supplier", "auth", "profile"]);
  assert.equal(h.timers.size, 0);
});

for (const [stage, status, expected] of [["auth-body", 401, 401], ["profile-body", 403, 401], ["supplier-body", 503, 200]]) {
  test(`an unused native ${stage} error body is closed before its deadline is retired`, async t => {
    const h = await fixture(t, stage, status);
    const response = await settles(h.handle(request()));
    assert.equal(response.status, expected);
    assert.equal(await Promise.race([h.closed, delay(500).then(() => false)]), true, "unused error bodies must not keep an upstream socket open");
    assert.equal(h.timers.size, 0);
  });
}

test("valid lookups across all suppliers share one deadline and retain exact product matching", async t => {
  const h = await fixture(t);
  for (const supplier of ["CEF", "Screwfix", "TLC Direct"]) {
    const response = await h.handle(request(JSON.stringify({ supplier, stockCode: "C1" })));
    assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.supplier, supplier); assert.equal(result.exactMatch, true); assert.equal(result.name, "Cable");
    assert.equal(h.timers.size, 0);
  }
  assert.equal(h.scheduled.length, 3, "one deadline per complete lookup, without restarting between phases");
  assert.ok(h.scheduled.every(timer => timer.ms === 15000));
  for (let i = 0; i < h.signals.length; i += 3) {
    assert.ok(h.signals[i] instanceof AbortSignal);
    assert.equal(h.signals[i + 1], h.signals[i]); assert.equal(h.signals[i + 2], h.signals[i]);
  }
});
