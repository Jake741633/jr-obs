import assert from "node:assert/strict";
import test from "node:test";
import { cloudTransportHarness, jwt, tracked, waitFor } from "./helpers/cloud-transport-harness.mjs";

async function networkFailure(h, work) {
  await waitFor(() => work.state !== "pending", "transport deadline");
  assert.equal(work.state, "rejected");
  assert.ok(work.error instanceof h.session.SupabaseRequestError);
  assert.equal(work.error.kind, "network");
  assert.equal(h.session.supabaseRequestInvalidatesSession(work.error), false);
  assert.equal(work.error.message, h.session.cloudServiceUnavailableMessage);
  await waitFor(() => h.exchanges.every((entry) => entry.closed), "native response socket closure");
  assert.equal(h.timers.size, 0); assert.equal(h.baselineListeners(), 0);
}

for (const mode of ["headers", "body", "errorbody"]) test(`native ${mode} responses have an end-to-end JSON deadline`, async (t) => {
  const h = await cloudTransportHarness(t); const work = tracked(h.client.cloudSelect(mode));
  await networkFailure(h, work); assert.deepEqual(h.deadlineCalls, [30_000]);
  assert.ok(h.session.readSupabaseSession());
});

test("supabase authorization checks also abort stalled native response bodies", async (t) => {
  const h = await cloudTransportHarness(t); h.route("/rest/v1/profiles", (req, res) => h.hold(req, res));
  const work = tracked(h.repository.revalidateSyncAuthorization(h.identity));
  await waitFor(() => work.state !== "pending", "authorization deadline");
  assert.equal(work.value, false); await waitFor(() => h.exchanges[0]?.closed, "profile socket closure");
  assert.deepEqual(h.deadlineCalls, [30_000]); assert.equal(h.timers.size, 0); assert.equal(h.baselineListeners(), 0);
});

for (const stage of ["profiles", "private_files"]) test(`caller retirement aborts the private upload ${stage} stage and retains bytes`, async (t) => {
  const h = await cloudTransportHarness(t, { deadlineMs: 1000 }); const first = h.queue();
  h.route(`/rest/v1/${stage}`, (req, res) => h.hold(req, res));
  const controller = new AbortController();
  const work = tracked(h.files.flushPrivateFileUploadQueue(h.identity, first.storageKey, () => { throw Error("Cancelled upload cannot confirm"); }, controller.signal));
  await waitFor(() => h.exchanges.length === 1, "upload authorization/metadata body"); controller.abort();
  await waitFor(() => work.state !== "pending" && h.exchanges[0].closed, "cancelled upload stage");
  const retained = h.files.readPrivateUploadQueue(h.identity);
  assert.equal(retained.length, 1); assert.equal(retained[0].id, first.id); assert.equal(retained[0].dataUrl, first.dataUrl);
  assert.equal(h.timers.size, 0); assert.equal(h.baselineListeners(), 0);
});

for (const kind of ["upload", "download"]) test(`private ${kind} uses its own complete-body deadline`, async (t) => {
  const h = await cloudTransportHarness(t);
  const path = kind === "upload" ? "/storage/v1/object/private/org-a/file.txt" : "/storage/v1/object/authenticated/private/org-a/file.txt";
  h.route(path, (req, res) => h.hold(req, res, kind === "download" ? "blob" : "json"));
  const work = tracked(kind === "upload" ? h.client.uploadPrivateObject("org-a/file.txt", new Blob(["x"]), "text/plain") : h.client.downloadPrivateObject("org-a/file.txt"));
  await networkFailure(h, work); assert.deepEqual(h.deadlineCalls, [kind === "upload" ? 120_000 : 60_000]);
  assert.deepEqual(h.created, []);
});

test("a private download error body is also deadline-bound without disclosing partial text", async (t) => {
  const h = await cloudTransportHarness(t);
  h.route("/storage/v1/object/authenticated/private/org-a/file.txt", (req, res) => h.hold(req, res, "json", 403));
  await networkFailure(h, tracked(h.client.downloadPrivateObject("org-a/file.txt")));
  assert.deepEqual(h.deadlineCalls, [60_000]);
});

