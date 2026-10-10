import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as signals from "../lib/assistantSignals-core.mjs";
import * as jobsCore from "../lib/jobManagement-core.mjs";
import * as taskCore from "../lib/jobTasks-core.mjs";
import * as payments from "../lib/payments.ts";
import * as permissions from "../lib/cloud/permissions.ts";

function compile(path, dependencies = {}, jsx = false, globals = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) } }).outputText, { ...globals, module: mod, exports: mod.exports, Date, Intl, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return mod.exports;
}
const jobLink = compile("../lib/assistantJobLink.ts", {}, false, { URLSearchParams });
const scheduling = compile("../lib/scheduling.ts");
const taskInbox = compile("../lib/taskInbox.ts", { "./jobTasks-core.mjs": taskCore, "./assistantSignals-core.mjs": signals });
const assistantTasks = compile("../lib/assistantTasks.ts", { "./jobTasks-core.mjs": taskCore, "./assistantSignals-core.mjs": signals, "./taskInbox": taskInbox });
const dashboard = compile("../lib/dashboardIntelligence.ts", { "./jobManagement-core.mjs": jobsCore });
const briefing = compile("../lib/assistantBriefing.ts", { "./assistantTasks": assistantTasks, "./scheduling": scheduling, "./jobManagement-core.mjs": jobsCore, "./dashboardIntelligence": dashboard, "./assistantSignals-core.mjs": signals, "./payments": payments });
const questions = compile("../lib/assistantQuestions.ts", { "./assistantTasks": assistantTasks, "./assistantBriefing": briefing, "./assistantSignals-core.mjs": signals, "./jobManagement-core.mjs": jobsCore, "./payments": payments, "./scheduling": scheduling });
const now = new Date(2026, 9, 10, 10);
const records = (patch = {}) => ({ jobs: [], documents: [], invoices: [], payments: [], planner: [], purchases: [], reminders: [], certificates: [], ...patch });
const visit = (patch = {}) => ({ id: "v1", title: "First fix", status: "Confirmed", date: "2026-10-11", startTime: "09:00", endTime: "12:00", location: "1 High Street", teamMemberIds: ["worker"], ...patch });
const job = (patch = {}) => ({ id: "j1", title: "Workshop", status: "Scheduled", startDate: "2026-10-11", siteAddress: "1 High Street", assignedTo: ["worker"], ...patch });
const invoice = (patch = {}) => ({ id: "i1", number: "INV-1", title: "Lighting", status: "Sent", dueDate: "2026-10-09", items: [{ quantity: 2, unitPrice: 100 }], vatEnabled: true, vatRate: 20, amountPaid: 0, ...patch });
const siteTask = (patch = {}) => ({ id: "t1", jobId: "j1", type: "Task", title: "Fit labels", status: "Open", priority: "Normal", category: "General", dueDate: "", ...patch });
const answer = (question, data = {}, date = now) => questions.answerAssistantQuestion(records(data), question, date);
const answerFor = (question, data, id) => questions.answerAssistantQuestion(records(data), question, now, undefined, id);

test("question matching accepts normal phrasing and punctuation, and rejects ambiguous scopes or commands", () => {
  for (const [query, intent] of [["What's booked tomorrow?", "tomorrow"], ["Please show my diary next seven days!", "week"], ["Can you tell me how much is overdue?", "overdue"], ["Who owes me money?", "unpaid"], ["Show quote follow-ups", "quotes"], ["Am I ready for site?", "site"], ["What should I do next?", "priorities"]]) assert.equal(questions.assistantQuestionIntent(query), intent, query);
  for (const query of ["Show tomorrow's weather", "How much is overdue for Smith?", "Don't show unpaid invoices", "Delete overdue invoices", "Show my diary next month", "How much is overdue and what is booked tomorrow?", "x".repeat(181)]) {
    assert.equal(questions.assistantQuestionIntent(query), null, query);
    assert.equal(answer(query).recognized, false);
    assert.equal(answer(query).items.length, 0);
  }
  assert.equal(answer(" "), null);
});

test("tomorrow includes spanning bookings and unbooked job starts, deduplicating only the linked job fallback", () => {
  const result = answer("What is booked tomorrow?", { planner: [visit({ jobId: "j1" }), visit({ id: "span", date: "2026-10-09", endDate: "2026-10-12", startTime: "08:00" }), visit({ id: "cancelled", status: "Cancelled" }), visit({ id: "complete", status: "Complete" })], jobs: [job(), job({ id: "j /?#", title: "New start" }), job({ id: "closed", status: "Paid" })] });
  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].id, "visit:span");
  assert.match(result.summary, /2 diary bookings and 1 job start/);
  assert.equal(result.items[0].href, "/planner?date=2026-10-11");
  assert.match(result.items.find((item) => item.id === "job:j /?#").detail, /visit time not confirmed/);
  assert.equal(result.items.find((item) => item.id === "job:j /?#").href, "/jobs/j%20%2F%3F%23");
  assert.match(result.scope, /does not confirm availability or site readiness/);
});

test("seven-day answers include today through day six, retain missing times, and report invalid date evidence", () => {
  const result = answer("Show my diary next 7 days", { planner: [visit({ date: "2026-10-10", startTime: "", endTime: "" }), visit({ id: "last", date: "2026-10-16" }), visit({ id: "beyond", date: "2026-10-17" }), visit({ id: "invalid", date: "2026-02-30" }), visit({ id: "reversed", endDate: "2026-10-09" })] });
  assert.equal(result.items.length, 2);
  assert.match(result.items[0].detail, /Time needs review/);
  assert.match(result.scope, /2026-10-10 to 2026-10-16/);
  assert.match(result.warnings[0], /2 diary entr/);
  const repeated = answer("What is booked tomorrow?", { planner: [visit({ jobId: "j1" }), visit({ id: "v2", jobId: "j1", startTime: "13:00", endTime: "16:00" })], jobs: [job()] });
  assert.equal(repeated.items.length, 2, "separate visits must remain visible");
});

