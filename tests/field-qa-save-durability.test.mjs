import assert from "node:assert/strict";
import test from "node:test";
import { buildQaInspection } from "../lib/jobQa-core.mjs";
import { content, fieldSaveHarness, job, nodes, queueKey, timelineKey } from "./helpers/field-save-harness.mjs";

const inspectionsKey = "jr-os-job-qa-inspections";
const tasksKey = "jr-os-job-tasks";
const inspection = buildQaInspection({
  id: "inspection-a", jobId: job.id, type: "First fix", inspectorId: "engineer-a", inspectorName: "Site Supervisor",
  notes: "Workshop inspection", now: "2026-11-17T09:00:00.000Z",
});
const checked = { ...inspection, checks: inspection.checks.map(check => ({ ...check, completed: true })) };
const firstCheck = inspection.checks[0].label;

function qaPage(inspections = [inspection], { rowsByKey = {}, ...options } = {}) {
  return fieldSaveHarness("qa/", { mode: "local", ...options, rowsByKey: { [inspectionsKey]: inspections, [tasksKey]: [], ...rowsByKey } });
}

function enterInspectionDraft(page) {
  const form = nodes(page.render()).find(node => node.type === "form");
  nodes(form).find(node => node.type === "select").props.onChange({ target: { value: job.id } });
  page.field("Inspection notes").props.onChange({ target: { value: "Workshop access limitations" } });
  return page.submitHandler();
}

test("mobile QA preserves inspection notes when the draft cannot be saved", async () => {
  const page = await qaPage([]);
  const submit = enterInspectionDraft(page);
  page.blocked.add(inspectionsKey);
  submit();
  const view = page.paint();

  assert.equal(page.field("Inspection notes", view).props.value, "Workshop access limitations");
  assert.match(content(view), /inspection save could not be confirmed/i);
  assert.doesNotMatch(content(view), /QA inspection created/);
  assert.deepEqual(page.rows(inspectionsKey), []);
  const rejected = page.rejectedWrites.find(write => write.key === inspectionsKey);
  assert.ok(rejected);
  page.blocked.delete(inspectionsKey);
  const retry = page.submitHandler();
  retry();
  retry();
  const saved = page.rows(inspectionsKey);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].notes, "Workshop access limitations");
  assert.equal(saved[0].id, JSON.parse(rejected.value)[0].id);
  assert.equal(page.field("Inspection notes").props.value, "");
});

test("mobile QA shows checklist progress only after the check saves", async () => {
  const page = await qaPage();
  page.blocked.add(inspectionsKey);
  page.click(firstCheck);
  const view = page.paint();

  assert.match(content(view), /Checklist 0% complete/);
  assert.match(content(view), /checklist change could not be saved/i);
  assert.equal(page.rows(inspectionsKey)[0].checks[0].completed, false);
  assert.ok(page.rejectedWrites.some(write => write.key === inspectionsKey));

  page.blocked.delete(inspectionsKey);
  page.click(firstCheck);
  assert.equal(page.rows(inspectionsKey)[0].checks[0].completed, true);
  assert.match(content(page.render()), /Checklist 25% complete/);
});

test("a cloud office QA result keeps the inspection pending when its queue write fails", async () => {
  const page = await qaPage([inspection], { mode: "cloud", role: "admin" });
  page.blocked.add(queueKey);
  page.click("Fail");
  const view = page.paint();

  assert.ok(page.button("Fail", view));
  assert.match(content(view), /QA result save could not be confirmed/i);
  assert.doesNotMatch(content(view), /fail recorded|linked snag action created/i);
  assert.deepEqual(page.rows(inspectionsKey), [inspection]);
  assert.deepEqual(page.rows(timelineKey), []);
  assert.deepEqual(page.rows(tasksKey), []);
  assert.ok(page.rejectedWrites.some(write => write.key === queueKey));

  page.blocked.delete(queueKey);
  const fail = page.button("Fail").props.onClick;
  fail();
  fail();
  assert.equal(page.rows(inspectionsKey)[0].result, "Fail");
  assert.equal(page.rows(timelineKey)[0].sourceId, inspection.id);
  assert.equal(page.rows(timelineKey).length, 1);
  assert.equal(page.rows(tasksKey)[0].title, "First fix QA actions");
  assert.equal(page.rows(tasksKey).length, 1);
  const queued = page.queue();
  assert.equal(queued.length, 3);
  assert.equal(queued.find(item => item.collectionKey === inspectionsKey).baseVersion, 1);
});

