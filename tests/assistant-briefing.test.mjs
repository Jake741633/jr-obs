import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as signals from "../lib/assistantSignals-core.mjs";
import * as paymentsCore from "../lib/payments-core.mjs";
import * as jobsCore from "../lib/jobManagement-core.mjs";
import * as taskCore from "../lib/jobTasks-core.mjs";
import * as invoiceLink from "../lib/invoiceLink.ts";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";

function compile(path, dependencies = {}) {
  const mod = { exports: {} };
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, { module: mod, exports: mod.exports, Date, Intl, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return mod.exports;
}
const payments = compile("../lib/payments.ts", { "./payments-core.mjs": paymentsCore });
const assistantIdentity = compile("../lib/assistantIdentity.ts");
const assistantQuotes = compile("../lib/assistantQuotes.ts", { "./assistantIdentity": assistantIdentity, "./assistantSignals-core.mjs": signals });
const assistantMoney = compile("../lib/assistantMoney.ts", { "./invoiceLink": invoiceLink, "./assistantIdentity": assistantIdentity, "./payments": payments, "./assistantSignals-core.mjs": signals });
const scheduling = compile("../lib/scheduling.ts");
const taskInbox = compile("../lib/taskInbox.ts", { "./assistantIdentity": assistantIdentity, "./jobTasks-core.mjs": taskCore, "./assistantSignals-core.mjs": signals });
const assistantTasks = compile("../lib/assistantTasks.ts", { "./assistantIdentity": assistantIdentity, "./jobTasks-core.mjs": taskCore, "./assistantSignals-core.mjs": signals, "./taskInbox": taskInbox });
const dashboard = compile("../lib/dashboardIntelligence.ts", { "./jobManagement-core.mjs": jobsCore });
const { buildAssistantBriefing, filterAssistantActions } = compile("../lib/assistantBriefing.ts", { "./assistantQuotes": assistantQuotes, "./assistantMoney": assistantMoney, "./assistantTasks": assistantTasks, "./scheduling": scheduling, "./jobManagement-core.mjs": jobsCore, "./dashboardIntelligence": dashboard, "./assistantSignals-core.mjs": signals, "./payments": payments });
const now = new Date(2026, 9, 10, 10, 0, 0);
const invoice = (patch = {}) => ({ id: "i/1?#", number: "INV-01", title: "Workshop lights", status: "Sent", dueDate: "2026-10-09", items: [{ quantity: 2, unitPrice: 100 }], vatEnabled: true, vatRate: 20, amountPaid: 40, ...patch });
const quote = (patch = {}) => ({ id: "q1", number: "Q-01", title: "Workshop", type: "Quote", status: "Sent", validUntil: "2026-11-01", updatedAt: "2026-10-01T12:00:00Z", ...patch });
const job = (patch = {}) => ({ id: "j1", title: "Workshop", status: "Scheduled", startDate: "2026-10-10", assignedTo: ["worker-a"], siteAddress: "1 High Street", ...patch });
const visit = (patch = {}) => ({ id: "v1", title: "First fix", date: "2026-10-10", startTime: "09:00", endTime: "12:00", status: "Confirmed", teamMemberIds: ["worker-a"], location: "1 High Street", ...patch });
const records = (patch = {}) => ({ jobs: [], documents: [], invoices: [], planner: [], purchases: [], reminders: [], certificates: [], ...patch });
const actions = (patch) => buildAssistantBriefing(records(patch), now).actions;

test("overdue signals exclude drafts, paid, cancelled, zero balances and invalid dates", () => {
  assert.equal(signals.assistantInvoiceBalance(invoice()), 200);
  assert.equal(signals.isAssistantInvoiceOverdue(invoice(), now), true);
  for (const patch of [{ status: "Draft" }, { status: "Paid" }, { status: "Cancelled" }, { amountPaid: 240 }, { amountPaid: 300 }, { dueDate: "2026-10-10" }, { dueDate: "2026-02-30" }, { dueDate: "nonsense" }, { amountPaid: NaN }]) {
    assert.equal(signals.isAssistantInvoiceOverdue(invoice(patch), now), false, JSON.stringify(patch));
  }
  assert.equal(actions({ invoices: [invoice()] })[0].href, "/invoices?invoice=i%2F1%3F%23");
});

test("explicit follow-up schedules and recent contact suppress repeated quote chasing", () => {
  assert.equal(signals.assistantQuoteFollowUpDue(quote(), now), true);
  assert.equal(signals.assistantQuoteFollowUpDue(quote({ nextFollowUpDate: "2026-10-12", validUntil: "2026-10-08" }), now), false);
  assert.equal(signals.assistantQuoteFollowUpDue(quote({ nextFollowUpDate: "2026-10-10" }), now), true);
  assert.equal(signals.assistantQuoteFollowUpDue(quote({ nextFollowUpDate: "invalid" }), now), false);
  assert.equal(signals.assistantQuoteFollowUpDue(quote({ lastFollowUpAt: "2026-10-10T08:00:00Z", validUntil: "2026-10-12" }), now), false);
  assert.equal(signals.assistantQuoteFollowUpDue(quote({ updatedAt: "invalid" }), now), false);
  assert.equal(signals.assistantQuoteFollowUpDue(quote({ status: "Accepted" }), now), false);
});

test("expired quotes get one pricing review, without overriding a future contact agreement", () => {
  const result = actions({ documents: [quote({ validUntil: "2026-10-08", nextFollowUpDate: "2026-10-12" })] });
  assert.equal(result.length, 1);
  assert.match(result[0].title, /Review expired quote/);
  assert.match(result[0].nextStep, /keep any future follow-up date/);
});

test("accepted quotes recognise job-side and snapshot links before recommending conversion", () => {
  for (const linkedJob of [job({ sourceQuoteId: "q1" }), job({ quoteSnapshot: { quoteId: "q1" } })]) {
    assert.equal(actions({ documents: [quote({ status: "Accepted" })], jobs: [linkedJob] }).filter((a) => a.id.startsWith("convert:")).length, 0);
  }
  assert.equal(actions({ documents: [quote({ status: "Accepted" })] })[0].id, "convert:q1");
  assert.equal(actions({ documents: [quote({ status: "Accepted", jobId: "j1" })] }).length, 0);
});

test("site readiness joins upcoming visits and purchases, respecting actual assignment evidence", () => {
  const result = actions({ jobs: [job({ id: "job /?#", startDate: "2026-01-01", assignedTo: [], siteAddress: "" })],
    planner: [visit({ jobId: "job /?#", date: "2026-10-12" })],
    purchases: [{ id: "p1", number: "PO-01", title: "Lighting stock", jobId: "job /?#", items: [{ status: "Needed" }, { status: "Ordered" }, { status: "Delivered" }] }] });
  assert.equal(result.length, 1);
  assert.equal(result[0].priority, "Today");
  assert.equal(result[0].href, "/jobs/job%20%2F%3F%23");
  assert.match(result[0].evidence.join(" "), /1 material line still marked Needed/);
  assert.match(result[0].evidence.join(" "), /1 material line ordered/);
  assert.doesNotMatch(result[0].evidence.join(" "), /No worker|No site/);
});

test("inactive, distant and cancelled visits do not manufacture site-readiness urgency", () => {
  for (const status of ["Cancelled", "On hold", "Paid"]) assert.equal(actions({ jobs: [job({ status, siteAddress: "" })], certificates: [{ jobId: "j1", status: "Issued" }] }).length, 0);
  assert.equal(actions({ jobs: [job({ startDate: "2026-12-01", siteAddress: "" })] }).length, 0);
  assert.equal(actions({ jobs: [job({ startDate: "2026-01-01", siteAddress: "" })], planner: [visit({ jobId: "j1", status: "Cancelled" })] }).length, 0);
});

test("invoice and certificate checks distinguish missing records from professional conclusions", () => {
  const result = actions({ jobs: [job({ status: "Complete" })] });
  assert.equal(result.length, 2);
  assert.match(result.find((a) => a.id === "certificate:j1").nextStep, /Confirm which certification/);
  assert.equal(actions({ jobs: [job({ status: "Complete" })], invoices: [invoice({ jobId: "j1", status: "Draft" })], certificates: [{ jobId: "j1", status: "Issued" }] }).length, 0);
});

test("diary clashes group shared resources into one action and ignore cancelled or complete visits", () => {
  const a = visit({ jobId: "j1", vehicleId: "van1" });
  const b = visit({ id: "v2", title: "Second visit", startTime: "11:00", endTime: "13:00", jobId: "j1", vehicleId: "van1" });
  const result = actions({ planner: [a, b] });
  assert.equal(result.length, 1);
  assert.match(result[0].reason, /job, staff, vehicle/);
  for (const patch of [{ status: "Cancelled" }, { status: "Complete" }, { startTime: "12:00" }, { startTime: "" }, { endTime: "08:00" }, { date: "2026-11-01" }]) assert.equal(actions({ planner: [a, { ...b, ...patch }] }).length, 0, JSON.stringify(patch));
});

test("multi-day visits still surface today's overlaps, with stable ordering", () => {
  const planner = [visit({ date: "2026-10-08", endDate: "2026-10-12" }), visit({ id: "v2", title: "Overlapping", startTime: "11:00" })];
  const first = actions({ planner, invoices: [invoice()] });
  const second = actions({ planner: [...planner].reverse(), invoices: [invoice()] });
  assert.equal(first.length, 2);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first[0].id, "invoice:i/1?#");
});