test("answers follow the local calendar over a year boundary and planner dates reject malformed values", () => {
  const result = answer("What's booked tomorrow?", { planner: [visit({ date: "2027-01-01" })] }, new Date(2026, 11, 31, 23, 59));
  assert.equal(result.items[0].href, "/planner?date=2027-01-01");
  assert.equal(scheduling.plannerViewDate("2028-02-29"), "2028-02-29");
  for (const value of [null, "", "2026-02-29", "2026-02-30", "2026-1-1", "10/10/2026", "2026-10-10&action=create", "javascript:alert(1)"]) assert.equal(scheduling.plannerViewDate(value), null);
});

test("money answers distinguish overdue from future/current debts and use recorded ledger payments", () => {
  const data = { invoices: [invoice({ id: "i/1?#" }), invoice({ id: "today", dueDate: "2026-10-10" }), invoice({ id: "future", dueDate: "2026-10-12" }), invoice({ id: "paid", status: "Paid" }), invoice({ id: "draft", status: "Draft" })], payments: [{ invoiceId: "i/1?#", type: "Payment", amount: 100 }] };
  const overdue = answer("How much is overdue?", data);
  assert.match(overdue.summary, /£140\.00 across 1 invoice/);
  assert.equal(overdue.items[0].href, "/invoices?invoice=i%2F1%3F%23");
  assert.match(overdue.items[0].evidence.join(" "), /£100\.00/);
  assert.match(answer("Who owes me money?", data).summary, /£620\.00 across 3 invoices/);
  assert.match(answer("How much am I owed?", { invoices: [invoice()], payments: [{ invoiceId: "i1", type: "Payment", amount: 240 }] }).summary, /£0\.00 across 0 invoices/);
});

test("money totals keep penny precision and visibly exclude invalid amounts or unknown overdue dates", () => {
  const pennies = Array.from({ length: 3 }, (_, id) => invoice({ id: String(id), items: [{ quantity: 1, unitPrice: 0.1 }], vatEnabled: false }));
  assert.match(answer("How much is overdue?", { invoices: pennies }).summary, /£0\.30/);
  const invalid = answer("How much is overdue?", { invoices: [invoice({ dueDate: "" }), invoice({ id: "invalid", items: [{ quantity: Infinity, unitPrice: 2 }] })] });
  assert.equal(invalid.items.length, 0);
  assert.equal(invalid.warnings.length, 2);
  const large = Array.from({ length: 2 }, (_, id) => invoice({ id: String(id), items: [{ quantity: 1, unitPrice: 5e13 }], vatEnabled: false }));
  assert.match(answer("How much am I owed?", { invoices: large }).summary, /outside the supported total range/);
});

test("malformed recorded-paid amounts are reported instead of becoming zero-paid invoice chases", () => {
  for (const amountPaid of [undefined, null, NaN, Infinity, -1]) {
    const data = records({ invoices: [invoice({ amountPaid })] });
    const result = questions.answerAssistantQuestion(data, "How much is overdue?", now);
    assert.equal(result.items.length, 0);
    assert.match(result.warnings[0], /invalid or unsupported amounts/);
    assert.equal(briefing.buildAssistantBriefing(data, now).actions.length, 0);
  }
});

test("quote answers respect contact agreements even when an expired quote still needs a pricing review", () => {
  const quote = { id: "q1", number: "Q-1", title: "Lighting", type: "Quote", status: "Sent", updatedAt: "2026-10-01T12:00:00Z", validUntil: "2026-10-08", nextFollowUpDate: "2026-10-12" };
  assert.equal(answer("Which quotes need chasing?", { documents: [quote] }).items.length, 0);
  assert.equal(answer("What should I do next?", { documents: [quote] }).items.length, 1);
  assert.equal(answer("Which quotes need chasing?", { documents: [{ ...quote, nextFollowUpDate: "2026-10-10" }] }).items.length, 1);
});

test("answers retain source immutability, authorised internal links and explicit limits to site readiness", () => {
  const data = records({ jobs: [job({ assignedTo: [], siteAddress: "" })], invoices: [invoice()] });
  const before = JSON.stringify(data);
  const result = questions.answerAssistantQuestion(data, "Am I ready for site?", now);
  assert.equal(result.items.length, 1); assert.match(result.scope, /does not confirm/);
  for (const question of ["What should I do next?", "What's booked tomorrow?", "How much am I owed?"]) for (const item of questions.answerAssistantQuestion(data, question, now).items) assert.equal(permissions.canAccessPath("office", permissions.internalPathForAccess(item.href)), true);
  assert.equal(JSON.stringify(data), before);
});

const jsx = (type, props) => ({ type, props });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);
function ui(data = records(), canOpenTaskWorkspace = true, search = "") {
  const states = [], effects = [], frames = []; let cursor = 0, blurred = 0, mounted = false;
  const component = compile("../components/ai/AssistantQuestions.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useEffect: (fn) => { if (!mounted) effects.push(fn); }, useMemo: (fn) => fn(), useRef: () => ({ current: { blur: () => blurred++ } }), useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; } },
    "next/link": { default: "Link" }, "../ui/Card": { Card: "Card" }, "../../lib/assistantQuestions": questions, "../../lib/assistantJobLink": jobLink,
  }, true, { window: { location: { search }, requestAnimationFrame(fn) { frames.push(fn); return frames.length; }, cancelAnimationFrame(id) { frames[id - 1] = null; } } });
  let recordsNow = data;
  const render = () => { cursor = 0; const tree = component.AssistantQuestions({ records: recordsNow, now, briefing: briefing.buildAssistantBriefing(recordsNow, now, canOpenTaskWorkspace), canOpenTaskWorkspace }); mounted = true; return tree; };
  return { render, flush() { render(); effects.splice(0).forEach((fn) => fn()); frames.splice(0).filter(Boolean).forEach((fn) => fn()); }, blurred: () => blurred, replaceRecords(value) { recordsNow = value; }, scope(value) { nodes(render()).find((node) => node.type === "select").props.onChange({ target: { value } }); }, choose(index = 0) { const button = nodes(render()).filter((node) => node.type === "button" && text(node) === "Use this job")[index]; assert.ok(button); button.props.onClick(); }, fill(value) { nodes(render()).find((node) => node.type === "input").props.onChange({ target: { value } }); }, submit() { nodes(render()).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); }, click(label) { const button = nodes(render()).find((node) => node.type === "button" && text(node).startsWith(label)); assert.ok(button, label); button.props.onClick(); } };
}

