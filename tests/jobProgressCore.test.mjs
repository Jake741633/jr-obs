import assert from "node:assert/strict";
import test from "node:test";

import {
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
