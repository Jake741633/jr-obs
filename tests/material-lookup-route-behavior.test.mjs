import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../app/api/materials/lookup/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const product = (patch = {}) => ({ "@type": "Product", sku: "C1", name: "Cable", brand: { name: "Maker" }, url: "/product/cable", ...patch });

function harness({ metadata, role = "office", active = true, supplierResponse } = {}) {
  const calls = [], timers = new Map();
  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    module: mod, exports: mod.exports, URL, AbortController,
    process: { env: { NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://auth.example.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-key" } },
    require(name) {
      assert.equal(name, "next/server");
      return { NextResponse: { json(value, options) { return Response.json(value, options); } } };
    },
    async fetch(url, init) {
      calls.push({ url, init });
      if (url === "https://auth.example.test/auth/v1/user") return Response.json({ id: "user-1" });
      if (url.startsWith("https://auth.example.test/rest/v1/profiles?")) return Response.json([{ role, active }]);
      assert.ok(url.startsWith("https://www.cef.co.uk/"), "No real network or unexpected supplier authority");
      return supplierResponse?.(url, init) ?? new Response(`<script type="application/ld+json">${JSON.stringify(metadata)}</script>`);
    },
    setTimeout(fn, ms) { const id = timers.size + 1; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return {
    calls, timers,
    async lookup({ origin = "https://app.example.test", authorization = "Bearer test-token" } = {}) {
      const headers = { "Content-Type": "application/json" };
      if (origin !== null) headers.Origin = origin;
      if (authorization !== null) headers.Authorization = authorization;
      return mod.exports.POST(new Request("https://app.example.test/api/materials/lookup", { method: "POST", headers, body: JSON.stringify({ supplier: "CEF", stockCode: "C1" }) }));
    },
  };
}

test("endpoint does not invent a zero or positive public price from absent or malformed supplier prices", async () => {
  for (const price of [undefined, null, "", " ", "Call for price", "-12.50", -12.5, "£12.50", "$12.50", "12,50", "1,234.50", "12.50 per pack", "1e3", "NaN", "Infinity", {}, [], 1_000_000.01]) {
    const h = harness({ metadata: product({ offers: { price } }) });
    const response = await h.lookup();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.exactMatch, true);
    assert.equal("publicPrice" in body, false, `must omit ${JSON.stringify(price)}`);
    assert.equal(h.timers.size, 0);
  }
  const body = await (await harness({ metadata: product() }).lookup()).json();
  assert.equal("publicPrice" in body, false, "missing offers does not imply a free product");
});

test("endpoint accepts a finite decimal price only in GBP or with no stated currency", async () => {
  for (const [price, priceCurrency, expected] of [[0, "GBP", 0], [12.5, "GBP", 12.5], ["12.50", "GBP", 12.5], [" 12.50 ", undefined, 12.5], [1_000_000, "GBP", 1_000_000]]) {
    const body = await (await harness({ metadata: product({ offers: { price, priceCurrency } }) }).lookup()).json();
    assert.equal(body.publicPrice, expected);
  }
  for (const priceCurrency of ["USD", "EUR", "", null, {}]) {
    const body = await (await harness({ metadata: product({ offers: { price: 12.5, priceCurrency } }) }).lookup()).json();
    assert.equal("publicPrice" in body, false, `must not assume GBP for ${JSON.stringify(priceCurrency)}`);
  }
});

test("endpoint omits public price on a suggested product without an exact submitted identifier", async () => {
  const body = await (await harness({ metadata: product({ sku: "C2", offers: { price: "12.50", priceCurrency: "GBP" } }) }).lookup()).json();
  assert.equal(body.exactMatch, false);
  assert.equal("publicPrice" in body, false);
});

test("exact identity can use any product identifier but must belong to the described product", async () => {
  const matching = product({ sku: "OTHER", mpn: "c 1", offers: { price: 12 } });
  const body = await (await harness({ metadata: [product({ sku: "C2", name: "Wrong product" }), matching] }).lookup()).json();
  assert.equal(body.exactMatch, true);
  assert.equal(body.name, "Cable");
  assert.equal(body.publicPrice, 12);
  const wrapped = await (await harness({ metadata: { "@type": "ListItem", sku: "C1", item: product({ sku: "C2", offers: { price: 99 } }) } }).lookup()).json();
  assert.equal(wrapped.exactMatch, false, "wrapper identifiers do not prove nested product identity");
  assert.equal("publicPrice" in wrapped, false);
});

test("supplier product URLs reject credentials, unexpected ports and parser-normalised input", async () => {
  for (const url of ["https://name:password@www.cef.co.uk/product", "https://@www.cef.co.uk/product", "https://www.cef.co.uk:8443/product", "https://www.cef.co.uk/pa\nth", "https://www.cef.co.uk\\product", "https://www.cef.co.uk/p%0a", "https://www.cef.co.uk/p%", "https://www.cef.co.uk/a b", "https://www.cef.co.uk.evil.test/product"]) {
    const body = await (await harness({ metadata: product({ url }) }).lookup()).json();
    assert.equal(body.productUrl, body.searchUrl, `unsafe product URL ${JSON.stringify(url)}`);
  }
  const body = await (await harness({ metadata: product() }).lookup()).json();
  assert.equal(body.productUrl, "https://www.cef.co.uk/product/cable");
});

test("unsafe supplier redirects are never followed and return search fallback", async () => {
  for (const location of ["https://name:password@www.cef.co.uk/product", "https://www.cef.co.uk:8443/product", "https://www.cef.co.uk\\product", "https://evil.test/product"]) {
    const h = harness({ supplierResponse: () => new Response(null, { status: 302, headers: { location } }) });
    const body = await (await h.lookup()).json();
    assert.equal(body.exactMatch, false);
    assert.equal(h.calls.length, 3, "authentication plus one supplier request only");
    assert.equal(h.timers.size, 0);
  }
});

test("authentication and same-origin rejection prevent supplier network access", async () => {
  for (const origin of ["https://other.example.test", null]) {
    const h = harness();
    assert.equal((await h.lookup({ origin })).status, 403);
    assert.equal(h.calls.length, 0);
  }
  const signedOut = harness();
  assert.equal((await signedOut.lookup({ authorization: null })).status, 401);
  assert.equal(signedOut.calls.length, 0);
  for (const options of [{ role: "customer" }, { active: false }]) {
    const h = harness(options);
    assert.equal((await h.lookup()).status, 403);
    assert.equal(h.calls.length, 2);
  }
});
