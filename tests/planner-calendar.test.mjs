import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as scheduling from "../lib/scheduling.ts";
import * as jobCore from "../lib/jobManagement-core.mjs";

test("calendar weeks crossing a month or year contain exactly Monday through Sunday", () => {
  for (const [anchor, first, last, before, after, distant] of [
    ["2026-11-01", "2026-10-26", "2026-11-01", "2026-10-25", "2026-11-02", "2026-11-20"],
    ["2026-01-01", "2025-12-29", "2026-01-04", "2025-12-28", "2026-01-05", "2026-01-20"],
    ["2026-03-01", "2026-02-23", "2026-03-01", "2026-02-22", "2026-03-02", "2026-03-20"],
  ]) {
    for (const date of [first, last]) assert.equal(scheduling.dateWithinView(date, anchor, "week"), true, `${anchor}: ${date}`);
    for (const date of [before, after, distant]) assert.equal(scheduling.dateWithinView(date, anchor, "week"), false, `${anchor}: ${date}`);
    assert.equal(scheduling.dateWithinView(before, anchor, "week", after), true);
  }
});

test("date-only navigation clamps short months and handles leap days and year changes", () => {
  for (const [date, amount, view, expected] of [
    ["2026-01-31", 1, "month", "2026-02-28"], ["2028-01-31", 1, "month", "2028-02-29"], ["2026-03-31", -1, "month", "2026-02-28"],
    ["2026-12-31", 1, "day", "2027-01-01"], ["2026-01-01", -1, "day", "2025-12-31"], ["2026-03-28", 1, "week", "2026-04-04"],
  ]) assert.equal(scheduling.shiftPlannerDate(date, amount, view), expected);
  for (const [date, amount] of [["2026-02-30", 1], ["", 1], ["9999-12-31", 1], ["2026-10-10", Infinity], ["2026-10-10", 1.5]]) assert.equal(scheduling.shiftPlannerDate(date, amount), null);
});

