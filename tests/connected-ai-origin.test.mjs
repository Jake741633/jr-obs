import assert from "node:assert/strict";
import test from "node:test";
import { createQuoteScopeHandler } from "../lib/server/quoteScope.mjs";

test("rejected AI origins provide a bounded diagnostic without exposing headers or source data", async () => {
  let calls = 0;
  const handler = createQuoteScopeHandler({ env: {}, fetchImpl: async () => { calls++; throw new Error("Unexpected network call"); } });
  for (const [origin, expected] of [[null, "missing"], ["https://elsewhere.test", "host"], ["http://jr.example", "scheme"], ["null", "malformed"], ["https://jr.example/path", "malformed"]]) {
    const response = await handler(new Request("https://jr.example/api/ai/quote-scope", {
      method: "POST", headers: origin === null ? {} : { origin }, body: "private-source-sentinel",
    }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("x-jr-origin-check"), expected);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const payload = await response.text();
    assert.ok(!payload.includes("private-source-sentinel") && !payload.includes("elsewhere.test"));
  }
  assert.equal(calls, 0);
  const accepted = await handler(new Request("https://jr.example/api/ai/quote-scope", { method: "POST", headers: { origin: "https://jr.example" } }));
  assert.equal(accepted.status, 401);
  assert.equal(accepted.headers.get("x-jr-origin-check"), null);
});