test("reminders refresh on the next calendar day and completed reminders disappear", () => {
  const reminder = { id: "r1", title: "Call builder", dueDate: "2026-10-11", dueTime: "09:00", priority: "Urgent", completed: false, notes: "Confirm access" };
  assert.equal(actions({ reminders: [reminder] }).length, 0);
  assert.equal(buildAssistantBriefing(records({ reminders: [reminder] }), new Date(2026, 9, 11, 10)).actions[0].priority, "Now");
  assert.equal(actions({ reminders: [{ ...reminder, dueDate: "2026-10-09", completed: true }] }).length, 0);
});

test("search and focus work together without changing or persisting source records", () => {
  const input = records({ invoices: [invoice()], documents: [quote()] });
  const before = JSON.stringify(input);
  const briefing = buildAssistantBriefing(input, now);
  assert.equal(filterAssistantActions(briefing.actions, "Money", "WORKSHOP lights").length, 1);
  assert.equal(filterAssistantActions(briefing.actions, "Quotes", "INV-01").length, 0);
  assert.equal(filterAssistantActions(briefing.actions, "All", "unknown").length, 0);
  assert.equal(JSON.stringify(input), before);
});

const payment = (patch = {}) => ({ id: "p1", invoiceId: "i/1?#", type: "Payment", amount: 240, reconciliationStatus: "Allocated", ...patch });
test("assistant counts ledger payments before recommending a chase, without double-counting invoice paid amounts", () => {
  assert.equal(actions({ invoices: [invoice()], payments: [payment()] }).length, 0);
  const partial = actions({ invoices: [invoice()], payments: [payment({ amount: 100 })] });
  assert.equal(partial.length, 1);
  assert.match(partial[0].reason, /£140\.00 remains unpaid/);
  assert.match(partial[0].evidence.join(" "), /Effective recorded paid: £100\.00/);
  assert.match(actions({ invoices: [invoice({ amountPaid: 150 })], payments: [payment({ amount: 100 })] })[0].reason, /£90\.00/);
  assert.match(actions({ invoices: [invoice()], payments: [payment({ invoiceId: "another-invoice" })] })[0].reason, /£200\.00/);
});

