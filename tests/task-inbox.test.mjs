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
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports: mod.exports, module: mod, Date, Error, URLSearchParams, ...globals, require(name) { assert.ok(name in deps, name); return deps[name]; } });
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

function pageHarness({ tasks: initialTasks = [], jobs = [job()], search = "", ready: initialReady = true, writable = false, failTasks = 0, failTimeline = 0, failUpdates = 0, failDeletes = 0, confirmDelete = true } = {}) {
  const state = [], effects = [], frames = [], listeners = {};
  let cursor = 0, tasks = initialTasks, timeline = [], ready = initialReady, writes = 0, ids = 0;
  const attempts = [];
  function create(kind, item) {
    if (!writable) return noWrite();
    writes++; attempts.push({ kind, item });
    if ((kind === "task" && failTasks-- > 0) || (kind === "timeline" && failTimeline-- > 0)) throw new Error(`${kind} storage failed`);
    const current = kind === "task" ? tasks : timeline;
    if (current.some((record) => record.id === item.id)) throw new Error("Duplicate record id");
    if (kind === "task") tasks = [item, ...tasks]; else timeline = [item, ...timeline];
    return item;
  }
  function updateItem(id, update) {
    if (!writable) return noWrite();
    const index = tasks.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("The collection record is no longer available");
    const item = update(tasks[index]);
    if (item === tasks[index]) return item;
    writes++; attempts.push({ kind: "update", item });
    if (failUpdates-- > 0) throw new Error("task update storage failed");
    tasks = tasks.map((current, i) => i === index ? item : current);
    return item;
  }
  function removeItem(id, validate) {
    if (!writable) return noWrite();
    const item = tasks.find((item) => item.id === id);
    if (!item) throw new Error("The collection record is no longer available");
    validate?.(item); writes++; attempts.push({ kind: "delete", item });
    if (failDeletes-- > 0) throw new Error("task deletion storage failed");
    tasks = tasks.filter((item) => item.id !== id);
    return item;
  }
  const useState = (initial) => { const index = cursor++; if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial; return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; };
  const noWrite = () => { writes++; throw new Error("Inbox navigation must not write records"); };
  const store = (items) => ({ items, isReady: ready, setItems: noWrite, remove: noWrite });
  const page = compile("../app/job-tasks/page.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx }, react: { useState, useRef: (value) => useState({ current: value })[0], useMemo: (fn) => fn(), useEffect: (fn) => effects.push(fn) }, "lucide-react": {},
    "../../components/ui/Card": { Card: "Card" }, "../../components/ui/Button": { Button: "Button" }, "../../components/ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" }, "../../components/ui/PageHeader": { PageHeader: "PageHeader" },
    "../../lib/cloud/coreBusinessCollections": { useJobsCollection: () => store(jobs), useJobTasksCollection: () => ({ ...store(tasks), createItem: (item) => create("task", item), updateItem, removeItem }), useJobTimelineCollection: () => ({ ...store(timeline), createItem: (item) => create("timeline", item) }), useTeamCollection: () => store([]) },
    "../../lib/storage": { makeId: () => writable ? `new-${++ids}` : noWrite() }, "../../lib/jobTasks-core.mjs": taskCore, "../../lib/assistantSignals-core.mjs": signals, "../../lib/taskInbox": inbox,
  }, { window: { confirm: () => confirmDelete, location: { search }, requestAnimationFrame(fn) { frames.push(fn); return frames.length; }, cancelAnimationFrame() {}, setInterval() { return 1; }, clearInterval() {}, addEventListener(type, fn) { listeners[type] = fn; }, removeEventListener() {} } });
  const render = () => { cursor = 0; effects.length = 0; return page.default(); };
  const flush = () => { render(); effects.splice(0).forEach((fn) => fn()); frames.splice(0).forEach((fn) => fn()); };
  return { render, flush, writes: () => writes, attempts, tasks: () => tasks, timeline: () => timeline,
    replaceTimeline(value) { timeline = value; },
    field(label, value) { const form = nodes(render()).find((n) => n.type === "form"); const all = nodes(form); let input = all.find((n) => n.props.label === label); if (!input) input = nodes(all.find((n) => n.type === "label" && text(n).startsWith(label))).find((n) => n.type === "select"); assert.ok(input, label); input.props.onChange({ target: { value } }); },
    submitHandler() { const form = nodes(render()).find((n) => n.type === "form"); assert.ok(form); return () => form.props.onSubmit({ preventDefault() {} }); },
    retryHandler() { const button = nodes(render()).find((n) => n.type === "button" && text(n) === "Retry timeline note"); assert.ok(button); return button.props.onClick; },
    taskHandler(label) { const card = cards(render()).find((n) => /^(Task|Snag):/.test(n.props["aria-label"])); const button = nodes(card).find((n) => n.type === "button" && text(n) === label); assert.ok(button, label); return button.props.onClick; },
    replaceTasks(value) { tasks = value; }, setReady(value) { ready = value; }, fill(value) { nodes(render()).find((n) => n.type === "input").props.onChange({ target: { value } }); }, click(label) { const button = nodes(render()).find((n) => n.type === "button" && text(n).startsWith(label)); assert.ok(button, label); button.props.onClick(); } };
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