test("monthly repeats stay anchored to the original day without skipping February", () => {
  assert.deepEqual(scheduling.recurringDates("2026-01-31", "Monthly", 4), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  assert.deepEqual(scheduling.recurringDates("2028-01-31", "Monthly", 3), ["2028-01-31", "2028-02-29", "2028-03-31"]);
  assert.deepEqual(scheduling.recurringDates("2026-03-22", "Weekly", 3), ["2026-03-22", "2026-03-29", "2026-04-05"]);
  assert.deepEqual(scheduling.recurringDates("2026-01-31", "None", 24), ["2026-01-31"]);
  assert.deepEqual(scheduling.recurringDates("2026-02-30", "Monthly", 3), []);
  assert.deepEqual(scheduling.recurringDates("9999-12-31", "Weekly", 2), []);
  assert.equal(scheduling.recurringDates("2026-01-01", "Weekly", 100).length, 24);
});

test("calendar math is timezone independent while Today follows the phone's local date", () => {
  const url = new URL("../lib/scheduling.ts", import.meta.url).href;
  const script = `import {plannerDateKey, shiftPlannerDate, recurringDates, dateWithinView} from ${JSON.stringify(url)}; console.log(JSON.stringify({today:plannerDateKey(new Date('2026-07-01T23:30:00Z')), shift:shiftPlannerDate('2026-10-24',2), monthly:recurringDates('2026-01-31','Monthly',3), outside:dateWithinView('2026-11-20','2026-11-01','week')}));`;
  for (const [zone, today] of [["Europe/London", "2026-07-02"], ["America/Los_Angeles", "2026-07-01"], ["Pacific/Kiritimati", "2026-07-02"], ["UTC", "2026-07-01"]]) {
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", env: { ...process.env, TZ: zone } });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), { today, shift: "2026-10-26", monthly: ["2026-01-31", "2026-02-28", "2026-03-31"], outside: false });
  }
});

const jsx = (type, props, key) => ({ type, props, key });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);
const entry = (patch = {}) => ({ id: "e1", title: "Site visit", type: "Job", date: "2026-01-31", endDate: "2026-02-01", startTime: "09:00", endTime: "12:00", teamMemberIds: [], location: "", status: "Planned", ...patch });
const job = (patch = {}) => ({ id: "j1", title: "Workshop", status: "Scheduled", siteAddress: "Site", notes: "Saved job notes", updatedAt: "2026-01-01T10:00:00Z", ...patch });
function harness({ search = "?date=2026-01-31", entries: initial = [], jobs: initialJobs = [], failEntries = 0, failJobs = 0, failCreateAt = [], ready: initialReady = true, now: initialNow = "2026-10-10T10:00:00" } = {}) {
  const state = [], effects = [];
  let cursor = 0, entries = initial, jobs = initialJobs, writes = 0, ids = 0, ready = initialReady;
  let now = initialNow, tick;
  const listeners = new Map();
  class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  const attempts = [];
  const creations = [];
  function createItem(item) {
    if (!ready) throw new Error("Scheduling records are not ready");
    if (entries.some((record) => record.id === item.id)) throw new Error("A collection record with this id already exists");
    writes++; creations.push(item);
    if (failCreateAt.includes(creations.length)) throw new Error("visit storage failed");
    entries = [item, ...entries];
    return item;
  }
  function updateItem(kind, id, update) {
    if (!ready) throw new Error("Scheduling records are not ready");
    const records = kind === "visit" ? entries : jobs;
    const index = records.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`${kind} record is no longer available`);
    const item = update(records[index]);
    if (item === records[index]) return item;
    writes++; attempts.push({ kind, item });
    if ((kind === "visit" && failEntries-- > 0) || (kind === "job" && failJobs-- > 0)) throw new Error(`${kind} storage failed`);
    const next = records.map((record, i) => i === index ? item : record);
    if (kind === "visit") entries = next; else jobs = next;
    return item;
  }
  const useState = (initial) => { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; };
  const store = (items = []) => ({ items, isReady: ready });
  const deps = {
    "react/jsx-runtime": { jsx, jsxs: jsx }, react: { useState, useRef: (value) => useState({ current: value })[0], useMemo: (fn) => fn(), useEffect: (fn) => effects.push(fn) }, "next/link": { default: "Link" }, "lucide-react": {},
    "../../components/ui/Button": { Button: "Button" }, "../../components/ui/Card": { Card: "Card" }, "../../components/ui/PageHeader": { PageHeader: "PageHeader" }, "../../components/ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" },
    "../../lib/scheduling": { ...scheduling, plannerDateKey: () => scheduling.plannerDateKey(new Date(now)) }, "../../lib/jobManagement-core.mjs": jobCore, "../../lib/storage": { makeId: () => `id-${++ids}`, useCloudLocalCollection: () => store() },
    "../../lib/cloud/coreBusinessCollections": { useCustomersCollection: () => store(), useJobsCollection: () => ({ ...store(jobs), updateItem: (id, update) => updateItem("job", id, update), setItems() { throw new Error("Dispatch must use durable job writes"); } }), usePlannerCollection: () => ({ ...store(entries), createItem, updateItem: (id, update) => updateItem("visit", id, update), setItems() { throw new Error("Bookings must use durable creation"); } }) },
  };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/planner/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module: mod, exports: mod.exports, Date: TestDate, Error, URLSearchParams, window: { location: { search }, requestAnimationFrame(fn) { fn(); return 1; }, cancelAnimationFrame() {}, setInterval(fn) { tick = fn; return 1; }, clearInterval() {}, addEventListener(event, fn) { listeners.set(event, fn); }, removeEventListener() {}, scrollTo() {} }, require(name) { assert.ok(name in deps, name); return deps[name]; } });
  const render = () => { cursor = 0; effects.length = 0; return mod.exports.default(); };
  render(); effects.splice(0).forEach((fn) => fn());
  return { render, writes: () => writes, entries: () => entries, jobs: () => jobs, attempts, creations, replaceEntries(value) { entries = value; }, replaceJobs(value) { jobs = value; }, setReady(value) { ready = value; },
    advance(value, focus = false) { now = value; (focus ? listeners.get("focus") : tick)(); },
    handler(label) { const node = nodes(render()).find((n) => ["button", "Button"].includes(n.type) && text(n) === label); assert.ok(node, label); return node.props.onClick; },
    click(label) { const node = nodes(render()).find((n) => ["button", "Button"].includes(n.type) && (n.props["aria-label"] === label || text(n) === label)); assert.ok(node, label); node.props.onClick(); },
    add() { nodes(render()).find((n) => n.type === "PageHeader").props.action.props.onClick(); },
    fill(label, value) { const all = nodes(render()); let field = all.find((n) => n.props?.label === label); if (!field) field = nodes(all.find((n) => n.type === "label" && text(n).startsWith(label))).find((n) => n.type === "select"); assert.ok(field, label); field.props.onChange({ target: { value } }); },
    saveHandler() { return nodes(render()).find((n) => n.type === "form").props.onSubmit; },
    submit() { this.saveHandler()({ preventDefault() {} }); },
  };
}

