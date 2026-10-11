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
const job = (patch = {}) => ({ id: "j1", title: "Workshop", status: "Scheduled", siteAddress: "1 High Street", startDate: "", notes: "", customerId: "c1", ...patch });
const cards = (view) => nodes(nodes(view).find(n => n.props["aria-label"] === "Job records")).filter(n => n.type === "Card");

function harness({ jobs: initial = [], role = "owner", ready: initialReady = true } = {}) {
  const slots = [], layouts = []; let cursor = 0, jobs = initial, ready = initialReady, blurred = 0;
  const failWrite = () => { throw new Error("Browsing must not write any record or create an identity"); };
  const collection = (items = []) => ({ items, isReady: ready, setItems: failWrite, remove: failWrite });
  const dependencies = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; }, useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; }, useMemo: fn => fn(), useEffect() {}, useLayoutEffect(fn) { layouts.push(fn); } },
    "next/link": { default: "Link" }, "lucide-react": {},
    "../../components/ui/Button": { Button: "Button" }, "../../components/ui/Card": { Card: "Card" }, "../../components/ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" }, "../../components/ui/PageHeader": { PageHeader: "PageHeader" }, "../../components/ui/StatusBadge": { StatusBadge: "StatusBadge" }, "../../components/crm/EntityEmptyState": { EntityEmptyState: "Empty" },
    "../../lib/cloud/adapter": { accountStorageKey: (...parts) => parts.join(":") },
    "../../lib/cloud/coreBusinessCollections": { useJobsCollection: () => collection(jobs), useCustomersCollection: () => collection([{ id: "c1", name: "Sample customer" }]), useBuildersCollection: () => collection([{ id: "b1", companyName: "Example builder" }]), useJobTimelineCollection: () => collection(), useTeamCollection: () => collection() },
    "../../lib/cloud/fieldMutationPolicy-core.mjs": policy, "../../lib/cloud/permissions": permissions,
    "../../lib/cloud/repository-core.mjs": {}, "../../lib/cloud/repository": {},
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ mode: "cloud", isReady: ready, identity: { role, organisationId: "org", userId: "user" } }) },
    "../../lib/jobManagement-core.mjs": jobCore, "../../lib/siteDiaryIdentity-core.mjs": { fieldOperatorMemberId: () => "member" },
    "../../lib/assistantJobLink": links, "../../lib/assistantIdentity": identities, "../../lib/assistantSignals-core.mjs": signals, "../../lib/storage": { makeId: failWrite },
  };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/jobs/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module: mod, exports: mod.exports, Date, Intl, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  const render = () => { cursor = 0; const view = mod.exports.default(); layouts.splice(0).forEach(fn => fn()); return view; };
  const input = () => nodes(render()).find(n => n.type === "input" && n.props.type === "search");
  return { render, replace(value) { jobs = value; }, setReady(value) { ready = value; },
    search(value) { input().props.onChange({ target: { value } }); },
    filter(value) { nodes(render()).find(n => n.type === "label" && text(n).startsWith("Job stage filter")).props.children[1].props.onChange({ target: { value } }); },
    click(label) { const button = nodes(render()).find(n => (n.type === "button" || n.type === "Button") && text(n).startsWith(label)); assert.ok(button, label); button.props.onClick(); },
    openForm() { nodes(render()).find(n => n.type === "PageHeader").props.action.props.onClick(); },
    field(label, value) { nodes(render()).find(n => n.type === "InputField" && n.props.label === label).props.onChange({ target: { value } }); },
    enter() { input().props.onKeyDown({ key: "Enter", currentTarget: { blur() { blurred++; } } }); }, blurred: () => blurred,
  };
}

test("phone jobs reveal eight at a time and reset paging without discarding an open draft", () => {
  const h = harness({ jobs: Array.from({ length: 19 }, (_, i) => job({ id: `j${i}`, title: `Job ${i}` })) });
  assert.equal(cards(h.render()).length, 8); assert.match(text(h.render()), /Showing 8 of 19 matching job records/);
  h.click("Show more jobs"); assert.equal(cards(h.render()).length, 16);
  h.click("Show more jobs"); assert.equal(cards(h.render()).length, 19);
  h.openForm(); h.field("Job title", "Keep this draft"); h.search("Job"); assert.equal(cards(h.render()).length, 8);
  h.click("Show more jobs"); h.filter("Active"); assert.equal(cards(h.render()).length, 8);
  h.click("Show more jobs"); h.click("Clear job filters"); assert.equal(cards(h.render()).length, 8);
  assert.equal(nodes(h.render()).find(n => n.type === "InputField" && n.props.label === "Job title").props.value, "Keep this draft");
});