function draftTask(h, title = "Fit labels", type = "Task") {
  h.flush(); h.click(type); h.field("Job", "j1"); h.field("Title", title); h.field("Description", "Site draft details");
}

test("failed durable task creation retains the editable draft and stable id for a successful retry", () => {
  const h = pageHarness({ writable: true, failTasks: 1 }); draftTask(h);
  h.submitHandler()();
  assert.match(text(h.render()), /Task save could not be confirmed.*Your draft is still here.*task storage failed/);
  assert.equal(h.tasks().length, 0); assert.equal(h.timeline().length, 0);
  assert.equal(nodes(h.render()).find((n) => n.props.label === "Title").props.value, "Fit labels");
  h.field("Title", "Fit circuit labels"); h.submitHandler()();
  assert.equal(h.tasks().length, 1); assert.equal(h.timeline().length, 1);
  assert.equal(h.tasks()[0].title, "Fit circuit labels");
  assert.equal(h.attempts[0].item.id, h.attempts[1].item.id);
  assert.equal(nodes(h.render()).some((n) => n.type === "form"), false);
  assert.match(text(h.render()), /saved on this device.*Check sync status/);
});

test("a repeated submit cannot create the same task twice after the first durable save", () => {
  const h = pageHarness({ writable: true }); draftTask(h, "Fix faceplate", "Snag");
  const submit = h.submitHandler(); submit(); submit();
  assert.equal(h.tasks().length, 1); assert.equal(h.timeline().length, 1);
  assert.equal(h.tasks()[0].type, "Snag"); assert.equal(h.timeline()[0].eventType, "Snag");
  assert.equal(h.timeline()[0].sourceId, h.tasks()[0].id);
});

test("partial timeline failure offers a note-only retry and never recreates the saved task", () => {
  const h = pageHarness({ writable: true, failTimeline: 2 }); draftTask(h); h.submitHandler()();
  assert.equal(h.tasks().length, 1); assert.equal(h.timeline().length, 0);
  assert.equal(nodes(h.render()).some((n) => n.type === "form"), false);
  assert.match(text(h.render()), /Retry the note below; do not recreate the task/);
  h.retryHandler()(); assert.equal(h.timeline().length, 0); assert.match(text(h.render()), /task remains saved/);
  const retry = h.retryHandler(); retry(); retry();
  assert.equal(h.tasks().length, 1); assert.equal(h.timeline().length, 1);
  assert.equal(new Set(h.attempts.filter((a) => a.kind === "timeline").map((a) => a.item.id)).size, 1);
  assert.equal(h.attempts.filter((a) => a.kind === "task").length, 1);
  assert.doesNotMatch(text(h.render()), /Retry timeline note/);
});

test("timeline retry recognises an already saved matching note and refuses a conflicting identity", () => {
  for (const conflict of [false, true]) {
    const h = pageHarness({ writable: true, failTimeline: 1 }); draftTask(h); h.submitHandler()();
    const note = h.attempts.find((a) => a.kind === "timeline").item;
    h.replaceTimeline([{ ...note, ...(conflict ? { jobId: "other-job" } : {}) }]);
    const before = h.writes(); h.retryHandler()(); assert.equal(h.writes(), before);
    if (conflict) assert.match(text(h.render()), /ID is already used by a different record/);
    else assert.doesNotMatch(text(h.render()), /Retry timeline note/);
  }
});

test("timeline retry will not write a note for a task that was removed or moved to another job", () => {
  for (const moved of [false, true]) {
    const h = pageHarness({ writable: true, failTimeline: 1 }); draftTask(h); h.submitHandler()();
    h.replaceTasks(moved ? [{ ...h.tasks()[0], jobId: "other-job" }] : []);
    const before = h.writes(); h.retryHandler()(); assert.equal(h.writes(), before);
    assert.match(text(h.render()), /no longer available on this job/);
    assert.equal(h.timeline().length, 0);
  }
});