test("caller abort closes the actual response body and removes every listener and timer", async (t) => {
  const h = await cloudTransportHarness(t, { deadlineMs: 1000 }); const controller = new AbortController();
  let activeCallerListeners = 0;
  const add = controller.signal.addEventListener.bind(controller.signal), remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = (...args) => { activeCallerListeners += 1; return add(...args); };
  controller.signal.removeEventListener = (...args) => { activeCallerListeners -= 1; return remove(...args); };
  const work = tracked(h.client.cloudSelect("body", "select=*", controller.signal));
  await waitFor(() => h.exchanges.length === 1, "native body"); controller.abort(); await networkFailure(h, work);
  assert.equal(activeCallerListeners, 0);
  const before = h.requests.length;
  const alreadyAborted = tracked(h.client.cloudSelect("body", "select=*", controller.signal));
  await networkFailure(h, alreadyAborted); assert.equal(h.requests.length, before);
});

test("session retirement cancels a native in-flight body without exposing response bytes", async (t) => {
  const h = await cloudTransportHarness(t, { deadlineMs: 1000 }); const work = tracked(h.client.cloudSelect("body"));
  await waitFor(() => h.exchanges.length === 1, "native body"); h.retire(); await networkFailure(h, work);
});

for (const client of ["cloud", "supabase"]) test(`completed ${client} HTTP error is not definitive after silent ownership retirement`, async (t) => {
  const h = await cloudTransportHarness(t, { deadlineMs: 1000 });
  h.route("/rest/v1/retired_error", (req, res) => h.hold(req, res, "json", 401));
  const work = tracked(client === "cloud" ? h.client.cloudSelect("retired_error") : h.session.supabaseFetch("/rest/v1/retired_error"));
  await waitFor(() => h.exchanges.length === 1, "old-owner error response");
  const replacement = h.stored(jwt("replacement")); h.session.saveSupabaseSession(replacement);
  h.exchanges[0].res.end("]");
  await networkFailure(h, work); assert.equal(h.session.readSupabaseSession().access_token, replacement.access_token);
});

test("captured logout revokes its original credential independently of replacement browser ownership", async (t) => {
  const h = await cloudTransportHarness(t, { deadlineMs: 1000 }); const ownership = h.session.captureSupabaseSessionOwnership();
  h.route("/auth/v1/logout", (req, res) => h.hold(req, res));
  h.publish({ ...h.stored(jwt("replacement-b", "user-b")), user: { id: "user-b" } });
  const work = tracked(h.loadCloudSync().signOutCloudUser(ownership));
  await waitFor(() => h.exchanges.length === 1, "captured logout response");
  const replacement = { ...h.stored(jwt("replacement-c", "user-c")), user: { id: "user-c" } }; h.publish(replacement);
  h.exchanges[0].res.end("]"); await work.done;
  assert.equal(work.state, "fulfilled");
  assert.equal(h.requests[0].headers.authorization, `Bearer ${ownership.session.access_token}`);
  assert.equal(h.session.readSupabaseSession().access_token, replacement.access_token);
  assert.equal(h.timers.size, 0); assert.equal(h.baselineListeners(), 0);
});

test("same-user sign-in with a different session id retires an existing request", async (t) => {
  const h = await cloudTransportHarness(t, { deadlineMs: 1000 }); const work = tracked(h.client.cloudSelect("body"));
  await waitFor(() => h.exchanges.length === 1, "native body"); h.publish(h.stored(jwt("another-sign-in"))); await networkFailure(h, work);
});

test("token refresh retires the old exact owner and a fresh request succeeds", async (t) => {
  const h = await cloudTransportHarness(t, { deadlineMs: 1000 }); const work = tracked(h.client.cloudSelect("body"));
  await waitFor(() => h.exchanges.length === 1, "native body"); h.publish(h.stored(jwt("session-a", "user-a", "refreshed")));
  await networkFailure(h, work);
  assert.deepEqual(JSON.parse(JSON.stringify(await h.client.cloudSelect("normal"))), []);
  assert.equal(h.timers.size, 0); assert.equal(h.baselineListeners(), 0);
});

test("observed cross-tab sign-out retires a request even after same-user session restoration", async (t) => {
  const h = await cloudTransportHarness(t, { deadlineMs: 1000 }); const work = tracked(h.client.cloudSelect("body"));
  await waitFor(() => h.exchanges.length === 1, "native body");
  h.session.saveSupabaseSession(null); h.session.saveSupabaseSession(h.stored(jwt("session-a", "user-a", "later")));
  h.storageEvent(null); await networkFailure(h, work);
});

