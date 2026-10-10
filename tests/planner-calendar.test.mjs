import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as scheduling from "../lib/scheduling.ts";

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
function harness({ search = "?date=2026-01-31", entries: initial = [] } = {}) {
  const state = [], effects = [];
  let cursor = 0, entries = initial, writes = 0, ids = 0;
  const useState = (initial) => { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; };
  const store = (items = []) => ({ items, isReady: true });
  const deps = {
    "react/jsx-runtime": { jsx, jsxs: jsx }, react: { useState, useRef: (value) => useState({ current: value })[0], useMemo: (fn) => fn(), useEffect: (fn) => effects.push(fn) }, "next/link": { default: "Link" }, "lucide-react": {},
    "../../components/ui/Button": { Button: "Button" }, "../../components/ui/Card": { Card: "Card" }, "../../components/ui/PageHeader": { PageHeader: "PageHeader" }, "../../components/ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" },
    "../../lib/scheduling": scheduling, "../../lib/storage": { makeId: () => `id-${++ids}`, useCloudLocalCollection: () => store() },
    "../../lib/cloud/coreBusinessCollections": { useCustomersCollection: () => store(), useJobsCollection: () => store(), usePlannerCollection: () => ({ ...store(entries), setItems(fn) { writes++; entries = fn(entries); } }) },
  };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/planner/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module: mod, exports: mod.exports, Date, URLSearchParams, window: { location: { search }, requestAnimationFrame(fn) { fn(); return 1; }, cancelAnimationFrame() {} }, require(name) { assert.ok(name in deps, name); return deps[name]; } });
  const render = () => { cursor = 0; effects.length = 0; return mod.exports.default(); };
  render(); effects.splice(0).forEach((fn) => fn());
  return { render, writes: () => writes, entries: () => entries,
    click(label) { const node = nodes(render()).find((n) => ["button", "Button"].includes(n.type) && (n.props["aria-label"] === label || text(n) === label)); assert.ok(node, label); node.props.onClick(); },
    add() { nodes(render()).find((n) => n.type === "PageHeader").props.action.props.onClick(); },
    fill(label, value) { const all = nodes(render()); let field = all.find((n) => n.props?.label === label); if (!field) field = nodes(all.find((n) => n.type === "label" && text(n).startsWith(label))).find((n) => n.type === "select"); assert.ok(field, label); field.props.onChange({ target: { value } }); },
    submit() { nodes(render()).find((n) => n.type === "form").props.onSubmit({ preventDefault() {} }); },
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
  h.submit(); assert.equal(h.writes(), 1);
  assert.deepEqual(Array.from(h.entries(), (e) => [e.date, e.endDate]), [["2026-01-31", "2026-02-01"], ["2026-02-28", "2026-03-01"], ["2026-03-31", "2026-04-01"]]);
  assert.equal(new Set(h.entries().map((e) => e.recurrenceGroupId)).size, 1);
  const single = harness(); single.add();
  for (const [label, value] of [["Entry title", "One visit"], ["Start date", "2026-01-31"], ["End date", "2026-02-01"], ["Number of visits", "3"]]) single.fill(label, value);
  single.submit(); assert.equal(single.entries().length, 1);
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
