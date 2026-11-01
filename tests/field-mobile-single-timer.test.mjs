import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canStopFieldTimer, fieldTimerStartBlock, fieldTimerState } from "../lib/fieldTimer-core.mjs";

const fieldPage = await readFile(new URL("../app/field/page.tsx", import.meta.url), "utf8");

test("field timer state distinguishes idle, running and stopped site records", () => {
  assert.deepEqual(fieldTimerState({}), { jobId: "", state: "idle", startedAt: "", finishedAt: "" });
  assert.deepEqual(fieldTimerState({ jobId: "job-1", startedAt: "08:00", finishedAt: "" }), {
    jobId: "job-1",
    state: "running",
    startedAt: "08:00",
    finishedAt: "",
  });
  assert.deepEqual(fieldTimerState({ jobId: "job-1", startedAt: "08:00", finishedAt: "16:30" }), {
    jobId: "job-1",
    state: "stopped",
    startedAt: "08:00",
    finishedAt: "16:30",
  });
});

test("only one field job can own a running or unsaved timer", () => {
  const running = { jobId: "job-1", startedAt: "08:00", finishedAt: "" };
  const stopped = { jobId: "job-1", startedAt: "08:00", finishedAt: "16:30" };
  assert.equal(fieldTimerStartBlock({}, "job-2"), null);
  assert.equal(fieldTimerStartBlock(running, "job-1"), "already-running");
  assert.equal(fieldTimerStartBlock(running, "job-2"), "stop-current");
  assert.equal(fieldTimerStartBlock(stopped, "job-1"), "save-current");
  assert.equal(fieldTimerStartBlock(stopped, "job-2"), "save-current");
  assert.equal(canStopFieldTimer(running, "job-1"), true);
  assert.equal(canStopFieldTimer(running, "job-2"), false);
  assert.equal(canStopFieldTimer(stopped, "job-1"), false);
});

test("field page never rebinds a timer while stopping another job", () => {
  const stopHandler = fieldPage.match(/function stopJob\(job: Job\) \{[\s\S]*?\n  \}\n\n  function saveDiary/)?.[0] ?? "";
  assert.match(stopHandler, /canStopFieldTimer\(form, job\.id\)/);
  assert.match(stopHandler, /setForm\(\(current\) => \(\{ \.\.\.current, finishedAt \}\)\)/);
  assert.doesNotMatch(stopHandler, /jobId: job\.id/);
});

test("field page blocks another start until the current timed record is stopped and saved", () => {
  const startHandler = fieldPage.match(/function startJob\(job: Job\) \{[\s\S]*?\n  \}\n\n  function stopJob/)?.[0] ?? "";
  assert.match(startHandler, /fieldTimerStartBlock\(form, job\.id\)/);
  assert.match(startHandler, /startBlock === "already-running"/);
  assert.match(startHandler, /startBlock === "stop-current"/);
  assert.match(startHandler, /startBlock === "save-current"/);
  assert.match(fieldPage, /disabled=\{timerLocked \|\| \(cloudFieldMode/);
  assert.match(fieldPage, /<select required disabled=\{timerLocked\}/);
});

test("mobile field controls expose only the valid timer action with large touch targets", () => {
  assert.match(fieldPage, /canStopFieldTimer\(form, job\.id\) \? <Button/);
  assert.match(fieldPage, /href="#daily-job-diary"/);
  assert.match(fieldPage, /href=\{`\/jobs\/\$\{job\.id\}\/workspace`\}/);
  assert.match(fieldPage, /bottom-\[calc\(5\.5rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(fieldPage, /aria-live="polite"/);
  assert.match(fieldPage, /className="min-h-12 shrink-0"/);
});
