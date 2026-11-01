import assert from "node:assert/strict";
import test from "node:test";
import { deviceCoordinationSummary } from "../lib/deviceCoordinationCalculator-core.mjs";
import { buildCalculationSnapshot, createCalculationRecord, isCalculationRecord } from "../lib/calculationRecords-core.mjs";

// Synthetic evidence for software tests, not a manufacturer-approved device pair.
const input = {
  upstreamDeviceReference: "Test manufacturer / upstream model / 100 A settings / standard",
  downstreamDeviceReference: "Test manufacturer / downstream model / 32 A settings / standard",
  supplyVoltageVolts: "400", supplyConditions: "AC 50 Hz, 3 poles, line-line, grid case",
  circuitEvidenceReference: "Synthetic rating sheets rev 2 and site fault study rev 3",
  upstreamBreakingCapacityKa: "25", upstreamFaultCurrentKa: "20",
  downstreamBreakingCapacityKa: "6", downstreamFaultCurrentKa: "10",
  backupMode: "manufacturer", backupLimitKa: "15", backupEvidenceReference: "Synthetic backup table rev 2 page 5 / matched conditions",
  selectivityMode: "documented", selectivityLimitKa: "12", selectivityEvidenceReference: "Synthetic selectivity table rev 2 page 9 / matched conditions",
  evidenceConfirmed: true,
};
const nullableOutputs = ["effectiveDownstreamCapacityKa", "upstreamCapacityAdequate", "downstreamStandaloneAdequate", "downstreamCapacityAdequate", "selectivityCovered", "upstreamMarginKa", "downstreamMarginKa", "selectivityMarginKa"];

test("coordination compares the two locations independently and preserves a failed stand-alone rating", () => {
  const result = deviceCoordinationSummary(input);
  assert.equal(result.hasCompleteInputs, true);
  assert.equal(result.meetsEnteredChecks, true);
  assert.equal(result.upstreamCapacityAdequate, true);
  assert.equal(result.downstreamStandaloneAdequate, false);
  assert.equal(result.downstreamCapacityAdequate, true);
  assert.equal(result.selectivityCovered, true);
  assert.equal(result.upstreamMarginKa, 5);
  assert.equal(result.downstreamMarginKa, 5);
  assert.equal(result.selectivityMarginKa, 2);
});

test("backup evidence cannot grant upstream capacity or imply selectivity", () => {
  const upstream = deviceCoordinationSummary({ ...input, upstreamFaultCurrentKa: "26" });
  assert.equal(upstream.upstreamCapacityAdequate, false);
  assert.equal(upstream.meetsEnteredChecks, false);
  assert.equal(upstream.upstreamMarginKa, -1);
  const unavailable = deviceCoordinationSummary({ ...input, selectivityMode: "unassessed", selectivityLimitKa: "1000" });
  assert.equal(unavailable.hasCompleteInputs, true);
  assert.equal(unavailable.selectivityCovered, null);
  assert.equal(unavailable.selectivityLimitKa, null);
  assert.equal(unavailable.meetsEnteredChecks, false);
  const insufficient = deviceCoordinationSummary({ ...input, downstreamFaultCurrentKa: "16", selectivityLimitKa: "18" });
  assert.equal(insufficient.selectivityCovered, true);
  assert.equal(insufficient.downstreamCapacityAdequate, false);
  assert.equal(insufficient.meetsEnteredChecks, false);
});

test("no-backup mode uses only the stand-alone rating and ignores stale hidden evidence", () => {
  const result = deviceCoordinationSummary({ ...input, backupMode: "none", backupLimitKa: "malformed", backupEvidenceReference: null });
  assert.equal(result.hasCompleteInputs, true);
  assert.equal(result.effectiveDownstreamCapacityKa, 6);
  assert.equal(result.downstreamCapacityAdequate, false);
  assert.equal(result.downstreamMarginKa, -4);
  assert.equal(result.backupLimitKa, null);
});

test("breaking equality is accepted, selectivity equality requires review, comparisons never round", () => {
  const boundary = { ...input, upstreamFaultCurrentKa: "25", downstreamFaultCurrentKa: "15", selectivityLimitKa: "15" };
  const result = deviceCoordinationSummary(boundary);
  assert.equal(result.upstreamCapacityAdequate, true);
  assert.equal(result.downstreamCapacityAdequate, true);
  assert.equal(result.selectivityCovered, false);
  assert.equal(result.selectivityMarginKa, 0);
  assert.equal(deviceCoordinationSummary({ ...boundary, downstreamFaultCurrentKa: "14.999999999" }).meetsEnteredChecks, true);
  assert.equal(deviceCoordinationSummary({ ...boundary, upstreamFaultCurrentKa: "25.000000001" }).upstreamCapacityAdequate, false);
  assert.equal(deviceCoordinationSummary({ ...boundary, downstreamFaultCurrentKa: "15.000000001" }).downstreamCapacityAdequate, false);
  assert.equal(deviceCoordinationSummary({ ...input, selectivityLimitKa: "0" }).selectivityCovered, false);
});

