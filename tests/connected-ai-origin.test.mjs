import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
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
    assert.equal(response.headers.get("x-jr-origin-expected"), null);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const payload = await response.text();
    assert.ok(!payload.includes("private-source-sentinel") && !payload.includes("elsewhere.test"));
  }
  assert.equal(calls, 0);
  const accepted = await handler(new Request("https://jr.example/api/ai/quote-scope", { method: "POST", headers: { origin: "https://jr.example" } }));
  assert.equal(accepted.status, 401);
  assert.equal(accepted.headers.get("x-jr-origin-check"), null);
});

const deployment = { url: "https://build-id--jr.netlify.app", alias: "https://deploy-preview-1--jr.netlify.app" };
test("a build's exact preview alias can reach authentication after Netlify rewrites to its immutable URL", async () => {
  let calls = 0;
  const handler = createQuoteScopeHandler({ env: {}, deployment, fetchImpl: async () => { calls++; throw new Error("Unexpected network call"); } });
  for (const [url, origin, status] of [[deployment.url, deployment.alias, 401], [deployment.url, deployment.url, 401], [deployment.alias, deployment.alias, 401], [deployment.url, "https://deploy-preview-2--jr.netlify.app", 403], [deployment.url, "https://jr.netlify.app", 403], [deployment.url, "https://other.netlify.app", 403], [deployment.url, "http://deploy-preview-1--jr.netlify.app", 403], ["https://unrelated.example", deployment.alias, 403]]) {
    const response = await handler(new Request(url + "/api/ai/quote-scope", { method: "POST", headers: { origin } }));
    assert.equal(response.status, status, `${origin} -> ${url}`);
  }
  assert.equal(calls, 0);
});

test("request headers and malformed or partial deployment settings cannot grant alias access", async () => {
  for (const configured of [{}, { url: deployment.url }, { alias: deployment.alias }, { ...deployment, url: "https://build-id--jr.netlify.app/path" }, { ...deployment, alias: "https://user:secret@deploy-preview-1--jr.netlify.app" }, { ...deployment, alias: deployment.alias + "?extra=1" }, { ...deployment, alias: "http://deploy-preview-1--jr.netlify.app" }]) {
    const handler = createQuoteScopeHandler({ env: {}, deployment: configured });
    const response = await handler(new Request(deployment.url + "/api/ai/quote-scope", { method: "POST", headers: { origin: deployment.alias, host: "deploy-preview-1--jr.netlify.app", "x-forwarded-host": "deploy-preview-1--jr.netlify.app", "x-forwarded-proto": "https" } }));
    assert.equal(response.status, 403);
  }
});

test("Netlify builds capture only public deployment URLs; local builds have no hosting alias", () => {
  const code = ts.transpileModule(readFileSync(new URL("../next.config.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const hosted of [true, false]) {
    const mod = { exports: {} };
    vm.runInNewContext(code, { module: mod, exports: mod.exports, process: { env: { NETLIFY: hosted ? "true" : "false", DEPLOY_URL: deployment.url, DEPLOY_PRIME_URL: deployment.alias, OPENAI_API_KEY: "private-key-sentinel" } } });
    const values = mod.exports.default.env;
    assert.deepEqual(JSON.parse(JSON.stringify(values)), { JR_OS_DEPLOY_URL: hosted ? deployment.url : "", JR_OS_DEPLOY_PRIME_URL: hosted ? deployment.alias : "" });
    assert.ok(!JSON.stringify(values).includes("private-key-sentinel"));
  }
});
