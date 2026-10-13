import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as queue from "../../lib/cloud/privateUploadQueue-core.mjs";
import * as replay from "../../lib/cloud/privateUploadReplay-core.mjs";

const source = ts.transpileModule(readFileSync(new URL("../../lib/cloud/privateFiles.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

export function privateBridgeHarness(records, storageKey = "jr-os-job-documents") {
  const slots = [], effects = [], downloads = [], blobs = new Map(), revoked = [];
  let cursor = 0, sequence = 0, download = async path => new Blob([path], { type: "image/jpeg" });
  const identity = { organisationId: "org-1", userId: "user-1", role: "owner" };
  const props = { items: records, identity, storageKey, mode: "cloud", isReady: true, setItems(value) { props.items = typeof value === "function" ? value(props.items) : value; } };
  const useState = initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; };
  const changed = (old, deps) => !old || deps.some((value, i) => !Object.is(value, old.deps[i]));
  const dependencies = {
    react: { useState, useRef: value => useState({ current: value })[0], useMemo(fn, deps) { const i = cursor++; if (changed(slots[i], deps)) slots[i] = { deps, value: fn() }; return slots[i].value; }, useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (changed(old, deps)) { const next = { deps, cleanup: old?.cleanup }; slots[i] = next; effects.push(() => { next.cleanup?.(); next.cleanup = fn(); }); } } },
    "../supabase/client": { readSupabaseSession: () => ({ user: { id: identity.userId } }) },
    "./client": { downloadPrivateObject: path => { downloads.push(path); return download(path); } },
    "./config": { cloudStorageBucket: "private", effectiveCloudMode: () => "cloud" },
    "./privateUploadQueue-core.mjs": queue, "./privateUploadReplay-core.mjs": replay,
    "./repository": { activeSyncAuthorizationMatches: () => true, revalidateSyncAuthorization: async () => true },
  };
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, Blob, Error, Date, CustomEvent,
    window: { localStorage: { getItem: key => key === "jr-os-active-organisation" ? identity.organisationId : null, setItem() {} }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
    URL: { createObjectURL(blob) { const url = `blob:https://preview.example.com/7a4fffb3-6a59-431b-a126-${String(++sequence).padStart(12, "0")}`; blobs.set(url, blob); return url; }, revokeObjectURL(url) { revoked.push(url); blobs.delete(url); } },
    require: key => { assert.ok(key in dependencies, key); return dependencies[key]; },
  });
  function render() { cursor = 0; const result = mod.exports.usePrivateFileCollectionBridge(props); effects.splice(0).forEach(fn => fn()); return result.items; }
  return { props, downloads, blobs, revoked, render, download(fn) { download = fn; }, async settled() { await new Promise(resolve => setImmediate(resolve)); return render(); }, unmount() { slots.forEach(slot => slot?.cleanup?.()); } };
}