test("every required numeric field rejects missing, coerced, non-finite and non-positive values", () => {
  for (const field of ["supplyVoltageVolts", "upstreamBreakingCapacityKa", "upstreamFaultCurrentKa", "downstreamBreakingCapacityKa", "downstreamFaultCurrentKa", "backupLimitKa", "selectivityLimitKa"]) {
    for (const value of [undefined, null, "", " ", "T", "0x10", true, [], {}, -1, Infinity, NaN, "1e309", "1e-999", ...(field === "selectivityLimitKa" ? [] : [0])]) {
      const result = deviceCoordinationSummary({ ...input, [field]: value });
      assert.equal(result.hasCompleteInputs, false, `${field}: ${String(value)}`);
      assert.equal(result.meetsEnteredChecks, false);
      for (const output of nullableOutputs) assert.equal(result[output], null, output);
      assert.equal(buildCalculationSnapshot("device-coordination", { ...input, [field]: value }), null);
    }
  }
});

test("all active source references, explicit modes and exact applicability confirmation are required", () => {
  for (const field of ["upstreamDeviceReference", "downstreamDeviceReference", "supplyConditions", "circuitEvidenceReference", "backupEvidenceReference", "selectivityEvidenceReference"]) for (const value of [undefined, null, "", " ", 12, true, [], {}, "x".repeat(2001)]) {
    assert.equal(deviceCoordinationSummary({ ...input, [field]: value }).hasCompleteInputs, false, field);
  }
  for (const patch of [{ backupMode: "" }, { backupMode: "__proto__" }, { selectivityMode: "total" }, { selectivityMode: undefined }, ...[undefined, null, false, "true", 1].map((evidenceConfirmed) => ({ evidenceConfirmed }))]) assert.equal(deviceCoordinationSummary({ ...input, ...patch }).hasCompleteInputs, false);
  assert.equal(deviceCoordinationSummary().hasCompleteInputs, false);
});

test("contradictory backup capacity is unavailable, while finite extreme inputs do not overflow", () => {
  assert.equal(deviceCoordinationSummary({ ...input, backupLimitKa: "5" }).hasCompleteInputs, false);
  const extreme = deviceCoordinationSummary({ ...input, upstreamBreakingCapacityKa: Number.MAX_VALUE, selectivityLimitKa: Number.MAX_VALUE });
  assert.equal(extreme.hasCompleteInputs, true);
  for (const field of ["upstreamMarginKa", "downstreamMarginKa", "selectivityMarginKa"]) assert.equal(Number.isFinite(extreme[field]), true);
});

test("coordination snapshots are immutable, preserve both sources and retain failed comparisons", () => {
  const mutable = { ...input };
  const record = createCalculationRecord({ id: "coordination-a", createdAt: "2026-10-10T13:00:00Z", title: "DB1 / circuit A", evidenceReference: "Design review A", kind: "device-coordination", input: mutable });
  mutable.backupEvidenceReference = "Changed evidence";
  assert.equal(isCalculationRecord(JSON.parse(JSON.stringify(record))), true);
  assert.equal(record.snapshot.assessment, "Meets entered checks");
  assert.equal(record.snapshot.inputs.find((row) => row.label.startsWith("Backup document")).value, input.backupEvidenceReference);
  assert.equal(record.snapshot.outputs.find((row) => row.label === "Downstream stand-alone capacity").value, "Review required");
  const failed = buildCalculationSnapshot("device-coordination", { ...input, upstreamFaultCurrentKa: "30" });
  assert.equal(failed.assessment, "Review required");
  assert.equal(failed.outputs.find((row) => row.label === "Upstream capacity margin").value, -5);
});

test("unassessed snapshots never turn missing selectivity into a pass and exclude inactive evidence", () => {
  const snapshot = buildCalculationSnapshot("device-coordination", { ...input, backupMode: "none", selectivityMode: "unassessed", downstreamFaultCurrentKa: "5" });
  assert.equal(snapshot.assessment, "Review required");
  assert.equal(snapshot.outputs.find((row) => row.label === "Documented selectivity comparison").value, "Not assessed");
  assert.equal(snapshot.inputs.some((row) => row.label.startsWith("Backup document") || row.label.startsWith("Selectivity document") || row.label.startsWith("Documented")), false);
  assert.equal(snapshot.outputs.some((row) => row.label.startsWith("Selectivity margin")), false);
});
