import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("../app/jobs/[id]/workspace/page.tsx", import.meta.url), "utf8");

test("mobile job workspace loads and updates the existing job progress collection", () => {
  assert.match(workspace, /useJobProgressCollection/);
  assert.match(workspace, /const progress = useJobProgressCollection\(\)/);
  assert.match(workspace, /progress\.items\.find\(\(item\) => item\.jobId === jobId\)/);
  assert.match(workspace, /progress\.setItems/);
});

test("mobile job workspace edits only operational progress metrics", () => {
  assert.match(workspace, /normaliseJobProgress/);
  assert.match(workspace, /Save field progress/);
  assert.match(workspace, /Operational progress saved and queued for secure sync/);
  for (const metric of ["overall", "firstFix", "secondFix", "testing", "certificates", "materials"]) {
    assert.match(workspace, new RegExp(`key: \"${metric}\"`));
  }
  assert.match(workspace, /id=\{`progress-\$\{key\}`\}/);
  assert.doesNotMatch(workspace, /id=\{?`progress-payments`/);
  assert.match(workspace, /!fieldWorkspace \? <div[^>]*>\{progressBar\("Payments \(office controlled\)", progressValue\.payments\)\}<\/div> : null/);
  assert.match(workspace, /manual: fieldWorkspace \? fieldManual : normalised/);
  assert.doesNotMatch(workspace, /payments: progressValue\.payments/);
});

test("mobile job workspace creates one canonical progress record shape when none exists", () => {
  assert.match(workspace, /`job-progress-\$\{jobId\}`/);
  assert.match(workspace, /fieldWorkspace \? \{\} : \{ suggestions: progressRecord\?\.suggestions \?\? \[\] \}/);
  assert.match(workspace, /No saved progress record yet\. Saving will create one for this assigned job\./);
});