test("quick question buttons, typed submission, progressive reveal, edit invalidation and clearing use real handlers", () => {
  const h = ui(records({ planner: Array.from({ length: 7 }, (_, index) => visit({ id: String(index) })) }));
  assert.equal(nodes(h.render()).find((node) => node.props.type === "submit").props.disabled, true);
  h.click("Tomorrow"); assert.match(text(h.render()), /7 diary bookings/);
  assert.equal(nodes(h.render()).filter((node) => node.type === "Link").length, 4);
  h.click("Show more records"); assert.equal(nodes(h.render()).filter((node) => node.type === "Link").length, 7);
  h.fill("How much is overdue?"); assert.doesNotMatch(text(h.render()), /7 diary bookings/);
  h.submit(); assert.match(text(h.render()), /£0\.00 across 0 invoices/); assert.equal(h.blurred(), 2);
  h.fill("Send an invoice"); h.submit(); assert.match(text(h.render()), /Try a supported question/);
  h.click("Clear answer"); assert.equal(nodes(h.render()).find((node) => node.type === "input").props.value, "");
  assert.equal(nodes(h.render()).some((node) => node.props["aria-label"] === "JR AI answer"), false);
});

test("submitted answers refresh when loaded records change without retaining a stale balance", () => {
  const data = records({ invoices: [invoice()] }); const h = ui(data);
  h.click("Overdue money"); assert.match(text(h.render()), /£240\.00 across 1 invoice/);
  h.replaceRecords({ ...data, payments: [{ invoiceId: "i1", type: "Payment", amount: 240 }] });
  assert.match(text(h.render()), /£0\.00 across 0 invoices/);
  assert.equal(nodes(h.render()).filter((node) => node.type === "Link").length, 0);
});

test("planner views include visits spanning the requested day, week or month", () => {
  for (const [date, end, anchor, view, expected] of [
    ["2026-10-09", "2026-10-12", "2026-10-11", "day", true],
    ["2026-10-09", "2026-10-12", "2026-10-13", "day", false],
    ["2026-09-01", "2026-11-30", "2026-10-11", "week", true],
    ["2026-09-30", "2026-10-01", "2026-10-11", "month", true],
    ["2026-09-30", "2026-09-30", "2026-10-11", "month", false],
    ["2026-10-09", "2026-10-01", "2026-10-11", "week", false],
    ["2026-02-30", "2026-10-12", "2026-10-11", "day", false],
  ]) assert.equal(scheduling.dateWithinView(date, anchor, view, end), expected);
});

test("actual planner date links select the day and show spanning visits without writing records", () => {
  const state = [], effects = []; let cursor = 0, writes = 0;
  const useState = (initial) => { const index = cursor++; if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial; return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; };
  const store = (items = []) => ({ items, isReady: true, setItems() { writes++; throw new Error("Navigation must not write records"); } });
  const plannerPage = compile("../app/planner/page.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useMemo: (fn) => fn(), useState, useRef: (value) => useState({ current: value })[0], useEffect: (fn) => effects.push(fn) },
    "next/link": { default: "Link" }, "lucide-react": {},
    "../../components/ui/Button": { Button: "Button" }, "../../components/ui/Card": { Card: "Card" }, "../../components/ui/PageHeader": { PageHeader: "PageHeader" }, "../../components/ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" },
    "../../lib/cloud/coreBusinessCollections": { useCustomersCollection: () => store(), useJobsCollection: () => store(), usePlannerCollection: () => store([visit({ title: "Spanning visit", date: "2026-10-09", endDate: "2026-10-12" })]) },
    "../../lib/storage": { useCloudLocalCollection: () => store() }, "../../lib/scheduling": scheduling,
    "../../lib/jobManagement-core.mjs": jobsCore,
  }, true, { URLSearchParams, window: { location: { search: "?date=2026-10-11" }, requestAnimationFrame(fn) { fn(); return 1; }, cancelAnimationFrame() {}, setInterval() { return 1; }, clearInterval() {}, addEventListener() {}, removeEventListener() {} } });
  const render = () => { cursor = 0; return plannerPage.default(); };
  render(); effects.forEach((fn) => fn()); const result = render();
  assert.match(text(result), /Day diary centred on/);
  assert.match(text(result), /11 Oct 2026/);
  assert.match(text(result), /Spanning visit/);
  assert.equal(nodes(result).some((node) => node.type === "form"), false);
  assert.equal(writes, 0);
});

test("task questions include all open work while snag questions keep their narrower scope", () => {
  const task = (patch = {}) => ({ id: "t1", jobId: "j1", type: "Task", title: "Finish labels", status: "Open", category: "General", priority: "Normal", dueDate: "2026-12-01", ...patch });
  const data = { jobs: [job()], tasks: [task(), task({ id: "snag", type: "Snag", dueDate: "" }), task({ id: "closed", status: "Completed" }), task({ id: "confirmed", type: "Snag", status: "Customer confirmed" })] };
  const result = answer("Show my open tasks", data);
  assert.equal(result.items.length, 2); assert.match(result.scope, /future and undated/);
  assert.equal(answer("What snags need fixing?", data).items.length, 1);
  assert.equal(answer("Show my open snags", data).items[0].id, "task:snag");
  assert.equal(answer("Complete all tasks", data).recognized, false);
  assert.equal(answer("Show open tasks for Smith", data).title, "Job unavailable");
  assert.equal(answer("Show open tasks for Smith", data).items.length, 0);
  assert.equal(answer("Show overdue tasks", data).recognized, false);
  assert.match(answer("Show tasks").summary, /not ready/);
  assert.match(answer("Show tasks", { tasks: [] }).summary, /0 open items/);
});