test("normal JSON, 204, HTTP conflicts, and auth refresh keep their contracts and clear deadlines", async (t) => {
  const h = await cloudTransportHarness(t);
  h.route("/rest/v1/conflict", (_req, res) => h.json(res, { code: "PT409", message: "Version conflict", details: "Expected 3" }, 409));
  h.route("/rest/v1/empty", (_req, res) => { res.writeHead(204); res.end(); });
  h.route("/rest/v1/auth_error", (_req, res) => h.json(res, { message: "Invalid JWT", code: "bad_jwt" }, 401));
  h.route("/rest/v1/invalid_json", (_req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end("invalid"); });
  h.route("/auth/v1/token", (_req, res) => h.json(res, { access_token: jwt("session-a", "user-a", "refreshed"), refresh_token: "next", expires_in: 3600, user: { id: "user-a" } }));
  assert.deepEqual(JSON.parse(JSON.stringify(await h.client.cloudSelect("normal"))), []);
  assert.equal(await h.client.cloudDelete("empty", "record"), undefined);
  await assert.rejects(() => h.client.cloudSelect("conflict"), (error) => error instanceof h.client.CloudRequestError && h.client.isCloudConflictError(error) && error.details === "Expected 3");
  await assert.rejects(() => h.session.supabaseFetch("/rest/v1/auth_error"), (error) => error instanceof h.session.SupabaseRequestError && error.kind === "http" && error.status === 401 && error.code === "bad_jwt");
  assert.equal(await h.session.supabaseFetch("/rest/v1/invalid_json"), null);
  const refreshed = await h.client.refreshSession(); assert.equal(refreshed.accessToken, h.session.readSupabaseSession().access_token);
  assert.equal(h.timers.size, 0); assert.equal(h.baselineListeners(), 0); assert.ok(h.deadlineCalls.every((ms) => ms === 30_000));
});

test("upsert retains its existing conflict-columns argument when a signal is supplied", async (t) => {
  const h = await cloudTransportHarness(t); const controller = new AbortController();
  await h.client.cloudUpsert("normal", [{ id: "record" }], "organisation_id,collection_key,source_id", controller.signal);
  assert.match(h.requests[0].path, /on_conflict=organisation_id%2Ccollection_key%2Csource_id/);
  assert.equal(h.timers.size, 0); assert.equal(h.baselineListeners(), 0);
});

test("explicit auth refresh still rejects an exact ownership change", async (t) => {
  const h = await cloudTransportHarness(t, { deadlineMs: 1000 }); h.route("/auth/v1/token", (req, res) => h.hold(req, res));
  const work = tracked(h.client.refreshSession()); await waitFor(() => h.exchanges.length === 1, "auth body");
  const replacement = h.stored(jwt("session-a", "user-a", "other-refresh")); h.publish(replacement);
  await networkFailure(h, work); assert.equal(h.session.readSupabaseSession().access_token, replacement.access_token);
});

test("collection hook cleanup aborts native I/O and cannot publish its retired load", async (t) => {
  const h = await cloudTransportHarness(t, { deadlineMs: 1000 }); h.route("/rest/v1/customers", (req, res) => h.hold(req, res));
  h.loadStorage().useCloudLocalCollection("jr-os-customers"); h.effects();
  await waitFor(() => h.exchanges.length === 1, "collection body"); h.cleanup();
  await waitFor(() => h.exchanges[0].closed, "retired collection socket");
  assert.equal(h.timers.size, 0); assert.equal(h.baselineListeners(), 0);
});

test("download bridge cleanup aborts its blob stream before creating or hydrating a URL", async (t) => {
  const h = await cloudTransportHarness(t, { deadlineMs: 1000 }); h.route("/storage/v1/object/authenticated/private/org-a/file.txt", (req, res) => h.hold(req, res, "blob"));
  h.files.usePrivateFileCollectionBridge({ storageKey: "jr-os-job-documents", items: [{ id: "doc", privateStoragePath: "org-a/file.txt" }], updateItem() { throw Error("Unexpected mutation"); }, isReady: true, identity: h.identity, mode: "cloud" }); h.effects();
  await waitFor(() => h.exchanges.length === 1, "download body"); h.cleanup();
  await waitFor(() => h.exchanges[0].closed, "retired download socket");
  assert.deepEqual(h.created, []); assert.deepEqual(h.revoked, []); assert.equal(h.timers.size, 0);
});

