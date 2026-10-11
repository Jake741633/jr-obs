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
import * as invoiceLink from "../lib/invoiceLink.ts";

function compile(path, dependencies = {}, jsx = false, globals = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) } }).outputText, { ...globals, module: mod, exports: mod.exports, Date, Intl, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return mod.exports;
}
const jobLink = compile("../lib/assistantJobLink.ts", {}, false, { URLSearchParams });
const scheduling = compile("../lib/scheduling.ts");
const assistantVisits = compile("../lib/assistantVisits.ts", { "./jobManagement-core.mjs": jobsCore, "./scheduling": scheduling });
const purchaseLink = compile("../lib/purchaseListLink.ts", {}, false, { URLSearchParams });
const assistantIdentity = compile("../lib/assistantIdentity.ts");
const assistantQuotes = compile("../lib/assistantQuotes.ts", { "./assistantIdentity": assistantIdentity, "./assistantSignals-core.mjs": signals });
const assistantMoney = compile("../lib/assistantMoney.ts", { "./invoiceLink": invoiceLink, "./assistantIdentity": assistantIdentity, "./payments": payments, "./assistantSignals-core.mjs": signals });
const assistantMaterials = compile("../lib/assistantMaterials.ts", { "./purchaseListLink": purchaseLink, "./assistantIdentity": assistantIdentity });
const taskInbox = compile("../lib/taskInbox.ts", { "./assistantIdentity": assistantIdentity, "./jobTasks-core.mjs": taskCore, "./assistantSignals-core.mjs": signals });
const assistantTasks = compile("../lib/assistantTasks.ts", { "./assistantIdentity": assistantIdentity, "./jobTasks-core.mjs": taskCore, "./assistantSignals-core.mjs": signals, "./taskInbox": taskInbox });
const dashboard = compile("../lib/dashboardIntelligence.ts", { "./jobManagement-core.mjs": jobsCore });
const briefing = compile("../lib/assistantBriefing.ts", { "./assistantQuotes": assistantQuotes, "./assistantMoney": assistantMoney, "./assistantTasks": assistantTasks, "./scheduling": scheduling, "./jobManagement-core.mjs": jobsCore, "./dashboardIntelligence": dashboard, "./assistantSignals-core.mjs": signals, "./payments": payments });
const questions = compile("../lib/assistantQuestions.ts", { "./assistantQuotes": assistantQuotes, "./assistantMoney": assistantMoney, "./assistantIdentity": assistantIdentity, "./assistantMaterials": assistantMaterials, "./assistantVisits": assistantVisits, "./assistantTasks": assistantTasks, "./assistantBriefing": briefing, "./assistantSignals-core.mjs": signals, "./jobManagement-core.mjs": jobsCore, "./payments": payments, "./scheduling": scheduling });
const now = new Date(2026, 9, 10, 10);
const records = (patch = {}) => ({ jobs: [], documents: [], invoices: [], payments: [], planner: [], purchases: [], reminders: [], certificates: [], ...patch });
const visit = (patch = {}) => ({ id: "v1", title: "First fix", type: "Job", status: "Confirmed", date: "2026-10-11", startTime: "09:00", endTime: "12:00", location: "1 High Street", teamMemberIds: ["worker"], ...patch });
const job = (patch = {}) => ({ id: "j1", title: "Workshop", status: "Scheduled", startDate: "2026-10-11", siteAddress: "1 High Street", assignedTo: ["worker"], ...patch });
const invoice = (patch = {}) => ({ id: "i1", number: "INV-1", title: "Lighting", status: "Sent", dueDate: "2026-10-09", items: [{ quantity: 2, unitPrice: 100 }], vatEnabled: true, vatRate: 20, amountPaid: 0, ...patch });
const siteTask = (patch = {}) => ({ id: "t1", jobId: "j1", type: "Task", title: "Fit labels", status: "Open", priority: "Normal", category: "General", dueDate: "", ...patch });
const answer = (question, data = {}, date = now) => questions.answerAssistantQuestion(records(data), question, date);
const answerFor = (question, data, id) => questions.answerAssistantQuestion(records(data), question, now, undefined, id);

test("quote answers separate verified follow-up counts from identity and date reviews", () => {
  const quote = { id: "q1", type: "Quote", status: "Sent", number: "Q-1", title: "Lighting", validUntil: "2026-11-01", updatedAt: "2026-10-01T10:00:00Z" };
  const data = records({ documents: [quote, { ...quote, type: "Estimate" }, { ...quote, id: "valid" }, { ...quote, id: "bad-date", nextFollowUpDate: "invalid" }] });
  const result = questions.answerAssistantQuestion(data, "Show quote follow-ups", now, { today: "2026-10-10", actions: [] });
  assert.match(result.summary, /1 confirmed follow-up.*2 quote source reviews.*count incomplete/);
  assert.equal(result.items.length, 3); assert.match(result.warnings.join(" "), /count is incomplete/);
  assert.ok(!result.items.some(i => i.id === "follow-up:q1" || i.id === "follow-up:bad-date"));
  const recovered = answer("Show quote follow-ups", { documents: [quote] });
  assert.match(recovered.summary, /1 confirmed follow-up/); assert.equal(recovered.warnings.length, 0);
});

test("job briefing rebuilds quote evidence in scope even with a cached global briefing", () => {
  const quote = { id: "q1", jobId: "j1", type: "Quote", status: "Sent", number: "Q-1", title: "Lighting", validUntil: "2026-11-01", updatedAt: "2026-10-01T10:00:00Z" };
  const data = records({ jobs: [job(), job({ id: "other", title: "Other site" })], documents: [quote, { ...quote, jobId: "other", type: "Estimate", title: "Hidden other quote details" }] });
  const global = briefing.buildAssistantBriefing(data, now);
  assert.match(JSON.stringify(global), /Hidden other quote details/);
  const result = questions.answerAssistantQuestion(data, "Show job briefing", now, global, "j1");
  assert.equal(result.items.filter(i => i.id.startsWith("quote-source:")).length, 1);
  assert.ok(!result.items.some(i => i.id === "follow-up:q1")); assert.match(result.warnings.join(" "), /quote source review/);
  assert.doesNotMatch(JSON.stringify(result), /Hidden other quote details|Other site/);
});

test("task and job answers withhold ambiguous counts using all loaded task identities", () => {
  const data = { jobs: [job(), job({ id: "other", title: "Other site" })], tasks: [siteTask({ type: "Snag", priority: "Urgent" }), siteTask({ jobId: "other", title: "Other job copy details", status: "Completed" }), siteTask({ id: "valid", title: "Known open work" })] };
  for (const query of ["Show open tasks", "Show open snags", "Show job briefing"]) {
    const result = answerFor(query, data, "j1");
    assert.match(result.summary, /1 task identity review.*count incomplete/);
    assert.match(result.summary, query.includes("snags") ? /0 open items/ : query.includes("briefing") ? /1 open task or snag/ : /1 open item/);
    assert.match(result.warnings.join(" "), /excluded from the open-work count/);
    assert.equal(result.items.filter(i => i.id.startsWith("task-source:")).length, 1);
    assert.ok(!result.items.some(i => i.id === "task:t1"));
    assert.doesNotMatch(JSON.stringify(result), /Other job copy details|Other site/);
  }
  const all = answer("Show open tasks", data); assert.match(all.summary, /1 open item.*count incomplete/);
  assert.match(JSON.stringify(all.items), /Other job copy details/);
});

test("job task source reviews preserve role destinations and refresh after conflicts are resolved", () => {
  const data = records({ jobs: [job()], tasks: [siteTask(), siteTask({ status: "Completed" })] });
  const restricted = questions.answerAssistantQuestion(data, "Show job briefing", now, undefined, "j1", false);
  const item = restricted.items.find(i => i.id.startsWith("task-source:")); assert.equal(item.href, "/jobs/j1"); assert.match(item.detail, /owner or admin/);
  assert.ok(restricted.items.every(i => !i.href.startsWith("/job-tasks")));
  const recovered = answerFor("Show open tasks", { ...data, tasks: [siteTask()] }, "j1");
  assert.match(recovered.summary, /1 open item/); assert.equal(recovered.warnings.length, 0); assert.equal(recovered.items[0].href, "/job-tasks?job=j1&task=t1");
});