test("a failed QA inspection can recover its missing snag after reopening the page", async () => {
  const page = await qaPage();
  page.blocked.add(tasksKey);
  page.click("Fail");
  const view = page.paint();
  const saved = page.rows(inspectionsKey)[0];
  const notes = page.rows(timelineKey);

  assert.equal(saved.result, "Fail");
  assert.equal(notes[0].sourceId, inspection.id);
  assert.deepEqual(page.rows(tasksKey), []);
  assert.match(content(view), /linked snag needs saving/i);
  assert.doesNotMatch(content(view), /linked snag action created/i);

  const reopened = await qaPage([saved], { rowsByKey: { [timelineKey]: notes } });
  assert.ok(reopened.button("Retry QA follow-up"));
  reopened.click("Retry QA follow-up");
  assert.deepEqual(reopened.rows(inspectionsKey), [saved]);
  assert.deepEqual(reopened.rows(timelineKey), notes);
  const tasks = reopened.rows(tasksKey);
  assert.deepEqual(tasks.map(task => [task.id, task.jobId, task.title]), [[saved.completion.snagId, job.id, "First fix QA actions"]]);
  assert.match(content(reopened.render()), /linked snag action created/i);
  assert.equal(reopened.button("Retry QA follow-up"), undefined);
});

test("a QA pass with a failed timeline write can retry just its note", async () => {
  const page = await qaPage([checked]);
  page.blocked.add(timelineKey);
  page.click("Pass");
  const view = page.paint();
  const saved = page.rows(inspectionsKey)[0];

  assert.equal(saved.result, "Pass");
  assert.deepEqual(page.rows(timelineKey), []);
  assert.deepEqual(page.rows(tasksKey), []);
  assert.match(content(view), /timeline note needs saving/i);
  assert.doesNotMatch(content(view), /inspection and timeline entry sync independently/i);

  page.blocked.delete(timelineKey);
  const retry = page.button("Retry QA follow-up").props.onClick;
  retry();
  retry();
  assert.deepEqual(page.rows(inspectionsKey), [saved]);
  assert.deepEqual(page.rows(tasksKey), []);
  assert.deepEqual(page.rows(timelineKey).map(note => [note.id, note.sourceId, note.note]),
    [[saved.completion.timelineId, inspection.id, "First fix QA inspection passed · Workshop inspection."]]);
  assert.equal(page.button("Retry QA follow-up"), undefined);
});

test("QA follow-up recovery rejects another snag with the same ID on the same job", async () => {
  const ids = { timelineId: "qa-timeline-a", snagId: "qa-snag-a" };
  const completed = { ...inspection, result: "Fail", completion: ids };
  const unrelated = { id: ids.snagId, jobId: job.id, type: "Snag", title: "Other task", status: "Open", createdAt: "2026-11-16T08:00:00.000Z" };
  const page = await qaPage([completed], { rowsByKey: { [tasksKey]: [unrelated] } });
  assert.match(content(page.render()), /review the linked snag/i);
  page.click("Retry QA follow-up");

  assert.deepEqual(page.rows(tasksKey), [unrelated]);
  assert.deepEqual(page.rows(timelineKey).map(note => note.id), [ids.timelineId]);
  assert.doesNotMatch(content(page.render()), /linked snag action created/i);
  assert.equal(page.button("Retry QA follow-up"), undefined);
});

test("a retained QA Pass action cannot override a newly incomplete checklist", async () => {
  const page = await qaPage([checked]);
  const pass = page.button("Pass").props.onClick;
  page.click(firstCheck);
  page.render();
  pass();
  page.render();

  const saved = page.rows(inspectionsKey)[0];
  assert.equal(saved.result, "Pending");
  assert.equal(saved.checks[0].completed, false);
  assert.deepEqual(page.rows(timelineKey), []);
});

test("a retained QA follow-up retry cannot write after account retirement", async () => {
  const completed = { ...inspection, result: "Pass", completion: { timelineId: "qa-timeline-a" } };
  const page = await qaPage([completed], { mode: "cloud", role: "admin" });
  const retry = page.button("Retry QA follow-up");
  assert.ok(retry);
  page.retireSession();
  retry.props.onClick();

  assert.deepEqual(page.rows(timelineKey), []);
  assert.deepEqual(page.queue(), []);
});

test("cloud electricians can review QA without seeing result or follow-up actions", async () => {
  const completed = { ...inspection, id: "inspection-b", result: "Fail", completion: { timelineId: "qa-timeline-a", snagId: "qa-snag-a" } };
  const page = await qaPage([inspection, completed], { mode: "cloud" });
  const view = page.render();
  assert.match(content(view), /QA cloud writes are currently locked/);
  assert.equal(page.button(firstCheck, view).props.disabled, true);
  assert.equal(page.button("Fail", view), undefined);
  assert.equal(page.button("Retry QA follow-up", view), undefined);
  assert.equal(nodes(view).some(node => node.type === "form"), false);
});