test("task shortcuts refresh after a task is completed without writing or retaining stale answers", () => {
  const data = records({ tasks: [{ id: "t1", jobId: "j1", title: "Fix faceplate", type: "Snag", status: "Open", category: "General", priority: "High", dueDate: "2026-10-10" }] });
  const h = ui(data);
  h.click("Open snags"); assert.match(text(h.render()), /1 open item/);
  assert.equal(nodes(h.render()).find((n) => n.type === "Link").props.href, "/job-tasks?job=j1&task=t1");
  h.replaceRecords({ ...data, tasks: [{ ...data.tasks[0], status: "Completed" }] });
  assert.match(text(h.render()), /0 open items/);
  assert.equal(nodes(h.render()).filter((n) => n.type === "Link").length, 0);
});

test("named task questions use only the exact saved job and keep future, undated and closed-job work visible", () => {
  const data = { jobs: [job({ status: "Complete" }), job({ id: "other", title: "Other job" })], tasks: [siteTask(), siteTask({ id: "future", dueDate: "2026-12-01", type: "Snag" }), siteTask({ id: "done", status: "Completed" }), siteTask({ id: "other", jobId: "other", priority: "Urgent" }), siteTask({ id: "orphan", jobId: "missing" })] };
  const result = answer("Show tasks for Workshop", data);
  assert.deepEqual(Array.from(result.items, (item) => item.id), ["task:future", "task:t1"]);
  assert.equal(result.resolvedJobId, "j1"); assert.match(result.scope, /Only Workshop.*Complete.*future and undated/);
  assert.equal(answer("What snags need fixing at Workshop?", data).items.length, 1);
  assert.equal(answer("Show tasks", data).items.length, 4);
});

test("saved names and addresses match case, repeated spaces and apostrophes without fuzzy or partial matching", () => {
  const data = { jobs: [job({ title: "Jake's workshop", siteAddress: "10 High St." })], tasks: [siteTask()] };
  for (const query of ["Show open tasks for Jake’s workshop?", "Please show my tasks at 10   HIGH st.", 'Can you tell me show snags for "Jake\'s workshop" please?', "List outstanding tasks for Jake's workshop!"]) {
    const result = answer(query, data); assert.equal(result.resolvedJobId, "j1", query);
  }
  for (const query of ["Show tasks for Jake", "Show tasks at High St", "Show tasks for Jakes workshop", "Show tasks for Jake's workshop tomorrow", "Show tasks for missing"]) {
    const result = answer(query, data); assert.equal(result.title, "Job unavailable", query); assert.equal(result.items.length, 0);
  }
  for (const query of ["Complete tasks for Jake's workshop", "Don't show tasks for Jake's workshop", "Show overdue tasks for Jake's workshop", "Show tasks for", "Show tasks for ?", `Show tasks for ${"x".repeat(181)}`]) assert.equal(answer(query, data).recognized, false, query);
});

test("duplicate names or a title/address collision require an explicit current job choice", () => {
  const data = { jobs: [job({ id: "title", title: "Workshop", siteAddress: "Elsewhere" }), job({ id: "address", title: "Kitchen", siteAddress: "Workshop" })], tasks: [siteTask({ jobId: "title" }), siteTask({ id: "other", jobId: "address" })] };
  const result = answer("Show tasks for Workshop", data);
  assert.equal(result.title, "Choose a job"); assert.equal(result.items.length, 0);
  assert.deepEqual(Array.from(result.jobChoices, (choice) => choice.id), ["address", "title"]);
  assert.equal(answerFor("Show tasks for Workshop", data, "address").items[0].id, "task:other");
  const invalidChoice = answerFor("Show tasks for Workshop", data, "foreign");
  assert.equal(invalidChoice.items.length, 0); assert.match(invalidChoice.warnings[0], /previous selection is unavailable/);
});

test("punctuation-bearing names remain distinct and quotes select the literal saved title", () => {
  const data = { jobs: [job({ title: "Workshop." }), job({ id: "plain", title: "Workshop" })], tasks: [siteTask()] };
  assert.equal(answer("Show tasks for Workshop.", data).jobChoices.length, 2);
  assert.equal(answer('Show tasks for "Workshop."?', data).resolvedJobId, "j1");
  assert.equal(answer('Show tasks for “Workshop”!', data).resolvedJobId, "plain");
});

test("selected task scopes cannot broaden to other jobs when unavailable and preserve normal invoice scope", () => {
  const data = { jobs: [job(), job({ id: "other", title: "Elsewhere" })], tasks: [siteTask(), siteTask({ id: "other", jobId: "other" })], invoices: [invoice()] };
  assert.equal(answerFor("Show tasks", data, "j1").items.length, 1);
  const unavailable = answerFor("Show snags", data, "missing");
  assert.equal(unavailable.title, "Job unavailable"); assert.equal(unavailable.items.length, 0);
  assert.match(answerFor("How much is overdue?", data, "j1").summary, /£240\.00/);
  assert.match(answer("Show tasks for Workshop", { jobs: [job()] }).summary, /not ready/);
  assert.match(answer("Show tasks for Workshop", { jobs: [job()], tasks: [] }).summary, /0 open items/);
});

test("phone job selector scopes both task shortcuts and changing it clears the previous answer", () => {
  const data = records({ jobs: [job(), job({ id: "other", title: "Kitchen" })], tasks: [siteTask(), siteTask({ id: "other", jobId: "other", type: "Snag" })], invoices: [invoice()] }); const h = ui(data);
  h.scope("j1"); h.click("Open tasks"); assert.match(text(h.render()), /Only Workshop/);
  assert.equal(nodes(h.render()).filter((n) => n.type === "Link").length, 1);
  h.scope("other"); assert.equal(nodes(h.render()).some((n) => n.props["aria-label"] === "JR AI answer"), false);
  h.click("Open snags"); assert.equal(nodes(h.render()).find((n) => n.type === "Link").props.href, "/job-tasks?job=other&task=other");
  h.click("Overdue money"); assert.match(text(h.render()), /£240\.00/);
  h.click("Clear answer"); assert.equal(nodes(h.render()).find((n) => n.type === "select").props.value, "");
});

