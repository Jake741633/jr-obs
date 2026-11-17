import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/field/qa/page.tsx", import.meta.url), "utf8");
const finishInspection = page.slice(page.indexOf("function finishInspection"), page.indexOf("\n\n  return <div"));

test("field QA reports device-local completion while each collection target syncs independently", () => {
  assert.doesNotMatch(finishInspection, /QA passed\./);
  assert.doesNotMatch(finishInspection, /QA failed and a linked snag was created\./);
  assert.match(finishInspection, /`\$\{updated\.type\} QA pass recorded on this device\. The inspection and timeline entry sync independently\.`/);
  assert.match(finishInspection, /`\$\{updated\.type\} QA fail recorded on this device\. The inspection, timeline entry and linked snag sync independently\.`/);
  assert.doesNotMatch(finishInspection, /successfully synced|cloud-confirmed|all targets synced/i);
});

test("field QA confirms the result and its linked writes before reporting capture", () => {
  const inspectionWrite = finishInspection.indexOf("updated = updatePendingInspection");
  const followUp = finishInspection.indexOf("saveFollowUpRecords(updated)");
  const feedback = finishInspection.indexOf("setMessage(result === \"Pass\"");
  const saveRecords = page.slice(page.indexOf("function saveFollowUpRecords"), page.indexOf("function retryFollowUp"));

  assert.ok(inspectionWrite >= 0 && inspectionWrite < followUp && followUp < feedback);
  assert.match(finishInspection, /return \{ \.\.\.resolved, completion \}/);
  assert.match(finishInspection, /if \(!saved\) \{[\s\S]*Review its follow-up records below[\s\S]*return;/);
  assert.match(saveRecords, /timeline\.createItem[\s\S]*failedQaTask[\s\S]*tasks\.createItem/);
});
