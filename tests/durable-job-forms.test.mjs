import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as jobCore from "../lib/jobManagement-core.mjs";
import * as policy from "../lib/cloud/fieldMutationPolicy-core.mjs";
import * as permissions from "../lib/cloud/permissions.ts";
import * as links from "../lib/assistantJobLink.ts";
import * as identities from "../lib/assistantIdentity.ts";
import * as signals from "../lib/assistantSignals-core.mjs";

const jsx = (type, props) => ({ type, props });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);
const savedJob = (patch = {}) => ({ id: "job-1", title: "Workshop", siteAddress: "1 High Street", customerId: "customer-1", status: "Scheduled", startDate: "2026-10-15", value: 240, notes: "Keep access clear", createdAt: "2026-10-01T09:00:00Z", updatedAt: "2026-10-01T09:00:00Z", ...patch });
const source = ts.transpileModule(readFileSync(new URL("../app/jobs/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function harness(initial = []) {
  const slots = [], layouts = [], attempts = [], writes = [], confirmations = [];
  let cursor = 0, sequence = 0, confirmEffect, confirmResult = true;
  let mode = "cloud", identity = { organisationId: "org-1", userId: "user-1", role: "owner" }, identityReady = true;
  const data = { jobs: initial, timeline: [], customers: [{ id: "customer-1", name: "Customer one" }], builders: [{ id: "builder-1", companyName: "Builder one" }], team: [] };
  const ready = { jobs: true, timeline: true, customers: true, builders: true, team: true };
  const failures = new Set();
  const useState = (value) => { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === "function" ? value() : value; return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; };
  function layout(fn, deps) {
    const i = cursor++, previous = slots[i];
    if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) {
      const current = { deps, cleanup: previous?.cleanup }; slots[i] = current;
      layouts.push(() => { current.cleanup?.(); current.cleanup = fn(); });
    }
  }
  function collection(name) {
    const commit = (kind, item, next) => {
      attempts.push({ name, kind, item });
      if (failures.has(`${name}:${kind}`)) throw new Error("Device storage or sync queue is full");
      data[name] = next; writes.push({ name, kind, item }); return item;
    };
    return { items: data[name], isReady: ready[name],
      setItems() { throw new Error("Job forms must not use deferred collection writes"); }, remove() { throw new Error("Job deletion must be durable"); },
      createItem(item) { assert.ok(!data[name].some(record => record.id === item.id), "Creation must not reuse a saved identity"); return commit("create", item, [item, ...data[name]]); },
      updateItem(id, update) { const index = data[name].findIndex(item => item.id === id); assert.ok(index >= 0); const item = update(data[name][index]); return commit("update", item, data[name].map((record, i) => i === index ? item : record)); },
      removeItem(id, validate) { const item = data[name].find(record => record.id === id); assert.ok(item); validate(item); return commit("delete", item, data[name].filter(record => record.id !== id)); },
    };
  }
  const dependencies = {
    "react/jsx-runtime": { jsx, jsxs: jsx }, react: { useState, useRef: value => useState({ current: value })[0], useMemo: fn => fn(), useEffect() {}, useLayoutEffect: layout },
    "next/link": { default: "Link" }, "lucide-react": {},
    "../../components/ui/Button": { Button: "Button" }, "../../components/ui/Card": { Card: "Card" }, "../../components/ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" }, "../../components/ui/PageHeader": { PageHeader: "PageHeader" }, "../../components/ui/StatusBadge": { StatusBadge: "StatusBadge" }, "../../components/crm/EntityEmptyState": { EntityEmptyState: "Empty" },
    "../../lib/cloud/adapter": { accountStorageKey: (...parts) => parts.join(":") },
    "../../lib/cloud/coreBusinessCollections": { useJobsCollection: () => collection("jobs"), useCustomersCollection: () => collection("customers"), useBuildersCollection: () => collection("builders"), useJobTimelineCollection: () => collection("timeline"), useTeamCollection: () => collection("team") },
    "../../lib/cloud/fieldMutationPolicy-core.mjs": policy, "../../lib/cloud/permissions": permissions,
    "../../lib/cloud/repository-core.mjs": {}, "../../lib/cloud/repository": {},
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ mode, identity, isReady: identityReady }) },
    "../../lib/jobManagement-core.mjs": jobCore, "../../lib/siteDiaryIdentity-core.mjs": { fieldOperatorMemberId: () => "member-1" },
    "../../lib/assistantJobLink": links, "../../lib/assistantIdentity": identities, "../../lib/assistantSignals-core.mjs": signals,
    "../../lib/storage": { makeId: prefix => `${prefix}_${++sequence}` },
  };
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, Error, Date, Intl, window: { confirm(message) { confirmations.push(message); confirmEffect?.(); return confirmResult; } }, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  const render = () => { cursor = 0; const view = mod.exports.default(); layouts.splice(0).forEach(fn => fn()); return view; };
  const form = () => nodes(render()).find(n => n.type === "form");
  const button = label => nodes(render()).find(n => (n.type === "button" || n.type === "Button") && (text(n) === label || n.props["aria-label"] === label));
  const field = label => nodes(form()).find(n => n.props.label === label) || nodes(form()).find(n => n.type === "label" && text(n.props.children[0]) === label)?.props.children[1];
  return { data, ready, failures, attempts, writes, confirmations, render, form, button, field,
    open() { nodes(render()).find(n => n.type === "PageHeader").props.action.props.onClick(); },
    enter(label, value) { const control = field(label); assert.ok(control, label); control.props.onChange({ target: { value } }); },
    fill(title = "New job") { this.enter("Job title", title); this.enter("Site address", "2 New Street"); this.enter("Estimated value (£)", "120.50"); },
    submitHandler() { return form().props.onSubmit; }, submit() { this.submitHandler()({ preventDefault() {} }); },
    click(label) { const control = button(label); assert.ok(control, label); control.props.onClick(); },
    account(patch) { identity = { ...identity, ...patch }; render(); },
    mode(value) { mode = value; render(); }, signedOut() { identity = null; render(); }, identityLoading() { identityReady = false; render(); },
    confirm(value, effect) { confirmResult = value; confirmEffect = effect; },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
const submit = fn => fn({ preventDefault() {} });
const jobWrites = h => h.writes.filter(w => w.name === "jobs");

test("new job failures retain the editable draft and retry one stable identity before dismissing", () => {
  const h = harness(); h.open(); h.fill(); h.enter("Customer", "customer-1"); h.enter("Job notes", "Access at rear");
  h.failures.add("jobs:create"); h.submit();
  assert.equal(h.data.jobs.length, 0); assert.equal(h.data.timeline.length, 0);
  assert.equal(h.field("Job title").props.value, "New job"); assert.equal(h.field("Customer").props.value, "customer-1");
  assert.match(text(h.render()), /save could not be confirmed.*draft is still here/);
  const first = h.attempts[0].item;
  h.enter("Job title", "Reviewed job"); h.failures.clear(); const repeat = h.submitHandler(); submit(repeat); submit(repeat);
  assert.equal(h.form(), undefined); assert.equal(h.data.jobs.length, 1); assert.equal(h.data.timeline.length, 1);
  assert.equal(h.data.jobs[0].id, first.id); assert.equal(h.data.jobs[0].createdAt, first.createdAt);
  assert.equal(h.data.jobs[0].title, "Reviewed job"); assert.equal(h.data.jobs[0].notes, "Access at rear");
  assert.equal(h.data.jobs[0].value, 120.5); assert.match(text(h.render()), /saved on this device.*Check sync status/);
});

test("callbacks from older input or a closed form cannot submit a different draft", () => {
  const h = harness(); h.open(); h.fill(); const old = h.submitHandler();
  h.enter("Job title", "Latest draft"); submit(old); assert.equal(h.writes.length, 0);
  const closed = h.submitHandler(); h.open(); submit(closed); assert.equal(h.writes.length, 0);
  h.open(); h.fill("Next job"); submit(closed); assert.equal(h.writes.length, 0);
  h.submit(); assert.equal(h.data.jobs[0].title, "Next job");
});

test("invalid money dates stages and required fields cannot save a job", () => {
  for (const [label, value] of [["Estimated value (£)", "Infinity"], ["Estimated value (£)", "1e309"], ["Estimated value (£)", "-1"], ["Estimated value (£)", "oops"], ["Start date", "2026-02-30"], ["Start date", "2026-10-11T09:00"], ["Status", "Unknown"], ["Job title", "  "], ["Site address", "  "]]) {
    const h = harness(); h.open(); h.fill(); h.enter(label, value); h.submit();
    assert.equal(h.attempts.length, 0, `${label}: ${value}`); assert.ok(h.form());
  }
  const h = harness(); h.open(); h.fill(); h.enter("Estimated value (£)", ""); h.submit(); assert.equal(h.data.jobs[0].value, 0);
});

test("customer and builder choices require current unique saved identities", () => {
  for (const [name, label, id] of [["customers", "Customer", "customer-1"], ["builders", "Builder", "builder-1"]]) {
    for (const duplicate of [false, true]) {
      const h = harness(); h.open(); h.fill(); h.enter(label, id); const stale = h.submitHandler();
      h.data[name] = duplicate ? [h.data[name][0], { ...h.data[name][0], name: "Duplicate", companyName: "Duplicate" }] : [];
      h.render(); submit(stale);
      assert.equal(h.attempts.length, 0); assert.equal(h.field(label).props.value, id);
      assert.match(text(h.render()), /selected (customer|builder) is unavailable or ambiguous/i);
      assert.equal(nodes(h.field(label)).filter(n => n.type === "option" && n.props.value === id).length, 1);
    }
  }
});

test("creation and editing wait for all required sources and reject stale account or unmounted callbacks", () => {
  for (const source of ["jobs", "timeline", "customers", "builders"]) {
    const h = harness(); h.open(); h.fill(); const stale = h.submitHandler(); h.ready[source] = false; h.render(); submit(stale);
    assert.equal(h.attempts.length, 0); assert.ok(h.form()); assert.match(text(h.render()), /finish loading/);
    h.ready[source] = true; h.submit(); assert.equal(h.data.jobs.length, 1);
  }
  for (const change of [h => h.account({ role: "electrician" }), h => h.account({ role: "customer" }), h => h.account({ role: "unknown" }), h => h.account({ organisationId: "org-2" }), h => h.account({ userId: "user-2" }), h => h.mode("local"), h => h.signedOut(), h => h.identityLoading(), h => h.unmount()]) {
    for (const edit of [false, true]) {
      const h = harness(edit ? [savedJob()] : []); if (edit) h.click("Edit Workshop"); else { h.open(); h.fill(); }
      const stale = h.submitHandler(); change(h); submit(stale); assert.equal(h.attempts.length, 0);
    }
  }
});

test("creation note failures retry only that note with its original identity and guard repeated taps", () => {
  const h = harness(); h.failures.add("timeline:create"); h.open(); h.fill(); h.submit();
  assert.equal(h.form(), undefined); assert.equal(h.data.jobs.length, 1); assert.equal(h.data.timeline.length, 0);
  assert.match(text(h.render()), /Job saved on this device, but its timeline note was not saved/);
  assert.match(text(h.render()), /leaving loses these unsaved notes/);
  const initial = h.attempts.find(w => w.name === "timeline").item, retry = h.button("Retry timeline note").props.onClick;
  retry(); assert.equal(h.data.timeline.length, 0); h.failures.clear(); retry(); retry();
  assert.equal(h.data.timeline.length, 1); assert.equal(h.data.timeline[0], initial); assert.equal(jobWrites(h).length, 1);
  assert.equal(h.button("Retry timeline note"), undefined);
});

test("note retry recognises an exact saved note and refuses conflicting contents or duplicate identities", () => {
  for (const kind of ["matching", "different-details", "different-source", "invented-previous-stage", "duplicate"]) {
    const h = harness(); h.failures.add("timeline:create"); h.open(); h.fill(); h.submit();
    const note = h.attempts.find(w => w.name === "timeline").item;
    h.data.timeline = kind === "matching" ? [{ ...note }] : kind === "different-details" ? [{ ...note, note: "Another event" }] : kind === "different-source" ? [{ ...note, jobId: "other-job" }] : kind === "invented-previous-stage" ? [{ ...note, fromStatus: "Complete" }] : [{ ...note }, { ...note }];
    h.failures.clear(); h.click("Retry timeline note");
    assert.equal(h.writes.filter(w => w.name === "timeline").length, 0);
    if (kind === "matching") assert.equal(h.button("Retry timeline note"), undefined);
    else { assert.ok(h.button("Retry timeline note")); assert.match(text(h.render()), /identity is ambiguous or contains different details/); }
  }
});

test("note retries refuse missing duplicate replaced or unauthorized job sources", () => {
  for (const change of [h => { h.data.jobs = []; h.render(); }, h => { h.data.jobs = [h.data.jobs[0], { ...h.data.jobs[0] }]; h.render(); }, h => { h.data.jobs = [{ ...h.data.jobs[0], createdAt: "2026-10-12T09:00:00Z" }]; h.render(); }, h => { h.ready.timeline = false; h.render(); }, h => h.account({ role: "electrician" }), h => h.account({ organisationId: "org-2" }), h => h.unmount()]) {
    const h = harness(); h.failures.add("timeline:create"); h.open(); h.fill(); h.submit();
    const retry = h.button("Retry timeline note").props.onClick; h.failures.clear(); change(h); retry();
    assert.equal(h.data.timeline.length, 0); assert.equal(h.writes.filter(w => w.name === "timeline").length, 0);
  }
});

test("multiple pending notes remain independent and identify their saved jobs", () => {
  const h = harness(); h.failures.add("timeline:create"); h.open(); h.fill("First job"); h.submit(); h.open(); h.fill("Second job"); h.submit();
  const section = nodes(h.render()).find(n => n.props["aria-label"] === "Unsaved job timeline notes");
  assert.match(text(section), /First job/); assert.match(text(section), /Second job/);
  h.failures.clear(); h.click("Retry timeline note"); assert.equal(h.data.timeline.length, 1);
  h.click("Retry timeline note"); assert.equal(h.data.timeline.length, 2); assert.equal(jobWrites(h).length, 2);
  assert.equal(new Set(h.data.timeline.map(note => note.id)).size, 2);
});

test("failed edits retain their draft and retry against current metadata without changing unrelated fields", () => {
  const original = savedJob({ sourceQuoteId: "quote-1", contacts: [{ id: "contact-1" }], priority: "Normal" }), h = harness([original]);
  h.click("Edit Workshop"); h.enter("Job title", "Updated workshop"); h.enter("Status", "First fix"); h.failures.add("jobs:update"); h.submit();
  assert.equal(h.data.jobs[0], original); assert.equal(h.data.timeline.length, 0); assert.equal(h.field("Job title").props.value, "Updated workshop");
  h.data.jobs = [{ ...original, priority: "High", targetCompletionDate: "2026-11-01", contacts: [{ id: "contact-2" }], updatedAt: "2026-10-11T08:00:00Z" }];
  h.failures.clear(); const repeat = h.submitHandler(); submit(repeat); submit(repeat);
  assert.equal(h.data.jobs[0].title, "Updated workshop"); assert.equal(h.data.jobs[0].status, "First fix");
  assert.equal(h.data.jobs[0].priority, "High"); assert.equal(h.data.jobs[0].sourceQuoteId, "quote-1"); assert.deepEqual(h.data.jobs[0].contacts, [{ id: "contact-2" }]);
  assert.equal(h.data.jobs[0].targetCompletionDate, "2026-11-01"); assert.equal(h.data.timeline.length, 1);
  assert.equal(h.data.timeline[0].fromStatus, "Scheduled"); assert.equal(h.data.timeline[0].toStatus, "First fix"); assert.equal(jobWrites(h).length, 1);
});

test("ordinary edits without a stage change do not create status evidence", () => {
  const h = harness([savedJob()]); h.click("Edit Workshop"); h.enter("Job notes", "New access code"); h.submit();
  assert.equal(h.data.timeline.length, 0); assert.equal(h.data.jobs[0].notes, "New access code");
  assert.match(text(h.render()), /Job changes saved on this device/);
});

test("changed editable details block stale drafts and Use saved values explicitly reloads them", () => {
  for (const patch of [{ status: "Complete" }, { title: "Other title" }, { siteAddress: "New address" }, { customerId: "customer-2" }, { builderId: "builder-1" }, { startDate: "2026-11-12" }, { value: 480 }, { notes: "New notes" }, { createdAt: "2026-10-11T09:00:00Z" }]) {
    const original = savedJob(), h = harness([original]); h.click("Edit Workshop"); h.enter("Job notes", "My unsaved note"); const stale = h.submitHandler();
    // The repository may have a newer record before this form has rendered it.
    h.data.jobs = [{ ...original, ...patch }]; submit(stale);
    assert.equal(h.writes.length, 0); assert.equal(h.field("Job notes").props.value, "My unsaved note"); assert.match(text(h.render()), /editable details or stage have changed/);
    h.click("Use saved values"); assert.equal(h.field("Job notes").props.value, patch.notes ?? original.notes);
  }
});

test("editing rejects missing and ambiguous job identities, including stale edit callbacks", () => {
  for (const records of [[], [savedJob(), savedJob({ title: "Duplicate job" })]]) {
    const h = harness([savedJob()]); const edit = h.button("Edit Workshop").props.onClick; h.data.jobs = records; h.render(); edit();
    assert.equal(h.form(), undefined); assert.equal(h.writes.length, 0);
    const opened = harness([savedJob()]); opened.click("Edit Workshop"); const stale = opened.submitHandler(); opened.data.jobs = records; opened.render(); submit(stale);
    assert.equal(opened.writes.length, 0); assert.ok(opened.form());
  }
  const h = harness([savedJob({ id: " " })]); assert.equal(h.button("Edit Workshop").props.disabled, true); h.click("Edit Workshop"); assert.equal(h.form(), undefined);
});

test("unknown saved stages require explicit review and never invent a previous enquiry stage", () => {
  for (const stage of ["Unknown", "__proto__", undefined]) {
    const h = harness([savedJob({ status: stage })]); h.click("Edit Workshop"); assert.equal(h.field("Status").props.value, ""); h.submit(); assert.equal(h.writes.length, 0);
    h.enter("Status", "Enquiry"); h.submit(); assert.equal(h.data.jobs[0].status, "Enquiry");
    assert.equal(h.data.timeline.length, 1); assert.equal(h.data.timeline[0].fromStatus, undefined); assert.match(h.data.timeline[0].note, /after review/);
  }
  const h = harness([savedJob({ status: "In progress" })]); h.click("Edit Workshop"); assert.equal(h.field("Status").props.value, "First fix"); h.submit(); assert.equal(h.data.timeline.length, 0);
});

test("a failed edit note retries the original transition without changing a later saved stage", () => {
  const h = harness([savedJob()]); h.click("Edit Workshop"); h.enter("Status", "First fix"); h.failures.add("timeline:create"); h.submit();
  assert.equal(h.data.jobs[0].status, "First fix"); assert.equal(h.form(), undefined);
  h.data.jobs = [{ ...h.data.jobs[0], status: "Testing" }]; h.failures.clear(); h.click("Retry timeline note");
  assert.equal(h.data.jobs[0].status, "Testing"); assert.equal(jobWrites(h).length, 1); assert.equal(h.data.timeline[0].toStatus, "First fix");
});

test("deletion waits for confirmation and durable persistence, keeping the record after failure", () => {
  const original = savedJob(), h = harness([original]); h.confirm(false); h.click("Delete Workshop"); assert.equal(h.writes.length, 0);
  h.confirm(true); h.failures.add("jobs:delete"); h.click("Delete Workshop"); assert.equal(h.data.jobs[0], original); assert.match(text(h.render()), /Deletion could not be confirmed/);
  h.failures.clear(); const repeat = h.button("Delete Workshop").props.onClick; repeat(); repeat();
  assert.equal(h.data.jobs.length, 0); assert.equal(jobWrites(h).length, 1); assert.equal(h.confirmations.length, 3);
  assert.match(text(h.render()), /Job deleted on this device.*Check sync status/);
});

test("deletion rejects stale records and rechecks identity readiness and privileges after confirmation", () => {
  for (const change of [h => { h.data.jobs = [{ ...h.data.jobs[0], notes: "Changed during confirmation" }]; }, h => { h.data.jobs = [h.data.jobs[0], { ...h.data.jobs[0] }]; h.render(); }, h => { h.data.jobs = []; h.render(); }, h => { h.ready.jobs = false; h.render(); }, h => h.account({ role: "office" }), h => h.account({ organisationId: "org-2" }), h => h.unmount()]) {
    const h = harness([savedJob()]); h.confirm(true, () => change(h)); h.click("Delete Workshop"); assert.equal(h.writes.length, 0);
  }
  const h = harness([savedJob()]), stale = h.button("Delete Workshop").props.onClick;
  h.data.jobs = [{ ...h.data.jobs[0], value: 999 }]; h.render(); stale(); assert.equal(h.confirmations.length, 0); assert.equal(h.writes.length, 0);
});

test("an open edit draft blocks deletion and office accounts retain editing without deletion", () => {
  const h = harness([savedJob()]); h.click("Edit Workshop"); h.enter("Job notes", "Unsaved detail"); h.click("Delete Workshop");
  assert.equal(h.confirmations.length, 0); assert.ok(h.form()); assert.match(text(h.render()), /Save or close this job's edit form/);
  h.open(); const staleDelete = h.button("Delete Workshop").props.onClick; h.account({ role: "office" }); staleDelete();
  assert.equal(h.confirmations.length, 0); assert.equal(h.button("Delete Workshop"), undefined);
  h.click("Edit Workshop"); h.enter("Job title", "Office change"); h.submit(); assert.equal(h.data.jobs[0].title, "Office change");
});
