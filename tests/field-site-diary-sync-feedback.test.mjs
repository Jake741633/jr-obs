import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  awaitingQueueState,
  emptySiteDiarySyncProjection,
  refreshSiteDiarySyncProjection,
  registerSiteDiarySyncAttempt,
  siteDiaryAttemptStates,
  unpairedSiteDiaryTargetStates,
} from "../lib/siteDiarySync-core.mjs";

const page = readFileSync(new URL("../app/field/site-diary/page.tsx", import.meta.url), "utf8");

function queueItem(collectionKey, sourceId, state = "Pending", extra = {}) {
  return { table: "cloud_collections", collectionKey, sourceId, state, ...extra };
}

test("site diary pair waits for each exact collection target before absence can mean synced", () => {
  let projection = registerSiteDiarySyncAttempt(emptySiteDiarySyncProjection(), {
    scopeKey: "scope-a",
    diaryId: "diary-1",
    timelineId: "timeline-1",
    jobId: "job-1",
    workDate: "2026-08-27",
  });
  assert.deepEqual(siteDiaryAttemptStates(projection, "diary-1"), {
    diary: awaitingQueueState,
    timeline: awaitingQueueState,
    timelineId: "timeline-1",
    jobId: "job-1",
    workDate: "2026-08-27",
  });

  projection = refreshSiteDiarySyncProjection({
    current: projection,
    scopeKey: "scope-a",
    queue: [queueItem("jr-os-site-diaries", "diary-1")],
    online: true,
  });
  assert.equal(projection.diaryTargets["diary-1"].state, "Pending");
  assert.equal(projection.timelineTargets["timeline-1"].state, awaitingQueueState);

  projection = refreshSiteDiarySyncProjection({
    current: projection,
    scopeKey: "scope-a",
    queue: [
      queueItem("jr-os-site-diaries", "diary-1"),
      queueItem("jr-os-job-timeline", "timeline-1", "Offline"),
    ],
    online: false,
  });
  assert.equal(projection.diaryTargets["diary-1"].state, "Offline");
  assert.equal(projection.timelineTargets["timeline-1"].state, "Offline");

  projection = refreshSiteDiarySyncProjection({
    current: projection,
    scopeKey: "scope-a",
    queue: [queueItem("jr-os-job-timeline", "timeline-1", "Failed")],
    online: true,
  });
  assert.equal(projection.diaryTargets["diary-1"].state, "Synced");
  assert.equal(projection.timelineTargets["timeline-1"].state, "Failed");

  projection = refreshSiteDiarySyncProjection({ current: projection, scopeKey: "scope-a", queue: [], online: true });
  assert.equal(projection.timelineTargets["timeline-1"].state, "Synced");
});

test("site diary projection ignores wrong tables and collection keys and resets by identity scope", () => {
  let projection = registerSiteDiarySyncAttempt(emptySiteDiarySyncProjection(), {
    scopeKey: "scope-a",
    diaryId: "diary-1",
    timelineId: "timeline-1",
  });
  projection = refreshSiteDiarySyncProjection({
    current: projection,
    scopeKey: "scope-a",
    queue: [
      queueItem("jr-os-site-diaries", "diary-1", "Failed", { table: "jobs" }),
      queueItem("wrong-key", "diary-1", "Conflict"),
      queueItem("jr-os-job-timeline", "timeline-1", "Failed", { table: "jobs" }),
      queueItem("jr-os-site-diaries", "other-diary", "Conflict"),
    ],
    online: true,
  });
  assert.equal(projection.diaryTargets["diary-1"].state, awaitingQueueState);
  assert.equal(projection.timelineTargets["timeline-1"].state, awaitingQueueState);
  assert.equal(projection.diaryTargets["other-diary"].state, "Conflict");

  const replacement = refreshSiteDiarySyncProjection({ current: projection, scopeKey: "scope-b", queue: [], online: true });
  assert.equal(replacement.scopeKey, "scope-b");
  assert.deepEqual(replacement.attempts, {});
  assert.deepEqual(replacement.diaryTargets, {});
  assert.deepEqual(replacement.timelineTargets, {});
});

