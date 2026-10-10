import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as taskCore from "../lib/jobTasks-core.mjs";
import * as signals from "../lib/assistantSignals-core.mjs";

const jsx = (type, props, key) => ({ type, props, key });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);
function compile(path, deps, globals = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports: mod.exports, module: mod, Date, URLSearchParams, ...globals, require(name) { assert.ok(name in deps, name); return deps[name]; } });
  return mod.exports;
}
const inbox = compile("../lib/taskInbox.ts", { "./jobTasks-core.mjs": taskCore, "./assistantSignals-core.mjs": signals });
const assistant = compile("../lib/assistantTasks.ts", { "./jobTasks-core.mjs": taskCore, "./assistantSignals-core.mjs": signals, "./taskInbox": inbox });
const now = new Date(2026, 9, 10, 10);
const job = (patch = {}) => ({ id: "j1", title: "Workshop", siteAddress: "1 High Street", status: "Scheduled", updatedAt: "2026-10-10T10:00:00Z", ...patch });
const task = (patch = {}) => ({ id: "t1", jobId: "j1", type: "Task", title: "Check labels", description: "Confirm circuit labels", category: "General", priority: "Normal", dueDate: "2026-10-10", status: "Open", photos: [], notes: "", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", ...patch });

test("task priorities distinguish urgent, safety, past, today, near and distant work", () => {
  const data = [task({ id: "future", dueDate: "2026-12-01" }), task({ id: "today" }), task({ id: "late", dueDate: "2026-10-09" }), task({ id: "safety", category: "Safety", dueDate: "" }), task({ id: "urgent", priority: "Urgent", dueDate: "2026-12-01" }), task({ id: "high", priority: "High", dueDate: "" }), task({ id: "near", dueDate: "2026-10-16" }), task({ id: "outside", dueDate: "2026-10-17" }), task({ id: "closed", status: "Completed", priority: "Urgent" }), task({ id: "confirmed", status: "Customer confirmed", category: "Safety" }), task({ id: "invalid", dueDate: "2026-02-30" })];
  const copy = structuredClone(data);
  const actions = assistant.assistantTaskActions(data, [job()], now);
  assert.deepEqual(Array.from(actions, (item) => [item.id, item.priority]), [["task:late", "Now"], ["task:urgent", "Now"], ["task:safety", "Now"], ["task:today", "Today"], ["task:high", "Today"], ["task:near", "Next"]]);
  assert.match(actions.find((a) => a.id === "task:safety").reason, /categorised as Safety/);
  assert.equal(assistant.assistantTaskActions(data, [job()], now, false).length, 9);
  assert.deepEqual(data, copy);
});

test("task links encode exact identities and preserve closed-job, orphan and invalid-status evidence", () => {
  const actions = assistant.assistantTaskActions([task({ id: "t /?#", jobId: "j /?#", status: "Legacy" }), task({ id: "orphan", jobId: "missing" })], [job({ id: "j /?#", status: "Complete" })], now);
  const linked = actions.find((a) => a.id === "task:t /?#");
  assert.equal(linked.href, "/job-tasks?job=j%20%2F%3F%23&task=t%20%2F%3F%23");
  assert.match(linked.evidence.join(" "), /Workshop · Complete/);
  assert.match(linked.evidence.join(" "), /Legacy · needs review/);
  assert.match(actions.find((a) => a.id === "task:orphan").evidence.join(" "), /not found in the loaded records/);
});

test("inbox filters preserve open legacy work and refuse invalid dates as due", () => {
  const tasks = [task(), task({ id: "snag", type: "Snag", status: "In progress" }), task({ id: "past", dueDate: "2026-10-09" }), task({ id: "future", dueDate: "2026-10-11" }), task({ id: "invalid", dueDate: "2026-02-30" }), task({ id: "missing", dueDate: "" }), task({ id: "legacy", status: "Old status" }), task({ id: "done", status: "Completed" }), task({ id: "confirmed", status: "Customer confirmed" })];
  const ids = (filter) => tasks.filter((t) => inbox.taskMatchesInboxFilter(t, filter, "2026-10-10")).map((t) => t.id);
  assert.deepEqual(ids("Open"), ["t1", "snag", "past", "future", "invalid", "missing", "legacy"]);
  assert.deepEqual(ids("Due"), ["t1", "snag", "past", "legacy"]);
  assert.deepEqual(ids("Snags"), ["snag"]);
  assert.deepEqual(ids("Completed"), ["done", "confirmed"]);
  assert.equal(ids("All").length, 9);
});

test("task search combines words across task and job fields without mutating records", () => {
  const data = [task(), task({ id: "other", jobId: "j2" })];
  const copy = structuredClone(data);
  const options = { jobId: "", filter: "Open", query: "LABELS high STREET", today: "2026-10-10" };
  assert.deepEqual(Array.from(inbox.filterTaskInbox(data, [job(), job({ id: "j2", siteAddress: "Elsewhere" })], options), (t) => t.id), ["t1"]);
  assert.equal(inbox.filterTaskInbox(data, [job()], { ...options, jobId: "j2" }).length, 0);
  assert.deepEqual(data, copy);
});

test("deep links resolve exact authorized records and reject mismatched or missing targets", () => {
  const tasks = [task({ id: "t /?#", jobId: "j /?#", status: "Completed" })], jobs = [job({ id: "j /?#" })];
  assert.deepEqual(JSON.parse(JSON.stringify(inbox.resolveTaskInboxLink(tasks, jobs, "?job=j%20%2F%3F%23&task=t%20%2F%3F%23"))), { taskId: "t /?#", jobId: "j /?#", missing: false });
  for (const query of ["?job=other&task=t%20%2F%3F%23", "?task=missing", "?job=missing", "?task=https%3A%2F%2Fexample.com"]) assert.equal(inbox.resolveTaskInboxLink(tasks, jobs, query).missing, true);
  assert.equal(inbox.resolveTaskInboxLink([task()], [], "?task=t1&job=j1").taskId, "t1");
});

function pageHarness({ tasks: initialTasks = [], jobs = [job()], search = "", ready: initialReady = true } = {}) {
  const state = [], effects = [], frames = [], listeners = {};
  let cursor = 0, tasks = initialTasks, ready = initialReady, writes = 0;
  const useState = (initial) => { const index = cursor++; if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial; return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; };
  const noWrite = () => { writes++; throw new Error("Inbox navigation must not write records"); };
  const store = (items) => ({ items, isReady: ready, setItems: noWrite, remove: noWrite });
  const page = compile("../app/job-tasks/page.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx }, react: { useState, useRef: (value) => useState({ current: value })[0], useMemo: (fn) => fn(), useEffect: (fn) => effects.push(fn) }, "lucide-react": {},
    "../../components/ui/Card": { Card: "Card" }, "../../components/ui/Button": { Button: "Button" }, "../../components/ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" }, "../../components/ui/PageHeader": { PageHeader: "PageHeader" },
    "../../lib/cloud/coreBusinessCollections": { useJobsCollection: () => store(jobs), useJobTasksCollection: () => store(tasks), useJobTimelineCollection: () => store([]), useTeamCollection: () => store([]) },
    "../../lib/storage": { makeId: noWrite }, "../../lib/jobTasks-core.mjs": taskCore, "../../lib/assistantSignals-core.mjs": signals, "../../lib/taskInbox": inbox,
  }, { window: { location: { search }, requestAnimationFrame(fn) { frames.push(fn); return frames.length; }, cancelAnimationFrame() {}, setInterval() { return 1; }, clearInterval() {}, addEventListener(type, fn) { listeners[type] = fn; }, removeEventListener() {} } });
  const render = () => { cursor = 0; effects.length = 0; return page.default(); };
  const flush = () => { render(); effects.splice(0).forEach((fn) => fn()); frames.splice(0).forEach((fn) => fn()); };
  return { render, flush, writes: () => writes, replaceTasks(value) { tasks = value; }, setReady(value) { ready = value; }, fill(value) { nodes(render()).find((n) => n.type === "input").props.onChange({ target: { value } }); }, click(label) { const button = nodes(render()).find((n) => n.type === "button" && text(n).startsWith(label)); assert.ok(button, label); button.props.onClick(); } };
}
const cards = (view) => nodes(view).filter((n) => n.type === "Card" && n.props["aria-label"]);