test("question matching accepts normal phrasing and punctuation, and rejects ambiguous scopes or commands", () => {
  for (const [query, intent] of [["What's booked tomorrow?", "tomorrow"], ["Please show my diary next seven days!", "week"], ["Can you tell me how much is overdue?", "overdue"], ["Who owes me money?", "unpaid"], ["Show quote follow-ups", "quotes"], ["Am I ready for site?", "site"], ["What should I do next?", "priorities"]]) assert.equal(questions.assistantQuestionIntent(query), intent, query);
  for (const query of ["Show tomorrow's weather", "Don't show unpaid invoices", "Delete overdue invoices", "Show my diary next month", "How much is overdue and what is booked tomorrow?", "x".repeat(181)]) {
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
  const data = { invoices: [invoice({ id: "i/1?#" }), invoice({ id: "today", dueDate: "2026-10-10" }), invoice({ id: "future", dueDate: "2026-10-12" }), invoice({ id: "paid", status: "Paid" }), invoice({ id: "draft", status: "Draft" })], payments: [{ id: "pay-special", invoiceId: "i/1?#", type: "Payment", amount: 100 }] };
  const overdue = answer("How much is overdue?", data);
  assert.match(overdue.summary, /£140\.00 across 1 invoice/);
  assert.equal(overdue.items[0].href, "/invoices?invoice=i%2F1%3F%23");
  assert.match(overdue.items[0].evidence.join(" "), /£100\.00/);
  assert.match(answer("Who owes me money?", data).summary, /£620\.00 across 3 invoices/);
  assert.match(answer("How much am I owed?", { invoices: [invoice()], payments: [{ id: "pay-i1", invoiceId: "i1", type: "Payment", amount: 240 }] }).summary, /£0\.00 across 0 invoices/);
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

test("money answers withhold duplicate invoice identities, including closed copies, and keep valid subtotals", () => {
  for (const status of ["Sent", "Paid", "Draft", "Cancelled"]) {
    const data = records({ invoices: [invoice(), invoice({ status, title: "Conflicting saved copy" }), invoice({ id: "valid" })] });
    for (const question of ["How much is overdue?", "Who owes me money?"]) {
      const result = answer(question, data);
      assert.match(result.summary, /Verified subtotal: £240\.00 across 1 invoice.*Total incomplete/);
      assert.equal(result.items.filter((item) => item.id.startsWith("invoice:")).length, 1);
      const review = result.items.find((item) => item.id.startsWith("invoice-source:"));
      assert.equal(review.href, "/invoices"); assert.match(review.evidence.join(" "), /Conflicting saved copy/);
      assert.match(result.warnings.join(" "), /1 invoice identity review/);
    }
    const actions = briefing.buildAssistantBriefing(data, now).actions;
    assert.equal(actions.filter((action) => action.title.startsWith("Chase")).length, 1);
    assert.equal(actions.filter((action) => action.title === "Invoice identity needs review").length, 1);
  }
});

test("missing invoice identities cannot supply balances or an exact source link", () => {
  for (const id of [undefined, null, "", "   ", 12]) {
    const data = records({ invoices: [invoice({ id })] });
    const result = answer("Who owes me money?", data);
    assert.match(result.summary, /Total incomplete/); assert.equal(result.items.length, 1);
    assert.equal(result.items[0].href, "/invoices"); assert.match(result.items[0].detail, /identities are missing/);
    assert.ok(!briefing.buildAssistantBriefing(data, now).actions.some((action) => action.title.startsWith("Chase")));
  }
});

test("a duplicate payment cannot overstate settlement or become unpaid by being discarded", () => {
  const payment = { id: "pay", invoiceId: "i1", type: "Payment", amount: 120 };
  const data = records({ invoices: [invoice()], payments: [payment, { ...payment }] });
  const result = answer("How much is overdue?", data);
  assert.match(result.summary, /Verified subtotal: £0\.00.*Total incomplete/);
  assert.equal(result.items.length, 1); assert.equal(result.items[0].href, "/payments");
  assert.match(result.items[0].detail, /not treated as unpaid or settled/);
  assert.match(result.items[0].evidence.join(" "), /identity shared/);
  assert.doesNotMatch(result.items[0].detail, /£/);
  const action = briefing.buildAssistantBriefing(data, now).actions[0];
  assert.equal(action.title, "Payment evidence needs review · INV-1"); assert.equal(action.priority, "Today");
});

test("payment identity checks include copies on another invoice or without allocation", () => {
  for (const invoiceId of ["other", undefined]) {
    const data = { invoices: [invoice()], payments: [{ id: "pay", invoiceId: "i1", type: "Payment", amount: 100 }, { id: "pay", invoiceId, type: "Refund", amount: 30, reference: "Other invoice secret" }] };
    const result = answer("Who owes me money?", data);
    assert.match(result.summary, /Total incomplete/);
    assert.match(result.items[0].evidence.join(" "), /identity shared/);
    assert.doesNotMatch(result.items[0].evidence.join(" "), /Other invoice secret|30/);
  }
});

test("missing payment identities and unsupported payment amounts or types request review", () => {
  for (const patch of [{ id: undefined }, { id: " " }, { id: null }, { type: "Unknown" }, { amount: -1 }, { amount: NaN }, { amount: Infinity }, { amount: "100" }, { amount: 1e16 }]) {
    const data = { invoices: [invoice({ amountPaid: 240 })], payments: [{ id: "pay", invoiceId: "i1", type: "Payment", amount: 100, ...patch }] };
    const result = answer("How much is overdue?", data);
    assert.match(result.summary, /Total incomplete/); assert.equal(result.items.length, 1);
    assert.match(result.items[0].title, /Payment evidence needs review/);
    assert.ok(!briefing.buildAssistantBriefing(records(data), now).actions.some((action) => action.title.startsWith("Chase")));
  }
});

test("valid credits refunds deposits and invoice-paid maxima retain the existing payment policy", () => {
  const data = { invoices: [invoice()], payments: [
    { id: "deposit", invoiceId: "i1", type: "Deposit", amount: 50 },
    { id: "stage", invoiceId: "i1", type: "Stage payment", amount: 50 },
    { id: "credit", invoiceId: "i1", type: "Credit note", amount: 20 },
    { id: "refund", invoiceId: "i1", type: "Refund", amount: 10 },
  ] };
  assert.match(answer("Who owes me money?", data).summary, /^£130\.00 across 1 invoice/);
  assert.match(answer("Who owes me money?", { ...data, invoices: [invoice({ amountPaid: 150 })] }).summary, /^£90\.00 across 1 invoice/);
  assert.equal(answer("Who owes me money?", data).warnings.length, 0);
});

test("unrelated malformed payments and only closed invoices do not create money reviews", () => {
  const result = answer("Who owes me money?", { invoices: [invoice()], payments: [{ invoiceId: "other", type: "Unknown", amount: NaN }] });
  assert.match(result.summary, /^£240\.00 across 1 invoice/); assert.equal(result.warnings.length, 0);
  const closed = answer("Who owes me money?", { invoices: [invoice({ status: "Paid" }), invoice({ status: "Cancelled" }), invoice({ id: "", status: "Draft" })] });
  assert.equal(closed.items.length, 0); assert.equal(closed.warnings.length, 0);
});

test("unsafe aggregate ledger amounts cannot silently imply an invoice is settled", () => {
  const result = answer("Who owes me money?", { invoices: [invoice()], payments: [
    { id: "a", invoiceId: "i1", type: "Payment", amount: 5e13 }, { id: "b", invoiceId: "i1", type: "Payment", amount: 5e13 },
  ] });
  assert.match(result.summary, /Total incomplete/); assert.match(result.warnings.join(" "), /invalid or unsupported amounts/);
  assert.equal(result.items.length, 0);
});

test("job briefings retain global identity conflicts but never another job's invoice copy evidence", () => {
  const data = { jobs: [job(), job({ id: "other", title: "Other job" })], invoices: [invoice({ jobId: "j1" }), invoice({ jobId: "other", title: "Other job confidential detail", status: "Paid" })] };
  const result = answer("Job briefing for Workshop", data);
  assert.ok(!result.items.some((item) => item.id.startsWith("invoice:")));
  assert.match(result.warnings.join(" "), /invoice identity review/);
  const reviews = result.items.filter((item) => item.id.startsWith("invoice-source:"));
  assert.equal(reviews.length, 1); assert.match(reviews[0].evidence.join(" "), /Lighting/);
  assert.doesNotMatch(JSON.stringify(result), /Other job confidential detail/);
});

test("job briefings detect cross-invoice payment conflicts without widening the job scope", () => {
  const result = answer("Job briefing for Workshop", { jobs: [job()], invoices: [invoice({ jobId: "j1" })], payments: [
    { id: "shared", invoiceId: "i1", type: "Payment", amount: 100 }, { id: "shared", invoiceId: "other", type: "Payment", amount: 50 },
  ] });
  assert.ok(!result.items.some((item) => item.id.startsWith("invoice:")));
  assert.equal(result.items.filter((item) => item.id.startsWith("invoice-payment-review:")).length, 1);
  assert.match(result.warnings.join(" "), /uncertain linked payment evidence/);
});

test("money source reviews are order-independent read-only and office-accessible", () => {
  const data = records({ invoices: [invoice(), invoice({ status: "Paid" }), invoice({ id: "valid" }), invoice({ id: "bad-payment" })], payments: [{ id: "", invoiceId: "bad-payment", type: "Payment", amount: 100 }] });
  const before = JSON.stringify(data);
  const result = answer("How much is overdue?", data);
  assert.equal(JSON.stringify(result), JSON.stringify(answer("How much is overdue?", { ...data, invoices: [...data.invoices].reverse(), payments: [...data.payments].reverse() })));
  assert.equal(JSON.stringify(data), before);
  for (const item of result.items) assert.equal(permissions.canAccessPath("office", permissions.internalPathForAccess(item.href)), true);
  assert.equal(new Set(result.items.map((item) => item.id)).size, result.items.length);
});

test("oversized historical invoice identities use the explicitly labelled invoice inbox", () => {
  const data = records({ invoices: [invoice({ id: "x".repeat(301) })] });
  const item = answer("How much is overdue?", data).items[0]; assert.equal(item.href, "/invoices"); assert.equal(item.actionLabel, "Review invoice inbox");
  const action = briefing.buildAssistantBriefing(data, now).actions[0]; assert.equal(action.href, "/invoices"); assert.equal(action.actionLabel, "Review invoice inbox");
});

test("phone money answers refresh from a balance to review and back without stale claims", () => {
  const data = records({ invoices: [invoice()] }); const h = ui(data);
  h.click("Overdue money"); assert.match(text(h.render()), /£240\.00 across 1 invoice/);
  h.replaceRecords({ ...data, invoices: [invoice(), invoice({ status: "Paid" })] });
  assert.match(text(h.render()), /Total incomplete/); assert.doesNotMatch(text(h.render()), /£240\.00 outstanding/);
  assert.equal(nodes(h.render()).find((node) => node.type === "Link").props.href, "/invoices");
  h.replaceRecords({ ...data, payments: [{ id: "pay", invoiceId: "i1", type: "Payment", amount: 100 }] });
  assert.match(text(h.render()), /£140\.00 across 1 invoice/); assert.doesNotMatch(text(h.render()), /Total incomplete/);
  h.click("Clear answer"); assert.ok(!nodes(h.render()).some((node) => node.props["aria-label"] === "JR AI answer"));
});

test("phone money reviews keep progressive reveal and supported source links", () => {
  const invoices = Array.from({ length: 6 }, (_, index) => invoice({ id: `copy-${index}`, number: `INV-${index}` })).flatMap((entry) => [entry, { ...entry, status: "Paid" }]);
  const h = ui(records({ invoices })); h.click("Overdue money");
  assert.match(text(h.render()), /6 invoice identity reviews/);
  assert.equal(nodes(h.render()).filter((node) => node.type === "Link").length, 4);
  h.click("Show more records"); assert.equal(nodes(h.render()).filter((node) => node.type === "Link").length, 6);
  h.fill("Who owes me money?"); assert.ok(!nodes(h.render()).some((node) => node.props["aria-label"] === "JR AI answer"));
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
    react: { useEffect: (fn) => { if (!mounted) effects.push(fn); }, useMemo: (fn) => fn(), useRef(initial) { const index = cursor++; if (!(index in states)) states[index] = { current: initial === null ? { blur: () => blurred++ } : initial }; return states[index]; }, useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; } },
    "next/link": { default: "Link" }, "../ui/Card": { Card: "Card" }, "../../lib/assistantQuestions": questions, "../../lib/assistantJobLink": jobLink, "../../lib/assistantIdentity": assistantIdentity,
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
  h.replaceRecords({ ...data, payments: [{ id: "pay-i1", invoiceId: "i1", type: "Payment", amount: 240 }] });
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
  const data = { jobs: [job()], tasks: [], invoices: [invoice({ jobId: "j1", amountPaid: 100 }), invoice({ id: "future", jobId: "j1", dueDate: "2026-11-01" }), invoice({ id: "draft", jobId: "j1", status: "Draft" }), invoice({ id: "cancelled", jobId: "j1", status: "Cancelled" })], payments: [{ id: "pay-i1", invoiceId: "i1", type: "Payment", amount: 150 }, { id: "pay-future", invoiceId: "future", type: "Payment", amount: 20 }] };
  const result = answer("Job briefing for Workshop", data);
  assert.match(result.items.find((i) => i.id === "invoice:i1").detail, /£90\.00/);
  assert.match(result.items.find((i) => i.id === "invoice:future").detail, /£220\.00/);
  assert.equal(result.items.filter((i) => i.id.startsWith("invoice:")).length, 2);
  const settled = answer("Job briefing for Workshop", { ...data, payments: [{ id: "pay-i1", invoiceId: "i1", type: "Payment", amount: 240 }, { id: "pay-future", invoiceId: "future", type: "Payment", amount: 240 }] });
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
  h.click("Show more records"); assert.equal(nodes(h.render()).filter((n) => n.type === "Link").length, 8);
  assert.equal(nodes(h.render()).filter((n) => n.type === "Link" && n.props.href.startsWith("/job-tasks?")).length, 6);
  assert.match(text(h.render()), /Plan next visit for Workshop/);
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
  h.replaceRecords({ ...data, tasks: [siteTask({ priority: "High", status: "Completed" })], payments: [{ id: "pay-i1", invoiceId: "i1", type: "Payment", amount: 240 }], planner: [visit({ jobId: "j1", status: "Complete" })] });
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

test("next-visit questions have explicit forms and cannot interpret commands or broader diary requests", () => {
  for (const question of ["Which jobs need booking?", "What jobs need another work visit?", "Please show me next visit checks!", "Show jobs needing a visit", "Show work visit checks"]) assert.equal(questions.assistantQuestionIntent(question), "visits");
  for (const question of ["Book the next visit", "Delete next visit checks", "Which jobs need booking next month?", "Which jobs need another visit and overdue invoices?"]) {
    assert.equal(answer(question).recognized, false); assert.equal(answer(question).items.length, 0);
  }
});

test("visit planning covers accepted and on-site work with stage-specific review while excluding leads and closed jobs", () => {
  const included = ["Accepted", "Awaiting deposit", "Scheduled", "First fix", "In progress", "Awaiting builder", "Second fix", "Testing", "Snagging"];
  const excluded = ["Enquiry", "Lead", "Survey required", "Quoted", "Complete", "Invoiced", "Paid", "On hold", "Cancelled", "Unknown"];
  const jobs = [...included, ...excluded].map((status) => job({ id: status, status }));
  const result = answer("Which jobs need another visit?", { jobs });
  assert.deepEqual(new Set(idsOf(result)), new Set(included.map((status) => `visit-plan:${status}`)));
  assert.match(result.items.find((i) => i.id === "visit-plan:Awaiting deposit").detail, /Review the deposit.*before agreeing/);
  assert.match(result.items.find((i) => i.id === "visit-plan:Awaiting builder").detail, /Confirm the builder's access/);
  assert.match(result.scope, /enquiries, unaccepted quotes, closed and held jobs are excluded.*does not confirm availability, payment, access or site readiness/);
  assert.ok(assistantVisits.assistantVisitActions(jobs, [], "2026-10-10").every((action) => action.priority === "Next" && !action.dueDate));
});

test("work-visit answers distinguish real current/future bookings from past history surveys and deliveries", () => {
  for (const patch of [{ type: "Survey" }, { type: "Delivery" }, { status: "Complete" }, { status: "Cancelled" }, { date: "2026-10-08", endDate: "2026-10-09" }, { jobId: "other" }, { jobId: undefined }]) {
    const data = { jobs: [job({ startDate: "2026-10-10" })], planner: [visit({ jobId: "j1", ...patch })] };
    assert.deepEqual(idsOf(answer("Which jobs need booking?", data)), ["visit-plan:j1"]);
  }
  for (const patch of [{ date: "2026-10-08", endDate: "2026-10-10" }, { date: "2028-10-10", endDate: undefined }]) {
    assert.equal(answer("Which jobs need booking?", { jobs: [job()], planner: [visit({ jobId: "j1", ...patch })] }).items.length, 0);
  }
});

test("uncertain work bookings stay explicit alongside a future visit without leaking another job's record", () => {
  const planner = [visit({ jobId: "j1", id: "valid-future", date: "2027-01-01" }), visit({ jobId: "j1", id: "bad-date", date: "2026-02-30" }), visit({ jobId: "j1", id: "reversed", date: "2026-10-12", endDate: "2026-10-11" }), visit({ jobId: "j1", id: "unknown", status: "Tentative" }), visit({ jobId: "other", id: "other-bad", date: "bad" })];
  const result = answerFor("Show next visit checks", { jobs: [job(), job({ id: "other" })], planner }, "j1");
  assert.equal(result.resolvedJobId, "j1"); assert.deepEqual(idsOf(result), ["visit-plan:j1"]);
  assert.match(result.items[0].detail, /3 linked work bookings have invalid\/reversed dates or an unsupported status.*before creating another visit/);
  const evidence = result.items[0].evidence.join(" "); assert.match(evidence, /1 ongoing\/future.*bad-date.*reversed.*Tentative/); assert.doesNotMatch(evidence, /other-bad/);
  assert.equal(assistantVisits.assistantVisitActions([job()], planner, "2026-10-10")[0].priority, "Today");
});

test("named next-visit questions retain exact-name duplicate choices and never broaden missing identity", () => {
  const data = { jobs: [job(), job({ id: "other", siteAddress: "Elsewhere" })] };
  const duplicate = answer("Show next visit checks for Workshop", data); assert.equal(duplicate.title, "Choose a job"); assert.equal(duplicate.jobChoices.length, 2); assert.equal(duplicate.items.length, 0);
  const exact = answer("Show next visit checks at 1 High Street", data); assert.equal(exact.resolvedJobId, "j1"); assert.deepEqual(idsOf(exact), ["visit-plan:j1"]);
  assert.equal(answer("Show next visit checks for Work", data).items.length, 0);
  assert.equal(answerFor("Show next visit checks", data, "missing").title, "Job unavailable");
  assert.equal(answerFor("Show next visit checks for Workshop", data, "missing").items.length, 0);
});

test("phone next-visit shortcut scopes jobs, reveals four at a time and refreshes after bookings change", () => {
  const data = records({ jobs: Array.from({ length: 7 }, (_, i) => job({ id: `j${i}`, title: `Job ${i}` })) }); const h = ui(data);
  h.click("Next visit checks"); assert.match(text(h.render()), /7 jobs with missing or uncertain work bookings/); assert.equal(nodes(h.render()).filter((n) => n.type === "Link").length, 4); assert.equal(h.blurred(), 1);
  h.click("Show more records"); assert.equal(nodes(h.render()).filter((n) => n.type === "Link").length, 7);
  h.scope("j6"); assert.equal(nodes(h.render()).some((n) => n.props["aria-label"] === "JR AI answer"), false);
  h.click("Next visit checks"); assert.match(text(h.render()), /Next work visit checks · Job 6/); assert.equal(nodes(h.render()).filter((n) => n.type === "Link").length, 1);
  h.replaceRecords({ ...data, planner: [visit({ jobId: "j6" })] }); assert.match(text(h.render()), /0 jobs with missing or uncertain work bookings/); assert.equal(nodes(h.render()).filter((n) => n.type === "Link").length, 0);
  h.replaceRecords({ ...data, jobs: data.jobs.filter((j) => j.id !== "j6") }); assert.match(text(h.render()), /selected job is no longer available/);
  h.click("Clear answer"); assert.equal(nodes(h.render()).find((n) => n.type === "select").props.value, "");
});

test("job briefing includes one work-booking check and drops it when a real work visit arrives", () => {
  const data = records({ jobs: [job()], tasks: [], planner: [visit({ jobId: "j1", type: "Survey" })] }); const h = ui(data);
  h.scope("j1"); h.click("Job briefing"); assert.match(text(h.render()), /Plan next visit for Workshop/);
  const result = answerFor("Show job briefing", data, "j1"); assert.equal(idsOf(result).filter((id) => id === "visit-plan:j1").length, 1); assert.ok(idsOf(result).includes("visit:v1"), "the separate survey remains listed");
  h.replaceRecords({ ...data, planner: [visit({ jobId: "j1" })] }); assert.doesNotMatch(text(h.render()), /Plan next visit for Workshop/);
  h.replaceRecords({ ...data, planner: [visit({ jobId: "j1", status: "Complete" })] }); assert.match(text(h.render()), /Plan next visit for Workshop/);
  assert.ok(!idsOf(answerFor("Show job briefing", { ...data, jobs: [job({ status: "Complete" })] }, "j1")).includes("visit-plan:j1"));
});

test("visit planning preserves sources and exact permitted links for office owner and admin accounts", () => {
  const data = records({ jobs: [job({ id: "j /?#", status: "Awaiting deposit" })], planner: [visit({ jobId: "j /?#", status: "Tentative" })] }); const before = JSON.stringify(data);
  for (const role of ["office", "owner", "admin"]) {
    const result = questions.answerAssistantQuestion(data, "Which jobs need booking?", now, undefined, "", permissions.canAccessPath(role, "/job-tasks"));
    assert.equal(result.items[0].href, "/planner?job=j%20%2F%3F%23"); assert.ok(result.items.every((i) => permissions.canAccessPath(role, permissions.internalPathForAccess(i.href))));
  }
  assert.equal(JSON.stringify(data), before);
});

test("next-visit scheduling links encode one exact job scope and cannot carry booking commands", () => {
  for (const id of ["j /?# +&action=create&job=other", "  opaque id  ", "électricité", "x".repeat(300)]) {
    const result = assistantVisits.assistantVisitActions([job({ id, status: "Scheduled" })], [], "2026-10-10")[0];
    const link = new URL(result.href, "https://jr.example"); assert.equal(link.pathname, "/planner");
    assert.deepEqual(Array.from(link.searchParams), [["job", id]]); assert.deepEqual(Array.from(result.jobIds), [id]);
  }
  const longId = "x".repeat(301); const result = assistantVisits.assistantVisitActions([job({ id: longId, status: "Scheduled" })], [], "2026-10-10")[0];
  assert.equal(result.href, `/jobs/${longId}`);
});

const purchaseLine = (patch = {}) => ({ id: "line-1", description: "Cable", supplier: "CEF", stockCode: "CABLE-10", quantity: 12.5, unitCost: 6, status: "Needed", ...patch });
const purchaseList = (patch = {}) => ({ id: "p1", number: "PO-01", title: "Workshop materials", jobId: "j1", items: [purchaseLine()], notes: "", ...patch });

test("materials and delivery questions accept explicit forms and reject orders or invented delivery dates", () => {
  for (const [query, intent] of [["Which materials need ordering?", "materials"], ["What materials do I need to order?", "materials"], ["Please show materials to order!", "materials"], ["What deliveries am I waiting for?", "deliveries"], ["Show awaiting deliveries", "deliveries"], ["List outstanding deliveries", "deliveries"], ["Which materials are ordered?", "deliveries"]]) assert.equal(questions.assistantQuestionIntent(query), intent, query);
  for (const query of ["Order all materials", "Mark all materials delivered", "What deliveries arrive tomorrow?", "Show late deliveries", "Cancel orders for Workshop", "What cable should I buy?", "Show materials to order and unpaid invoices"]) {
    assert.equal(answer(query).recognized, false, query); assert.equal(answer(query).items.length, 0);
  }
});

test("material answers separate saved order stages, keep uncertain statuses and preserve each line's evidence", () => {
  const data = { jobs: [job()], purchases: [purchaseList({ items: [purchaseLine(), purchaseLine({ id: "second", quantity: 3, stockCode: "OTHER" }), purchaseLine({ id: "ordered", description: "Ordered sockets", status: "Ordered" }), purchaseLine({ id: "done", description: "Delivered switches", status: "Delivered" }), purchaseLine({ id: "legacy", description: "Legacy line", status: "Dispatched" })] })] };
  const before = JSON.stringify(data);
  const needed = answer("Which materials need ordering?", data); assert.match(needed.summary, /2 line\(s\) marked Needed.*1 uncertain/); assert.equal(needed.items.length, 1);
  const evidence = needed.items[0].evidence.join(" "); assert.match(evidence, /Line line-1.*Quantity: 12.5.*CEF.*CABLE-10.*Line second.*Quantity: 3.*OTHER.*Legacy line.*Dispatched/);
  assert.doesNotMatch(evidence, /Ordered sockets|Delivered switches|unitCost|£/);
  const ordered = answer("Show awaiting deliveries", data); assert.match(ordered.summary, /1 line\(s\) marked Ordered.*1 uncertain/);
  assert.match(ordered.items[0].evidence.join(" "), /Ordered sockets.*Legacy line/); assert.doesNotMatch(ordered.items[0].evidence.join(" "), /Delivered switches|Line second/);
  assert.match(ordered.scope, /not confirmed late deliveries/); assert.equal(JSON.stringify(data), before);
});

test("material job scope uses only saved purchase links and preserves closed orphan and unlinked evidence", () => {
  const data = { jobs: [job({ status: "Complete" }), job({ id: "other", title: "Other job" })], purchases: [purchaseList(), purchaseList({ id: "other", jobId: "other" }), purchaseList({ id: "orphan", jobId: "missing" }), purchaseList({ id: "unlinked", jobId: undefined, pricingDocumentId: "q1" })], documents: [{ id: "q1", jobId: "j1" }] };
  const all = answer("Show materials to order", data); assert.equal(all.items.length, 4); assert.match(all.scope, /including unlinked lists and lists on closed jobs/);
  assert.match(all.items.find((i) => i.id === "purchase:orphan").evidence[0], /Linked job unavailable/); assert.match(all.items.find((i) => i.id === "purchase:unlinked").evidence[0], /No saved job link/);
  const scoped = answerFor("Show materials to order", data, "j1"); assert.deepEqual(Array.from(scoped.items, (i) => i.id), ["purchase:p1"]); assert.match(scoped.scope, /Job status: Complete/);
  const missing = answerFor("Show materials to order", data, "removed"); assert.equal(missing.title, "Job unavailable"); assert.equal(missing.items.length, 0);
});

test("named material and delivery questions preserve duplicate choices, quoted names and full addresses", () => {
  const data = { jobs: [job(), job({ id: "other", title: "Workshop", siteAddress: "2 High Street" })], purchases: [purchaseList({ items: [purchaseLine({ status: "Ordered" })] }), purchaseList({ id: "other", jobId: "other" })] };
  assert.equal(answer("Which materials need ordering for Workshop?", data).title, "Choose a job");
  assert.equal(answer("Which materials need ordering for Workshop?", data).items.length, 0);
  for (const query of ['What deliveries am I waiting for at "1 High Street"?', "Show awaiting deliveries for 1 high   street", "Which materials are ordered at 1 High Street"]) {
    const result = answer(query, data); assert.equal(result.resolvedJobId, "j1", query); assert.equal(result.items[0].id, "purchase:p1");
  }
  assert.equal(answer("Show materials to order for Work", data).title, "Job unavailable");
  const named = { jobs: [job({ title: "Workshop for Ray" })], purchases: [purchaseList()] };
  assert.equal(answer('Show materials to order for "Workshop for Ray"', named).resolvedJobId, "j1");
});

test("missing quantity and status evidence cannot become an empty materials clearance", () => {
  const data = { purchases: [purchaseList({ items: [0, -1, NaN, Infinity, undefined].map((quantity, i) => purchaseLine({ id: String(i), quantity, supplier: "", stockCode: "" })).concat([purchaseLine({ id: "legacy", quantity: 2, status: "" }), purchaseLine({ id: "done", status: "Delivered", quantity: NaN })]) })] };
  const result = answer("Show materials to order", data); assert.match(result.summary, /5 line\(s\) marked Needed.*1 uncertain/); assert.match(result.warnings[0], /5 outstanding line/);
  assert.match(result.items[0].evidence.join(" "), /Quantity needs review.*Supplier: Not recorded.*Stock code: Not recorded/);
  assert.match(result.items[0].evidence.join(" "), /Line legacy.*Status: Not recorded/);
  assert.match(answer("Show materials to order", { purchases: undefined }).summary, /not ready/);
  assert.match(answer("Show materials to order", { purchases: [] }).summary, /0 line\(s\) marked Needed/);
});

test("phone material shortcuts reveal four lists and refresh on saved order and delivery changes", () => {
  const data = records({ jobs: [job()], purchases: Array.from({ length: 7 }, (_, i) => purchaseList({ id: `p${i}`, number: `PO-${i}` })) }); const h = ui(data);
  h.scope("j1"); h.click("Materials to order"); assert.match(text(h.render()), /Only purchase lists explicitly linked to Workshop/);
  assert.equal(nodes(h.render()).filter((n) => n.type === "Link").length, 4); assert.equal(h.blurred(), 1);
  h.click("Show more records"); assert.equal(nodes(h.render()).filter((n) => n.type === "Link").length, 7);
  h.replaceRecords({ ...data, purchases: data.purchases.map((list) => ({ ...list, items: [purchaseLine({ status: "Ordered" })] })) });
  assert.match(text(h.render()), /0 line\(s\) marked Needed/); h.click("Awaiting deliveries"); assert.equal(nodes(h.render()).filter((n) => n.type === "Link").length, 4);
  h.replaceRecords({ ...data, purchases: data.purchases.map((list) => ({ ...list, items: [purchaseLine({ status: "Delivered" })] })) }); assert.match(text(h.render()), /0 line\(s\) marked Ordered/);
  h.scope(""); assert.equal(nodes(h.render()).some((n) => n.props["aria-label"] === "JR AI answer"), false);
});

test("submitted named material answers retain the selected identity when names are reused", () => {
  const data = records({ jobs: [job()], purchases: [purchaseList()] }); const h = ui(data);
  h.fill("Show materials to order for Workshop"); h.submit(); assert.match(text(h.render()), /1 line\(s\) marked Needed/);
  h.replaceRecords({ ...data, jobs: [job({ id: "replacement" })], purchases: [purchaseList({ jobId: "replacement" })] });
  assert.match(text(h.render()), /previous selection is unavailable/); assert.equal(nodes(h.render()).filter((n) => n.type === "Link").length, 1, "only an explicit job-choice review link remains");
  assert.ok(!nodes(h.render()).some((n) => n.type === "Link" && n.props.href.startsWith("/purchases")));
  h.choose(); assert.match(text(h.render()), /1 line\(s\) marked Needed/); h.click("Clear answer"); assert.equal(nodes(h.render()).some((n) => n.props["aria-label"] === "JR AI answer"), false);
});

test("material review links retain opaque saved ids and permitted office destinations without source mutation", () => {
  const id = " p /?# +&action=create "; const data = records({ jobs: [job()], purchases: [purchaseList({ id })] }); const before = JSON.stringify(data);
  for (const role of ["owner", "admin", "office"]) {
    const result = questions.answerAssistantQuestion(data, "Which materials need ordering?", now, undefined, "j1", permissions.canAccessPath(role, "/job-tasks"));
    const link = new URL(result.items[0].href, "https://jr.example"); assert.deepEqual(Array.from(link.searchParams), [["list", id]]);
    assert.equal(permissions.canAccessPath(role, permissions.internalPathForAccess(result.items[0].href)), true); assert.equal(purchaseLink.purchaseListFromLink(link.search).listId, id);
  }
  assert.equal(JSON.stringify(data), before);
});

test("every job-scoped question refuses duplicate saved identities even when only one copy matches a typed name", () => {
  const data = { jobs: [job(), job({ title: "Other saved copy", siteAddress: "Elsewhere" })], tasks: [siteTask()], purchases: [purchaseList()], planner: [visit({ jobId: "j1" })] };
  for (const query of ["Show job briefing", "Show open tasks", "Show open snags", "Show next visit checks", "Show materials to order", "Show awaiting deliveries"]) {
    const scoped = answerFor(query, data, "j1"); assert.equal(scoped.title, "Job identity needs review", query); assert.equal(scoped.items.length, 0); assert.equal(scoped.resolvedJobId, undefined); assert.match(scoped.warnings.join(" "), /ambiguous/);
    const named = answer(`${query} for Workshop`, data); assert.equal(named.title, "Job identity needs review", query); assert.equal(named.items.length, 0); assert.equal(named.jobChoices.length, 0);
  }
});

test("named job choices retain unique matching identities while malformed or duplicate matches require explicit review", () => {
  const data = { jobs: [job(), job({ siteAddress: "2 High Street" }), job({ id: "unique", siteAddress: "3 High Street" }), job({ id: " " })], purchases: [purchaseList({ id: "chosen", jobId: "unique" })] };
  const before = JSON.stringify(data), result = answer("Show materials to order for Workshop", data);
  assert.equal(result.title, "Choose a job"); assert.equal(result.items.length, 0); assert.deepEqual(Array.from(result.jobChoices, (choice) => choice.id), ["unique"]); assert.match(result.warnings.join(" "), /3 matching job records/);
  assert.equal(answerFor("Show materials to order for Workshop", data, "unique").items[0].id, "purchase:chosen"); assert.equal(JSON.stringify(data), before);
  for (const id of ["", " ", undefined]) { const unavailable = answer("Show job briefing for Workshop", { jobs: [job({ id })] }); assert.equal(unavailable.title, "Job identity needs review"); assert.equal(unavailable.items.length, 0); }
});

test("phone job scope excludes unusable identities and preserves exact opaque saved ids", () => {
  const id = " j /?# +&action=create ", data = records({ jobs: [job(), job({ title: "Duplicate" }), job({ id: " " }), job({ id, title: "Opaque job" })], purchases: [purchaseList({ jobId: id })] }), h = ui(data);
  const options = nodes(h.render()).filter((node) => node.type === "option"); assert.deepEqual(options.map((node) => node.props.value), ["", id]); assert.match(text(h.render()), /3 job record\(s\).*missing or duplicate/);
  h.scope(id); h.click("Materials to order"); assert.match(text(h.render()), /Only purchase lists explicitly linked to Opaque job/); assert.match(nodes(h.render()).find((node) => node.type === "select").props.className, /min-h-12/);
});

test("submitted job scope becomes unavailable on duplicate identity refresh and restores only the same unique record", () => {
  const data = records({ jobs: [job()], purchases: [purchaseList()] }), h = ui(data); h.scope("j1"); h.click("Materials to order");
  h.replaceRecords({ ...data, jobs: [job(), job({ title: "Conflicting copy" }), job({ id: "replacement" })] }); assert.match(text(h.render()), /Job identity needs review/); assert.equal(nodes(h.render()).filter((node) => node.type === "Link").length, 0);
  const selected = nodes(h.render()).find((node) => node.type === "select"); assert.equal(selected.props.value, "j1"); assert.match(text(selected), /Selected job unavailable or ambiguous/);
  h.replaceRecords({ ...data, jobs: [job({ id: "replacement" })] }); assert.match(text(h.render()), /Job unavailable/); h.replaceRecords(data); assert.match(text(h.render()), /1 line\(s\) marked Needed/);
});

test("an exact job briefing link cannot select an arbitrary duplicate record", () => {
  const h = ui(records({ jobs: [job(), job({ title: "Conflicting copy" })], tasks: [siteTask()] }), true, "?job=j1"); h.flush(); assert.match(text(h.render()), /Job identity needs review/); assert.equal(nodes(h.render()).filter((node) => node.type === "Link").length, 0); assert.equal(h.blurred(), 0);
});

test("duplicate purchase identities form one source review without inflating ordering or delivery counts", () => {
  const data = { jobs: [job()], purchases: [purchaseList(), purchaseList({ number: "PO-02", title: "Other copy", items: [purchaseLine({ description: "Conflicting sockets", status: "Ordered", quantity: 9 })] }), purchaseList({ id: "valid", number: "PO-03" })] }, before = JSON.stringify(data);
  const result = answer("Show materials to order", data); assert.match(result.summary, /1 line\(s\) marked Needed.*1 source identity review/); assert.equal(result.items.length, 2);
  const review = result.items.find((item) => item.actionLabel === "Review purchase identity"); assert.match(review.detail, /2 loaded records.*counts are withheld/); assert.match(review.evidence.join(" "), /Saved copy 1.*Cable.*Needed.*Saved copy 2.*Conflicting sockets.*Ordered/); assert.equal(review.href, "/purchases?list=p1"); assert.equal(new Set(result.items.map((item) => item.id)).size, 2);
  const delivery = answer("Show awaiting deliveries", data); assert.match(delivery.summary, /0 line\(s\) marked Ordered.*1 source identity review/); assert.equal(delivery.items.length, 1); assert.equal(JSON.stringify(data), before);
});

test("cross-job purchase collisions remain source reviews without broadening selected-job evidence", () => {
  const data = { jobs: [job(), job({ id: "other", title: "Other site" })], purchases: [purchaseList({ items: [purchaseLine({ status: "Delivered" })] }), purchaseList({ jobId: "other", title: "Other site order", items: [purchaseLine({ description: "Other site cable", status: "Needed" })] })] };
  const result = answerFor("Show materials to order", data, "j1"); assert.equal(result.items.length, 1); assert.match(result.summary, /0 line\(s\) marked Needed.*1 source identity review/); assert.match(result.items[0].detail, /2 loaded records/); assert.match(result.items[0].evidence.join(" "), /Workshop.*Delivered/); assert.doesNotMatch(result.items[0].evidence.join(" "), /Other site/);
  const delivered = answer("Show materials to order", { ...data, purchases: data.purchases.map((list) => ({ ...list, items: list.items.map((line) => ({ ...line, status: "Delivered" })) })) }); assert.equal(delivered.items.length, 0);
});

test("conflicting line copies are reviewed together and withheld while unique lines keep their recorded counts", () => {
  const data = { purchases: [purchaseList({ items: [purchaseLine(), purchaseLine({ description: "Delivered copy", status: "Delivered" }), purchaseLine({ id: "valid", description: "Unique cable" }), purchaseLine({ id: "uncertain", status: "Dispatched" }), purchaseLine({ id: "ordered", status: "Ordered" })] })] };
  const result = answer("Show materials to order", data); assert.match(result.summary, /1 line\(s\) marked Needed.*1 uncertain line.*1 source identity review/); assert.match(result.items[0].evidence.join(" "), /identity ambiguous; count withheld.*Delivered copy.*Delivered.*Unique cable/); assert.match(result.warnings.join(" "), /Ambiguous lines are excluded/);
  const deliveries = answer("Show awaiting deliveries", data); assert.match(deliveries.summary, /1 line\(s\) marked Ordered.*1 uncertain/); assert.doesNotMatch(deliveries.items[0].evidence.join(" "), /Delivered copy/);
  const independent = answer("Show materials to order", { purchases: [purchaseList(), purchaseList({ id: "other" })] }); assert.match(independent.summary, /2 line\(s\) marked Needed/); assert.doesNotMatch(independent.warnings.join(" "), /identity/);
});

test("missing and unsupported purchase identities retain evidence with explicit inbox review rather than an exact-record claim", () => {
  const purchases = ["", " ", undefined, null, 123, "x".repeat(301)].map((id, index) => purchaseList({ id, number: `PO-${index}` }));
  const result = answer("Show materials to order", { purchases }); assert.match(result.summary, /0 line\(s\) marked Needed.*6 source identity review/); assert.equal(result.items.length, 6); assert.equal(new Set(result.items.map((item) => item.id)).size, 6);
  for (const item of result.items) { assert.equal(item.actionLabel, "Review purchase inbox"); assert.equal(item.href, "/purchases"); assert.match(item.evidence.join(" "), /Cable.*Quantity: 12.5.*CEF.*CABLE-10/); assert.doesNotMatch(item.evidence.join(" "), /unitCost|£/); }
  const id = " p /?# +&action=create ", opaque = answer("Show materials to order", { purchases: [purchaseList({ id })] }); assert.match(opaque.summary, /1 line\(s\) marked Needed/); assert.equal(purchaseLink.purchaseListFromLink(new URL(opaque.items[0].href, "https://jr.example").search).listId, id);
});

test("missing line identities and descriptions remain reviewable and cannot inflate status counts", () => {
  const result = answer("Show materials to order", { purchases: [purchaseList({ items: ["", " ", undefined].map((id) => purchaseLine({ id, description: " ", quantity: 0, supplier: " ", stockCode: " " })) })] });
  assert.match(result.summary, /0 line\(s\) marked Needed.*3 source identity review/); assert.match(result.warnings.join(" "), /3 outstanding line.*invalid quantity.*3 outstanding line.*no recorded description.*3 line identity review/);
  assert.match(result.items[0].evidence.join(" "), /Description not recorded.*identity missing.*Quantity needs review.*Supplier: Not recorded.*Stock code: Not recorded/);
});

test("empty saved purchase lists are explicit reviews in both modes and remain different from unloaded or empty collections", () => {
  for (const query of ["Show materials to order", "Show awaiting deliveries"]) {
    const result = answer(query, { purchases: [purchaseList({ items: [] })] }); assert.equal(result.items.length, 1); assert.match(result.summary, /1 empty list/); assert.match(result.items[0].detail, /empty list does not confirm/); assert.match(result.warnings.join(" "), /requirements are covered/);
    assert.match(answer(query, { purchases: undefined }).summary, /not ready/); assert.equal(answer(query, { purchases: [] }).items.length, 0);
  }
});

test("global material evidence never substitutes the last duplicate job and ignores closed delivery-only source warnings", () => {
  const data = { jobs: [job(), job({ title: "Wrong job name" }), job({ id: "valid", title: "Unique site" })], purchases: [purchaseList(), purchaseList({ id: "orphan", jobId: "missing" }), purchaseList({ id: "valid", jobId: "valid" }), purchaseList({ id: "unlinked", jobId: undefined }), purchaseList({ id: "done", jobId: "gone", items: [purchaseLine({ status: "Delivered" })] })] };
  const result = answer("Show materials to order", data); assert.equal(result.items.length, 4); assert.match(result.items.find((item) => item.id === "purchase:p1").evidence[0], /Linked job identity ambiguous/); assert.doesNotMatch(result.items[0].evidence[0], /Wrong job name|Workshop/); assert.match(result.warnings.join(" "), /2 reviewed purchase records?\(s\).*unavailable or ambiguous/);
  assert.match(result.items.find((item) => item.id === "purchase:valid").evidence[0], /Unique site/);
});

test("phone source reviews retain four-card reveal and 48px evidence and clear controls without changing records", () => {
  const data = records({ purchases: Array.from({ length: 6 }, (_, index) => purchaseList({ id: `p${index}`, number: `PO-${index}`, items: index === 0 ? [] : [purchaseLine()] })) }), before = JSON.stringify(data), h = ui(data); h.click("Materials to order");
  assert.equal(nodes(h.render()).filter((node) => node.type === "Link").length, 4); h.click("Show more records"); assert.equal(nodes(h.render()).filter((node) => node.type === "Link").length, 6);
  for (const summary of nodes(h.render()).filter((node) => node.type === "summary")) assert.match(summary.props.className, /min-h-12/); assert.match(nodes(h.render()).find((node) => node.type === "button" && text(node) === "Clear answer").props.className, /min-h-12/);
  h.click("Clear answer"); assert.equal(nodes(h.render()).some((node) => node.props["aria-label"] === "JR AI answer"), false); assert.equal(JSON.stringify(data), before);
});

test("corrected purchase and line identities restore counts on refresh without re-asking or selecting another job", () => {
  const data = records({ jobs: [job()], purchases: [purchaseList(), purchaseList({ number: "PO-02", items: [purchaseLine({ description: "Second record" })] })] }), h = ui(data); h.scope("j1"); h.click("Materials to order"); assert.match(text(h.render()), /0 line\(s\) marked Needed.*1 source identity review/);
  h.replaceRecords({ ...data, purchases: [data.purchases[0], { ...data.purchases[1], id: "p2" }] }); assert.match(text(h.render()), /2 line\(s\) marked Needed/);
  h.replaceRecords({ ...data, purchases: [purchaseList({ items: [purchaseLine(), purchaseLine({ description: "Conflicting line" })] })] }); assert.match(text(h.render()), /0 line\(s\) marked Needed.*1 source identity review/);
  h.replaceRecords({ ...data, purchases: [purchaseList({ items: [purchaseLine(), purchaseLine({ id: "fixed", description: "Conflicting line" })] })] }); assert.match(text(h.render()), /2 line\(s\) marked Needed/); assert.equal(nodes(h.render()).find((node) => node.type === "select").props.value, "j1");
});

test("explicit conversational follow-ups recognize supported job topics without widening the normal parser", () => {
  for (const [query, intent] of [["What about tasks?", "tasks"], ["And the open snags!", "snags"], ["Please what about materials?", "materials"], ["And deliveries for the same job", "deliveries"], ["What about the next visit?", "visits"], ["And job briefing", "job"], ["Show tasks for this job", "tasks"], ["Can you show awaiting deliveries for that job?", "deliveries"], ["Which materials need ordering for this job?", "materials"], ["Show next visit checks for the same job", "visits"]]) {
    assert.equal(questions.assistantJobFollowUpIntent(query), intent, query); assert.equal(questions.assistantQuestionIntent(query), null, query);
  }
});

test("follow-up parsing does not accept commands, mixed topics, vague money questions or partial words", () => {
  for (const query of ["Order materials for this job", "Delete tasks for this job", "Don't show tasks for this job", "What about materials and deliveries?", "What about materials for everyone?", "What about money?", "What about materialstuff", "What about tasks tomorrow?", "What about tasks" + "x".repeat(180)]) {
    assert.equal(questions.assistantJobFollowUpIntent(query), null, query); assert.equal(answer(query).recognized, false, query); assert.equal(answer(query).items.length, 0);
  }
});

test("unscoped follow-ups require a unique job choice even when only one job is available", () => {
  const data = records({ jobs: [job(), job({ id: "duplicate", title: "A" }), job({ id: "duplicate", title: "B" }), job({ id: "" })], tasks: [siteTask()] });
  const result = answer("What about tasks?", data); assert.equal(result.title, "Choose a job"); assert.match(result.summary, /Choose one loaded job/); assert.equal(result.items.length, 0); assert.deepEqual(Array.from(result.jobChoices, j => j.id), ["j1"]); assert.match(result.scope, /not guessed.*all jobs/);
  const empty = answer("What about tasks?"); assert.equal(empty.items.length, 0); assert.equal(empty.jobChoices.length, 0); assert.match(empty.summary, /No uniquely identified job/);
});

test("all follow-up topics remain on the exact selected job and reject removed or duplicate identities", () => {
  const data = records({ jobs: [job(), job({ id: "other", title: "Other job" })], tasks: [siteTask(), siteTask({ id: "other-task", jobId: "other" })], purchases: [purchaseList(), purchaseList({ id: "other-purchase", jobId: "other" })] }); const before = JSON.stringify(data);
  for (const query of ["What about tasks?", "And snags", "And materials", "And deliveries", "And next visit", "And job briefing"]) {
    const result = answerFor(query, data, "j1"); assert.equal(result.resolvedJobId, "j1", query); assert.doesNotMatch(JSON.stringify(result.items), /other-task|other-purchase/);
    const missing = answerFor(query, data, "removed"); assert.equal(missing.items.length, 0); assert.equal(missing.resolvedJobId, undefined); assert.equal(missing.jobChoices.length, 0);
    const duplicate = answerFor(query, { ...data, jobs: [...data.jobs, job({ title: "Conflicting copy" })] }, "j1"); assert.equal(duplicate.title, "Job identity needs review"); assert.equal(duplicate.items.length, 0);
  }
  assert.equal(JSON.stringify(data), before);
});

test("quoted literal job names remain literal while this-job phrases need explicit saved scope", () => {
  const data = { jobs: [job({ title: "This job" }), job({ id: "other", title: "Elsewhere" })], tasks: [siteTask()] };
  assert.equal(answer('Show tasks for "This job"', data).resolvedJobId, "j1");
  assert.equal(answer("Show tasks for this job", data).resolvedJobId, undefined);
  assert.equal(answerFor("Show tasks for this job", data, "other").resolvedJobId, "other");
});

test("a named answer updates phone job scope so the next shortcut and typed follow-up stay on that identity", () => {
  const data = records({ jobs: [job(), job({ id: "other", title: "Kitchen" })], tasks: [siteTask()], purchases: [purchaseList(), purchaseList({ id: "other-purchase", jobId: "other", title: "Other materials" })] }); const h = ui(data);
  h.scope("other"); h.fill("Show tasks for Workshop"); h.submit(); assert.equal(nodes(h.render()).find(n => n.type === "select").props.value, "j1");
  h.click("Materials to order"); assert.match(text(h.render()), /Only purchase lists explicitly linked to Workshop/); assert.doesNotMatch(text(h.render()), /Other materials/);
  h.fill("What about deliveries?"); h.submit(); assert.match(text(h.render()), /Awaiting deliveries · Workshop/); assert.equal(nodes(h.render()).find(n => n.type === "select").props.value, "j1");
});

test("related-answer buttons keep exact job scope, use 48px targets and reset progressive reveal", () => {
  const data = records({ jobs: [job()], tasks: Array.from({ length: 7 }, (_, i) => siteTask({ id: `follow-task-${i}` })), purchases: [purchaseList()] }); const h = ui(data);
  h.fill("Job briefing for Workshop"); h.submit(); const group = nodes(h.render()).find(n => n.props["aria-label"] === "Follow up on this job"); assert.match(text(group), /Continue with Workshop/);
  const buttons = nodes(group).filter(n => n.type === "button"); assert.equal(buttons.length, 6); for (const button of buttons) assert.match(button.props.className, /min-h-12/);
  h.click("Job tasks"); assert.match(text(h.render()), /7 open items/); assert.equal(nodes(h.render()).filter(n => n.type === "Link").length, 4); h.click("Show more records"); assert.equal(nodes(h.render()).filter(n => n.type === "Link").length, 7);
  h.click("Job materials"); assert.match(text(h.render()), /Materials to order · Workshop/); h.click("Job tasks"); assert.equal(nodes(h.render()).filter(n => n.type === "Link").length, 4);
  h.click("Job snags"); assert.match(text(h.render()), /Open snags · Workshop/); h.click("Next work visit"); assert.match(text(h.render()), /Next work visit checks · Workshop/); h.click("Job summary"); assert.match(text(h.render()), /Job briefing · Workshop/);
});

test("follow-up without a chosen job offers progressive choices and answers only after explicit selection", () => {
  const jobs = Array.from({ length: 7 }, (_, i) => job({ id: `follow-job-${i}`, title: `Job ${i}` })); const data = records({ jobs, tasks: jobs.map(j => siteTask({ id: `task-${j.id}`, jobId: j.id })) }); const h = ui(data);
  h.fill("What about tasks?"); h.submit(); assert.match(text(h.render()), /Choose one loaded job before/); assert.equal(nodes(h.render()).filter(n => n.type === "button" && text(n) === "Use this job").length, 4);
  assert.ok(!nodes(h.render()).some(n => n.props["aria-label"] === "Follow up on this job")); h.click("Show more jobs"); h.choose(5); assert.match(text(h.render()), /Only Job 5/); assert.equal(nodes(h.render()).find(n => n.type === "select").props.value, "follow-job-5");
  assert.equal(nodes(h.render()).filter(n => n.type === "Link").length, 1);
});

test("follow-up state stays unavailable when a job disappears, even if another job reuses its name", () => {
  const data = records({ jobs: [job()], tasks: [siteTask()] }); const h = ui(data); h.fill("Show tasks for Workshop"); h.submit(); h.fill("And tasks"); h.submit();
  h.replaceRecords({ ...data, jobs: [job({ id: "replacement" })], tasks: [siteTask({ jobId: "replacement" })] }); assert.match(text(h.render()), /selected job is no longer available/); assert.equal(nodes(h.render()).filter(n => n.type === "Link").length, 0); assert.ok(!nodes(h.render()).some(n => n.props["aria-label"] === "Follow up on this job"));
  h.replaceRecords(data); assert.match(text(h.render()), /Only Workshop/); assert.equal(nodes(h.render()).filter(n => n.type === "Link").length, 1);
});

test("retained follow-up buttons cannot restore an answer after clear, input or scope changes", () => {
  for (const action of [h => h.click("Clear answer"), h => h.fill("Something new"), h => h.scope("other"), h => h.click("Tomorrow")]) {
    const h = ui(records({ jobs: [job(), job({ id: "other", title: "Other" })], tasks: [siteTask()] })); h.scope("j1"); h.click("Open tasks"); const stale = nodes(h.render()).find(n => n.type === "button" && text(n) === "Job materials").props.onClick;
    action(h); const before = text(h.render()); stale(); assert.equal(text(h.render()), before);
  }
});

test("a follow-up callback captured before a source refresh cannot substitute an unavailable job", () => {
  const data = records({ jobs: [job()], tasks: [siteTask()], purchases: [purchaseList()] }); const h = ui(data); h.scope("j1"); h.click("Open tasks"); const stale = nodes(h.render()).find(n => n.type === "button" && text(n) === "Job materials").props.onClick;
  h.replaceRecords({ ...data, jobs: [job({ id: "replacement" })], purchases: [purchaseList({ jobId: "replacement" })] }); stale(); assert.match(text(h.render()), /selected job is no longer available/); assert.ok(!nodes(h.render()).some(n => n.type === "Link" && n.props.href.startsWith("/purchases")));
});

test("unresolved named questions clear the previous job context instead of reusing it for a follow-up", () => {
  const data = records({ jobs: [job(), job({ id: "a", title: "Shared" }), job({ id: "b", title: "Shared" })], tasks: [siteTask()] });
  for (const name of ["Shared", "No matching job"]) {
    const h = ui(data); h.scope("j1"); h.click("Open tasks"); h.fill(`Show tasks for ${name}`); h.submit(); assert.equal(nodes(h.render()).find(n => n.type === "select").props.value, ""); h.fill("What about materials?"); h.submit(); assert.match(text(h.render()), /Choose one loaded job before/); assert.ok(!nodes(h.render()).some(n => n.type === "Link" && n.props.href.startsWith("/purchases")));
  }
});

test("clear or All loaded jobs removes follow-up context, while normal shortcuts retain their documented scope", () => {
  const data = records({ jobs: [job()], tasks: [siteTask()], invoices: [invoice()] }); const h = ui(data); h.fill("Show tasks for Workshop"); h.submit(); h.click("Overdue money"); assert.match(text(h.render()), /£240\.00/); assert.ok(!nodes(h.render()).some(n => n.props["aria-label"] === "Follow up on this job"));
  h.fill("And tasks"); h.submit(); assert.match(text(h.render()), /Only Workshop/); h.scope(""); h.fill("And tasks"); h.submit(); assert.match(text(h.render()), /Choose one loaded job before/); h.choose(); h.click("Clear answer"); h.fill("And tasks"); h.submit(); assert.match(text(h.render()), /Choose one loaded job before/);
  const fresh = ui(data); fresh.fill("And tasks"); fresh.submit(); assert.match(text(fresh.render()), /Choose one loaded job before/);
});

test("follow-ups retain office task destinations and do not mutate sources or restore stale choices", () => {
  const data = records({ jobs: [job()], tasks: [siteTask()] }); const before = JSON.stringify(data), h = ui(data, false); h.fill("And tasks"); h.submit(); const oldChoice = nodes(h.render()).find(n => n.type === "button" && text(n) === "Use this job").props.onClick; h.choose();
  assert.equal(nodes(h.render()).find(n => n.type === "Link").props.href, "/jobs/j1"); h.click("Job tasks"); assert.match(text(h.render()), /owner or admin/); h.click("Clear answer"); oldChoice(); assert.ok(!nodes(h.render()).some(n => n.props["aria-label"] === "JR AI answer")); assert.equal(JSON.stringify(data), before);
});

test("user input before a deferred job-link frame wins over the initial linked briefing", () => {
  for (const action of [h => h.fill("What about materials?"), h => h.scope("other"), h => h.click("Tomorrow")]) {
    const h = ui(records({ jobs: [job(), job({ id: "other", title: "Other" })] }), true, "?job=j1"); h.render(); action(h); const before = text(h.render()); h.flush(); assert.equal(text(h.render()), before); assert.doesNotMatch(text(h.render()), /Job briefing · Workshop/);
  }
});

test("the compact question form comes before job scope and shortcut groups without keyboard autofocus", () => {
  const tree = ui().render(), all = nodes(tree), form = all.find(n => n.type === "form"), select = all.find(n => n.type === "select"), input = all.find(n => n.type === "input"), quick = all.find(n => n.props["aria-label"] === "Quick questions");
  assert.ok(all.indexOf(form) < all.indexOf(select)); assert.ok(all.indexOf(form) < all.indexOf(quick)); assert.equal(input.props.autoFocus, undefined); assert.match(input.props.className, /min-h-12/); assert.match(input.props.className, /text-base/);
});

test("four primary questions and eight secondary questions retain every shortcut exactly once", () => {
  const all = nodes(ui().render()), primary = all.find(n => n.props["aria-label"] === "Quick questions"), more = all.find(n => n.props["aria-label"] === "More quick questions");
  assert.deepEqual(nodes(primary).filter(n => n.type === "button").map(text), ["Today", "Tomorrow", "Job briefing", "Materials to order"]);
  const secondary = nodes(more).filter(n => n.type === "button"); assert.equal(secondary.length, 8); const labels = [...nodes(primary).filter(n => n.type === "button"), ...secondary].map(text); assert.equal(new Set(labels).size, 12);
  for (const n of [...nodes(primary).filter(n => n.type === "button"), ...secondary]) assert.match(n.props.className, /min-h-12/);
  const disclosure = all.find(n => n.type === "details" && text(n).startsWith("More questions")); assert.ok(disclosure); assert.equal(disclosure.props.open, undefined); assert.equal(disclosure.props.onToggle, undefined); assert.match(text(disclosure), /^More questions \(8\)/);
});

test("scope help is a 48px native disclosure while identity warnings stay outside collapsed content", () => {
  const tree = ui(records({ jobs: [job(), job()] })).render(), all = nodes(tree), help = all.find(n => n.type === "details" && text(n).startsWith("How job scope works"));
  assert.ok(help); assert.equal(help.props.open, undefined); assert.match(nodes(help).find(n => n.type === "summary").props.className, /min-h-12/); assert.match(text(help), /Other|normal scope/);
  const warning = all.find(n => n.props.role === "status" && text(n).includes("duplicate identities")); assert.ok(warning); assert.ok(!all.filter(n => n.type === "details").some(n => nodes(n).includes(warning)));
});

test("secondary question handlers preserve job scope and global answers after the layout change", () => {
  const h = ui(records({ jobs: [job()], tasks: [siteTask()], invoices: [invoice()] })); h.scope("j1");
  const clickMore = label => { const group = nodes(h.render()).find(n => n.props["aria-label"] === "More quick questions"), button = nodes(group).find(n => n.type === "button" && text(n) === label); assert.ok(button); button.props.onClick(); };
  clickMore("Open tasks"); assert.match(text(h.render()), /Only Workshop/); clickMore("Overdue money"); assert.match(text(h.render()), /£240\.00 across 1 invoice/); assert.ok(!nodes(h.render()).some(n => n.props["aria-label"] === "Follow up on this job"));
  clickMore("Awaiting deliveries"); assert.match(text(h.render()), /Awaiting deliveries · Workshop/); assert.equal(nodes(h.render()).find(n => n.type === "select").props.value, "j1");
});

test("explicit finance follow-ups require a chosen job and keep vague or compound requests unsupported", () => {
  for (const [query, intent] of [["What about unpaid invoices?", "unpaid"], ["And overdue invoices", "overdue"], ["How much is overdue for this job?", "overdue"], ["How much am I owed for the same job?", "unpaid"], ["What about quotes?", "quotes"], ["And quote follow-ups for that job", "quotes"]]) {
    assert.equal(questions.assistantJobFollowUpIntent(query), intent, query);
    const result = answer(query, { jobs: [job()], invoices: [invoice({ jobId: "j1" })] });
    assert.equal(result.title, "Choose a job"); assert.equal(result.items.length, 0); assert.equal(result.resolvedJobId, undefined);
  }
  for (const query of ["Send unpaid invoices for this job", "Mark invoices paid for this job", "What about unpaid invoices and quotes?", "Show paid invoices for this job", "Show unpaid invoices next month for this job"]) {
    assert.equal(answerFor(query, { jobs: [job()] }, "j1").recognized, false, query);
  }
  assert.equal(answer("How much is overdue for Smith?", { jobs: [job()], invoices: [invoice()] }).title, "Job unavailable");
});

test("named job money answers use explicit links and recorded payments without including same-customer invoices", () => {
  const data = records({ jobs: [job({ status: "Complete", customerId: "c1" }), job({ id: "other", title: "Other site", customerId: "c1" })],
    invoices: [invoice({ jobId: "j1", customerId: "c1" }), invoice({ id: "today", jobId: "j1", dueDate: "2026-10-10" }), invoice({ id: "other", jobId: "other", title: "Other invoice", customerId: "c1" }), invoice({ id: "unlinked", title: "Unlinked invoice", customerId: "c1" })],
    payments: [{ id: "p1", invoiceId: "i1", type: "Payment", amount: 100 }] });
  const before = JSON.stringify(data);
  const unpaid = answer("Show unpaid invoices for workshop", data);
  assert.equal(unpaid.resolvedJobId, "j1"); assert.match(unpaid.summary, /£380\.00 across 2 invoices/);
  assert.match(unpaid.scope, /Only invoices explicitly linked to Workshop.*Job status: Complete.*Unlinked invoices and customer-name matches are not included/);
  assert.doesNotMatch(JSON.stringify(unpaid), /Other invoice|Unlinked invoice"/);
  const overdue = answer('How much is overdue at "1 High Street"?', { ...data, jobs: [data.jobs[0]] });
  assert.match(overdue.summary, /£140\.00 across 1 invoice/); assert.equal(overdue.items[0].href, "/invoices?invoice=i1");
  assert.match(answerFor("What about unpaid invoices?", data, "j1").summary, /£380\.00/);
  assert.match(answerFor("How much am I owed?", data, "j1").summary, /£860\.00 across 4 invoices/, "ordinary money queries retain the global scope");
  assert.equal(JSON.stringify(data), before);
});

test("job finance validates all invoice and payment identities before filtering evidence to one job", () => {
  const data = records({ jobs: [job(), job({ id: "other", title: "Other site" })], invoices: [invoice({ jobId: "j1" }), invoice({ jobId: "other", title: "Private other copy", status: "Paid" }), invoice({ id: "valid", jobId: "j1" })] });
  const conflict = answerFor("Show unpaid invoices for this job", data, "j1");
  assert.match(conflict.summary, /Verified subtotal: £240\.00.*incomplete/); assert.match(conflict.warnings.join(" "), /invoice identity review/);
  assert.doesNotMatch(JSON.stringify(conflict), /Private other copy|Other site/);
  const paymentsConflict = answerFor("Show overdue invoices for this job", { ...data, invoices: [data.invoices[0]], payments: [{ id: "p1", invoiceId: "i1", type: "Payment", amount: 100 }, { id: "p1", invoiceId: "outside", type: "Payment", amount: 900 }] }, "j1");
  assert.match(paymentsConflict.summary, /Verified subtotal: £0\.00.*incomplete/); assert.match(paymentsConflict.warnings.join(" "), /uncertain linked payment evidence/);
  assert.equal(paymentsConflict.items[0].href, "/payments"); assert.doesNotMatch(JSON.stringify(paymentsConflict), /£900|outside/);
});

test("job quote follow-ups use saved quote and job-side links while retaining agreements and identity reviews", () => {
  const quote = { id: "q1", type: "Quote", number: "Q-1", title: "Workshop quote", status: "Sent", updatedAt: "2026-10-01T12:00:00Z", validUntil: "2026-11-01" };
  const data = records({ jobs: [job({ sourceQuoteId: "q1" }), job({ id: "other", title: "Elsewhere", siteAddress: "2 High Street" })], documents: [quote,
    { ...quote, id: "direct", jobId: "j1", number: "Q-2" }, { ...quote, id: "agreed", jobId: "j1", number: "Q-3", validUntil: "2026-10-08", nextFollowUpDate: "2026-10-12" },
    { ...quote, id: "other", jobId: "other", title: "Other quote" }, { ...quote, id: "unlinked", title: "Same customer without job link", customerId: "c1" }] });
  const result = answer("Which quotes need chasing for Workshop?", data);
  assert.equal(result.resolvedJobId, "j1"); assert.match(result.summary, /2 confirmed follow-ups/);
  assert.deepEqual(Array.from(result.items, i => i.id).sort(), ["follow-up:direct", "follow-up:q1"]);
  assert.doesNotMatch(JSON.stringify(result), /Other quote|Same customer without job link|Q-3/);
  assert.match(result.scope, /Only quotes linked by a saved quote or job reference to Workshop/);
  const conflict = answerFor("And quote follow-ups", { ...data, documents: [...data.documents, { ...quote, type: "Estimate", jobId: "other", title: "Other conflicting copy" }] }, "j1");
  assert.match(conflict.summary, /1 confirmed follow-up.*1 quote source review.*incomplete/);
  assert.doesNotMatch(JSON.stringify(conflict), /Other conflicting copy|Other quote/);
});

test("job finance cannot choose duplicate identities or substitute partial names and reused titles", () => {
  for (const query of ["Show unpaid invoices", "Show overdue invoices", "Which quotes need chasing"]) {
    const ambiguous = answer(`${query} for Workshop`, { jobs: [job(), job({ id: "other", siteAddress: "2 High Street" })] });
    assert.equal(ambiguous.title, "Choose a job"); assert.equal(ambiguous.items.length, 0); assert.equal(ambiguous.jobChoices.length, 2);
    const duplicate = answer(`${query} for Workshop`, { jobs: [job(), job({ title: "Different name" })] });
    assert.equal(duplicate.title, "Job identity needs review"); assert.equal(duplicate.items.length, 0);
    assert.equal(answer(`${query} for Work`, { jobs: [job()] }).title, "Job unavailable");
    assert.equal(answerFor(`${query} for this job`, { jobs: [job({ id: "replacement" })], invoices: [invoice({ jobId: "replacement" })] }, "j1").title, "Job unavailable");
  }
});

test("phone job finance controls stay compact and preserve exact scope through refreshes and global shortcuts", () => {
  const data = records({ jobs: [job(), job({ id: "other", title: "Kitchen" })], invoices: Array.from({ length: 7 }, (_, i) => invoice({ id: `i${i}`, jobId: "j1" })).concat([invoice({ id: "elsewhere", jobId: "other", title: "Elsewhere invoice" })]) });
  const h = ui(data); h.scope("other"); h.fill("Show unpaid invoices for Workshop"); h.submit();
  assert.equal(nodes(h.render()).find(n => n.type === "select").props.value, "j1"); assert.match(text(h.render()), /£1,680\.00 across 7 invoices/);
  const disclosure = nodes(h.render()).find(n => n.type === "details" && text(n).startsWith("Invoice & quote questions for this job"));
  assert.ok(disclosure); assert.equal(disclosure.props.open, undefined); assert.match(nodes(disclosure).find(n => n.type === "summary").props.className, /min-h-12/);
  assert.equal(nodes(disclosure).filter(n => n.type === "button").length, 3); for (const b of nodes(disclosure).filter(n => n.type === "button")) assert.match(b.props.className, /min-h-12/);
  h.click("Show more records"); assert.equal(nodes(h.render()).filter(n => n.type === "Link").length, 7);
  h.click("Job overdue invoices"); assert.equal(nodes(h.render()).filter(n => n.type === "Link").length, 4); assert.match(text(h.render()), /Overdue invoices · Workshop/);
  h.replaceRecords({ ...data, payments: [{ id: "payment", invoiceId: "i0", type: "Payment", amount: 240 }] }); assert.match(text(h.render()), /£1,440\.00 across 6 invoices/);
  h.click("Overdue money"); assert.match(text(h.render()), /£1,680\.00 across 7 invoices/); assert.ok(!nodes(h.render()).some(n => n.props["aria-label"] === "Finance follow-ups for this job"));
  h.fill("What about unpaid invoices?"); h.submit(); assert.match(text(h.render()), /Unpaid invoices · Workshop/);
  h.click("Job quote follow-ups"); assert.match(text(h.render()), /Quote follow-ups due · Workshop/); assert.match(text(h.render()), /0 confirmed follow-ups/);
  h.replaceRecords({ ...data, jobs: [job({ id: "replacement" }), data.jobs[1]] }); assert.match(text(h.render()), /selected job is no longer available/);
  assert.ok(!nodes(h.render()).some(n => n.type === "Link"));
});

test("finance follow-up choices, opaque job IDs, clearing and stale callbacks keep the record boundary", () => {
  const id = " j /?# +&action=create "; const data = records({ jobs: [job({ id })], invoices: [invoice({ jobId: id })] }), before = JSON.stringify(data), h = ui(data);
  h.fill("How much am I owed for this job?"); h.submit(); assert.match(text(h.render()), /Choose one loaded job before/); h.choose(); assert.equal(nodes(h.render()).find(n => n.type === "select").props.value, id);
  h.click("Job unpaid invoices"); assert.match(text(h.render()), /£240\.00/);
  const stale = nodes(h.render()).find(n => n.type === "button" && text(n) === "Job overdue invoices").props.onClick;
  h.click("Clear answer"); stale(); assert.ok(!nodes(h.render()).some(n => n.props["aria-label"] === "JR AI answer"));
  h.fill("What about quotes?"); h.submit(); assert.match(text(h.render()), /Choose one loaded job before/);
  assert.equal(JSON.stringify(data), before);
});
