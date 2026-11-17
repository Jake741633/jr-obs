import assert from "node:assert/strict";
import test from "node:test";
import { content, fieldSaveHarness, job, jobKey, nodes, queueKey, timelineKey } from "./helpers/field-save-harness.mjs";

const tasksKey = "jr-os-job-tasks";
const snag = {
  id: "snag-a", jobId: job.id, type: "Snag", category: "Second fix", priority: "Normal",
  title: "Replace damaged faceplate", description: "Workshop socket", assignedTo: "engineer-a",
  dueDate: "", status: "Open", photos: [], notes: "", createdAt: "2026-11-17T08:00:00.000Z", updatedAt: "2026-11-17T08:00:00.000Z",
};

function snagPage(tasks = [], options = {}) {
  return fieldSaveHarness("snags/", { ...options, rowsByKey: { [tasksKey]: tasks } });
}

function prepareSnag(page) {
  const form = nodes(page.render()).find(node => node.type === "form");
  nodes(form).find(node => node.type === "select").props.onChange({ target: { value: job.id } });
  page.field("Snag title").props.onChange({ target: { value: snag.title } });
  page.field("Description").props.onChange({ target: { value: snag.description } });
  return page.submitHandler();
}

test("mobile snag creation retains the draft until the task is written to the sync queue", async () => {
  const page = await snagPage();
  const submit = prepareSnag(page);
  page.blocked.add(queueKey);
  submit();
  const view = page.paint();

  assert.equal(page.field("Snag title", view).props.value, snag.title);
  assert.equal(page.field("Description", view).props.value, snag.description);
  assert.match(content(view), /save could not be confirmed/i);
  assert.doesNotMatch(content(view), /captured on this device/i);
  assert.deepEqual(page.rows(tasksKey), []);
  assert.deepEqual(page.rows(timelineKey), []);
  const rejected = page.rejectedWrites.find(write => write.key === queueKey);
  assert.ok(rejected, "the real queue write must have been attempted");

  page.blocked.delete(queueKey);
  const retry = page.submitHandler();
  retry();
  retry();
  const [saved] = page.rows(tasksKey);
  assert.equal(saved.id, JSON.parse(rejected.value)[0].sourceId);
  assert.equal(saved.assignedTo, "engineer-a");
  assert.equal(saved.description, snag.description);
  assert.equal(page.rows(tasksKey).length, 1);
  assert.deepEqual(page.rows(timelineKey).map(note => [note.sourceId, note.note]), [[saved.id, `Snag created · ${snag.title}.`]]);
  assert.equal(page.field("Snag title").props.value, "");
});

test("mobile snag status stays Open when its task write fails and can be retried", async () => {
  const page = await snagPage([snag]);
  page.blocked.add(queueKey);
  page.click("Start");
  const view = page.paint();

  assert.match(content(view), /Status: Open/);
  assert.match(content(view), /status save could not be confirmed/i);
  assert.doesNotMatch(content(view), /status captured on this device/i);
  assert.deepEqual(page.rows(tasksKey), [snag]);
  assert.deepEqual(page.rows(timelineKey), []);
  assert.ok(page.rejectedWrites.some(write => write.key === queueKey));

  page.blocked.delete(queueKey);
  const start = page.button("Start").props.onClick;
  start();
  start();
  assert.equal(page.rows(tasksKey)[0].status, "In progress");
  assert.deepEqual(page.rows(timelineKey).map(note => note.note), [`Snag · ${snag.title} changed from Open to In progress.`]);
  const [queued] = page.queue().filter(item => item.collectionKey === tasksKey);
  assert.equal(queued.sourceId, snag.id);
  assert.equal(queued.baseIntent, "update");
  assert.equal(queued.baseVersion, 1);
});

for (const action of ["create", "start"]) {
  test(`mobile snag ${action} retries only its failed timeline note`, async () => {
    const page = await snagPage(action === "start" ? [snag] : []);
    const submit = action === "create" ? prepareSnag(page) : () => page.click("Start");
    page.blocked.add(page.scoped(timelineKey));
    submit();
    const view = page.paint();

    assert.match(content(view), /timeline note needs retrying/i);
    assert.match(content(view), /Task record is saved on this device while offline/);
    assert.match(content(view), /Job timeline note is waiting to enter the device sync queue/);
    assert.doesNotMatch(content(view), /its task record and separate job timeline note are awaiting cloud confirmation/i);
    const savedTasks = page.rows(tasksKey);
    assert.equal(savedTasks.length, 1);
    assert.equal(savedTasks[0].status, action === "start" ? "In progress" : "Open");
    assert.deepEqual(page.rows(timelineKey), []);
    assert.equal(page.button("Complete", view).props.disabled, true);
    const originalTaskQueue = page.queue().filter(item => item.collectionKey === tasksKey);
    assert.equal(originalTaskQueue.length, 1);

    page.blocked.delete(page.scoped(timelineKey));
    const retry = page.button("Retry timeline note").props.onClick;
    retry();
    retry();
    assert.deepEqual(page.rows(tasksKey), savedTasks);
    assert.deepEqual(page.queue().filter(item => item.collectionKey === tasksKey), originalTaskQueue);
    const notes = page.rows(timelineKey);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].sourceId, savedTasks[0].id);
    assert.equal(notes[0].jobId, job.id);
    assert.equal(notes[0].sourceType, "JobTask");
    assert.equal(notes[0].eventType, "Snag");
    const retried = page.render();
    assert.doesNotMatch(content(retried), /timeline note needs retrying/i);
    assert.match(content(retried), /Job timeline note is saved on this device while offline/);
    assert.equal(page.button("Complete", retried).props.disabled, true);
  });
}