test("typed job questions take their named scope and retain its resolved identity through record changes", () => {
  const data = records({ jobs: [job(), job({ id: "other", title: "Kitchen" })], tasks: [siteTask(), siteTask({ id: "other", jobId: "other" })] }); const h = ui(data);
  h.scope("other"); h.fill("Show tasks for Workshop"); h.submit();
  assert.match(text(h.render()), /Only Workshop/); assert.equal(nodes(h.render()).find((n) => n.type === "Link").props.href, "/job-tasks?job=j1&task=t1");
  h.replaceRecords({ ...data, jobs: [job({ id: "replacement" }), data.jobs[1]], tasks: [siteTask({ jobId: "replacement" }), data.tasks[1]] });
  assert.match(text(h.render()), /previous selection is unavailable/);
  assert.equal(nodes(h.render()).filter((n) => n.type === "Link" && n.props.href.startsWith("/job-tasks")).length, 0);
  h.choose(); assert.match(text(h.render()), /Only Workshop/);
  assert.equal(nodes(h.render()).find((n) => n.type === "Link").props.href, "/job-tasks?job=replacement&task=t1");
});

test("ambiguous phone answers progressively reveal choices and use only the selected saved identity", () => {
  const jobs = Array.from({ length: 7 }, (_, index) => job({ id: `j${index}`, title: "Shared site", siteAddress: `Address ${index}` }));
  const data = records({ jobs, tasks: jobs.map((job) => siteTask({ id: `t-${job.id}`, jobId: job.id })) }); const h = ui(data);
  h.fill("Show tasks for Shared site"); h.submit();
  assert.match(text(h.render()), /7 loaded jobs match/);
  assert.equal(nodes(h.render()).filter((n) => n.type === "button" && text(n) === "Use this job").length, 4);
  h.click("Show more jobs"); h.choose(5);
  assert.equal(nodes(h.render()).filter((n) => n.type === "Link").length, 1);
  assert.equal(nodes(h.render()).find((n) => n.type === "Link").props.href, "/job-tasks?job=j5&task=t-j5");
  h.replaceRecords({ ...data, jobs: jobs.filter((job) => job.id !== "j5") });
  assert.match(text(h.render()), /previous selection is unavailable/);
  assert.equal(nodes(h.render()).filter((n) => n.type === "Link" && n.props.href.startsWith("/job-tasks")).length, 0);
  h.fill("Show open snags"); assert.doesNotMatch(text(h.render()), /loaded jobs match/);
});

test("a removed dropdown job stays explicitly unavailable and does not fall back to all tasks", () => {
  const data = records({ jobs: [job()], tasks: [siteTask()] }); const h = ui(data);
  h.scope("j1"); h.click("Open tasks"); h.replaceRecords({ ...data, jobs: [] });
  assert.match(text(h.render()), /Selected job unavailable/); assert.match(text(h.render()), /selected job is no longer available/);
  assert.equal(nodes(h.render()).filter((n) => n.type === "Link").length, 0);
  h.scope(""); h.click("Open tasks"); assert.match(text(h.render()), /All loaded jobs/);
});

test("job choices and scoped task links retain source immutability and encode authorised saved identities", () => {
  const data = records({ jobs: [job({ id: "j /?#", title: "Shared" }), job({ id: "other", title: "Shared" })], tasks: [siteTask({ id: "t /?#", jobId: "j /?#" })] }); const before = JSON.stringify(data); const h = ui(data);
  h.fill("Show tasks for Shared"); h.submit();
  const jobLinks = nodes(h.render()).filter((n) => n.type === "Link");
  assert.ok(jobLinks.some((n) => n.props.href === "/jobs/j%20%2F%3F%23"));
  const result = answerFor("Show tasks for Shared", data, "j /?#");
  assert.equal(result.items[0].href, "/job-tasks?job=j%20%2F%3F%23&task=t%20%2F%3F%23");
  assert.equal(permissions.canAccessPath("owner", permissions.internalPathForAccess(result.items[0].href)), true);
  assert.equal(permissions.canAccessPath("office", "/job-tasks"), false);
  assert.equal(JSON.stringify(data), before);
});

test("office task answers and priorities use permitted job pages while owner/admin keep exact task links", () => {
  const data = records({ jobs: [job({ id: "j /?#" })], tasks: [siteTask({ jobId: "j /?#", priority: "High" }), siteTask({ id: "orphan", jobId: "missing", priority: "High" })] });
  for (const query of ["Show tasks", "What should I do next?"]) {
    const result = questions.answerAssistantQuestion(data, query, now, undefined, "", false);
    assert.equal(result.items.find((item) => item.id === "task:t1").href, "/jobs/j%20%2F%3F%23");
    assert.equal(result.items.find((item) => item.id === "task:orphan").href, "/jobs");
    assert.ok(result.items.every((item) => permissions.canAccessPath("office", permissions.internalPathForAccess(item.href))));
    assert.match(result.items.find((item) => item.id === "task:t1").detail, /owner or admin/);
  }
  const h = ui(data, false); h.fill("Show tasks for Workshop"); h.submit();
  assert.equal(nodes(h.render()).find((n) => n.type === "Link").props.href, "/jobs/j%20%2F%3F%23");
  assert.match(text(h.render()), /Review linked job/);
  for (const role of ["owner", "admin"]) {
    const result = questions.answerAssistantQuestion(data, "Show tasks", now, undefined, "", permissions.canAccessPath(role, "/job-tasks"));
    assert.equal(result.items[0].href.startsWith("/job-tasks?"), true);
  }
});

const dueQuote = (patch = {}) => ({ id: "q1", number: "Q-1", title: "Workshop quote", type: "Quote", status: "Sent", updatedAt: "2026-10-01T10:00:00Z", validUntil: "2026-10-20", nextFollowUpDate: "2026-10-10", ...patch });
const idsOf = (result) => Array.from(result.items, (item) => item.id);

