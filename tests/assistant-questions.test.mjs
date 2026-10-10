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
const answer = (question, data = {}, date = now) => questions.answerAssistantQuestion(records(data), question, date);

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
function ui(data = records()) {
  const states = []; let cursor = 0, blurred = 0;
  const component = compile("../components/ai/AssistantQuestions.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useMemo: (fn) => fn(), useRef: () => ({ current: { blur: () => blurred++ } }), useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; } },
    "next/link": { default: "Link" }, "../ui/Card": { Card: "Card" }, "../../lib/assistantQuestions": questions,
  }, true);
  let recordsNow = data;
  const render = () => { cursor = 0; return component.AssistantQuestions({ records: recordsNow, now, briefing: briefing.buildAssistantBriefing(recordsNow, now) }); };
  return { render, blurred: () => blurred, replaceRecords(value) { recordsNow = value; }, fill(value) { nodes(render()).find((node) => node.type === "input").props.onChange({ target: { value } }); }, submit() { nodes(render()).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); }, click(label) { const button = nodes(render()).find((node) => node.type === "button" && text(node).startsWith(label)); assert.ok(button, label); button.props.onClick(); } };
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
  const useState = (initial) => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; };
  const store = (items = []) => ({ items, isReady: true, setItems() { writes++; throw new Error("Navigation must not write records"); } });
  const plannerPage = compile("../app/planner/page.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useMemo: (fn) => fn(), useState, useRef: (value) => useState({ current: value })[0], useEffect: (fn) => effects.push(fn) },
    "next/link": { default: "Link" }, "lucide-react": {},
    "../../components/ui/Button": { Button: "Button" }, "../../components/ui/Card": { Card: "Card" }, "../../components/ui/PageHeader": { PageHeader: "PageHeader" }, "../../components/ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" },
    "../../lib/cloud/coreBusinessCollections": { useCustomersCollection: () => store(), useJobsCollection: () => store(), usePlannerCollection: () => store([visit({ title: "Spanning visit", date: "2026-10-09", endDate: "2026-10-12" })]) },
    "../../lib/storage": { useCloudLocalCollection: () => store() }, "../../lib/scheduling": scheduling,
  }, true, { URLSearchParams, window: { location: { search: "?date=2026-10-11" }, requestAnimationFrame(fn) { fn(); return 1; }, cancelAnimationFrame() {} } });
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
  assert.equal(answer("Show open tasks for Smith", data).recognized, false);
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
