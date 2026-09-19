import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/field/page.tsx", import.meta.url), "utf8");

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return source.slice(start, end);
}

test("legacy field diary registers exact targets before optimistic surfaces", () => {
  const handler = section(page, "function saveDiary", "\n\n  function choosePhoto");
  const registration = handler.indexOf("registerSiteDiarySyncAttempt");
  assert.ok(registration >= 0);
  assert.ok(registration < handler.indexOf("diary.setItems"));
  assert.ok(registration < handler.indexOf("timeline.setItems"));
  assert.ok(registration < handler.indexOf("setMessage(cloudFieldMode"));
  assert.ok(registration < handler.indexOf("setForm({ ...blankDiary"));
  assert.match(handler, /const timelineEntry = siteDiaryTimelineEntry\([\s\S]*timelineId: makeId\("timeline"\)/);
  assert.match(handler, /diaryId: entry\.id,[\s\S]*timelineId: timelineEntry\.id,[\s\S]*jobId: entry\.jobId,[\s\S]*workDate: entry\.workDate/);
});

test("legacy field diary uses exact queue events and full identity scope", () => {
  const syncEffect = section(page, "function refreshSiteDiarySyncStates", "\n  }, [cloudFieldMode, identityState.identity, siteDiarySyncScopeKey]);");
  assert.match(syncEffect, /activeSyncAuthorizationMatches\(authorization\)/);
  assert.match(syncEffect, /const queue = getSyncQueue\(\)/);
  assert.match(syncEffect, /refreshSiteDiarySyncProjection\(\{/);
  assert.match(syncEffect, /window\.addEventListener\("jr-os-sync-status", refreshSiteDiarySyncStates\)/);
  assert.match(syncEffect, /window\.removeEventListener\("jr-os-sync-status", refreshSiteDiarySyncStates\)/);
  assert.doesNotMatch(syncEffect, /jr-os-cloud-cache-reconciled/);
  assert.match(page, /fieldWorkspaceScopeKey = JSON\.stringify\(\[[\s\S]*organisationId[\s\S]*userId[\s\S]*role[\s\S]*customerSourceId/);
  assert.match(page, /siteDiarySyncReady = !cloudFieldMode \|\| \(activeSiteDiarySyncProjection\.initialized/);
  assert.match(page, /interactionScopeReady = interactionScopeKey === fieldWorkspaceScopeKey/);
});

test("legacy field workspace clears transient state across identity changes", () => {
  const resetEffect = section(page, "useEffect(() => {\n    let active = true;", "\n\n  useEffect(() => {\n    if (!cloudFieldMode");
  assert.match(resetEffect, /setForm\(\{ \.\.\.blankDiary, workDate: today\(\) \}\)/);
  assert.match(resetEffect, /setMessage\(""\)/);
  assert.match(resetEffect, /setChecklist\(\[\]\)/);
  assert.match(resetEffect, /setCustomerName\(""\)/);
  assert.match(resetEffect, /setSignOffNotes\(""\)/);
  assert.match(resetEffect, /setSelectedPhoto\(null\)/);
  assert.match(resetEffect, /setSiteDiarySyncProjection\(emptySiteDiarySyncProjection\(siteDiarySyncScopeKey\)\)/);
  assert.match(resetEffect, /setInteractionScopeKey\(fieldWorkspaceScopeKey\)/);
  assert.match(resetEffect, /\[fieldWorkspaceScopeKey, siteDiarySyncScopeKey\]/);
});

test("legacy field diary reports partial and retained sync truth", () => {
  assert.match(page, /Site diary captured on this device; its diary record and separate job timeline note are awaiting cloud confirmation/);
  assert.match(page, /Diary record is [\s\S]*Job timeline note is/);
  assert.match(page, /The combined site diary save is not fully cloud-confirmed/);
  assert.match(page, /retained site diary sync targets are not cloud-confirmed/i);
  assert.match(page, /href="\/cloud"/);
  assert.doesNotMatch(page, /Site diary entry and a separate job timeline note queued for secure sync/);
  assert.match(page, /cloudFieldMode \? "Capture site record" : "Save site record"/);
  assert.match(page, /Site diary entry saved to the job record/);
});

test("legacy field diary revalidates the active assigned job before optimistic writes", () => {
  const handler = section(page, "function saveDiary", "\n\n  function choosePhoto");
  const selectedJobLookup = handler.indexOf("const selectedJob = jobs.items.find((job) => job.id === form.jobId)");
  const activeJobGuard = handler.indexOf("if (!selectedJob || isJobInactiveStatus(selectedJob.status))");
  const assignmentGuard = handler.indexOf("if (cloudFieldMode && !fieldJobAssignedToOperator({ job: selectedJob, operatorMemberId }))");
  assert.ok(selectedJobLookup >= 0);
  assert.ok(activeJobGuard > selectedJobLookup);
  assert.ok(assignmentGuard > activeJobGuard);
  assert.ok(assignmentGuard < handler.indexOf("registerSiteDiarySyncAttempt"));
  assert.ok(assignmentGuard < handler.indexOf("diary.setItems"));
  assert.ok(assignmentGuard < handler.indexOf("timeline.setItems"));
});
