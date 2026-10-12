import assert from "node:assert/strict";
import test from "node:test";
import { createQuoteScopeHandler } from "../lib/server/quoteScope.mjs";
import { parseQuoteScope, quoteScopeNotes } from "../lib/connectedQuoteScope.mjs";

const scope = { title: "Kitchen electrical work", summary: "Customer requests two sockets.", scope: ["Confirm locations for two requested sockets."], questions: ["Confirm the cable route and existing circuit condition."], exclusions: ["Heating-controls wiring is excluded."] };
const env = { OPENAI_API_KEY: "secret-sentinel", JR_OS_AI_ORGANISATION_ID: "org-1", NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key" };
const result = () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(scope) }] }] });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function request(body = { operation: "draft", notes: "Customer asks for two new kitchen sockets.", consent: true }, options = {}) {
  return new Request("https://jr.example/api/ai/quote-scope", { method: "POST", headers: { origin: "https://jr.example", authorization: "Bearer user-token", "x-jr-organisation": "org-1", "content-type": "application/json", ...options.headers }, body: JSON.stringify(body) });
}
function harness(config = {}) {
  const calls = []; let profile = { id: "user-1", organisation_id: "org-1", role: "owner", active: true }, timestamp = 0;
  const handler = createQuoteScopeHandler({ env: { ...env, ...config.env }, now: () => timestamp, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/auth/v1/user")) return json({ id: "user-1" });
    if (url.includes("/rest/v1/profiles?")) return json(config.profiles ?? [profile]);
    assert.equal(url, "https://api.openai.com/v1/responses");
    return config.provider ? config.provider() : json(result());
  } });
  return { handler, calls, profile, advance: ms => { timestamp += ms; }, providerCalls: () => calls.filter(x => x.url.includes("api.openai.com")) };
}