test("assistant payment evidence follows existing credit/refund rules and leaves source records untouched", () => {
  const inputs = records({ invoices: [invoice({ amountPaid: 0 })], payments: [payment(), payment({ id: "refund", type: "Refund", amount: 40 })] });
  const before = JSON.stringify(inputs);
  assert.match(buildAssistantBriefing(inputs, now).actions[0].reason, /£40\.00/);
  assert.equal(JSON.stringify(inputs), before);
  assert.equal(actions({ invoices: [invoice()], payments: [payment({ type: "Credit note" })] }).length, 0);
  assert.equal(actions({ invoices: [invoice()], payments: [payment({ amount: 300 })] }).length, 0);
});

const commandCentre = compile("../lib/aiCommandCentre.ts", {
  "./assistantIdentity": assistantIdentity,
  "./jobPackCatalogue": loadLocalTs(new URL("../lib/jobPackCatalogue.ts", import.meta.url)),
  "./estimateCostReview": loadLocalTs(new URL("../lib/estimateCostReview.ts", import.meta.url)),
  "./quoteEngine": {}, "./workflow": {}, "./aiLearning": {}, "./scheduling": scheduling,
  "./jobManagement-core.mjs": jobsCore, "./dashboardIntelligence": dashboard,
  "./assistantSignals-core.mjs": signals, "./payments": payments,
});
test("legacy Today and Smart Recommendations share the same payment-aware evidence", () => {
  const data = { ...records({ invoices: [invoice()], payments: [payment()] }), profiles: [], recommendations: [], labourSettings: { targetNetMargin: 25 }, now };
  assert.equal(commandCentre.buildSmartRecommendations(data).some((item) => item.id === "overdue-invoices"), false);
  const today = commandCentre.buildTodayAssistant(data);
  assert.equal(today.overdueInvoices.length, 0);
  assert.equal(today.payments, data.payments);
  const partial = { ...data, payments: [payment({ amount: 100 })] };
  assert.match(commandCentre.buildSmartRecommendations(partial).find((item) => item.id === "overdue-invoices").detail, /£140\.00/);
  assert.equal(commandCentre.buildTodayAssistant(partial).overdueInvoices.length, 1);
});

