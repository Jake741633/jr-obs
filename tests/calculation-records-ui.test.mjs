import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as core from "../lib/calculationRecords-core.mjs";
import * as numbers from "../lib/electricalCalculatorNumbers-core.mjs";

const load = { phase: "Single phase", powerWatts: "4600", voltage: "230", powerFactor: "1", efficiency: "1" };
const owner = { organisationId: "org-a", userId: "owner-a", role: "owner" };
const scope = (identity) => JSON.stringify([identity?.organisationId, identity?.userId, identity?.role, identity?.customerSourceId ?? null]);
function nodes(tree) { return Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : []; }
function text(tree) { return Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree); }
function compile(path, dependencies) {
  const mod = { exports: {} };
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports: mod.exports, module: mod, crypto: { randomUUID }, process: { env: {} }, Error,
    require(name) { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  return mod.exports;
}
const permissions = compile("../lib/cloud/permissions.ts", {});
function harness({ identity = owner, initial = [], view = "save", jobId } = {}) {
  let current = identity, identityReady = true, ready = true, fail = false, activeState, cursor;
  let props = { kind: "load", label: "Load and design current", input: structuredClone(load) };
  let jobs = [{ id: "job-a", title: "Workshop", customerId: "customer-a" }];
  const state = new Map(), stores = new Map([[scope(identity), initial]]), saves = [], reads = [];
  const jsx = (type, props, key) => ({ type, props, key });
  const components = compile("../components/calculators/CalculationRecords.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useState(initialValue) { const i = cursor++; if (!(i in activeState)) activeState[i] = typeof initialValue === "function" ? initialValue() : initialValue; const own = activeState; return [own[i], (value) => { own[i] = typeof value === "function" ? value(own[i]) : value; }]; } },
    "next/link": { default: "Link" }, "../ui/Card": { Card: "Card" }, "../ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" },
    "../../lib/calculationRecords-core.mjs": core,
    "../../lib/electricalCalculatorNumbers-core.mjs": numbers,
    "../../lib/cloud/permissions": permissions,
    "../../lib/cloud/repository": { activeSyncAuthorizationMatches: (identity) => identityReady && scope(identity) === scope(current) },
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ identity: current, isReady: identityReady, mode: "cloud" }) },
    "../../lib/cloud/coreBusinessCollections": { useJobsCollection: () => ({ items: jobs, isReady: ready }) },
    "../../lib/storage": { useCloudLocalCollection(key) { assert.equal(key, core.CALCULATION_RECORDS_STORAGE_KEY); const keyScope = scope(current); reads.push(keyScope); return { items: stores.get(keyScope) ?? [], isReady: ready, createItem(record) { if (fail) throw new Error("Device storage is full"); saves.push({ scope: keyScope, record }); stores.set(keyScope, [record, ...(stores.get(keyScope) ?? [])]); } }; } },
  });
  function expand(node, path = "root") {
    if (Array.isArray(node)) return node.map((value, i) => expand(value, `${path}/${i}`));
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") {
      const key = `${path}/${node.type.name}/${node.key ?? ""}`;
      if (!state.has(key)) state.set(key, []);
      activeState = state.get(key); cursor = 0;
      return expand(node.type(node.props), key);
    }
    return { ...node, props: { ...node.props, children: expand(node.props?.children, `${path}/${node.key ?? "children"}`) } };
  }
  const render = () => expand(jsx(view === "save" ? components.SaveCalculation : components.SavedCalculationRecords, view === "save" ? props : { jobId }));
  const button = () => nodes(render()).find((node) => node.type === "button");
  return {
    render, saves, reads, button, text: () => text(render()),
    fill(label, value) { const field = nodes(render()).find((node) => ["InputField", "TextareaField"].includes(node.type) && node.props.label === label); assert.ok(field, label); field.props.onChange({ target: { value } }); },
    selectJob(value) { nodes(render()).find((node) => node.type === "select").props.onChange({ target: { value } }); },
    save() { button().props.onClick(); },
    setInput(input) { props = { ...props, input }; },
    setIdentity(value) { current = value; }, setIdentityReady(value) { identityReady = value; }, setReady(value) { ready = value; },
    setJobs(value) { jobs = value; }, failStorage() { fail = true; },
  };
}
function fill(h) { h.fill("Calculation title", "Circuit A"); h.fill("Evidence source and revision", "Manufacturer sheet rev 2, survey 14"); }