test("retained site diary targets surface without treating unrelated timeline notes as diary saves", () => {
  const projection = refreshSiteDiarySyncProjection({
    current: emptySiteDiarySyncProjection("scope-a"),
    scopeKey: "scope-a",
    queue: [
      queueItem("jr-os-site-diaries", "retained-diary", "Failed"),
      queueItem("jr-os-job-timeline", "retained-timeline", "Conflict", {
        payload: { sourceType: "SiteDiaryEntry", eventType: "Site diary" },
      }),
      queueItem("jr-os-job-timeline", "unrelated-timeline", "Failed", {
        payload: { eventType: "Note" },
      }),
    ],
    online: true,
  });
  assert.deepEqual(unpairedSiteDiaryTargetStates(projection), [
    { kind: "diary", sourceId: "retained-diary", state: "Failed" },
    { kind: "timeline", sourceId: "retained-timeline", state: "Conflict" },
  ]);
  assert.equal(projection.timelineTargets["unrelated-timeline"], undefined);
});

test("site diary registers both targets before optimistic success surfaces", () => {
  const saveDiary = page.slice(page.indexOf("function saveDiary"), page.indexOf("\n\n  if (!ready)"));
  const registration = saveDiary.indexOf("registerSiteDiarySyncAttempt");
  assert.ok(registration >= 0);
  assert.ok(registration < saveDiary.indexOf("diaries.setItems"));
  assert.ok(registration < saveDiary.indexOf("timeline.setItems"));
  assert.ok(registration < saveDiary.indexOf("setMessage(cloudFieldMode"));
  assert.ok(registration < saveDiary.indexOf("setForm({ ...blankForm"));
  assert.match(saveDiary, /diaryId: entry\.id,[\s\S]*timelineId: timelineEntry\.id,[\s\S]*jobId: entry\.jobId,[\s\S]*workDate: entry\.workDate/);
});

test("site diary derives generic-collection success only from exact queue events", () => {
  assert.match(page, /activeSyncAuthorizationMatches\(authorization\)/);
  assert.match(page, /const queue = getSyncQueue\(\)/);
  assert.match(page, /window\.addEventListener\("jr-os-sync-status", refreshSiteDiarySyncStates\)/);
  assert.match(page, /window\.removeEventListener\("jr-os-sync-status", refreshSiteDiarySyncStates\)/);
  assert.doesNotMatch(page, /jr-os-cloud-cache-reconciled/);
  assert.match(page, /siteDiarySyncScopeKey = JSON\.stringify\(\[[\s\S]*organisationId[\s\S]*userId[\s\S]*role[\s\S]*customerSourceId/);
  assert.match(page, /siteDiarySyncReady = !cloudFieldMode \|\| \(activeSiteDiarySyncProjection\.initialized/);
  assert.match(page, /setSiteDiarySyncProjection\(emptySiteDiarySyncProjection\(siteDiarySyncScopeKey\)\)[\s\S]*setForm\(\{ \.\.\.blankForm, workDate: today\(\) \}\)[\s\S]*setMessage\(""\)[\s\S]*setInteractionScopeKey\(siteDiarySyncScopeKey\)[\s\S]*\[siteDiarySyncScopeKey\]/);
  assert.match(page, /interactionScopeReady = interactionScopeKey === siteDiarySyncScopeKey/);
});

test("site diary labels partial saves instead of reporting both records queued", () => {
  assert.match(page, /captured on this device[\s\S]*awaiting cloud confirmation/);
  assert.match(page, /Diary record is [\s\S]*Job timeline note is/);
  assert.match(page, /The combined daily progress save is not fully cloud-confirmed/);
  assert.match(page, /retained site diary sync targets are not cloud-confirmed/);
  assert.match(page, /href="\/cloud"/);
  assert.doesNotMatch(page, /Daily progress and a separate job timeline note queued for secure sync/);
  assert.match(page, /cloudFieldMode \? "Capture daily progress" : "Save daily progress"/);
});