test("separate failed timeline notes remain available when another task is created", () => {
  const h = pageHarness({ writable: true, failTimeline: 2 }); draftTask(h, "First task"); h.submitHandler()();
  h.click("Task"); h.field("Title", "Second task"); h.submitHandler()();
  assert.equal(h.tasks().length, 2);
  assert.equal(nodes(h.render()).filter((n) => n.type === "button" && text(n) === "Retry timeline note").length, 2);
  h.retryHandler()(); h.retryHandler()(); assert.equal(h.timeline().length, 2);
  assert.equal(new Set(h.timeline().map((n) => n.sourceId)).size, 2);
});

test("invalid job and due-date fields retain the draft and never write a task", () => {
  for (const [label, value, expected] of [["Job", "missing", /Choose an available job/], ["Due date", "2026-02-30", /Choose a valid due date/]]) {
    const h = pageHarness({ writable: true }); draftTask(h); h.field(label, value); h.submitHandler()();
    assert.equal(h.writes(), 0); assert.match(text(h.render()), expected);
    assert.equal(nodes(h.render()).find((n) => n.props.label === "Title").props.value, "Fit labels");
  }
});

test("failed task status persistence keeps the saved status and does not create a timeline note", () => {
  const h = pageHarness({ tasks: [task()], writable: true, failUpdates: 1 }); h.flush();
  h.taskHandler("Completed")();
  assert.equal(h.tasks()[0].status, "Open"); assert.equal(h.timeline().length, 0);
  assert.match(text(h.render()), /Status save could not be confirmed.*task update storage failed/);
  h.taskHandler("Completed")();
  assert.equal(h.tasks()[0].status, "Completed"); assert.equal(h.timeline().length, 1);
  assert.match(text(h.render()), /updated to Completed.*saved on this device.*Check sync status/);
});

test("a repeated status tap creates one transition and one note", () => {
  const h = pageHarness({ tasks: [task()], writable: true }); h.flush();
  const complete = h.taskHandler("Completed"); complete(); complete();
  assert.equal(h.tasks()[0].status, "Completed"); assert.equal(h.timeline().length, 1);
  assert.equal(h.attempts.filter((item) => item.kind === "update").length, 1);
  assert.match(text(h.render()), /already Completed/);
});

test("status timeline failure retries only the original transition note after later task changes", () => {
  const h = pageHarness({ tasks: [task()], writable: true, failTimeline: 1 }); h.flush();
  h.taskHandler("Completed")();
  assert.equal(h.tasks()[0].status, "Completed"); assert.equal(h.timeline().length, 0);
  assert.match(text(h.render()), /updated to Completed on this device.*timeline note was not saved/);
  h.click("Completed"); h.taskHandler("Open")();
  assert.equal(h.tasks()[0].status, "Open"); assert.equal(h.timeline().length, 1);
  const retry = h.retryHandler(); retry(); retry();
  assert.equal(h.tasks()[0].status, "Open"); assert.equal(h.timeline().length, 2);
  assert.equal(h.attempts.filter((a) => a.kind === "update").length, 2);
  assert.equal(h.timeline().filter((note) => /changed from Open to Completed/.test(note.note)).length, 1);
});

test("a status action retains newer task fields and refuses a changed status, job or missing record", () => {
  for (const patch of [{ title: "Updated title", notes: "New notes" }, { status: "In progress" }, { jobId: "another-job" }, null]) {
    const h = pageHarness({ tasks: [task()], writable: true }); h.flush();
    const complete = h.taskHandler("Completed"); h.replaceTasks(patch ? [task(patch)] : []); complete();
    if (patch?.title) {
      assert.equal(h.tasks()[0].status, "Completed"); assert.equal(h.tasks()[0].notes, "New notes");
      assert.match(h.timeline()[0].note, /Updated title/);
    } else {
      assert.equal(h.writes(), 0); assert.equal(h.timeline().length, 0);
      assert.match(text(h.render()), /Status save could not be confirmed/);
    }
  }
});

test("unsupported task status transitions write neither a task nor a timeline note", () => {
  const h = pageHarness({ tasks: [task()], writable: true }); h.flush(); h.taskHandler("Customer confirmed")();
  assert.equal(h.writes(), 0); assert.equal(h.tasks()[0].status, "Open");
  assert.match(text(h.render()), /cannot move from Open to Customer confirmed/);
});

test("failed deletion retains the task and permits a later durable deletion", () => {
  const h = pageHarness({ tasks: [task()], writable: true, failDeletes: 1 }); h.flush(); h.taskHandler("Delete task")();
  assert.equal(h.tasks().length, 1); assert.match(text(h.render()), /Deletion could not be confirmed.*task deletion storage failed/);
  h.taskHandler("Delete task")();
  assert.equal(h.tasks().length, 0); assert.match(text(h.render()), /deleted on this device.*Check sync status/);
  assert.equal(h.timeline().length, 0);
});