test("mobile snag status tracks a new pair after the previous task and note sync", async () => {
  const page = await snagPage([snag]);
  page.click("Start");
  page.render();
  page.confirmQueue();
  const first = page.render();
  assert.match(content(first), /The combined snag change is confirmed/);
  assert.equal(page.button("Complete", first).props.disabled, false);

  page.blocked.add(page.scoped(timelineKey));
  page.click("Complete", first);
  const second = page.paint();
  assert.match(content(second), /marked completed/i);
  assert.match(content(second), /Job timeline note is waiting to enter the device sync queue/);
  assert.doesNotMatch(content(second), /The combined snag change is confirmed/);
  assert.equal(page.rows(tasksKey)[0].status, "Completed");
  assert.equal(page.rows(timelineKey).length, 1);
  const retry = page.button("Retry timeline note", second);
  assert.ok(retry);
  page.blocked.delete(page.scoped(timelineKey));
  retry.props.onClick();
  assert.deepEqual(page.rows(timelineKey).map(note => note.note).sort(), [
    `Snag · ${snag.title} changed from In progress to Completed.`,
    `Snag · ${snag.title} changed from Open to In progress.`,
  ]);
});

test("a queued mobile snag status action cannot overwrite a reconciled task", async () => {
  const page = await snagPage([snag]);
  const start = page.button("Start").props.onClick;
  const reassigned = { ...snag, assignedTo: "engineer-b", notes: "Now assigned to another engineer" };
  page.reconcile(tasksKey, reassigned);
  start();
  page.render();

  assert.deepEqual(page.rows(tasksKey), [reassigned]);
  assert.deepEqual(page.rows(timelineKey), []);
  assert.deepEqual(page.queue(), []);
});

test("a mobile snag submit cannot write after sign-out before the page refreshes", async () => {
  const page = await snagPage();
  const submit = prepareSnag(page);
  page.retireSession();
  submit();
  page.render();

  assert.deepEqual(page.rows(tasksKey), []);
  assert.deepEqual(page.rows(timelineKey), []);
  assert.deepEqual(page.queue(), []);
});

test("mobile snag note retry stops when the field job is reassigned", async () => {
  const page = await snagPage([snag]);
  page.blocked.add(page.scoped(timelineKey));
  page.click("Start");
  const savedTasks = page.rows(tasksKey);
  page.blocked.delete(page.scoped(timelineKey));
  page.reconcile(jobKey, { ...job, assignedTo: ["engineer-b"] });
  page.click("Retry timeline note");

  assert.deepEqual(page.rows(tasksKey), savedTasks);
  assert.deepEqual(page.rows(timelineKey), []);
  assert.match(content(page.render()), /job is no longer assigned/i);
});

test("mobile snag note retry cannot write into a different account", async () => {
  const page = await snagPage([snag]);
  page.blocked.add(page.scoped(timelineKey));
  page.click("Start");
  const oldRetry = page.button("Retry timeline note", page.paint());
  assert.ok(oldRetry);
  const savedQueue = page.queue();
  page.blocked.delete(page.scoped(timelineKey));
  await page.switchAccount();
  oldRetry.props.onClick();

  assert.deepEqual(page.queue(), savedQueue);
  assert.deepEqual(page.rows(timelineKey), []);
  assert.equal(page.button("Retry timeline note"), undefined);
});

for (const mode of ["local", "migration"]) {
  test(`unsigned ${mode} snag workspaces can reopen completed snags on the device`, async () => {
    const page = await snagPage([{ ...snag, status: "Completed", completedAt: snag.updatedAt }], { mode, signedIn: false });
    page.click("Reopen");
    page.render();

    assert.equal(page.rows(tasksKey)[0].status, "Open");
    assert.equal(page.rows(tasksKey)[0].completedAt, undefined);
    assert.deepEqual(page.rows(timelineKey).map(note => note.note), [`Snag · ${snag.title} changed from Completed to Open.`]);
    assert.deepEqual(page.queue(), []);
  });
}

test("a legacy local snag with a blank status still records its completion note", async () => {
  const page = await snagPage([{ ...snag, status: "" }], { mode: "local" });
  page.click("Complete");

  assert.equal(page.rows(tasksKey)[0].status, "Completed");
  assert.deepEqual(page.rows(timelineKey).map(note => note.note), [`Snag · ${snag.title} changed from Open to Completed.`]);
});
