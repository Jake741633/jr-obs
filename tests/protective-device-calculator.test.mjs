import assert from "node:assert/strict";
import test from "node:test";
import { protectiveDeviceSummary } from "../lib/protectiveDeviceCalculator-core.mjs";

const input = {
  designCurrentAmps: 20, deviceRatingAmps: 25, cableCapacityAmps: 32,
  overloadOperatingCurrentAmps: 36.25, breakingCapacityKa: 6, prospectiveFaultCurrentKa: 5,
  deviceReference: "Example device / verified standard and rating",
  evidenceReference: "Example manufacturer revision / 230 V circuit evidence",
};
const checks = ["loadWithinRating", "ratingWithinCable", "overloadWithinLimit", "breakingCapacityAdequate"];

test("known device evidence produces four independent checks and correct margins", () => {
  const result = protectiveDeviceSummary(input);
  assert.equal(result.hasCompleteInputs, true);
  assert.equal(result.meetsEnteredChecks, true);
  for (const check of checks) assert.equal(result[check], true);
  assert.equal(result.maximumOverloadOperatingCurrentAmps, 46.4);
  assert.ok(Math.abs(result.overloadMarginAmps - 10.15) < 1e-12);
  assert.equal(result.breakingCapacityMarginKa, 1);
  assert.deepEqual(result.errors, []);
});

test("each failed criterion independently blocks an overall positive result", () => {
  for (const [patch, failed] of [
    [{ designCurrentAmps: 26 }, "loadWithinRating"],
    [{ deviceRatingAmps: 33, overloadOperatingCurrentAmps: 40 }, "ratingWithinCable"],
    [{ overloadOperatingCurrentAmps: 50 }, "overloadWithinLimit"],
    [{ prospectiveFaultCurrentKa: 7 }, "breakingCapacityAdequate"],
  ]) {
    const result = protectiveDeviceSummary({ ...input, ...patch });
    assert.equal(result.hasCompleteInputs, true);
    assert.equal(result.meetsEnteredChecks, false);
    for (const check of checks) assert.equal(result[check], check !== failed, check);
  }
  assert.equal(protectiveDeviceSummary({ ...input, prospectiveFaultCurrentKa: 7 }).breakingCapacityMarginKa, -1);
});

test("exact equality passes while unrounded values immediately beyond each limit fail", () => {
  const boundary = { ...input, designCurrentAmps: 32, deviceRatingAmps: 32, cableCapacityAmps: 32, overloadOperatingCurrentAmps: 46.4, prospectiveFaultCurrentKa: 6 };
  const result = protectiveDeviceSummary(boundary);
  assert.equal(result.meetsEnteredChecks, true);
  assert.equal(result.overloadMarginAmps, 0);
  assert.equal(result.breakingCapacityMarginKa, 0);
  for (const patch of [{ designCurrentAmps: 32.0000001 }, { deviceRatingAmps: 32.0000001 }, { overloadOperatingCurrentAmps: 46.4000001 }, { prospectiveFaultCurrentKa: 6.0000001 }]) {
    assert.equal(protectiveDeviceSummary({ ...boundary, ...patch }).meetsEnteredChecks, false);
  }
});

test("all numeric evidence must be explicit positive finite decimal data", () => {
  const invalid = [undefined, null, "", " ", "bad", "0x20", true, false, [], {}, 0, -1, Infinity, NaN];
  for (const field of ["designCurrentAmps", "deviceRatingAmps", "cableCapacityAmps", "overloadOperatingCurrentAmps", "breakingCapacityKa", "prospectiveFaultCurrentKa"]) for (const value of invalid) {
    const result = protectiveDeviceSummary({ ...input, [field]: value });
    assert.equal(result.hasCompleteInputs, false, `${field}=${String(value)}`);
    assert.equal(result.meetsEnteredChecks, false);
    for (const check of checks) assert.equal(result[check], false);
    assert.equal(result.maximumOverloadOperatingCurrentAmps, null);
    assert.equal(result.overloadMarginAmps, null);
    assert.equal(result.breakingCapacityMarginKa, null);
    assert.ok(result.errors.length);
  }
});

test("identification and evidence cannot be omitted or coerced from other data types", () => {
  for (const field of ["deviceReference", "evidenceReference"]) for (const value of [undefined, null, "", "  ", 123, ["reference"], {}]) {
    assert.equal(protectiveDeviceSummary({ ...input, [field]: value }).hasCompleteInputs, false);
  }
  const result = protectiveDeviceSummary({ ...input, deviceReference: "  Device A  ", evidenceReference: "  Drawing 1 / data sheet 2  " });
  assert.equal(result.deviceReference, "Device A");
  assert.equal(result.evidenceReference, "Drawing 1 / data sheet 2");
});

test("conventional overload input at or below normal rating cannot create a favourable assessment", () => {
  for (const overloadOperatingCurrentAmps of [20, 25]) {
    const result = protectiveDeviceSummary({ ...input, overloadOperatingCurrentAmps });
    assert.equal(result.hasCompleteInputs, false);
    assert.match(result.errors.join(" "), /conventional overload/);
    assert.equal(result.meetsEnteredChecks, false);
  }
});

test("overload limit overflow is unavailable instead of creating an unlimited cable rating", () => {
  const result = protectiveDeviceSummary({ ...input, cableCapacityAmps: Number.MAX_VALUE });
  assert.equal(result.hasCompleteInputs, false);
  assert.equal(result.meetsEnteredChecks, false);
  assert.equal(result.maximumOverloadOperatingCurrentAmps, null);
});

test("decimal strings and explicit kA units preserve the entered magnitude", () => {
  const result = protectiveDeviceSummary({ ...input, breakingCapacityKa: "6", prospectiveFaultCurrentKa: "5.999", overloadOperatingCurrentAmps: "3.625e1" });
  assert.equal(result.meetsEnteredChecks, true);
  assert.ok(Math.abs(result.breakingCapacityMarginKa - .001) < 1e-12);
});

test("scope excludes automatic selection, backup credit and simple earth-loop fault-current substitution", () => {
  const assumptions = protectiveDeviceSummary(input).assumptions.join(" ");
  for (const phrase of [/Design aid only/, /current BS 7671/, /no credit for upstream backup/, /Selectivity/, /simple voltage\/Zs/, /conventional operating time/]) assert.match(assumptions, phrase);
  assert.equal(protectiveDeviceSummary().hasCompleteInputs, false);
});
