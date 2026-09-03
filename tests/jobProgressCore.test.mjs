import assert from "node:assert/strict";
import test from "node:test";

import {
  jobHandoverReadiness,
  jobProgressWarnings,
  normaliseJobProgress,
  suggestJobProgress,
  updateManualJobProgress,
} from "../lib/jobProgress-core.mjs";

test("job progress normalisation clamps every supported section", () => {
  assert.deepEqual(normaliseJobProgress({ overall: 120, firstFix: -4, secondFix: 49.6, testing: "80", certificates: Number.NaN, materials: Infinity, payments: 100 }), {
    overall: 100,
    firstFix: 0,
    secondFix: 50,
    testing: 80,
    certificates: 0,
    materials: 0,
    payments: 100,
  });
});

test("manual progress updates preserve untouched sections without mutating the source", () => {
  const source = { overall: 20, firstFix: 40, secondFix: 0, testing: 0, certificates: 0, materials: 30, payments: 10 };
  const updated = updateManualJobProgress(source, { overall: 55, materials: 100 }, "2026-08-02T08:00:00.000Z", "Jake");
  assert.equal(updated.overall, 55);
  assert.equal(updated.firstFix, 40);
  assert.equal(updated.materials, 100);
  assert.equal(updated.source, "Manual");
  assert.equal(updated.updatedBy, "Jake");
  assert.deepEqual(source, { overall: 20, firstFix: 40, secondFix: 0, testing: 0, certificates: 0, materials: 30, payments: 10 });
});

test("suggested progress combines status task completion and operational evidence", () => {
  const suggestion = suggestJobProgress({
    status: "Testing",
    taskCounts: { completed: 6, outstanding: 2 },
    testingComplete: true,
    certificateIssued: false,
    materialsReady: true,
    amountPaid: 750,
    contractValue: 1000,
  });
  assert.equal(suggestion.overall, 75);
  assert.equal(suggestion.firstFix, 100);
  assert.equal(suggestion.secondFix, 100);
  assert.equal(suggestion.testing, 100);
  assert.equal(suggestion.certificates, 0);
  assert.equal(suggestion.materials, 100);
  assert.equal(suggestion.payments, 75);
  assert.equal(suggestion.source, "Suggested");
});

test("progress warnings identify only incomplete handover areas", () => {
  assert.deepEqual(jobProgressWarnings({ testing: 100, certificates: 20, materials: 100, payments: 80 }), [
    "Required certificates may still be outstanding.",
    "The contract is not fully paid.",
  ]);
});

test("handover readiness blocks completion for every unresolved operational area", () => {
  const readiness = jobHandoverReadiness({
    progress: { testing: 75, certificates: 0, materials: 60 },
    outstandingTasks: 2,
    outstandingSnags: 1,
    failedQa: 1,
    pendingQa: 3,
    requiredDocumentsMissing: 2,
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.status, "Handover blocked");
  assert.equal(readiness.blockerCount, 8);
  assert.deepEqual(readiness.blockers, [
    "Complete and record final testing.",
    "Issue all required certificates.",
    "Confirm final materials and returns.",
    "Complete all outstanding job tasks.",
    "Close all outstanding snags.",
    "Resolve all failed QA inspections.",
    "Complete all pending QA inspections.",
    "Attach all required handover documents.",
  ]);
});

test("handover readiness passes only when operational evidence is complete", () => {
  assert.deepEqual(jobHandoverReadiness({
    progress: { testing: 100, certificates: 100, materials: 100 },
    outstandingTasks: 0,
    outstandingSnags: 0,
    failedQa: 0,
    pendingQa: 0,
    requiredDocumentsMissing: 0,
  }), {
    ready: true,
    status: "Ready for handover",
    blockers: [],
    blockerCount: 0,
  });
});

test("handover readiness normalises malformed outstanding counts without inventing blockers", () => {
  const readiness = jobHandoverReadiness({
    progress: { testing: 100, certificates: 100, materials: 100 },
    outstandingTasks: -2,
    outstandingSnags: "invalid",
    failedQa: Number.NaN,
    pendingQa: null,
    requiredDocumentsMissing: undefined,
  });

  assert.equal(readiness.ready, true);
  assert.equal(readiness.blockerCount, 0);
});