test("planner month buttons reach February and week view hides distant bookings without writes", () => {
  const h = harness(); h.click("month"); h.click("Next month"); assert.match(text(h.render()), /28 Feb 2026/); assert.equal(h.writes(), 0);
  const week = harness({ search: "?date=2026-11-01", entries: [entry({ title: "Inside week", date: "2026-10-28", endDate: "2026-10-28" }), entry({ id: "far", title: "Distant visit", date: "2026-11-20", endDate: "2026-11-20" })] });
  week.click("week"); assert.match(text(week.render()), /Inside week/); assert.doesNotMatch(text(week.render()), /Distant visit/); assert.equal(week.writes(), 0);
});

test("planner saves monthly spans without drift and None creates only one booking", () => {
  const h = harness(); h.add();
  for (const [label, value] of [["Entry title", "Monthly visit"], ["Start date", "2026-01-31"], ["End date", "2026-02-01"], ["Repeat", "Monthly"], ["Number of visits", "3"]]) h.fill(label, value);
  h.submit(); assert.equal(h.writes(), 3);
  assert.deepEqual(Array.from(h.entries().toSorted((a, b) => a.date.localeCompare(b.date)), (e) => [e.date, e.endDate]), [["2026-01-31", "2026-02-01"], ["2026-02-28", "2026-03-01"], ["2026-03-31", "2026-04-01"]]);
  assert.equal(new Set(h.entries().map((e) => e.recurrenceGroupId)).size, 1);
  const single = harness(); single.add();
  for (const [label, value] of [["Entry title", "One visit"], ["Start date", "2026-01-31"], ["End date", "2026-02-01"], ["Number of visits", "3"]]) single.fill(label, value);
  single.submit(); assert.equal(single.entries().length, 1);
});

function prepareBooking(h, count = "3") {
  h.add();
  for (const [label, value] of [["Entry title", "Monthly visit"], ["Start date", "2026-01-31"], ["End date", "2026-02-01"], ["Repeat", "Monthly"], ["Number of visits", count], ["Notes", "Original series"]]) h.fill(label, value);
}

test("a failed first booking save retains its form and stable identities through edits and retry", () => {
  const h = harness({ failCreateAt: [1, 2] }); prepareBooking(h); h.submit();
  assert.equal(h.entries().length, 0); assert.match(text(h.render()), /0 of 3 visits saved.*form is retained/);
  assert.equal(nodes(h.render()).find((n) => n.props?.label === "Entry title").props.value, "Monthly visit");
  assert.equal(nodes(h.render()).find((n) => n.type === "fieldset").props.disabled, false);
  h.fill("Entry title", "Reviewed visit"); h.fill("Start date", "2026-03-31"); h.fill("End date", "2026-04-01"); h.submit(); h.submit();
  assert.equal(h.entries().length, 3);
  assert.equal(h.creations[0].id, h.creations[1].id); assert.equal(h.creations[1].id, h.creations[2].id);
  assert.equal(h.creations[0].recurrenceGroupId, h.creations[2].recurrenceGroupId);
  assert.equal(h.creations[0].createdAt, h.creations[2].createdAt);
  assert.ok(h.entries().every((e) => e.title === "Reviewed visit"));
  assert.match(text(h.render()), /3 diary entries saved on this device.*Check sync status/);
  assert.equal(nodes(h.render()).some((n) => n.type === "form"), false);
});