test("a job briefing joins saved relationships once and excludes same-named unrelated records", () => {
  const data = records({ jobs: [job({ siteAddress: "", assignedTo: [], sourceQuoteId: "q1" }), job({ id: "other", title: "Other job" })],
    invoices: [invoice({ jobId: "j1" }), invoice({ id: "unrelated-invoice", jobId: "other", title: "Workshop" })],
    documents: [dueQuote(), dueQuote({ id: "unrelated-quote", jobId: "other", title: "Workshop" })],
    tasks: [siteTask({ dueDate: "2026-10-09" }), siteTask({ id: "future", dueDate: "2027-01-01" }), siteTask({ id: "other-task", jobId: "other", title: "Workshop", priority: "Urgent" }), siteTask({ id: "done", status: "Completed" })],
    planner: [visit({ jobId: "j1" })], purchases: [{ id: "p1", jobId: "j1", number: "P-1", title: "Site materials", items: [{ status: "Needed" }] }],
    reminders: [{ id: "r1", title: "Workshop", dueDate: "2026-10-09", completed: false, priority: "Urgent" }] });
  const before = JSON.stringify(data); const result = answer("Show job briefing for Workshop", data);
  assert.equal(result.resolvedJobId, "j1"); assert.match(result.title, /Job briefing · Workshop/);
  for (const id of ["invoice:i1", "follow-up:q1", "readiness:j1", "task:t1", "task:future", "visit:v1", "job:j1"]) assert.ok(idsOf(result).includes(id), id);
  assert.equal(new Set(idsOf(result)).size, result.items.length);
  assert.ok(idsOf(result).every((id) => !id.includes("unrelated") && id !== "task:other-task" && id !== "task:done" && id !== "reminder:r1"));
  assert.match(result.items.find((i) => i.id === "readiness:j1").evidence.join(" "), /1 material line still marked Needed/);
  assert.match(result.scope, /not a site inspection/); assert.equal(JSON.stringify(data), before);
});

test("job briefings retain clashes with another job without leaking that job's unrelated tasks or invoices", () => {
  const data = records({ jobs: [job(), job({ id: "other", title: "Other job" })], tasks: [siteTask({ jobId: "other", priority: "Urgent" })],
    invoices: [invoice({ jobId: "other" })], planner: [visit({ jobId: "j1" }), visit({ id: "v2", jobId: "other", title: "Other visit" })] });
  const result = answer("What needs attention for Workshop?", data);
  const clash = result.items.find((i) => i.id.startsWith("clash:")); assert.ok(clash);
  assert.match(clash.evidence.join(" "), /First fix.*Other visit/); assert.equal(clash.href, "/planner?date=2026-10-11");
  assert.ok(!idsOf(result).includes("task:t1")); assert.ok(!idsOf(result).includes("invoice:i1")); assert.ok(!idsOf(result).includes("visit:v2"));
  const full = briefing.buildAssistantBriefing(data, now).actions.find((a) => a.id.startsWith("clash:"));
  assert.deepEqual(Array.from(full.jobIds), ["j1", "other"]);
});

test("job briefing money checks use the ledger without double counting and include not-yet-due debt", () => {
  const data = { jobs: [job()], tasks: [], invoices: [invoice({ jobId: "j1", amountPaid: 100 }), invoice({ id: "future", jobId: "j1", dueDate: "2026-11-01" }), invoice({ id: "draft", jobId: "j1", status: "Draft" }), invoice({ id: "cancelled", jobId: "j1", status: "Cancelled" })], payments: [{ invoiceId: "i1", type: "Payment", amount: 150 }, { invoiceId: "future", type: "Payment", amount: 20 }] };
  const result = answer("Job briefing for Workshop", data);
  assert.match(result.items.find((i) => i.id === "invoice:i1").detail, /£90\.00/);
  assert.match(result.items.find((i) => i.id === "invoice:future").detail, /£220\.00/);
  assert.equal(result.items.filter((i) => i.id.startsWith("invoice:")).length, 2);
  const settled = answer("Job briefing for Workshop", { ...data, payments: [{ invoiceId: "i1", type: "Payment", amount: 240 }, { invoiceId: "future", type: "Payment", amount: 240 }] });
  assert.equal(settled.items.filter((i) => i.id.startsWith("invoice:")).length, 0);
  const invalid = answer("Job briefing for Workshop", { jobs: [job()], invoices: [invoice({ jobId: "j1", amountPaid: NaN }), invoice({ id: "date", jobId: "j1", dueDate: "invalid" })] });
  assert.match(invalid.warnings.join(" "), /invalid or unsupported amounts/);
});

test("job quote checks support quote-side, job-side and snapshot links without overriding explicit quote ownership", () => {
  for (const saved of [job({ sourceQuoteId: "q1" }), job({ quoteSnapshot: { quoteId: "q1" } })]) {
    assert.ok(idsOf(answer("Job briefing for Workshop", { jobs: [saved], documents: [dueQuote()] })).includes("follow-up:q1"));
  }
  assert.ok(idsOf(answer("Job briefing for Workshop", { jobs: [job()], documents: [dueQuote({ jobId: "j1" })] })).includes("follow-up:q1"));
  assert.ok(!idsOf(answer("Job briefing for Workshop", { jobs: [job({ sourceQuoteId: "q1" })], documents: [dueQuote({ jobId: "other" })] })).includes("follow-up:q1"));
  assert.ok(!idsOf(answer("Job briefing for Workshop", { jobs: [job()], documents: [dueQuote({ title: "Workshop" })] })).includes("follow-up:q1"));
});

test("job briefing keeps ongoing and distant visits, flags bad dates/times and excludes finished history", () => {
  const result = answer("Show job briefing at 1 High Street", { jobs: [job()], tasks: [], planner: [
    visit({ jobId: "j1", date: "2026-10-08", endDate: "2026-10-12" }), visit({ id: "far", jobId: "j1", date: "2027-01-01", startTime: "" }),
    visit({ id: "invalid", jobId: "j1", date: "2026-02-30" }), visit({ id: "reversed", jobId: "j1", endDate: "2026-10-09" }),
    visit({ id: "past", jobId: "j1", date: "2026-10-01" }), visit({ id: "done", jobId: "j1", status: "Complete" }), visit({ id: "cancelled", jobId: "j1", status: "Cancelled" })] });
  assert.match(result.summary, /2 upcoming or ongoing visits/); assert.match(result.warnings.join(" "), /2 linked visits with invalid or reversed dates/);
  assert.equal(result.items.find((i) => i.id === "visit:v1").href, "/planner?date=2026-10-10");
  assert.equal(result.items.find((i) => i.id === "visit:far").href, "/planner?date=2027-01-01");
  assert.match(result.items.find((i) => i.id === "visit:far").detail, /Time needs review/);
  assert.equal(result.items.filter((i) => i.id.startsWith("visit:")).length, 2);
});