test("job search matches words across contact and site fields, combines with stages and dismisses the keyboard", () => {
  const saved = [job(), job({ id: "builder", title: "Factory", siteAddress: "Industrial Estate", customerId: undefined, builderId: "b1", status: "Paid" }), job({ id: "notes", title: "Storage", notes: "secret searchable note", value: 876543 })];
  const before = JSON.stringify(saved), h = harness({ jobs: saved });
  h.search(" HIGH  sample WORKshop "); assert.equal(cards(h.render()).length, 1); assert.match(text(cards(h.render())), /Workshop/);
  h.search("builder industrial"); h.filter("Closed"); assert.equal(cards(h.render()).length, 1); assert.match(text(cards(h.render())), /Factory/);
  h.filter("Active"); assert.equal(cards(h.render()).length, 0); h.click("Clear job filters");
  for (const query of ["secret searchable", "876543", "undefined"]) { h.search(query); assert.equal(cards(h.render()).length, 0); }
  h.enter(); assert.equal(h.blurred(), 1); assert.equal(JSON.stringify(saved), before);
  for (const control of nodes(h.render()).filter(n => (n.type === "input" && n.props.type === "search") || (n.type === "button" && text(n) === "Clear job filters"))) assert.match(control.props.className, /min-h-12/);
});

test("active closed and review filters retain legacy stages without classifying unknown records as enquiries", () => {
  const h = harness({ jobs: [job(), job({ id: "legacy", status: "In progress" }), job({ id: "lead", status: "Lead" }), job({ id: "closed", status: "Complete" }), job({ id: "invoiced", status: "Invoiced" }), job({ id: "hold", status: "On hold" }), job({ id: "unknown", status: "Waiting for something" }), job({ id: "missing", status: undefined })] });
  h.filter("Active"); assert.equal(cards(h.render()).length, 3);
  h.filter("Closed"); assert.equal(cards(h.render()).length, 2);
  h.filter("On hold"); assert.equal(cards(h.render()).length, 1);
  h.filter("First fix"); assert.equal(cards(h.render()).length, 1);
  h.filter("Enquiry"); assert.equal(cards(h.render()).length, 1);
  h.filter("Review"); assert.equal(cards(h.render()).length, 2);
  for (const card of cards(h.render())) {
    assert.equal(nodes(card).some(n => n.type === "StatusBadge"), false); assert.match(text(card), /Needs status review/);
    const select = nodes(card).find(n => n.type === "select"); assert.equal(select.props.value, "");
    const placeholder = nodes(select).find(n => n.type === "option" && n.props.value === ""); assert.equal(placeholder.props.disabled, true);
  }
});

test("job review and JR AI links encode the saved identity while readiness and field roles keep their boundaries", () => {
  const id = " j /?# +&action=create ", h = harness({ jobs: [job({ id })] });
  const savedLinks = nodes(cards(h.render())[0]).filter(n => n.type === "Link");
  assert.equal(savedLinks[0].props.href, `/jobs/${encodeURIComponent(id)}`);
  assert.equal(links.assistantJobFromLink(new URL(savedLinks[1].props.href, "https://jr.example").search).jobId, id);
  h.setReady(false); assert.equal(cards(h.render()).length, 0); assert.match(text(h.render()), /Loading jobs/); h.setReady(true); assert.equal(cards(h.render()).length, 1);
  const field = harness({ jobs: [job({ status: " Scheduled " })], role: "electrician" }); field.filter("Scheduled"); assert.equal(cards(field.render()).length, 1);
  assert.equal(nodes(cards(field.render())[0]).filter(n => n.type === "Link").length, 1); assert.doesNotMatch(text(field.render()), /Ask JR AI/);
  assert.equal(nodes(field.render()).find(n => n.type === "PageHeader").props.action, undefined);
  assert.deepEqual(nodes(cards(field.render())[0]).filter(n => n.type === "option").map(text), ["Scheduled", "First fix"]);
  for (const status of ["Unknown", "__proto__", "constructor", "toString"]) {
    field.replace([job({ status })]); field.filter("Review");
    const select = nodes(cards(field.render())[0]).find(n => n.type === "select");
    assert.equal(select.props.disabled, true);
    assert.ok(nodes(select).filter(n => n.type === "option").every(n => n.props.disabled || jobCore.canonicalJobStatuses.includes(text(n))));
  }
});
