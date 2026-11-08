import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as identity from "../../lib/siteDiaryIdentity-core.mjs";
import * as jobStatus from "../../lib/jobManagement-core.mjs";
import { loadLocalTs } from "./load-local-ts.mjs";

const electrical = loadLocalTs(new URL("../../lib/electricalTesting.ts", import.meta.url));
const source = ts.transpileModule(readFileSync(new URL("../../app/field/testing/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
export const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
export const text = tree => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);
export const record = (patch = {}) => ({ id: "testing-1", jobId: "job-1", customerId: "customer-1", certificateId: "certificate-1", status: "Draft", inspectorName: "Test inspector", testDate: "2026-11-08", supplyDetails: "230 V", earthingArrangement: "TN-C-S", circuits: [{ id: "c1", circuitReference: "1", description: "Lighting", protectiveDevice: "B6", r1r2: "0.5", insulationResistance: ">200", polarity: "Confirmed", zs: "0.7", rcdTest: "25 ms", notes: "" }], outstandingActions: [], generalNotes: "Saved evidence", createdAt: "2026-11-07T10:00:00Z", updatedAt: "2026-11-07T10:00:00Z", ...patch });

export async function harness(initial = []) {
  const state = [], effects = [], layouts = [], writes = [], attempts = [], failures = new Set();
  let cursor = 0, sequence = 0, lostAcknowledgement = false;
  const data = { records: initial, persisted: structuredClone(initial), ready: true, jobs: [{ id: "job-1", title: "Test job", customerId: "customer-1", status: "Scheduled" }], team: [{ id: "team-1", name: "Test inspector", email: "inspector@example.test", status: "Active", role: "Owner" }], certificates: [{ id: "certificate-1", number: "CERT-1", jobId: "job-1" }], identity: { mode: "local", isReady: true, identity: { organisationId: "org-1", userId: "user-1", role: "owner", email: "inspector@example.test" } } };
  const changed = (before, deps) => !before || deps.some((value, i) => !Object.is(value, before.deps[i]));
  const useState = initialValue => { const i = cursor++; if (!(i in state)) state[i] = typeof initialValue === "function" ? initialValue() : initialValue; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; };
  const useMemo = (fn, deps) => { const i = cursor++; if (changed(state[i], deps)) state[i] = { deps, value: fn() }; return state[i].value; };
  const effect = queue => (fn, deps) => { const i = cursor++; if (changed(state[i], deps)) { const slot = { deps, cleanup: state[i]?.cleanup }; state[i] = slot; queue.push(() => { slot.cleanup?.(); slot.cleanup = fn(); }); } };
  function commit(kind, item, next) {
    attempts.push({ kind, item });
    if (failures.has(kind)) throw new Error("Synthetic storage quota");
    data.records = next; data.persisted = structuredClone(next); writes.push({ kind, item });
    if (lostAcknowledgement) { lostAcknowledgement = false; throw new Error("Synthetic lost acknowledgement"); }
    return item;
  }
  const collection = {
    get items() { return data.records; }, get isReady() { return data.ready; },
    // The legacy setter changes render state before the passive durable effect.
    setItems(update) { data.records = typeof update === "function" ? update(data.records) : update; attempts.push({ kind: "deferred", item: data.records }); },
    createItem(item) { if (data.records.some(row => row.id === item.id)) throw new Error("Duplicate id"); return commit("create", item, [item, ...data.records]); },
    updateItem(id, update) { const i = data.records.findIndex(row => row.id === id); if (i < 0) throw new Error("Missing record"); const item = update(data.records[i]); return commit("update", item, data.records.map((row, index) => index === i ? item : row)); },
  };
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    "react/jsx-runtime": { jsx, jsxs: jsx }, react: { useState, useMemo, useRef: value => useState({ current: value })[0], useEffect: effect(effects), useLayoutEffect: effect(layouts) },
    "next/link": { default: "Link" }, "lucide-react": {},
    "../../../components/ui/Button": { Button: "Button" }, "../../../components/ui/Card": { Card: "Card" }, "../../../components/ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" }, "../../../components/ui/PageHeader": { PageHeader: "PageHeader" },
    "../../../lib/cloud/coreBusinessCollections": { useFieldElectricalTestingCollection: () => collection, useTeamCollection: () => ({ items: data.team, isReady: true }) },
    "../../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => data.identity },
    "../../../lib/siteDiaryIdentity-core.mjs": identity, "../../../lib/jobManagement-core.mjs": jobStatus,
    "../../../lib/storage": { makeId: prefix => `${prefix}-${++sequence}`, useCloudLocalCollection: key => ({ items: key === "jr-os-jobs" ? data.jobs : key === "jr-os-customers" ? [{ id: "customer-1", name: "Test customer" }] : data.certificates, isReady: true }) },
    "../../../lib/electricalTesting": electrical,
  };
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, Error, Date, JSON, queueMicrotask, window: { scrollTo() {} }, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  const render = () => { cursor = 0; const tree = mod.exports.default(); layouts.splice(0).forEach(fn => fn()); effects.splice(0).forEach(fn => fn()); return tree; };
  render(); await new Promise(resolve => setImmediate(resolve)); render();
  const form = () => nodes(render()).find(node => node.type === "form");
  const button = label => nodes(render()).find(node => node.type === "Button" && text(node).startsWith(label));
  const field = label => nodes(render()).find(node => node.props.label === label || node.type === "label" && text(node).startsWith(label));
  return { data, writes, attempts, failures, render, form, button,
    field(label, value) { let node = field(label); assert.ok(node, label); if (node.type === "label") node = nodes(node).find(item => ["select", "input", "textarea"].includes(item.type)); if (value !== undefined) node.props.onChange({ target: { value } }); return node; },
    submitHandler() { return form().props.onSubmit; }, submit() { this.submitHandler()({ preventDefault() {} }); },
    click(label) { const node = button(label); assert.ok(node, label); node.props.onClick(); },
    resume() { const node = button("Resume"); assert.ok(node); node.props.onClick(); },
    loseAcknowledgement() { lostAcknowledgement = true; },
    unmount() { state.forEach(slot => slot?.cleanup?.()); },
  };
}
