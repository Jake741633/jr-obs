import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../components/jobs/HandoverReadinessCard.tsx", import.meta.url), "utf8");

test("handover readiness card renders ready and blocked states", () => {
  assert.match(source, /Ready for handover/);
  assert.match(source, /Handover blocked/);
  assert.match(source, /readiness\.ready/);
  assert.match(source, /readiness\.blockers\.map/);
  assert.match(source, /readiness\.blockerCount/);
});

test("handover readiness card exposes status updates accessibly", () => {
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /aria-hidden="true"/);
});

test("handover readiness card keeps blocker content mobile safe", () => {
  assert.match(source, /min-w-0/);
  assert.match(source, /break-words/);
  assert.match(source, /shrink-0/);
});