test("abandoning one upload releases serialization and a subsequent attempt preserves replay identity", async (t) => {
  const h = await cloudTransportHarness(t, { deadlineMs: 1000 }); const first = h.queue(); let attempts = 0;
  const path = "/storage/v1/object/private/" + first.objectPath;
  h.route(path, (req, res) => { attempts += 1; if (attempts === 1) return h.hold(req, res); h.json(res, {}); });
  const controller = new AbortController(); let confirmations = 0;
  const abandoned = tracked(h.files.flushPrivateFileUploadQueue(h.identity, first.storageKey, () => { confirmations += 1; }, controller.signal));
  await waitFor(() => h.exchanges.length === 1, "upload body");
  const next = tracked(h.files.flushPrivateFileUploadQueue(h.identity, first.storageKey, () => { confirmations += 1; }));
  controller.abort(); await waitFor(() => abandoned.state !== "pending" && next.state !== "pending", "replacement upload completion");
  await waitFor(() => h.exchanges[0].closed, "aborted upload socket");
  assert.equal(attempts, 2); assert.equal(confirmations, 1);
  assert.equal(h.files.readPrivateUploadQueue(h.identity).length, 0);
  const posted = h.requests.filter((req) => req.path.startsWith("/storage/v1/object/private/"));
  assert.equal(posted[0].path, posted[1].path); assert.equal(posted[0].headers["x-upsert"], "true");
  assert.equal(h.timers.size, 0); assert.equal(h.baselineListeners(), 0);
});

for (const retirement of ["timeout", "token rotation"]) test(`${retirement} leaves an upload unconfirmed and retryable with the same identity`, async (t) => {
  const h = await cloudTransportHarness(t); const first = h.queue(); let attempts = 0, confirmations = 0;
  h.route("/storage/v1/object/private/" + first.objectPath, (req, res) => {
    attempts += 1; if (attempts === 1) return h.hold(req, res);
    h.json(res, {});
  });
  const work = tracked(h.files.flushPrivateFileUploadQueue(h.identity, first.storageKey, () => { confirmations += 1; }));
  await waitFor(() => h.exchanges.length === 1, "first upload body");
  if (retirement === "token rotation") h.publish(h.stored(jwt("session-a", "user-a", "rotated")));
  await waitFor(() => work.state !== "pending" && h.exchanges[0].closed, "unconfirmed upload");
  const retained = h.files.readPrivateUploadQueue(h.identity);
  assert.equal(retained.length, 1); assert.equal(retained[0].id, first.id); assert.equal(retained[0].objectPath, first.objectPath);
  assert.equal(retained[0].dataUrl, first.dataUrl); assert.equal(retained[0].state, "Failed"); assert.equal(confirmations, 0);
  await h.files.flushPrivateFileUploadQueue(h.identity, first.storageKey, () => { confirmations += 1; });
  assert.equal(attempts, 2); assert.equal(confirmations, 1); assert.equal(h.files.readPrivateUploadQueue(h.identity).length, 0);
  assert.equal(h.timers.size, 0); assert.equal(h.baselineListeners(), 0);
});

test("upload bridge retirement cancels native I/O while retaining its durable bytes", async (t) => {
  const h = await cloudTransportHarness(t, { deadlineMs: 1000 });
  h.route("/storage/v1/object/private/org-a/unassigned/doc/file.txt", (req, res) => h.hold(req, res));
  h.files.usePrivateFileCollectionBridge({ storageKey: "jr-os-job-documents", items: [{ id: "doc", dataUrl: "data:text/plain;base64,eA==", fileName: "file.txt", mimeType: "text/plain" }], updateItem() { throw Error("Retired upload cannot confirm"); }, isReady: true, identity: h.identity, mode: "cloud" }); h.effects();
  await waitFor(() => h.exchanges.length === 1, "bridge upload body"); h.cleanup();
  await waitFor(() => h.exchanges[0].closed, "retired upload socket");
  const queued = h.files.readPrivateUploadQueue(h.identity);
  assert.equal(queued.length, 1); assert.equal(queued[0].dataUrl, "data:text/plain;base64,eA==");
  assert.notEqual(queued[0].state, "Synced"); assert.equal(h.timers.size, 0);
});
