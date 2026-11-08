import assert from "node:assert/strict";
import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

export const waitFor = async (predicate, message = "condition", timeout = 1500) => {
  const expires = Date.now() + timeout;
  while (!predicate()) {
    assert.ok(Date.now() < expires, `Timed out waiting for ${message}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};
export const jwt = (sessionId = "session-a", subject = "user-a", nonce = "first") => `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: subject, session_id: sessionId, iss: "loopback-project", nonce })).toString("base64url")}.synthetic`;
export const tracked = (promise) => {
  const result = { state: "pending" };
  result.done = promise.then((value) => { result.state = "fulfilled"; result.value = value; }, (error) => { result.state = "rejected"; result.error = error; });
  return result;
};

// Real native fetch and AbortSignal. Only production deadline timers are shortened.
export async function cloudTransportHarness(t, { deadlineMs = 180 } = {}) {
  const exchanges = [], sockets = new Set(), held = new Set(), routeHandlers = new Map();
  function json(res, value, status = 200) { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); }
  function hold(req, res, kind = "json", status = 200) {
    let chunks = 0, timer;
    const entry = { req, res, kind, closed: false, get chunks() { return chunks; } };
    exchanges.push(entry); held.add(res);
    if (kind !== "headers") {
      res.writeHead(status, { "Content-Type": kind === "blob" ? "application/octet-stream" : "application/json" });
      res.write(kind === "blob" ? "x" : "[");
      timer = setInterval(() => { chunks += 1; res.write(kind === "blob" ? "x" : " "); }, 15);
    }
    res.on("close", () => { entry.closed = true; clearInterval(timer); held.delete(res); });
    return entry;
  }
  const requests = [];
  const server = http.createServer(async (req, res) => {
    requests.push({ path: req.url, method: req.method, headers: req.headers });
    const path = new URL(req.url, "http://loopback").pathname;
    if (routeHandlers.has(path)) return routeHandlers.get(path)(req, res);
    if (path === "/rest/v1/headers") return hold(req, res, "headers");
    if (path === "/rest/v1/body") return hold(req, res);
    if (path === "/rest/v1/errorbody") return hold(req, res, "json", 403);
    if (path === "/rest/v1/profiles") return json(res, [{ active: true, organisation_id: "org-a", role: "owner", customer_source_id: null }]);
    if (path === "/rest/v1/private_files") {
      let body = ""; for await (const chunk of req) body += chunk;
      return json(res, JSON.parse(body).map((row) => ({ ...row, id: "file-" + row.source_id })));
    }
    if (path.startsWith("/storage/v1/object/")) return json(res, {});
    return json(res, []);
  });
  server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { for (const res of held) res.destroy(); for (const socket of sockets) socket.destroy(); await new Promise((resolve) => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const values = new Map();
  const localStorage = { get length() { return values.size; }, key: (i) => [...values.keys()][i] ?? null, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
  const window = new EventTarget(); window.localStorage = localStorage; window.atob = atob;
  const listeners = new Map();
  const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
  window.addEventListener = (type, listener, options) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); add(type, listener, options); };
  window.removeEventListener = (type, listener, options) => { listeners.get(type)?.delete(listener); remove(type, listener, options); };
  const deadlineCalls = [], timers = new Set();
  function deadlineTimer(callback, delay, ...args) {
    deadlineCalls.push(delay);
    const timer = setTimeout(() => { timers.delete(timer); callback(...args); }, Math.min(delay, deadlineMs));
    timers.add(timer); return timer;
  }
  function clearDeadline(timer) { timers.delete(timer); clearTimeout(timer); }
  t.after(() => { for (const timer of timers) clearTimeout(timer); });
  const effects = [], cleanups = [], created = [], revoked = [];
  const react = {
    useEffect(callback) { effects.push(callback); }, useMemo(callback) { return callback(); }, useCallback(callback) { return callback; }, useRef(current) { return { current }; },
    useState(initial) { let value = typeof initial === "function" ? initial() : initial; return [value, (next) => { value = typeof next === "function" ? next(value) : next; }]; },
  };
  const identity = { organisationId: "org-a", userId: "user-a", role: "owner" };
  class TestURL extends URL { static createObjectURL() { const value = `blob:loopback-${created.length}`; created.push(value); return value; } static revokeObjectURL(value) { revoked.push(value); } }
  const config = { cloudConfig: { url, anonKey: "synthetic-only", isConfigured: true, mode: "cloud" }, cloudStorageBucket: "private", effectiveCloudMode: () => "cloud" };
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const mod = { exports: {} }; cache.set(path, mod);
    const code = ts.transpileModule(readFileSync(path, "utf8"), { fileName: path.replace(/\.(mjs|js)$/, ".ts"), compilerOptions: { allowJs: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    function require(name) {
      if (name === "react") return react;
      if (name === "./config") return config;
      if (name === "./cloud/useCloudIdentity") return { useCloudIdentity: () => ({ identity, isReady: true, mode: "cloud" }) };
      assert.ok(name.startsWith("."), name);
      const candidate = resolve(dirname(path), name);
      return load([candidate, ...[".ts", ".mjs", ".js"].map((extension) => candidate + extension)].find(existsSync));
    }
    vm.runInNewContext(code, { module: mod, exports: mod.exports, require, window, navigator: { onLine: true }, crypto: { randomUUID }, URL: TestURL, Date, Error, AggregateError, structuredClone, queueMicrotask, Event, CustomEvent, Blob, Uint8Array, Headers, AbortController, AbortSignal, atob, setTimeout: deadlineTimer, clearTimeout: clearDeadline, fetch: globalThis.fetch, process: { env: { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-only" } } }, { filename: path });
    return mod.exports;
  }
  const root = resolve(new URL("../..", import.meta.url).pathname);
  const session = load(`${root}/lib/supabase/client.ts`), client = load(`${root}/lib/cloud/client.ts`), repository = load(`${root}/lib/cloud/repository.ts`), files = load(`${root}/lib/cloud/privateFiles.ts`), adapter = load(`${root}/lib/cloud/adapter.ts`);
  const stored = (token = jwt()) => ({ access_token: token, refresh_token: "synthetic-refresh", user: { id: "user-a" }, expires_at: Math.floor(Date.now() / 1000) + 3600 });
  session.saveSupabaseSession(stored()); repository.setActiveSyncIdentity(identity.organisationId, identity.userId, identity.role);
  const baselineListeners = () => [...listeners.entries()].filter(([type]) => ["storage", "jr-os-cloud-identity-changed"].includes(type)).reduce((count, [, set]) => count + set.size, 0);
  const result = { url, session, client, repository, files, adapter, stored, identity, values, localStorage, window, requests, exchanges, deadlineCalls, timers, created, revoked, baselineListeners,
    route(path, handler) { routeHandlers.set(path, handler); }, hold, json,
    retire() { client.cloudSession.save(null); repository.setActiveSyncIdentity(null, null, null); },
    publish(value) { session.saveSupabaseSession(value); window.dispatchEvent(new Event("jr-os-cloud-identity-changed")); },
    storageEvent(value) { const event = new Event("storage"); Object.assign(event, { key: "jr-os-supabase-session", newValue: value === null ? null : JSON.stringify(value) }); window.dispatchEvent(event); },
    effects() { for (const effect of effects.splice(0)) { const cleanup = effect(); if (typeof cleanup === "function") cleanups.push(cleanup); } },
    cleanup() { for (const cleanup of cleanups.splice(0)) cleanup(); },
    loadStorage() { return load(`${root}/lib/storage.ts`); },
    loadCloudSync() { return load(`${root}/lib/cloudSync.ts`); },
    queue(sourceId = "file-a") { return files.queuePrivateFileUpload({ organisationId: "org-a", userId: "user-a", authorizationRole: "owner", sourceId, storageKey: "jr-os-job-documents", objectPath: `org-a/jobs/job-a/${sourceId}/file.txt`, dataUrl: "data:text/plain;base64,eA==", mimeType: "text/plain", size: 1, fileName: "file.txt" }); },
  };
  t.after(() => result.cleanup());
  return result;
}
