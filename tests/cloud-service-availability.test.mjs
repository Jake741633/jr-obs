import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const client = await readFile(new URL("../lib/supabase/client.ts", import.meta.url), "utf8");

function loadRequestClassifier() {
  const output = ts.transpileModule(client, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const commonJsModule = { exports: {} };

  vm.runInNewContext(output, {
    exports: commonJsModule.exports,
    module: commonJsModule,
    process: { env: {} },
    require(specifier) {
      assert.equal(specifier, "./sessionOwnership-core.mjs");
      return { supabaseSessionFingerprint: () => null };
    },
  });

  return commonJsModule.exports;
}

test("unreachable Supabase requests produce an actionable cloud-service error", () => {
  assert.match(
    client,
    /const cloudServiceUnavailableMessage = "JR OS cloud service is unavailable\. Check your connection and confirm the Supabase project is active, then try again\.";/,
  );
  assert.match(
    client,
    /let response: Response;\s*try \{\s*response = await fetch\([\s\S]*?\);\s*\} catch \{\s*throw new SupabaseRequestError\("network", cloudServiceUnavailableMessage\);\s*\}/,
  );
});

test("HTTP responses still retain Supabase's specific error message", () => {
  const networkErrorBoundary = client.indexOf('throw new SupabaseRequestError("network", cloudServiceUnavailableMessage);');
  const responseParsing = client.indexOf("const body = response.status === 204");
  const apiErrorMessage = client.indexOf("body?.msg || body?.message || body?.error_description || body?.error");

  assert.ok(networkErrorBoundary !== -1 && networkErrorBoundary < responseParsing);
  assert.ok(responseParsing !== -1 && responseParsing < apiErrorMessage);
});

test("configuration and session checks still run before network access", () => {
  const fetchSource = client.slice(client.indexOf("export async function supabaseFetch"));
  const configurationCheck = fetchSource.indexOf('if (!config) throw new Error("Supabase is not configured yet.");');
  const sessionCheck = fetchSource.indexOf("const session = readSupabaseSession();");
  const networkRequest = fetchSource.indexOf("response = await fetch(");

  assert.ok(configurationCheck !== -1 && configurationCheck < sessionCheck);
  assert.ok(sessionCheck < networkRequest);
});

test("only definitive Supabase authentication failures invalidate a stored session", () => {
  const { SupabaseRequestError, supabaseRequestInvalidatesSession } = loadRequestClassifier();
  const requestError = (kind, status, code) => new SupabaseRequestError(kind, "original message", { status, code });

  for (const error of [
    requestError("network"),
    requestError("http", 403),
    requestError("http", 408),
    requestError("http", 422),
    requestError("http", 429),
    requestError("http", 503),
    requestError("http", 401, "captcha_failed"),
    new Error("unclassified"),
  ]) {
    assert.equal(supabaseRequestInvalidatesSession(error), false);
  }

  for (const code of [
    "bad_jwt",
    "invalid_credentials",
    "no_authorization",
    "session_expired",
    "session_not_found",
    "unexpected_audience",
    "user_banned",
    "user_not_found",
  ]) {
    assert.equal(supabaseRequestInvalidatesSession(requestError("http", 400, code)), true);
  }

  assert.equal(supabaseRequestInvalidatesSession(requestError("http", 401)), true);
  assert.equal(requestError("http", 503).message, "original message");
});

test("HTTP request errors retain response status, auth code and message precedence", () => {
  assert.match(client, /const message = body\?\.msg \|\| body\?\.message \|\| body\?\.error_description \|\| body\?\.error \|\| "Cloud request failed\.";/);
  assert.match(client, /const code = typeof body\?\.code === "string"[\s\S]*typeof body\?\.error_code === "string"/);
  assert.match(client, /new SupabaseRequestError\("http", message, \{ status: response\.status, code \}\)/);
});