test("Business Coach excludes draft and ledger-settled balances from debt totals", () => {
  const data = { ...records({ invoices: [invoice({ issueDate: "2026-10-01" }), invoice({ id: "draft", status: "Draft", issueDate: "2026-10-01" })], payments: [payment()] }), labourSettings: { targetNetMargin: 25 }, now };
  const full = commandCentre.buildBusinessCoach(data);
  assert.equal(full.unpaidInvoiceValue, 0); assert.equal(full.overdueInvoiceCount, 0);
  const partial = commandCentre.buildBusinessCoach({ ...data, payments: [payment({ amount: 100 })] });
  assert.equal(partial.unpaidInvoiceValue, 140); assert.equal(partial.overdueInvoiceCount, 1);
});

test("one complete visit cannot hide another visit's missing address or worker", () => {
  const data = { jobs: [job({ startDate: "2026-01-01", assignedTo: [], siteAddress: "" })], planner: [visit({ title: "Prepared visit", jobId: "j1" }), visit({ id: "v2", title: "Unprepared visit", jobId: "j1", date: "2026-10-12", location: "", teamMemberIds: [] })] };
  const result = actions(data);
  assert.equal(result.length, 1); assert.equal(result[0].id, "readiness:j1");
  assert.equal(result[0].dueDate, "2026-10-12"); assert.equal(result[0].priority, "Today");
  assert.equal(result[0].href, "/planner?date=2026-10-12");
  assert.match(result[0].evidence.join(" "), /Unprepared visit.*No site or visit address/);
  assert.match(result[0].evidence.join(" "), /No worker assigned to the job or this visit/);
  assert.doesNotMatch(result[0].evidence.join(" "), /Prepared visit/);
  assert.equal(JSON.stringify(actions({ ...data, planner: [...data.planner].reverse() })), JSON.stringify(result));
});

test("job-level assignment and address remain valid fallbacks for every linked visit", () => {
  const result = actions({ jobs: [job()], planner: [visit({ jobId: "j1", location: "", teamMemberIds: [] }), visit({ id: "v2", jobId: "j1", date: "2026-10-12", location: "", teamMemberIds: [] })] });
  assert.equal(result.length, 0);
});

test("missing visit times generate a review instead of a guessed clash", () => {
  const result = actions({ jobs: [job()], planner: [visit({ jobId: "j1", startTime: "" }), visit({ id: "v2", jobId: "j1" })] });
  assert.equal(result.length, 1); assert.equal(result[0].id, "readiness:j1");
  assert.match(result[0].evidence.join(" "), /Visit time is missing or invalid/);
  assert.equal(result[0].href, "/planner?date=2026-10-10");
});

test("site and clash horizons include today plus six days, excluding the eighth day", () => {
  for (const [date, expected] of [["2026-10-16", 1], ["2026-10-17", 0]]) {
    assert.equal(actions({ jobs: [job({ startDate: date, siteAddress: "" })] }).length, expected);
    assert.equal(actions({ planner: [visit({ date }), visit({ id: "v2", date })] }).length, expected);
    assert.equal(actions({ jobs: [job({ startDate: "2026-01-01", siteAddress: "" })], planner: [visit({ date, jobId: "j1", location: "" })] }).length, expected);
  }
});

test("ongoing multi-day clashes open today while preserving original date evidence", () => {
  const result = actions({ planner: [visit({ date: "2026-10-08", endDate: "2026-10-12" }), visit({ id: "v2", date: "2026-10-09", endDate: "2026-10-11" })] });
  assert.equal(result.length, 1); assert.equal(result[0].dueDate, "2026-10-10");
  assert.equal(result[0].href, "/planner?date=2026-10-10");
  assert.match(result[0].evidence.join(" "), /2026-10-08 to 2026-10-12/);
});