test("deletion cancellation or a stale changed task cannot delete records", () => {
  const cancelled = pageHarness({ tasks: [task()], writable: true, confirmDelete: false }); cancelled.flush(); cancelled.taskHandler("Delete task")();
  assert.equal(cancelled.writes(), 0); assert.equal(cancelled.tasks().length, 1);
  for (const patch of [{ status: "In progress" }, { notes: "New site note" }, { jobId: "another-job" }, null]) {
    const h = pageHarness({ tasks: [task()], writable: true }); h.flush(); const remove = h.taskHandler("Delete task");
    const newer = patch ? [task(patch)] : []; h.replaceTasks(newer); remove();
    assert.equal(h.writes(), 0); assert.deepEqual(h.tasks(), newer);
    assert.match(text(h.render()), /Deletion could not be confirmed/);
  }
});

test("phone task cards enable only valid stage changes and mark the current status distinctly", () => {
  const stages = { Open: ["In progress", "Completed"], "In progress": ["Open", "Completed"], Completed: ["Open", "In progress", "Customer confirmed"], "Customer confirmed": ["Open"], Legacy: ["In progress", "Completed"] };
  for (const [status, allowed] of Object.entries(stages)) {
    const h = pageHarness({ tasks: [task({ status })], search: "?job=j1&task=t1" }); h.flush();
    const group = nodes(h.render()).find((n) => n.props["aria-label"] === "Task status actions"); assert.ok(group);
    const buttons = nodes(group).filter((n) => n.type === "button"); assert.equal(buttons.length, 4);
    for (const button of buttons) {
      const label = text(button); assert.equal(button.props.disabled, !allowed.includes(label), `${status}: ${label}`);
      assert.equal(button.props["aria-pressed"], label === status);
      assert.match(button.props.className, /min-h-12/);
      if (label !== status && button.props.disabled) assert.match(button.props.className, /disabled:opacity-40/);
    }
    assert.equal(h.writes(), 0);
    if (["Open", "In progress"].includes(status)) assert.match(text(h.render()), /Complete the task before recording customer confirmation/);
    if (status === "Customer confirmed") assert.match(text(h.render()), /Reopen the task before moving it/);
    if (status === "Legacy") assert.match(text(h.render()), /Saved status needs review/);
  }
});

test("phone stage controls follow completion and reopen immediately while preserving completion evidence", () => {
  const h = pageHarness({ tasks: [task()], search: "?job=j1&task=t1", writable: true }); h.flush();
  const buttons = () => nodes(nodes(h.render()).find((n) => n.props["aria-label"] === "Task status actions")).filter((n) => n.type === "button");
  const status = (label) => buttons().find((n) => text(n) === label);
  assert.equal(status("Customer confirmed").props.disabled, true);
  h.taskHandler("Completed")(); assert.equal(h.tasks()[0].status, "Completed"); const completedAt = h.tasks()[0].completedAt;
  assert.equal(status("Customer confirmed").props.disabled, false);
  h.taskHandler("Customer confirmed")(); assert.equal(h.tasks()[0].completedAt, completedAt); assert.ok(h.tasks()[0].customerConfirmedAt);
  assert.equal(status("In progress").props.disabled, true); assert.equal(status("Completed").props.disabled, true); assert.equal(status("Open").props.disabled, false);
  h.taskHandler("Open")(); assert.equal(h.tasks()[0].status, "Open"); assert.equal(h.tasks()[0].customerConfirmedAt, undefined);
  assert.equal(status("Customer confirmed").props.disabled, true); assert.equal(h.timeline().length, 3);
});

test("a disabled phone transition stays rejected even if an old callback is invoked directly", () => {
  const h = pageHarness({ tasks: [task()], search: "?job=j1&task=t1", writable: true }); h.flush();
  h.taskHandler("Customer confirmed")(); assert.equal(h.writes(), 0); assert.equal(h.tasks()[0].status, "Open");
  assert.match(text(h.render()), /cannot move from Open to Customer confirmed/);
  const complete = h.taskHandler("Completed"); h.replaceTasks([task({ status: "Customer confirmed" })]); complete();
  assert.equal(h.writes(), 0); assert.equal(h.tasks()[0].status, "Customer confirmed"); assert.match(text(h.render()), /status has changed/);
  const legacy = pageHarness({ tasks: [task({ status: "Legacy" })], search: "?job=j1&task=t1", writable: true }); legacy.flush();
  legacy.taskHandler("Open")(); assert.equal(legacy.writes(), 0); assert.equal(legacy.tasks()[0].status, "Legacy");
  assert.equal(legacy.timeline().length, 0, "a normalised same-stage action must not manufacture an Open-to-Open note");
});
