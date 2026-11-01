import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildQaInspection, completeQaInspection, failedQaTask, jobQaTypes, qaCompletion, qaSummary } from "../lib/jobQa-core.mjs";

test("job QA exposes each roadmap inspection type", () => {
  assert.deepEqual(jobQaTypes, ["First fix", "Second fix", "Testing", "Commissioning", "Handover"]);
});

test("QA inspections start pending with a deterministic checklist", () => {
  const inspection = buildQaInspection({ id: "qa-1", jobId: "job-1", type: "First fix", inspectorName: "Jake", now: "2026-08-02T10:00:00.000Z" });
  assert.equal(inspection.result, "Pending");
  assert.equal(inspection.checks.length, 4);
  assert.equal(qaCompletion(inspection), 0);
});

test("passing requires every checklist item", () => {
  const inspection = buildQaInspection({ id: "qa-1", jobId: "job-1", type: "Testing", inspectorName: "Jake", now: "2026-08-02T10:00:00.000Z" });
  assert.throws(() => completeQaInspection({ inspection, result: "Pass", now: "2026-08-02T11:00:00.000Z" }), /Complete every checklist item/);
  const checked = { ...inspection, checks: inspection.checks.map((check) => ({ ...check, completed: true })) };
  const passed = completeQaInspection({ inspection: checked, result: "Pass", now: "2026-08-02T11:00:00.000Z" });
  assert.equal(passed.result, "Pass");
  assert.equal(qaCompletion(passed), 100);
});

test("failed QA creates one linked snag action", () => {
  const inspection = buildQaInspection({ id: "qa-1", jobId: "job-1", type: "Handover", inspectorName: "Jake", notes: "Certificate missing", now: "2026-08-02T10:00:00.000Z" });
  const failed = completeQaInspection({ inspection, result: "Fail", now: "2026-08-02T11:00:00.000Z" });
  const task = failedQaTask({ inspection: failed, taskId: "snag-1", now: "2026-08-02T11:00:00.000Z" });
  assert.equal(task.jobId, "job-1");
  assert.equal(task.type, "Snag");
  assert.equal(task.priority, "High");
});

test("QA summary separates passed failed and pending inspections", () => {
  const inspections = [
    { jobId: "job-1", result: "Pass", checks: [{ completed: true }] },
    { jobId: "job-1", result: "Fail", checks: [{ completed: false }] },
    { jobId: "job-1", result: "Pending", checks: [{ completed: true }, { completed: false }] },
    { jobId: "job-2", result: "Pass", checks: [{ completed: true }] },
  ];
  assert.deepEqual(qaSummary(inspections, "job-1"), { total: 3, passed: 1, failed: 1, pending: 1, completion: 50 });
});

test("mobile QA route uses cloud collections and is reachable from navigation", () => {
  const page = fs.readFileSync("app/field/qa/page.tsx", "utf8");
  const navigation = fs.readFileSync("components/navigation.ts", "utf8");
  const collections = fs.readFileSync("lib/cloud/coreBusinessCollections.ts", "utf8");
  assert.match(page, /useJobQaInspectionsCollection/);
  assert.match(page, /failedQaTask/);
  assert.match(navigation, /Mobile QA Inspections/);
  assert.match(navigation, /\/field\/qa/);
  assert.match(collections, /jr-os-job-qa-inspections/);
});
