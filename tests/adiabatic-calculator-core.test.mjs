import assert from "node:assert/strict";
import test from "node:test";
import { adiabaticSummary, maximumAdiabaticFaultCurrent, requiredAdiabaticConductorSize } from "../lib/adiabaticCalculator-core.mjs";

const valid = { faultCurrentAmps: 1000, disconnectionTimeSeconds: 0.4, kFactor: 115, conductorSizeMm2: 6 };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test("adiabatic known current/time example includes energy and conductor withstand", () => {
  const result = adiabaticSummary(valid);
  close(result.requiredConductorSizeMm2, Math.sqrt(400000) / 115);
  close(requiredAdiabaticConductorSize(valid), Math.sqrt(400000) / 115);
  close(result.maximumFaultCurrentAmps, 690 / Math.sqrt(0.4));
  assert.equal(result.faultEnergyA2s, 400000);
  assert.equal(result.conductorWithstandA2s, 476100);
  assert.equal(result.hasCompleteInputs, true);
  assert.equal(result.conductorIsAdequate, true);
  assert.ok(result.sizeMarginMm2 > 0);
});

test("adiabatic equality, undersizing and unrounded borderline sizing remain distinct", () => {
  const equal = { ...valid, faultCurrentAmps: 1150, disconnectionTimeSeconds: 1, conductorSizeMm2: 10 };
  assert.equal(adiabaticSummary(equal).requiredConductorSizeMm2, 10);
  assert.equal(adiabaticSummary(equal).conductorIsAdequate, true);
  assert.equal(adiabaticSummary(equal).sizeMarginMm2, 0);
  const undersized = adiabaticSummary({ ...equal, conductorSizeMm2: 9.9999999 });
  assert.equal(undersized.conductorIsAdequate, false);
  assert.ok(undersized.sizeMarginMm2 < 0);
});

test("manufacturer energy gives equivalent sizing without inventing a fault current", () => {
  const result = adiabaticSummary({ method: "energy", letThroughEnergyA2s: 400000, disconnectionTimeSeconds: 0.01, kFactor: 115, conductorSizeMm2: 6 });
  assert.equal(result.requiredConductorSizeMm2, adiabaticSummary(valid).requiredConductorSizeMm2);
  assert.equal(result.faultEnergyA2s, 400000);
  assert.equal(result.conductorIsAdequate, true);
  assert.equal(result.maximumFaultCurrentAmps, null);
  assert.equal(result.faultCurrentAmps, null);
});

for (const key of Object.keys(valid)) {
  test(`adiabatic ${key} rejects missing, malformed, non-positive and non-finite data`, () => {
    for (const value of [undefined, null, "", " ", "invalid", "0x10", true, false, [], {}, 0, -1, Infinity, NaN]) {
      const result = adiabaticSummary({ ...valid, [key]: value });
      assert.equal(result.hasCompleteInputs, false, `${key}: ${String(value)}`);
      assert.equal(result.conductorIsAdequate, false);
      assert.equal(result.requiredConductorSizeMm2, null);
      assert.equal(result.sizeMarginMm2, null);
      assert.ok(result.errors.length);
    }
  });
}

test("simple current/time method only assesses its supported time range", () => {
  for (const time of [0.099999, 5.000001, 10]) {
    const input = { ...valid, disconnectionTimeSeconds: time };
    assert.equal(adiabaticSummary(input).hasCompleteInputs, false);
    assert.equal(requiredAdiabaticConductorSize(input), null);
    assert.equal(maximumAdiabaticFaultCurrent(input), null);
  }
  for (const time of [0.1, 5]) assert.equal(adiabaticSummary({ ...valid, disconnectionTimeSeconds: time }).hasCompleteInputs, true);
});

test("energy method requires actual device energy and an in-scope clearing time", () => {
  const input = { ...valid, method: "energy", letThroughEnergyA2s: 400000 };
  for (const energy of [undefined, "", "invalid", 0, -1, Infinity, null, true, []]) assert.equal(adiabaticSummary({ ...input, letThroughEnergyA2s: energy }).hasCompleteInputs, false);
  for (const time of [undefined, "", 0, -1, 5.000001]) assert.equal(adiabaticSummary({ ...input, disconnectionTimeSeconds: time }).hasCompleteInputs, false);
  assert.equal(adiabaticSummary({ ...input, disconnectionTimeSeconds: 5 }).hasCompleteInputs, true);
});

test("selected method uses only its own fault inputs and rejects an unknown method", () => {
  assert.equal(adiabaticSummary({ ...valid, letThroughEnergyA2s: "invalid" }).hasCompleteInputs, true);
  assert.equal(adiabaticSummary({ ...valid, method: "energy", faultCurrentAmps: "invalid", letThroughEnergyA2s: 400000 }).hasCompleteInputs, true);
  for (const method of ["unknown", "", null, true, []]) assert.equal(adiabaticSummary({ ...valid, method }).hasCompleteInputs, false);
  assert.equal(adiabaticSummary().hasCompleteInputs, false);
});

test("adiabatic overflow or underflow never becomes a zero-area approval", () => {
  for (const changes of [
    { faultCurrentAmps: 1e308 }, { faultCurrentAmps: Number.MIN_VALUE },
    { kFactor: Number.MIN_VALUE }, { kFactor: 1e308 }, { conductorSizeMm2: 1e308 },
    { method: "energy", letThroughEnergyA2s: Number.MIN_VALUE, kFactor: 1e200 },
  ]) {
    const result = adiabaticSummary({ ...valid, ...changes });
    assert.equal(result.hasCompleteInputs, false);
    assert.equal(result.conductorIsAdequate, false);
    assert.equal(result.requiredConductorSizeMm2, null);
    assert.equal(result.faultEnergyA2s, null);
    assert.equal(result.conductorWithstandA2s, null);
  }
});

test("adiabatic supports decimal and scientific numeric strings without changing inputs", () => {
  const input = Object.freeze({ faultCurrentAmps: "1e3", disconnectionTimeSeconds: ".4", kFactor: " 115 ", conductorSizeMm2: "6" });
  assert.equal(adiabaticSummary(input).requiredConductorSizeMm2, adiabaticSummary(valid).requiredConductorSizeMm2);
  assert.equal(input.faultCurrentAmps, "1e3");
  assert.match(adiabaticSummary(input).assumptions.join(" "), /verified k-factor/);
});