test("connected AI refuses cross-origin, unauthenticated and wrong-company requests before paid work", async () => {
  for (const [headers, status] of [[{ origin: "https://elsewhere.test" }, 403], [{ origin: "" }, 403], [{ authorization: "" }, 401], [{ "x-jr-organisation": "org-other" }, 403]]) {
    const h = harness(), response = await h.handler(request(undefined, { headers }));
    assert.equal(response.status, status); assert.equal(h.providerCalls().length, 0);
  }
});
test("active office membership and exact verified user/company are required", async () => {
  for (const patch of [{ role: "electrician" }, { role: "customer" }, { role: "other" }, { active: false }, { active: "true" }, { organisation_id: "org-other" }, { id: "wrong-user" }]) {
    const h = harness(); Object.assign(h.profile, patch);
    assert.equal((await h.handler(request())).status, 403); assert.equal(h.providerCalls().length, 0);
  }
  const duplicate = harness({ profiles: [{ id: "user-1", organisation_id: "org-1", role: "owner", active: true }, { id: "user-1", organisation_id: "org-1", role: "owner", active: true }] });
  assert.equal((await duplicate.handler(request())).status, 403);
});
test("configuration check makes no paid call and requires the server business allowlist", async () => {
  const h = harness(); const response = await h.handler(request({ operation: "status" }));
  assert.equal(response.status, 200); assert.equal((await response.json()).configured, true); assert.equal(h.providerCalls().length, 0);
  for (const missing of ["OPENAI_API_KEY", "JR_OS_AI_ORGANISATION_ID", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
    const absent = harness({ env: { [missing]: "" } }), rejected = await absent.handler(request());
    assert.equal(rejected.status, 503); assert.equal(absent.providerCalls().length, 0);
  }
});
test("chosen notes and JPEG produce a validated unpriced draft with no external tools or stored response", async () => {
  for (const role of ["owner", "admin", "office"]) {
    const h = harness(); h.profile.role = role;
    const response = await h.handler(request({ operation: "draft", notes: "Two sockets", consent: true, photo: "data:image/jpeg;base64,/9j/2Q==" }));
    assert.equal(response.status, 200); const actual = await response.json(); assert.deepEqual(actual.draft, scope);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const sent = JSON.parse(h.providerCalls()[0].init.body);
    assert.equal(sent.store, false); assert.equal(sent.tools, undefined); assert.equal(sent.text.format.strict, true);
    assert.deepEqual(sent.input[0].content, [{ type: "input_text", text: "Two sockets" }, { type: "input_image", image_url: "data:image/jpeg;base64,/9j/2Q==", detail: "auto" }]);
    assert.ok(!JSON.stringify(actual).includes("secret-sentinel")); assert.equal(h.calls.filter(x => x.url.includes("profiles?")).length, 3);
  }
});
test("empty, unconsented, oversized and remote-photo inputs are rejected without provider requests", async () => {
  for (const body of [{ operation: "draft", notes: "" }, { operation: "draft", notes: "two sockets", consent: false }, { operation: "draft", notes: "x".repeat(12001), consent: true }, { operation: "draft", notes: "two sockets", consent: true, photo: "https://internal.test/photo.jpg" }, { operation: "draft", notes: "two sockets", consent: true, photo: "data:image/jpeg;base64,YWJj" }, { operation: "draft", notes: "two sockets", consent: true, photo: "data:image/png;base64,/9j/2Q==" }, { operation: "draft", notes: "two sockets", consent: true, unknown: true }, []]) {
    const h = harness(); assert.equal((await h.handler(request(body))).status, 400); assert.equal(h.providerCalls().length, 0);
  }
  const h = harness(); assert.equal((await h.handler(request({ operation: "draft", notes: "x".repeat(2100001), consent: true }, { headers: { "content-length": "1" } }))).status, 413); assert.equal(h.providerCalls().length, 0);
});
test("quota, temporary limits, invalid credentials and provider failures return safe distinct errors", async () => {
  for (const [status, code, expectedStatus, expectedCode] of [[429, "credit_balance_exhausted", 402, "billing_required"], [429, "insufficient_quota", 402, "billing_required"], [429, "rate_limit_exceeded", 429, "rate_limited"], [401, "invalid_api_key", 503, "connection_failed"], [404, "model_not_found", 503, "connection_failed"], [500, "internal_error", 503, "provider_unavailable"]]) {
    const h = harness({ provider: () => json({ error: { code, message: "secret-sentinel and personal source content" } }, status) });
    const response = await h.handler(request()), actual = await response.json();
    assert.equal(response.status, expectedStatus); assert.equal(actual.code, expectedCode); assert.ok(!JSON.stringify(actual).includes("secret-sentinel")); assert.equal(h.providerCalls().length, 1);
  }
});
test("refusals, incomplete output, malformed structure and excessive provider responses fail closed", async () => {
  for (const payload of [{ ...result(), status: "incomplete" }, { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "Cannot help" }] }] }, { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }] }, { padding: "x".repeat(100001) }]) {
    const h = harness({ provider: () => json(payload) }); assert.equal((await h.handler(request())).status, 502);
  }
  assert.equal(parseQuoteScope({ ...scope, price: 200 }), null);
  assert.equal(parseQuoteScope({ ...scope, scope: ["x".repeat(501)] }), null);
  assert.match(quoteScopeNotes(scope), /Questions to confirm/);
});
test("membership revoked while generating cannot receive a completed draft", async () => {
  const h = harness({ provider: () => { h.profile.active = false; return json(result()); } });
  assert.equal((await h.handler(request())).status, 403);
});
test("membership changes during a slow upload prevent any paid request", async () => {
  for (const patch of [{ active: false }, { organisation_id: "org-other" }, { role: "office" }]) {
    const h = harness(); let upload;
    const stream = new ReadableStream({ start(controller) { upload = controller; } });
    const original = request();
    const pending = h.handler(new Request(original.url, { method: "POST", headers: original.headers, body: stream, duplex: "half" }));
    while (h.calls.length < 2) await new Promise(resolve => setImmediate(resolve));
    Object.assign(h.profile, patch);
    upload.enqueue(new TextEncoder().encode(JSON.stringify({ operation: "draft", notes: "Two sockets", consent: true })));
    upload.close();
    assert.equal((await pending).status, 403); assert.equal(h.providerCalls().length, 0);
  }
});
test("duplicate requests cannot overlap and a short burst has a bounded number of paid starts", async () => {
  let release; const h = harness({ provider: () => new Promise(resolve => { release = () => resolve(json(result())); }) });
  const first = h.handler(request()); while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await h.handler(request())).status, 429); assert.equal(h.providerCalls().length, 1); release(); await first;
  const burst = harness(); for (let index = 0; index < 4; index++) assert.equal((await burst.handler(request())).status, 200);
  assert.equal((await burst.handler(request())).status, 429); assert.equal(burst.providerCalls().length, 4);
  burst.advance(60001); assert.equal((await burst.handler(request())).status, 200);
});