test("phone inbox uses real filter, search, progressive reveal and reset handlers", () => {
  const h = pageHarness({ tasks: [...Array.from({ length: 11 }, (_, i) => task({ id: String(i), title: `Site task ${i}` })), task({ id: "done", status: "Completed" }), task({ id: "snag", type: "Snag", title: "Damaged switch" })] });
  h.flush(); assert.equal(cards(h.render()).length, 8);
  h.click("Show more tasks"); assert.equal(cards(h.render()).length, 12);
  h.click("Completed"); assert.equal(cards(h.render()).length, 1);
  h.click("Snags"); assert.equal(cards(h.render())[0].props["aria-label"], "Snag: Damaged switch");
  h.fill("missing"); assert.equal(cards(h.render()).length, 0);
  h.click("Reset filters"); assert.equal(cards(h.render()).length, 8);
  h.fill("High Street task 10"); assert.equal(cards(h.render()).length, 1);
  assert.equal(h.writes(), 0);
});

test("exact task links survive a completion update and do not reveal another task if deleted", () => {
  const h = pageHarness({ tasks: [task(), task({ id: "other", title: "Other task" })], search: "?job=j1&task=t1" });
  h.flush(); assert.equal(cards(h.render()).length, 1);
  assert.match(text(h.render()), /Showing the task you opened/);
  h.replaceTasks([task({ status: "Completed" }), task({ id: "other" })]);
  assert.equal(cards(h.render()).length, 1); assert.match(text(cards(h.render())), /Completed/);
  h.replaceTasks([task({ id: "other" })]); assert.equal(cards(h.render()).length, 0); assert.match(text(h.render()), /task link is unavailable/);
  h.click("Show all open tasks"); assert.equal(cards(h.render()).length, 1);
  assert.equal(h.writes(), 0);
});

test("task links wait for all sources and cannot manufacture a job or open a creation form", () => {
  const h = pageHarness({ tasks: [task()], search: "?job=wrong&task=t1&action=create", ready: false });
  h.flush(); assert.match(text(h.render()), /Loading job tasks/);
  h.setReady(true); h.flush(); assert.equal(cards(h.render()).length, 0);
  assert.match(text(h.render()), /task link is unavailable/);
  assert.equal(nodes(h.render()).some((n) => n.type === "form"), false);
  assert.equal(h.writes(), 0);
});
