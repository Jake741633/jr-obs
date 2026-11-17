import assert from "node:assert/strict";
import test from "node:test";
import { content, diaryKey, fieldSaveHarness, job, jobKey, queueKey, timelineKey } from "./helpers/field-save-harness.mjs";

for (const [name, route] of [["mobile site diary", "site-diary/"], ["field workspace diary", ""]]) {
  test(name + " retains entered work when its sync queue cannot be written", async () => {
    const h = await fieldSaveHarness(route);
    h.fill();
    h.blocked.add(queueKey);
    const submit = h.submitHandler();
    submit();
    const view = h.paint();

    assert.equal(h.field("Work completed", view).props.value, "First fix upstairs lighting");
    assert.match(content(view), /diary save could not be confirmed/i);
    assert.doesNotMatch(content(view), /captured on this device/);
    assert.deepEqual(h.rows(diaryKey), []);
    assert.deepEqual(h.rows(timelineKey), []);
    assert.deepEqual(h.queue(), []);
    const rejected = h.rejectedWrites.find(write => write.key === queueKey);
    assert.ok(rejected, "the test must exercise a real attempted queue write");

    h.blocked.delete(queueKey);
    const retry = h.submitHandler();
    retry();
    retry();
    const [entry] = h.rows(diaryKey);
    assert.equal(entry.id, JSON.parse(rejected.value)[0].sourceId);
    assert.equal(entry.workCompleted, "First fix upstairs lighting");
    assert.equal(h.rows(diaryKey).length, 1);
    assert.equal(h.rows(timelineKey).length, 1);
  });

  test(name + " saves a failed timeline note on retry without creating another diary", async () => {
    const h = await fieldSaveHarness(route);
    h.fill();
    h.blocked.add(h.scoped(timelineKey));
    h.submitHandler()();
    const view = h.paint();

    assert.match(content(view), /timeline note needs retrying/i);
    assert.doesNotMatch(content(view), /its diary record and separate job timeline note are awaiting cloud confirmation/);
    assert.match(content(view), /Diary record is saved on this device while offline/);
    assert.match(content(view), /Job timeline note is waiting to enter the device sync queue/);
    const [diary] = h.rows(diaryKey);
    assert.equal(diary.workCompleted, "First fix upstairs lighting");
    assert.deepEqual(h.rows(timelineKey), []);
    assert.equal(h.queue().filter(entry => entry.collectionKey === diaryKey).length, 1);

    h.blocked.delete(h.scoped(timelineKey));
    h.click("Retry timeline note");
    assert.equal(h.rows(diaryKey).length, 1);
    assert.deepEqual(h.rows(timelineKey).map(note => [note.sourceId, note.note]), [
      [diary.id, "First fix upstairs lighting"],
    ]);
    assert.equal(h.queue().filter(entry => entry.collectionKey === timelineKey).length, 1);
    assert.doesNotMatch(content(h.render()), /timeline note needs retrying/i);
    assert.match(content(h.render()), /Job timeline note is saved on this device while offline/);
  });
}

test("the diary retry keeps the saved entry when job assignment is withdrawn", async () => {
  const h = await fieldSaveHarness("site-diary/");
  h.fill();
  h.blocked.add(h.scoped(timelineKey));
  h.submitHandler()();
  const [entry] = h.rows(diaryKey);
  h.blocked.delete(h.scoped(timelineKey));
  h.reconcile(jobKey, { ...job, assignedTo: ["another-engineer"] });

  h.click("Retry timeline note");
  assert.deepEqual(h.rows(diaryKey), [entry]);
  assert.deepEqual(h.rows(timelineKey), []);
  assert.match(content(h.render()), /original job is no longer assigned/);
});

test("a retained diary retry cannot write after its account changes", async () => {
  const h = await fieldSaveHarness("site-diary/");
  h.fill();
  h.blocked.add(h.scoped(timelineKey));
  h.submitHandler()();
  const oldRetry = h.button("Retry timeline note").props.onClick;
  const originalQueue = h.queue();
  h.blocked.delete(h.scoped(timelineKey));

  await h.switchAccount();
  oldRetry();
  assert.deepEqual(h.queue(), originalQueue);
  assert.deepEqual(h.rows(timelineKey), []);
  assert.equal(h.button("Retry timeline note"), undefined);
});

test("a cloud diary submit cannot write after sign-out before the page refreshes", async () => {
  const h = await fieldSaveHarness("site-diary/");
  h.fill();
  const submit = h.submitHandler();
  h.retireSession();
  submit();

  assert.deepEqual(h.queue(), []);
  assert.deepEqual(h.rows(diaryKey), []);
  assert.deepEqual(h.rows(timelineKey), []);
});

test("local diary saves keep the diary and its note without a cloud queue", async () => {
  const h = await fieldSaveHarness("site-diary/", { mode: "local" });
  h.fill();
  h.submitHandler()();
  const [entry] = h.rows(diaryKey);
  assert.equal(entry.workCompleted, "First fix upstairs lighting");
  const [timeline] = h.rows(timelineKey);
  assert.equal(timeline.sourceId, entry.id);
  assert.deepEqual(h.queue(), []);
  assert.match(content(h.render()), /daily progress saved and added to the job timeline/i);
});

test("the unsigned migration workspace retains its existing team identity feedback", async () => {
  const h = await fieldSaveHarness("site-diary/", { mode: "migration", signedIn: false });
  h.fill();
  h.submitHandler()();
  const view = h.paint();
  assert.match(content(view), /active team identity could not be resolved/);
  assert.equal(h.field("Work completed", view).props.value, "First fix upstairs lighting");
  assert.deepEqual(h.rows(diaryKey), []);
});
