import assert from "node:assert/strict";
import test from "node:test";
import { calculateEarthFaultLoopImpedance, earthFaultLoopSummary, maximumPermittedEarthFaultLoop, prospectiveEarthFaultCurrent } from "../lib/earthFaultLoopCalculator-core.mjs";

const valid = { nominalVoltage: 230, externalEarthFaultLoopOhms: 0.35, lineConductorResistanceOhms: 0.18, cpcResistanceOhms: 0.3, tabulatedMaximumZsOhms: 1.37, permittedPercentage: 80 };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test("earth fault calculation preserves the known Ze + R1 + R2 assessment", () => {
  const result = earthFaultLoopSummary(valid);
  close(calculateEarthFaultLoopImpedance(valid), 0.83);
  close(result.calculatedZsOhms, 0.83);
  assert.equal(result.permittedMaximumZsOhms, 1.096);
  close(result.marginOhms, 0.266);
  close(result.prospectiveEarthFaultCurrentAmps, 230 / 0.83);
  assert.equal(result.hasCompleteInputs, true);
  assert.equal(result.withinSelectedLimit, true);
  assert.deepEqual(result.errors, []);
});

test("earth fault comparison distinguishes below, equal and above the selected limit without rounding", () => {
  const equal = { ...valid, externalEarthFaultLoopOhms: 0.4, lineConductorResistanceOhms: 0.3, cpcResistanceOhms: 0.3, tabulatedMaximumZsOhms: 1, permittedPercentage: 100 };
  assert.equal(earthFaultLoopSummary(equal).withinSelectedLimit, true);
  assert.equal(earthFaultLoopSummary(equal).marginOhms, 0);
  const over = earthFaultLoopSummary({ ...equal, cpcResistanceOhms: 0.3000001 });
  assert.equal(over.withinSelectedLimit, false);
  assert.ok(over.marginOhms < 0);
});

for (const key of Object.keys(valid)) {
  test(`earth fault ${key} must be an explicit valid number before assessment`, () => {
    for (const value of [undefined, null, "", "  ", "invalid", true, false, [], {}, Infinity, NaN, -1, "0x10"]) {
      const result = earthFaultLoopSummary({ ...valid, [key]: value });
      assert.equal(result.hasCompleteInputs, false, `${key}: ${String(value)}`);
      assert.equal(result.withinSelectedLimit, false);
      assert.equal(result.marginOhms, null);
      assert.ok(result.errors.length > 0);
    }
  });
}

test("explicit zero resistance is allowed only when the total impedance remains positive", () => {
  assert.equal(earthFaultLoopSummary({ ...valid, cpcResistanceOhms: "0" }).hasCompleteInputs, true);
  const zero = earthFaultLoopSummary({ ...valid, externalEarthFaultLoopOhms: 0, lineConductorResistanceOhms: 0, cpcResistanceOhms: 0 });
  assert.equal(zero.withinSelectedLimit, false);
  assert.equal(zero.calculatedZsOhms, null);
  assert.equal(zero.prospectiveEarthFaultCurrentAmps, null);
});

test("invalid resistance cannot produce a partial calculated impedance", () => {
  assert.equal(calculateEarthFaultLoopImpedance({ ...valid, cpcResistanceOhms: "" }), null);
  assert.equal(calculateEarthFaultLoopImpedance({ externalEarthFaultLoopOhms: -1, lineConductorResistanceOhms: "invalid", cpcResistanceOhms: 0.25 }), null);
});

test("earth fault limits reject invalid percentages instead of clamping or defaulting them", () => {
  for (const value of [0, -20, 120, "", "invalid", null, Infinity]) {
    assert.equal(maximumPermittedEarthFaultLoop({ tabulatedMaximumZsOhms: 2, permittedPercentage: value }), null);
    assert.equal(earthFaultLoopSummary({ ...valid, permittedPercentage: value }).withinSelectedLimit, false);
  }
  assert.equal(maximumPermittedEarthFaultLoop({ tabulatedMaximumZsOhms: 2 }), 2);
  assert.equal(earthFaultLoopSummary({ ...valid, permittedPercentage: undefined }).withinSelectedLimit, false);
});

test("prospective current never substitutes a default for an explicitly invalid voltage", () => {
  assert.equal(prospectiveEarthFaultCurrent({ nominalVoltage: 230, earthFaultLoopImpedanceOhms: 0.5 }), 460);
  for (const value of [0, "", "invalid", null, Infinity]) assert.equal(prospectiveEarthFaultCurrent({ nominalVoltage: value, earthFaultLoopImpedanceOhms: 0.5 }), null);
  assert.equal(prospectiveEarthFaultCurrent({ nominalVoltage: 230, earthFaultLoopImpedanceOhms: 0 }), null);
});

test("earth fault overflow and underflow cannot yield an apparently valid assessment", () => {
  for (const changes of [
    { externalEarthFaultLoopOhms: 1e308, lineConductorResistanceOhms: 1e308 },
    { externalEarthFaultLoopOhms: Number.MIN_VALUE, lineConductorResistanceOhms: 0, cpcResistanceOhms: 0 },
    { tabulatedMaximumZsOhms: Number.MIN_VALUE, permittedPercentage: Number.MIN_VALUE },
    { nominalVoltage: Number.MIN_VALUE, externalEarthFaultLoopOhms: 1e308 },
  ]) {
    const result = earthFaultLoopSummary({ ...valid, ...changes });
    assert.equal(result.hasCompleteInputs, false);
    assert.equal(result.withinSelectedLimit, false);
    assert.equal(result.marginOhms, null);
    assert.ok(result.errors.length);
  }
});

test("earth fault missing input is unassessed and numeric strings remain supported", () => {
  assert.equal(earthFaultLoopSummary().withinSelectedLimit, false);
  assert.equal(earthFaultLoopSummary({ ...valid, tabulatedMaximumZsOhms: undefined }).hasVerifiedLimit, false);
  assert.equal(earthFaultLoopSummary(Object.fromEntries(Object.entries(valid).map(([key, value]) => [key, String(value)]))).withinSelectedLimit, true);
});
