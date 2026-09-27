import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const client = await readFile(new URL("../lib/supabase/client.ts", import.meta.url), "utf8");
const cloudClient = await readFile(new URL("../lib/cloud/client.ts", import.meta.url), "utf8");
const unavailableMessage = "JR OS cloud service is unavailable. Check your connection and confirm the Supabase project is active, then try again.";

function loadRequestClassifier(fetchImpl = () => { throw new Error("Unexpected fetch"); }) {
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
    fetch: fetchImpl,
    process: { env: {} },
    require(specifier) {
      assert.equal(specifier, "./sessionOwnership-core.mjs");
      return { supabaseSessionFingerprint: () => null };
    },
  });

  return commonJsModule.exports;
}

function loadCloudClient(fetchImpl) {
  const supabase = loadRequestClassifier(fetchImpl);
  const session = {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "user-a", email: "engineer@example.com" },
  };
  const sessionSaves = [];
  const output = ts.transpileModule(cloudClient, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const commonJsModule = { exports: {} };

  vm.runInNewContext(output, {
    exports: commonJsModule.exports,
    module: commonJsModule,
    fetch: fetchImpl,
    Headers,
    require(specifier) {
      if (specifier === "./config") {
        return {
          cloudConfig: { url: "https://project.supabase.co", anonKey: "anon-key", isConfigured: true, mode: "cloud" },
          cloudStorageBucket: "jr-os-private",
        };
      }
      if (specifier === "../supabase/client") {
        return {
          ...supabase,
          captureSupabaseSessionOwnership: () => ({ session, epoch: "epoch-a" }),
          readSupabaseSession: () => session,
          readSupabaseSessionOwnershipEpoch: () => "epoch-a",
          saveSupabaseSession: (value) => sessionSaves.push(value),
        };
      }
      if (specifier === "../supabase/sessionOwnership-core.mjs") {
        return { sameSupabaseSessionOwnership: () => true };
      }
      throw new Error(`Unexpected module: ${specifier}`);
    },
  });

  return { cloud: commonJsModule.exports, supabase, sessionSaves };
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

test("collection and private download fetch failures share the actionable network error", async () => {
  const { cloud, supabase, sessionSaves } = loadCloudClient(async () => {
    throw new TypeError("Load failed");
  });

  for (const operation of [
    () => cloud.cloudSelect("jobs"),
    () => cloud.downloadPrivateObject("organisation-a/job-a/file.pdf"),
  ]) {
    await assert.rejects(operation, (error) => {
      assert.ok(error instanceof supabase.SupabaseRequestError);
      assert.equal(error.kind, "network");
      assert.equal(error.message, unavailableMessage);
      assert.notEqual(error.message, "Load failed");
      return true;
    });
  }
  assert.deepEqual(sessionSaves, []);
});

test("fresh collection reads bypass browser caches without changing normal reads", async () => {
  const requests = [];
  const { cloud } = loadCloudClient(async (url, init) => {
    requests.push({ url, init });
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  });

  await cloud.cloudSelectFresh("customer_portal_payment_links", "select=payload&source_id=eq.link-a");
  await cloud.cloudSelect("jobs", "select=source_id");

  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "https://project.supabase.co/rest/v1/customer_portal_payment_links?select=payload&source_id=eq.link-a");
  assert.equal(requests[0].init.method, "GET");
  assert.equal(requests[0].init.cache, "no-store");
  assert.equal(requests[0].init.headers.has("Cache-Control"), false);
  assert.equal(requests[0].init.headers.has("Pragma"), false);
  assert.equal(requests[0].init.headers.get("Authorization"), "Bearer access-token");
  assert.equal(requests[1].url, "https://project.supabase.co/rest/v1/jobs?select=source_id");
  assert.equal(requests[1].init.cache, undefined);
  assert.equal(requests[1].init.headers.has("Cache-Control"), false);
  assert.equal(requests[1].init.headers.get("Authorization"), "Bearer access-token");
});

test("cloud HTTP conflicts retain their status code and PostgREST detail", async () => {
  const { cloud } = loadCloudClient(async () => new Response(JSON.stringify({
    code: "PT409",
    message: "Version conflict",
    details: "Expected version 3",
    hint: "Reload the record",
  }), { status: 409, headers: { "Content-Type": "application/json" } }));

  await assert.rejects(() => cloud.cloudSelect("jobs"), (error) => {
    assert.ok(error instanceof cloud.CloudRequestError);
    assert.equal(error.status, 409);
    assert.equal(error.code, "PT409");
    assert.equal(error.message, "Version conflict");
    assert.equal(error.details, "Expected version 3");
    assert.equal(error.hint, "Reload the record");
    assert.equal(cloud.isCloudConflictError(error), true);
    return true;
  });
});

test("private download HTTP failures retain server text and fallback status", async () => {
  const denied = loadCloudClient(async () => new Response("Private file access denied", { status: 403 })).cloud;
  await assert.rejects(() => denied.downloadPrivateObject("organisation-a/job-a/file.pdf"), /Private file access denied/);

  const unavailable = loadCloudClient(async () => new Response("", { status: 503 })).cloud;
  await assert.rejects(() => unavailable.downloadPrivateObject("organisation-a/job-a/file.pdf"), /Private file download failed \(503\)\./);
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