test("partially saved repeats lock the series and retry only the missing visits with their original ids", () => {
  const other = entry({ id: "other" }); const h = harness({ entries: [other], failCreateAt: [2, 4] }); prepareBooking(h);
  const captured = h.saveHandler(); captured({ preventDefault() {} });
  assert.equal(h.entries().length, 2); assert.match(text(h.render()), /1 of 3 visits saved.*remaining visits could not be confirmed/);
  assert.equal(nodes(h.render()).find((n) => n.type === "fieldset").props.disabled, true);
  assert.match(text(h.render()), /Not confirmed: Sat, 28 Feb 2026.*Not confirmed: Tue, 31 Mar 2026/);
  assert.match(text(h.render()), /Leaving this page keeps the saved visits but loses the remaining draft/);
  h.add(); assert.equal(nodes(h.render()).some((n) => n.type === "form"), true);
  // A callback captured before the partial save must still use the frozen original series.
  h.fill("Entry title", "Stale edited draft"); captured({ preventDefault() {} });
  assert.equal(h.entries().length, 3); assert.match(text(h.render()), /2 of 3 visits saved/);
  h.submit(); assert.equal(h.entries().length, 4);
  assert.equal(h.creations[1].id, h.creations[2].id); assert.equal(h.creations[3].id, h.creations[4].id);
  assert.equal(h.creations.filter((e) => e.id === h.creations[0].id).length, 1);
  assert.ok(h.entries().filter((e) => e.id !== "other").every((e) => e.title === "Monthly visit" && e.notes === "Original series"));
  assert.deepEqual(h.entries().find((e) => e.id === "other"), other);
  assert.equal(new Set(h.entries().map((e) => e.id)).size, 4);
});

test("repeated submit callbacks cannot duplicate a completed booking or save an older draft after reopening", () => {
  const h = harness(); prepareBooking(h, "1"); const save = h.saveHandler(); save({ preventDefault() {} }); save({ preventDefault() {} });
  assert.equal(h.entries().length, 1); assert.equal(h.writes(), 1);
  h.add(); h.fill("Entry title", "Next booking"); save({ preventDefault() {} }); assert.equal(h.writes(), 1);
  h.submit(); assert.equal(h.entries().length, 2); assert.notEqual(h.entries()[0].id, h.entries()[1].id);
});

test("keeping saved visits stops only the unsaved tail and prevents old retries", () => {
  const h = harness({ failCreateAt: [2] }); prepareBooking(h); const save = h.saveHandler(); save({ preventDefault() {} });
  const saved = h.entries()[0]; const retry = h.saveHandler(); const keep = h.handler("Keep saved visits only"); keep(); keep(); retry({ preventDefault() {} });
  assert.deepEqual(h.entries(), [saved]); assert.equal(h.writes(), 2);
  assert.match(text(h.render()), /1 of 3 visits saved.*remaining visits were not booked/);
  assert.equal(nodes(h.render()).some((n) => n.type === "form"), false);
  h.add(); h.fill("Entry title", "New visit"); h.submit(); assert.equal(h.entries().length, 2); assert.notEqual(h.entries()[0].id, saved.id);
});

test("a pending booking id collision is not overwritten or treated as a successful retry", () => {
  const h = harness({ failCreateAt: [1] }); prepareBooking(h); h.submit();
  const other = entry({ id: h.creations[0].id, title: "Different saved visit" }); h.replaceEntries([other]); h.submit();
  assert.deepEqual(h.entries(), [other]); assert.match(text(h.render()), /0 of 3 visits saved.*already exists/);
  assert.equal(nodes(h.render()).some((n) => n.type === "form"), true);
});

test("booking readiness and invalid duration failures retain the draft without creating records", () => {
  const h = harness(); prepareBooking(h); const save = h.saveHandler(); h.setReady(false); save({ preventDefault() {} });
  assert.equal(h.writes(), 0); h.setReady(true); assert.match(text(h.render()), /could not be confirmed/);
  for (const duration of ["Infinity", "NaN", "-1"]) { h.fill("Estimated duration (minutes)", duration); h.submit(); assert.equal(h.writes(), 0); assert.match(text(h.render()), /valid estimated duration/); }
  h.fill("Estimated duration (minutes)", "90"); h.submit(); assert.equal(h.entries().length, 3);
});

test("invalid or reversed planner dates never create a partial recurrence", () => {
  for (const [start, end] of [["2026-02-30", "2026-03-01"], ["2026-03-02", "2026-03-01"], ["2026-03-01", ""], ["9999-12-31", "9999-12-31"]]) {
    const h = harness(); h.add();
    for (const [label, value] of [["Entry title", "Invalid range"], ["Start date", start], ["End date", end], ["Repeat", "Weekly"], ["Number of visits", "2"]]) h.fill(label, value);
    h.submit(); assert.equal(h.writes(), 0); assert.equal(h.entries().length, 0); assert.match(text(h.render()), /Choose valid|outside the supported/);
  }
});

