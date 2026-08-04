import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("../app/jobs/[id]/workspace/page.tsx", import.meta.url), "utf8");

test("mobile job workspace loads the existing job progress collection", () => {
  assert.match(workspace, /useJobProgressCollection/);
  assert.match(workspace, /const progress = useJobProgressCollection\(\)/);
  assert.match(workspace, /progress\.items\.find\(\(item\) => item\.jobId === jobId\)/);
});

test("mobile job workspace normalises and displays operational progress metrics", () => {
  assert.match(workspace, /normaliseJobProgress/);
  assert.match(workspace, /progressValue\.overall/);
  for (const metric of ["firstFix", "secondFix", "testing", "certificates", "materials", "payments"]) {
    assert.match(workspace, new RegExp(`progressValue\\.${metric}`));
  }
  assert.match(workspace, /Read-only snapshot from the existing job progress record/);
});

test("mobile job workspace keeps progress editing out of this read-only slice", () => {
  assert.doesNotMatch(workspace, /progress\.setItems/);
  assert.match(workspace, /No saved progress record yet/);
});