test("closed job briefings preserve recorded status and review missing billing and certificates without site clearance", () => {
  const result = answer("Job briefing for Workshop", { jobs: [job({ status: "Complete" })], tasks: [siteTask({ priority: "High" })] });
  assert.ok(idsOf(result).includes("invoice-job:j1")); assert.ok(idsOf(result).includes("certificate:j1")); assert.ok(idsOf(result).includes("task:t1"));
  assert.ok(!idsOf(result).includes("readiness:j1")); assert.match(result.items.find((i) => i.id === "job:j1").detail, /Job status: Complete/);
  assert.match(result.scope, /not a site inspection.*electrical compliance/);
  const missing = answer("Job briefing for Workshop", { jobs: [job()] });
  assert.match(missing.summary, /Task records not ready/); assert.match(missing.warnings.join(" "), /absence does not mean no work remains/);
  const loaded = answer("Job briefing for Workshop", { jobs: [job()], tasks: [] });
  assert.match(loaded.summary, /0 open tasks and snags/); assert.ok(!loaded.warnings.some((w) => w.includes("Task records")));
});

test("job briefings require a current exact job choice and never broaden a missing or ambiguous selection", () => {
  assert.equal(questions.assistantQuestionIntent("Show job briefing"), "job");
  const data = { jobs: [job(), job({ id: "other", siteAddress: "Other address" })], tasks: [siteTask()] };
  const ambiguous = answer("Job briefing for Workshop", data); assert.equal(ambiguous.title, "Choose a job"); assert.equal(ambiguous.items.length, 0); assert.equal(ambiguous.jobChoices.length, 2);
  const chosen = answerFor("Show job briefing", data, "j1"); assert.equal(chosen.resolvedJobId, "j1");
  const all = answer("Show job briefing", data); assert.equal(all.title, "Choose a job"); assert.equal(all.items.length, 0);
  const absent = answerFor("Show job briefing", data, "missing"); assert.equal(absent.title, "Job unavailable"); assert.equal(absent.items.length, 0);
  for (const q of ["Job briefing for Work", "Job briefing for unknown"]) assert.equal(answer(q, data).items.length, 0);
  for (const q of ["Delete job briefing for Workshop", "Job briefing for Workshop " + "x".repeat(181)]) assert.equal(answer(q, data).recognized, false);
  assert.equal(answer("Job briefing for Workshop and overdue invoices", data).items.length, 0, "a combined request must not guess Workshop");
});

test("phone job briefing choices, progressive reveal, typed scope and record refresh use actual handlers", () => {
  const data = records({ jobs: [job(), job({ id: "other", title: "Elsewhere", siteAddress: "Other address" })], tasks: Array.from({ length: 6 }, (_, i) => siteTask({ id: `t${i}` })) }); const h = ui(data);
  h.click("Job briefing"); assert.match(text(h.render()), /Choose one loaded job/); h.choose();
  assert.match(text(h.render()), /Job briefing · Elsewhere/);
  h.scope("j1"); h.click("Job briefing"); assert.match(text(h.render()), /Job briefing · Workshop/);
  assert.equal(nodes(h.render()).filter((n) => n.type === "Link").length, 4);
  h.click("Show more records"); assert.equal(nodes(h.render()).filter((n) => n.type === "Link").length, 7);
  h.fill("Job briefing for Elsewhere"); h.submit(); assert.match(text(h.render()), /Job briefing · Elsewhere/);
  h.replaceRecords({ ...data, jobs: [job(), job({ id: "replacement", title: "Elsewhere", siteAddress: "Other address" })] });
  assert.match(text(h.render()), /previous selection is unavailable/); assert.ok(!nodes(h.render()).some((n) => n.type === "Link" && n.props.href === "/jobs/other"));
  h.choose(); assert.match(text(h.render()), /Job briefing · Elsewhere/);
  assert.ok(nodes(h.render()).some((n) => n.type === "Link" && n.props.href === "/jobs/replacement"));
  h.click("Clear answer"); assert.ok(!text(h.render()).includes("Job briefing ·")); assert.ok(h.blurred() >= 3);
});

test("job briefing source links encode identities and remain usable by the account's route permissions", () => {
  const data = records({ jobs: [job({ id: "j /?#" })], tasks: [siteTask({ jobId: "j /?#", id: "t /?#", priority: "High" })], invoices: [invoice({ jobId: "j /?#" })] });
  for (const role of ["owner", "admin", "office"]) {
    const result = questions.answerAssistantQuestion(data, "Job briefing for Workshop", now, undefined, "", permissions.canAccessPath(role, "/job-tasks"));
    assert.ok(result.items.every((item) => permissions.canAccessPath(role, permissions.internalPathForAccess(item.href))));
    assert.equal(result.items.find((i) => i.id === "job:j /?#").href, "/jobs/j%20%2F%3F%23");
    assert.equal(result.items.find((i) => i.id === "task:t /?#").href, role === "office" ? "/jobs/j%20%2F%3F%23" : "/job-tasks?job=j%20%2F%3F%23&task=t%20%2F%3F%23");
  }
});


test("a phone job briefing refreshes saved task, payment and visit status without retaining stale actions", () => {
  const data = records({ jobs: [job()], tasks: [siteTask({ priority: "High" })], invoices: [invoice({ jobId: "j1" })], planner: [visit({ jobId: "j1" })] }); const h = ui(data);
  h.scope("j1"); h.click("Job briefing"); assert.match(text(h.render()), /Chase INV-1/); assert.match(text(h.render()), /Task: Fit labels/);
  h.replaceRecords({ ...data, tasks: [siteTask({ priority: "High", status: "Completed" })], payments: [{ invoiceId: "i1", type: "Payment", amount: 240 }], planner: [visit({ jobId: "j1", status: "Complete" })] });
  assert.doesNotMatch(text(h.render()), /Chase INV-1|Task: Fit labels|Review visit day/);
  assert.match(text(h.render()), /0 open tasks and snags.*0 upcoming or ongoing visits/);
  assert.match(text(h.render()), /Job briefing · Workshop/);
});