test("moving a visit shifts both ends while preserving its length and other records", () => {
  const other = entry({ id: "other", date: "2026-06-01", endDate: "2026-06-01" });
  const h = harness({ entries: [entry(), other] });
  h.click("Move ahead a day"); assert.equal(h.entries()[0].date, "2026-02-01"); assert.equal(h.entries()[0].endDate, "2026-02-02"); assert.deepEqual(h.entries()[1], other);
});

test("failed visit movement retains its saved dates and succeeds on a later retry", () => {
  const original = entry(); const h = harness({ entries: [original], failEntries: 1 }); h.click("Move ahead a day");
  assert.deepEqual(h.entries(), [original]); assert.match(text(h.render()), /Visit move could not be confirmed.*visit storage failed/);
  h.click("Move ahead a day"); assert.equal(h.entries()[0].date, "2026-02-01"); assert.equal(h.entries()[0].endDate, "2026-02-02");
  assert.match(text(h.render()), /moved to.*on this device.*Check sync status/);
});

test("repeated or stale move handlers cannot move an already changed visit again", () => {
  const h = harness({ entries: [entry()] }); const move = h.handler("Move ahead a day"); move(); move();
  assert.equal(h.entries()[0].date, "2026-02-01"); assert.equal(h.writes(), 1); assert.match(text(h.render()), /visit has changed/);
  for (const patch of [{ notes: "New dispatch note" }, { jobId: "another-job" }, { status: "Cancelled" }, null]) {
    const h = harness({ entries: [entry()] }); const move = h.handler("Move ahead a day");
    const changed = patch ? [entry(patch)] : []; h.replaceEntries(changed); move();
    assert.deepEqual(h.entries(), changed); assert.equal(h.writes(), 0);
  }
});

test("completed/cancelled history and calendar overflow cannot be moved", () => {
  for (const status of ["Complete", "Cancelled"]) {
    const h = harness({ entries: [entry({ status })] });
    assert.equal(nodes(h.render()).find((n) => text(n) === "Move ahead a day" && n.type === "button").props.disabled, true);
    h.handler("Move ahead a day")(); assert.equal(h.writes(), 0); assert.equal(h.entries()[0].status, status);
  }
  const edge = harness({ search: "?date=9999-12-31", entries: [entry({ date: "9999-12-31", endDate: "9999-12-31" })] });
  edge.handler("Move ahead a day")(); assert.equal(edge.writes(), 0); assert.match(text(edge.render()), /invalid or unsupported dates/);
});

test("starting a scheduled job durably saves First fix and visit confirmation once", () => {
  const h = harness({ entries: [entry({ jobId: "j1" })], jobs: [job()] }); const start = h.handler("Start job"); start(); start();
  assert.equal(h.jobs()[0].status, "First fix"); assert.equal(h.entries()[0].status, "Confirmed");
  assert.equal(h.attempts.filter((a) => a.kind === "job").length, 1); assert.equal(h.attempts.filter((a) => a.kind === "visit").length, 1);
  assert.equal(h.jobs()[0].notes, "Saved job notes");
  assert.match(text(h.render()), /Visit: Confirmed/); assert.match(text(h.render()), /Job: First fix/);
  const confirmed = harness({ entries: [entry({ jobId: "j1", status: "Confirmed" })], jobs: [job()] }); confirmed.handler("Start job")();
  assert.equal(confirmed.jobs()[0].status, "First fix"); assert.equal(confirmed.entries()[0].status, "Confirmed");
  assert.equal(confirmed.attempts.filter((a) => a.kind === "visit").length, 0);
});

test("a failed job start leaves the visit unconfirmed and retries through the same saved records", () => {
  const h = harness({ entries: [entry({ jobId: "j1" })], jobs: [job()], failJobs: 1 }); h.handler("Start job")();
  assert.equal(h.jobs()[0].status, "Scheduled"); assert.equal(h.entries()[0].status, "Planned");
  assert.equal(h.attempts.some((a) => a.kind === "visit"), false); assert.match(text(h.render()), /could not be confirmed.*job storage failed/);
  h.handler("Start job")(); assert.equal(h.jobs()[0].status, "First fix"); assert.equal(h.entries()[0].status, "Confirmed");
});

