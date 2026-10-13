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
function harness({ identity = owner, initial = [], view = "save", jobId, quoteId, surveyId } = {}) {
  let current = identity, identityReady = true, ready = true, fail = false, activeState, cursor;
  let props = { kind: "load", label: "Load and design current", input: structuredClone(load) };
  let jobs = [{ id: "job-a", title: "Workshop", customerId: "customer-a" }];
  let quotes = [{ id: "quote-a", number: "Q-014", title: "Workshop quote", type: "Quote", jobId: "job-a", customerId: "customer-a" }];
  let surveys = [{ id: "survey-a", number: "S-014", jobId: "job-a", customerId: "customer-a" }];
  let quotesReady = true, surveysReady = true;
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
    "../../lib/cloud/coreBusinessCollections": {
      useJobsCollection: () => ({ items: jobs, isReady: ready }),
      usePricingDocumentsCollection: () => ({ items: quotes, isReady: quotesReady }),
      useSurveysCollection: () => ({ items: surveys, isReady: surveysReady }),
    },
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
  const render = () => expand(jsx(view === "save" ? components.SaveCalculation : components.SavedCalculationRecords, view === "save" ? props : { jobId, quoteId, surveyId }));
  const button = () => nodes(render()).find((node) => node.type === "button");
  return {
    render, saves, reads, button, text: () => text(render()),
    fill(label, value) { const field = nodes(render()).find((node) => ["InputField", "TextareaField"].includes(node.type) && node.props.label === label); assert.ok(field, label); field.props.onChange({ target: { value } }); },
    select(label, value) { const field = nodes(render()).find((node) => node.type === "select" && node.props["aria-label"] === label); assert.ok(field, label); field.props.onChange({ target: { value } }); },
    selectJob(value) { this.select("Attach to", value ? "job" : "note"); if (value) this.select("Linked record", value); },
    save() { button().props.onClick(); },
    setInput(input) { props = { ...props, input }; },
    setIdentity(value) { current = value; }, setIdentityReady(value) { identityReady = value; }, setReady(value) { ready = value; },
    setJobs(value) { jobs = value; }, setQuotes(value) { quotes = value; }, setSurveys(value) { surveys = value; },
    setQuotesReady(value) { quotesReady = value; }, setSurveysReady(value) { surveysReady = value; }, failStorage() { fail = true; },
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
  assert.equal(nodes(h.render()).find((node) => node.type === "select").props.value, "note");
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

test("saving selected quotes, estimates and surveys uses their account-scoped job and customer", () => {
  for (const type of ["quote", "survey"]) {
    const h = harness(); fill(h);
    h.select("Attach to", type); h.select("Linked record", `${type}-a`);
    assert.match(h.text(), /Also linked to job: Workshop/);
    h.save();
    assert.equal(h.saves.length, 1);
    assert.equal(h.saves[0].record[`${type}Id`], `${type}-a`);
    assert.equal(h.saves[0].record.jobId, "job-a");
    assert.equal(h.saves[0].record.customerId, "customer-a");
  }
  const h = harness(); fill(h);
  h.setQuotes([{ id: "estimate-a", number: "E-001", title: "New works", type: "Estimate", customerId: "customer-a" }]);
  h.select("Attach to", "quote"); h.select("Linked record", "estimate-a"); h.save();
  assert.equal(h.saves[0].record.quoteType, "Estimate");
  assert.equal(h.saves[0].record.jobId, undefined);
  assert.equal(h.saves[0].record.customerId, "customer-a");
});

test("target removal, loading, missing jobs and customer mismatches block both UI and save handler", () => {
  for (const type of ["quote", "survey"]) {
    for (const invalidate of [
      (h) => type === "quote" ? h.setQuotes([]) : h.setSurveys([]),
      (h) => type === "quote" ? h.setQuotesReady(false) : h.setSurveysReady(false),
      (h) => h.setJobs([]),
      (h) => h.setJobs([{ id: "job-a", title: "Workshop", customerId: "customer-b" }]),
    ]) {
      const h = harness(); fill(h); h.select("Attach to", type); h.select("Linked record", `${type}-a`);
      invalidate(h);
      assert.equal(h.button().props.disabled, true);
      h.save(); assert.equal(h.saves.length, 0);
      assert.doesNotMatch(h.text(), /Saved on this device/);
    }
  }
});

test("changing target type clears the selection even when record ids overlap", () => {
  const h = harness(); fill(h);
  h.setSurveys([{ id: "quote-a", number: "S-014" }]);
  h.select("Attach to", "quote"); h.select("Linked record", "quote-a");
  h.select("Attach to", "survey");
  assert.equal(h.button().props.disabled, true);
  h.save(); assert.equal(h.saves.length, 0);
  h.select("Linked record", "quote-a"); h.save();
  assert.equal(h.saves[0].record.surveyId, "quote-a");
  assert.equal(h.saves[0].record.quoteId, undefined);
  assert.equal(h.saves[0].record.jobId, undefined);
});

test("quote and survey drafts retain values on failure and clear at account boundaries", () => {
  for (const type of ["quote", "survey"]) {
    const h = harness(); fill(h); h.select("Attach to", type); h.select("Linked record", `${type}-a`);
    h.failStorage(); h.save(); assert.equal(h.saves.length, 0);
    assert.equal(nodes(h.render()).find((node) => node.props?.["aria-label"] === "Linked record").props.value, `${type}-a`);
    const staleSave = h.button().props.onClick;
    h.setIdentity({ ...owner, organisationId: "org-b" }); staleSave();
    assert.equal(h.saves.length, 0);
    assert.equal(nodes(h.render()).find((node) => node.props?.["aria-label"] === "Attach to").props.value, "note");
  }
});

test("quote and survey detail filters, search and navigation use exact linked identifiers", () => {
  const base = { createdAt: "2026-10-10T12:00:00Z", evidenceReference: "Sheet rev 2", input: load, kind: "load" };
  const q = core.createCalculationRecord({ ...base, id: "q-record", title: "Quotation evidence", quote: { id: "same/id?", number: "Q-014", title: "Kitchen estimate", type: "Estimate" } });
  const s = core.createCalculationRecord({ ...base, id: "s-record", title: "Survey evidence", survey: { id: "same/id?", number: "S-014" } });
  const initial = [q, s];
  const quoteView = harness({ view: "list", quoteId: q.quoteId, initial });
  assert.match(quoteView.text(), /Quotation evidence/); assert.doesNotMatch(quoteView.text(), /Survey evidence/);
  assert.ok(nodes(quoteView.render()).some((node) => node.type === "Link" && node.props.href === "/quotes/same%2Fid%3F"));
  const surveyView = harness({ view: "list", surveyId: s.surveyId, initial });
  assert.match(surveyView.text(), /Survey evidence/); assert.doesNotMatch(surveyView.text(), /Quotation evidence/);
  assert.ok(nodes(surveyView.render()).some((node) => node.type === "Link" && node.props.href === "/surveys/same%2Fid%3F"));
  assert.doesNotMatch(harness({ view: "list", quoteId: "", initial }).text(), /Quotation evidence|Survey evidence/);
  const all = harness({ view: "list", initial });
  for (const query of ["Q-014", "Kitchen estimate", "S-014"]) {
    all.fill("Search saved calculations", query);
    assert.match(all.text(), query === "S-014" ? /Survey evidence/ : /Quotation evidence/);
  }
  assert.ok(nodes(quoteView.render()).find((node) => node.type === "section").props.className.includes("print:hidden"));
  for (const identity of [null, { ...owner, role: "office" }, { ...owner, role: "electrician" }, { ...owner, role: "customer" }]) {
    for (const filter of [{ quoteId: q.quoteId }, { surveyId: s.surveyId }]) {
      const h = harness({ view: "list", initial, identity, ...filter });
      assert.equal(h.text(), ""); assert.equal(h.reads.length, 0);
    }
  }
});
