import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/field/qa/page.tsx", import.meta.url), "utf8");
const finishInspection = page.slice(page.indexOf("function finishInspection"), page.indexOf("\n\n  return <div"));

test("field QA reports device-local completion while each collection target syncs independently", () => {
  assert.doesNotMatch(finishInspection, /QA passed\./);
  assert.doesNotMatch(finishInspection, /QA failed and a linked snag was created\./);
  assert.match(finishInspection, /`\$\{inspection\.type\} QA pass recorded on this device\. The inspection and timeline entry sync independently\.`/);
  assert.match(finishInspection, /`\$\{inspection\.type\} QA fail recorded on this device\. The inspection, timeline entry and linked snag sync independently\.`/);
  assert.doesNotMatch(finishInspection, /successfully synced|cloud-confirmed|all targets synced/i);
});

test("field QA keeps inspection, timeline and optional snag writes before truthful feedback", () => {
  const inspectionWrite = finishInspection.indexOf("inspections.setItems");
  const timelineWrite = finishInspection.indexOf("timeline.setItems");
  const failedTask = finishInspection.indexOf("const task = failedQaTask");
  const taskWrite = finishInspection.indexOf("tasks.setItems");
  const feedback = finishInspection.indexOf("setMessage(result === \"Pass\"");

  assert.ok(inspectionWrite >= 0 && inspectionWrite < timelineWrite, "the inspection update must remain the first optimistic target");
  assert.ok(timelineWrite < failedTask && failedTask < taskWrite, "the timeline update must remain before the optional failed-QA snag write");
  assert.ok(taskWrite < feedback, "feedback must remain after all optimistic target writes have been initiated");
  assert.match(finishInspection, /if \(task\) \{[\s\S]*tasks\.setItems/);
});