test("a partial start explicitly retries visit confirmation without repeating the saved job change", () => {
  const h = harness({ entries: [entry({ jobId: "j1" })], jobs: [job()], failEntries: 1 }); h.handler("Start job")();
  assert.equal(h.jobs()[0].status, "First fix"); assert.equal(h.entries()[0].status, "Planned");
  assert.match(text(h.render()), /Job saved as First fix on this device.*visit confirmation could not be confirmed.*retry Confirm visit/);
  const confirm = h.handler("Confirm visit"); confirm(); confirm();
  assert.equal(h.jobs()[0].status, "First fix"); assert.equal(h.entries()[0].status, "Confirmed");
  assert.equal(h.attempts.filter((a) => a.kind === "job").length, 1); assert.equal(h.attempts.filter((a) => a.kind === "visit").length, 2);
});

test("confirming an on-site job preserves every later stage and the latest saved job fields", () => {
  for (const status of ["First fix", "In progress", "Awaiting builder", "Second fix", "Testing", "Snagging"]) {
    const savedJob = job({ status }); const h = harness({ entries: [entry({ jobId: "j1" })], jobs: [savedJob] });
    h.handler("Confirm visit")(); assert.deepEqual(h.jobs(), [savedJob]); assert.equal(h.entries()[0].status, "Confirmed");
    assert.equal(h.attempts.filter((a) => a.kind === "job").length, 0); assert.match(text(h.render()), /Job status remains/);
  }
  const h = harness({ entries: [entry({ jobId: "j1" })], jobs: [job()] }); const start = h.handler("Start job");
  const newer = job({ status: "Testing", title: "Updated job", notes: "Fresh site evidence" }); h.replaceJobs([newer]); start();
  assert.deepEqual(h.jobs(), [newer]); assert.equal(h.entries()[0].status, "Confirmed");
});

test("starting cannot reopen closed/held/unscheduled jobs or a missing linked job", () => {
  for (const status of ["Complete", "Invoiced", "Paid", "Cancelled", "On hold", "Enquiry", "Survey required", "Quoted", "Accepted", "Awaiting deposit"]) {
    const savedJob = job({ status }); const h = harness({ entries: [entry({ jobId: "j1" })], jobs: [savedJob] });
    assert.equal(nodes(h.render()).find((n) => n.type === "Button" && text(n) === "Start job").props.disabled, true);
    h.handler("Start job")(); assert.equal(h.writes(), 0); assert.deepEqual(h.jobs(), [savedJob]); assert.equal(h.entries()[0].status, "Planned");
  }
  const missing = harness({ entries: [entry({ jobId: "missing" })] }); missing.handler("Start job")();
  assert.equal(missing.writes(), 0); assert.match(text(missing.render()), /Linked job unavailable/);
  const changed = harness({ entries: [entry({ jobId: "j1" })], jobs: [job()] }); const start = changed.handler("Start job");
  const closed = job({ status: "Paid" }); changed.replaceJobs([closed]); start();
  assert.equal(changed.writes(), 0); assert.deepEqual(changed.jobs(), [closed]); assert.equal(changed.entries()[0].status, "Planned");
});

test("surveys, deliveries and unlinked appointments confirm only their visit and retain saved status on failure", () => {
  for (const type of ["Survey", "Delivery", "Training", "Holiday", "Office", "Other", "Job"]) {
    const linked = type !== "Job"; const savedJob = job();
    const h = harness({ entries: [entry({ type, jobId: linked ? "j1" : undefined })], jobs: [savedJob], failEntries: 1 });
    h.handler("Confirm visit")(); assert.equal(h.entries()[0].status, "Planned"); assert.deepEqual(h.jobs(), [savedJob]);
    h.handler("Confirm visit")(); assert.equal(h.entries()[0].status, "Confirmed"); assert.deepEqual(h.jobs(), [savedJob]);
    assert.equal(h.attempts.some((a) => a.kind === "job"), false);
  }
});

test("stale visit cards and finished history cannot dispatch a job", () => {
  for (const patch of [{ jobId: "another" }, { date: "2026-02-01" }, { notes: "New visit note" }, null]) {
    const h = harness({ entries: [entry({ jobId: "j1" })], jobs: [job()] }); const start = h.handler("Start job");
    const changed = patch ? [entry({ jobId: "j1", ...patch })] : []; h.replaceEntries(changed); start();
    assert.equal(h.writes(), 0); assert.deepEqual(h.entries(), changed); assert.equal(h.jobs()[0].status, "Scheduled");
  }
  for (const status of ["Complete", "Cancelled"]) {
    const h = harness({ entries: [entry({ jobId: "j1", status })], jobs: [job()] }); h.handler("Start job")();
    assert.equal(h.writes(), 0); assert.equal(h.jobs()[0].status, "Scheduled");
  }
});