test("job briefing links encode one opaque identity and reject duplicate or unusable query ids", () => {
  for (const id of ["j1", "j /?# +&date=2026-10-10", "Whiteside’s café"] ) {
    const href = jobLink.assistantJobBriefingHref(id); assert.ok(href.startsWith("/ai/assistant?job="));
    const parsed = jobLink.assistantJobFromLink(new URL(href, "https://jr.example").search); assert.equal(parsed.jobId, id);
    assert.equal(new URL(href, "https://jr.example").searchParams.getAll("job").length, 1);
  }
  assert.equal(jobLink.assistantJobFromLink("?question=delete&action=create"), null);
  for (const search of ["?job=", "?job=+", "?job=j1&job=j2", `?job=${"x".repeat(301)}`]) assert.equal(jobLink.assistantJobFromLink(search).jobId, null);
  for (const id of ["", " ", "x".repeat(301)]) assert.equal(jobLink.assistantJobBriefingHref(id), null);
});

test("opening a saved job link shows only that job's briefing and does not replay after a user selects another", () => {
  const data = records({ jobs: [job(), job({ id: "other", title: "Elsewhere" })], tasks: [siteTask(), siteTask({ id: "other-task", jobId: "other" })] });
  const h = ui(data, true, "?job=j1&action=create&question=Delete+all+invoices"); h.flush();
  assert.match(text(h.render()), /Job briefing · Workshop/); assert.ok(!text(h.render()).includes("Job briefing · Elsewhere"));
  assert.ok(nodes(h.render()).some((n) => n.type === "Link" && n.props.href === "/job-tasks?job=j1&task=t1"));
  assert.ok(!nodes(h.render()).some((n) => n.type === "Link" && n.props.href.includes("task=other-task")));
  assert.equal(nodes(h.render()).find((n) => n.type === "select").props.value, "j1"); assert.equal(h.blurred(), 0);
  h.scope("other"); h.click("Job briefing"); h.flush(); assert.match(text(h.render()), /Job briefing · Elsewhere/);
});

test("unknown linked jobs remain unavailable across refreshes and cannot substitute a reused title", () => {
  const data = records({ jobs: [job({ id: "replacement" })], tasks: [siteTask({ jobId: "replacement" })] }); const h = ui(data, true, "?job=j1"); h.flush();
  assert.match(text(h.render()), /Selected job unavailable/); assert.match(text(h.render()), /selected job is no longer available/);
  assert.equal(nodes(h.render()).filter((n) => n.type === "Link").length, 0);
  h.replaceRecords({ ...data, jobs: [job()] }); assert.match(text(h.render()), /Job briefing · Workshop/);
  h.replaceRecords(data); assert.match(text(h.render()), /selected job is no longer available/);
  assert.equal(nodes(h.render()).filter((n) => n.type === "Link").length, 0);
});

test("invalid job links ask for a choice and expose no briefing records until the user chooses", () => {
  const data = records({ jobs: [job()], tasks: [siteTask()] });
  for (const search of ["?job=", "?job=j1&job=other", `?job=${"x".repeat(301)}`]) {
    const h = ui(data, true, search); h.flush(); assert.match(text(h.render()), /job briefing link is invalid/); assert.match(text(h.render()), /Choose one loaded job/);
    assert.ok(!nodes(h.render()).some((n) => n.type === "Link" && n.props.href.startsWith("/job-tasks")));
    h.choose(); assert.match(text(h.render()), /Job briefing · Workshop/); assert.doesNotMatch(text(h.render()), /link is invalid/);
  }
  const plain = ui(data); plain.flush(); assert.ok(!text(plain.render()).includes("Job briefing ·"));
});

test("job links preserve office task destinations and clear answer state through the existing controls", () => {
  const h = ui(records({ jobs: [job()], tasks: [siteTask({ priority: "High" })] }), false, "?job=j1"); h.flush();
  assert.match(text(h.render()), /Job briefing · Workshop/);
  assert.ok(nodes(h.render()).filter((n) => n.type === "Link").every((n) => permissions.canAccessPath("office", permissions.internalPathForAccess(n.props.href))));
  assert.ok(!nodes(h.render()).some((n) => n.type === "Link" && n.props.href.startsWith("/job-tasks")));
  h.click("Clear answer"); h.flush(); assert.ok(!text(h.render()).includes("Job briefing ·"));
});

test("job-to-assistant shortcuts follow account access and never render for denied or unresolved roles", () => {
  const makeLink = (identity, mode = "cloud", isReady = true, jobId = "j /?#") => compile("../components/ai/JobAssistantLink.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx }, "next/link": { default: "Link" }, "../../lib/assistantJobLink": jobLink,
    "../../lib/cloud/permissions": permissions, "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ identity, mode, isReady }) },
  }, true).JobAssistantLink({ jobId });
  for (const role of ["owner", "admin", "office"]) {
    const link = makeLink({ role }); assert.ok(link); assert.equal(link.props.href, "/ai/assistant?job=j%20%2F%3F%23");
    assert.match(link.props.className, /min-h-12/); assert.equal(text(link), "Ask JR AI about this job");
  }
  for (const role of ["electrician", "apprentice", "builder", "customer", undefined]) assert.equal(makeLink({ role }), null);
  assert.equal(makeLink({ role: "owner" }, "cloud", false), null);
  assert.equal(makeLink({ role: "owner" }, "cloud", true, ""), null);
  assert.ok(makeLink(null, "local")); assert.ok(makeLink(null, "migration"));
  for (const path of ["../app/jobs/[id]/page.tsx", "../app/jobs/[id]/workspace/page.tsx"]) assert.match(readFileSync(new URL(path, import.meta.url), "utf8"), /<JobAssistantLink jobId=\{job\.id\} \/>/);
});