test("saving a job snapshot acknowledges only a successful durable creation", () => {
  const h = harness();
  assert.equal(h.button().props.disabled, true);
  fill(h); h.selectJob("job-a"); h.save();
  assert.equal(h.saves.length, 1);
  assert.equal(h.saves[0].record.jobId, "job-a"); assert.equal(h.saves[0].record.customerId, "customer-a");
  assert.equal(h.saves[0].record.snapshot.outputs.find((row) => row.label === "Design current").value, 20);
  assert.match(h.text(), /queued for sync/);
  assert.equal(h.button().props.disabled, true, "title clears after success to prevent an accidental second save");
});

test("invalid inputs and loading collections are guarded in both button and handler", () => {
  const h = harness(); fill(h);
  h.setInput({ ...load, powerFactor: "" });
  assert.equal(h.button().props.disabled, true); h.save();
  assert.equal(h.saves.length, 0); assert.match(h.text(), /Complete all calculation inputs/);
  h.setInput(load); h.setReady(false); h.save();
  assert.equal(h.saves.length, 0); assert.match(h.text(), /finish loading/);
});

test("removed or unavailable job ids cannot create an unbound or forged record", () => {
  const h = harness(); fill(h); h.selectJob("job-a"); h.setJobs([]);
  assert.equal(h.button().props.disabled, true); h.save();
  assert.equal(h.saves.length, 0); assert.match(h.text(), /no longer available/);
  h.selectJob(""); h.save();
  assert.equal(h.saves.length, 1); assert.equal(h.saves[0].record.jobId, undefined);
});

test("storage failures retain form values and never report a successful save", () => {
  const h = harness(); fill(h); h.failStorage(); h.save();
  assert.equal(h.saves.length, 0); assert.match(h.text(), /Device storage is full/);
  assert.doesNotMatch(h.text(), /Saved on this device/);
  assert.equal(nodes(h.render()).find((node) => node.props?.label === "Calculation title").props.value, "Circuit A");
});

test("stale handlers reject account, organisation, role, portal-scope and sign-out changes", () => {
  for (const changed of [null, { ...owner, organisationId: "org-b" }, { ...owner, userId: "owner-b" }, { ...owner, role: "office" }, { ...owner, customerSourceId: "customer-b" }]) {
    const h = harness(); fill(h); const save = h.button().props.onClick;
    h.setIdentity(changed); save(); assert.equal(h.saves.length, 0);
  }
  const h = harness(); fill(h); const save = h.button().props.onClick;
  h.setIdentityReady(false); save(); assert.equal(h.saves.length, 0);
});

test("unauthorised and signed-out users never mount a business-record collection", () => {
  for (const identity of [null, { ...owner, role: "office" }, { ...owner, role: "electrician" }, { ...owner, role: "customer", customerSourceId: "customer-a" }]) {
    for (const view of ["save", "list"]) {
      const h = harness({ identity, view }); h.render(); assert.equal(h.reads.length, 0);
    }
  }
});

test("changing accounts remounts the form and clears the previous account's draft", () => {
  const h = harness(); fill(h); h.selectJob("job-a");
  h.setIdentity({ ...owner, userId: "owner-b" });
  assert.equal(nodes(h.render()).find((node) => node.props?.label === "Calculation title").props.value, "");
  assert.equal(nodes(h.render()).find((node) => node.type === "select").props.value, "");
});

test("record lists filter by job/search, retain malformed rows and isolate account switches", () => {
  const record = core.createCalculationRecord({ id: "record-a", createdAt: "2026-09-27T12:00:00Z", title: "Workshop circuit", evidenceReference: "Sheet rev 2", input: load, kind: "load", job: { id: "job-a", title: "Workshop" } });
  const other = { ...record, id: "record-b", title: "Other job", jobId: "job-b" };
  const h = harness({ view: "list", initial: [record, other, null] });
  assert.match(h.text(), /Workshop circuit/); assert.match(h.text(), /unsupported format/);
  h.fill("Search saved calculations", "Workshop circuit");
  assert.match(h.text(), /Workshop circuit/); assert.doesNotMatch(h.text(), /Other job/);
  const jobView = harness({ view: "list", jobId: "job-a", initial: [record, other] });
  assert.doesNotMatch(jobView.text(), /Other job/);
  h.setIdentity({ ...owner, organisationId: "org-b" });
  assert.doesNotMatch(h.text(), /Workshop circuit/); assert.match(h.text(), /No saved calculations yet/);
});