test("unallocated jobs exclude closed and held records and loading cannot expose dispatch controls", () => {
  const savedJobs = [job({ title: "Active work" }), ...["Complete", "Invoiced", "Paid", "Cancelled", "On hold"].map((status) => job({ id: status, title: `${status} job`, status }))];
  const h = harness({ jobs: savedJobs }); assert.match(text(h.render()), /Active work/);
  for (const status of ["Complete", "Invoiced", "Paid", "Cancelled", "On hold"]) assert.doesNotMatch(text(h.render()), new RegExp(`${status} job`));
  assert.deepEqual(h.jobs(), savedJobs); assert.equal(h.writes(), 0);
  const loading = harness({ ready: false, entries: [entry({ jobId: "j1" })], jobs: [job()] });
  assert.match(text(loading.render()), /Loading scheduling centre/); assert.doesNotMatch(text(loading.render()), /Start job|Site visit/);
});

test("next work visit planning ignores history and non-work appointments without guessing job links", () => {
  const saved = [entry({ jobId: "j1", status: "Complete", date: "2026-10-12", endDate: undefined }), entry({ id: "past", jobId: "j1", date: "2026-10-08", endDate: "2026-10-09" }),
    ...["Survey", "Delivery", "Office", "Other"].map((type) => entry({ id: type, jobId: "j1", type, date: "2026-10-12", endDate: undefined })),
    entry({ id: "cancelled", jobId: "j1", status: "Cancelled", date: "2026-10-12", endDate: undefined }), entry({ id: "other-job", jobId: "other", date: "2026-10-12", endDate: undefined }), entry({ id: "unlinked", jobId: undefined, date: "2026-10-12", endDate: undefined })];
  const before = structuredClone(saved);
  assert.deepEqual(scheduling.jobVisitPlan("j1", saved, "2026-10-10"), { upcoming: [], uncertain: [] });
  assert.deepEqual(scheduling.jobVisitPlan("", saved, "2026-10-10"), { upcoming: [], uncertain: [] });
  assert.deepEqual(saved, before);
  const h = harness({ entries: saved, jobs: [job()] });
  assert.match(text(h.render()), /No ongoing or future work visit found/); assert.equal(h.writes(), 0);
});

test("ongoing and future work visits count independently of calendar view and the job start date", () => {
  const current = entry({ jobId: "j1", date: "2026-10-08", endDate: "2026-10-10" });
  const future = entry({ id: "future", jobId: "j1", status: "Confirmed", date: "2027-01-01", endDate: undefined });
  assert.deepEqual(scheduling.jobVisitPlan("j1", [current, future], "2026-10-10").upcoming, [current, future]);
  assert.deepEqual(scheduling.jobVisitPlan("j1", [current, future], "2026-10-11").upcoming, [future]);
  const h = harness({ entries: [future], jobs: [job({ title: "Future allocated job", startDate: "2020-01-01" })] });
  assert.doesNotMatch(text(h.render()), /Future allocated job|Book next visit/);
  assert.match(text(h.render()), /No next-visit checks flagged in loaded records/); assert.equal(h.writes(), 0);
});

test("invalid dates and unknown upcoming status remain reviewable even alongside a real booking", () => {
  const uncertain = [entry({ jobId: "j1", date: "2026-02-30", endDate: undefined }), entry({ id: "reversed", jobId: "j1", date: "2026-10-12", endDate: "2026-10-11" }), entry({ id: "legacy", jobId: "j1", status: "Tentative", date: "2026-10-12", endDate: undefined })];
  const pastUnknown = entry({ id: "past-legacy", jobId: "j1", status: "Legacy", date: "2026-01-01", endDate: undefined });
  const future = entry({ id: "future", jobId: "j1", date: "2026-10-12", endDate: undefined });
  assert.deepEqual(scheduling.jobVisitPlan("j1", [...uncertain, pastUnknown, future], "2026-10-10"), { upcoming: [future], uncertain });
  const h = harness({ entries: [...uncertain, future], jobs: [job({ id: "j1", title: "Uncertain job" })] });
  const view = h.render(); assert.match(text(view), /Review uncertain work bookings.*2026-02-30.*Tentative/);
  const book = nodes(view).find((n) => n.type === "button" && text(n) === "Book next visit");
  assert.equal(book.props.disabled, true); book.props.onClick();
  assert.equal(nodes(h.render()).some((n) => n.type === "form"), false); assert.equal(h.writes(), 0);
});

