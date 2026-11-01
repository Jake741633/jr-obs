import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canAccessPath } from "../lib/cloud/permissions.ts";

const page = readFileSync(new URL("../app/field/page.tsx", import.meta.url), "utf8");

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return source.slice(start, end);
}

const completion = section(
  page,
  '<p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Completion</p>',
  '{activeTimer.state === "running"',
);
const cloudCompletion = section(
  completion,
  "{cloudFieldMode ? <Card>",
  ' : <Card className="space-y-5">',
);

test("cloud field completion opens the selected job workspace", () => {
  assert.equal(canAccessPath("electrician", "/jobs/job-1/workspace"), true);
  assert.match(cloudCompletion, /href=\{`\/jobs\/\$\{form\.jobId\}\/workspace`\}/);
  assert.match(cloudCompletion, />Job workspace<\/Link>/);
  assert.doesNotMatch(cloudCompletion, /href=\{`\/jobs\/\$\{form\.jobId\}`\}/);
  assert.doesNotMatch(cloudCompletion, />Open full job<\/Link>/);
});

test("cloud completion handoff actions provide 48px touch targets", () => {
  assert.match(cloudCompletion, /href=\{`\/jobs\/\$\{form\.jobId\}\/workspace`\} className="inline-flex min-h-12[^"]*">Job workspace<\/Link>/);
  assert.match(cloudCompletion, /href="\/field\/jobs" className="inline-flex min-h-12[^"]*">Open job control<\/Link>/);
  assert.match(cloudCompletion, /href="\/field\/testing" className="inline-flex min-h-12[^"]*">Open testing<\/Link>/);
  assert.doesNotMatch(cloudCompletion, /min-h-11/);
});