test("phone next-visit search combines job name address and status with four-card reveal and exact links", () => {
  const savedJobs = Array.from({ length: 9 }, (_, i) => job({ id: i === 8 ? "j /?# +" : `j${i}`, title: `Workshop ${i}`, siteAddress: i === 8 ? "12 High Street" : "2 Station Road", status: i === 8 ? "Testing" : "Scheduled" }));
  const h = harness({ jobs: savedJobs });
  assert.equal(nodes(h.render()).filter((n) => n.type === "article").length, 4);
  h.click("Show more jobs (5 remaining)"); assert.equal(nodes(h.render()).filter((n) => n.type === "article").length, 8);
  h.fill("Find a job for its next visit", " workshop HIGH testing ");
  const view = h.render(); assert.equal(nodes(view).filter((n) => n.type === "article").length, 1);
  const link = nodes(view).find((n) => n.type === "Link" && text(n) === "Review job"); assert.equal(link.props.href, "/jobs/j%20%2F%3F%23%20%2B");
  assert.match(text(view), /1 of 9 jobs match/);
  h.fill("Find a job for its next visit", "No match"); assert.match(text(h.render()), /No jobs match this search/);
  h.click("Clear job search"); assert.equal(nodes(h.render()).filter((n) => n.type === "article").length, 4);
  assert.ok(nodes(h.render()).filter((n) => n.type === "button" && text(n) === "Book next visit").every((n) => n.props.className.includes("min-h-12")));
  assert.equal(h.writes(), 0); assert.deepEqual(h.jobs(), savedJobs);
});

test("preparing the next visit keeps saved job identity and clamps old or invalid dates to today", () => {
  for (const [startDate, targetCompletionDate, start, end] of [["2026-01-01", "2026-02-01", "2026-10-10", "2026-10-10"], ["invalid", "2026-02-30", "2026-10-10", "2026-10-10"], ["2026-10-12", "2026-10-11", "2026-10-12", "2026-10-12"], ["2026-10-12", "2026-10-15", "2026-10-12", "2026-10-15"]]) {
    const savedJob = job({ id: "j /?#", startDate, targetCompletionDate, customerId: "customer-1" });
    const h = harness({ search: "", jobs: [savedJob] }); h.click("Book next visit");
    const all = nodes(h.render()); const field = (label) => all.find((n) => n.props?.label === label).props.value;
    assert.equal(field("Entry title"), savedJob.title); assert.equal(field("Start date"), start); assert.equal(field("End date"), end);
    assert.equal(nodes(all.find((n) => n.type === "label" && text(n).startsWith("Linked job"))).find((n) => n.type === "select").props.value, savedJob.id);
    assert.equal(h.writes(), 0); assert.deepEqual(h.jobs(), [savedJob]);
  }
});

test("a partially saved series cannot be replaced by the next-visit shortcut", () => {
  const h = harness({ jobs: [job()], failCreateAt: [2] }); const oldBook = h.handler("Book next visit");
  oldBook(); h.fill("Repeat", "Weekly"); h.fill("Number of visits", "3"); h.submit();
  assert.equal(h.entries().length, 1);
  oldBook(); assert.match(text(h.render()), /1 of 3 visits saved.*original booking details are locked/);
  h.submit(); assert.equal(h.entries().length, 3); assert.equal(h.creations.length, 4);
  assert.equal(new Set(h.entries().map((e) => e.id)).size, 3);
});

test("next-visit planning refreshes after local midnight and when the app regains focus", () => {
  const h = harness({ jobs: [job({ title: "Continuing work" })], entries: [entry({ jobId: "j1", date: "2026-10-10", endDate: undefined })] });
  assert.doesNotMatch(text(h.render()), /Continuing work/);
  h.advance("2026-10-11T00:01:00"); assert.match(text(h.render()), /Continuing work.*No ongoing or future work visit found/);
  h.replaceEntries([entry({ jobId: "j1", date: "2026-10-11", endDate: undefined })]); assert.doesNotMatch(text(h.render()), /Continuing work/);
  h.advance("2026-10-12T07:00:00", true); assert.match(text(h.render()), /Continuing work.*No ongoing or future work visit found/);
  assert.equal(h.writes(), 0);
});
