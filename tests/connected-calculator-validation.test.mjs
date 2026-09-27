import assert from "node:assert/strict";
import test from "node:test";
import { electricalLoadSummary, singlePhaseCurrent, threePhaseCurrent, apparentPowerVa } from "../lib/electricalCalculators-core.mjs";
import { voltageDropSummary } from "../lib/voltageDropCalculator-core.mjs";
import { cableSizingSummary, combinedCorrectionFactor } from "../lib/cableSizingCalculator-core.mjs";

const load = { phase: "Single phase", powerWatts: 4600, voltage: 230, powerFactor: 1, efficiency: 1 };
const drop = { phase: "Single phase", nominalVoltage: 230, designCurrentAmps: 20, routeLengthMetres: 30, millivoltsPerAmpMetre: 18, maximumPercent: 5 };
const cable = { designCurrentAmps: 20, ambientTemperatureFactor: 1, groupingFactor: 1, insulationFactor: 1, otherFactor: 1, cableOptions: [{ sizeMm2: 2.5, tabulatedCurrentAmps: 27 }] };
const invalid = [undefined, null, "", " ", "bad", "0x10", [], true, {}, -1, 0, Infinity, NaN];

test("load summaries reject every missing or malformed design input without assumed voltage or unity", () => {
  for (const key of ["powerWatts", "voltage", "powerFactor", "efficiency"]) for (const value of invalid) {
    const result = electricalLoadSummary({ ...load, [key]: value });
    assert.equal(result.hasCompleteInputs, false, `${key}=${String(value)}`);
    assert.equal(result.currentAmps, null);
    assert.equal(result.apparentPowerVa, null);
    assert.equal(result.inputPowerWatts, null);
    assert.ok(result.errors.length);
  }
  for (const phase of [undefined, null, "", "DC"]) assert.equal(electricalLoadSummary({ ...load, phase }).hasCompleteInputs, false);
  for (const key of ["powerFactor", "efficiency"]) assert.equal(electricalLoadSummary({ ...load, [key]: 1.001 }).hasCompleteInputs, false);
});

test("input active power, apparent power and current use the same efficiency basis", () => {
  const result = electricalLoadSummary({ ...load, powerWatts: "8000", powerFactor: ".8", efficiency: ".8" });
  assert.equal(result.inputPowerWatts, 10000);
  assert.equal(result.apparentPowerVa, 12500);
  assert.ok(Math.abs(result.currentAmps * 230 - 12500) < 1e-9);
  const three = electricalLoadSummary({ ...load, phase: "Three phase", voltage: 400, powerFactor: .8, efficiency: .9 });
  assert.ok(Math.abs(three.currentAmps * 400 * Math.sqrt(3) - three.apparentPowerVa) < 1e-9);
  assert.equal(singlePhaseCurrent({ powerWatts: 100 }), null);
  assert.equal(threePhaseCurrent({ powerWatts: 100 }), null);
  assert.equal(apparentPowerVa({ activePowerWatts: 100 }), null);
});

test("invalid voltage-drop values never return zero-drop pass or remaining allowance", () => {
  for (const key of ["nominalVoltage", "designCurrentAmps", "routeLengthMetres", "millivoltsPerAmpMetre", "maximumPercent"]) for (const value of invalid) {
    const result = voltageDropSummary({ ...drop, [key]: value });
    assert.equal(result.hasCompleteInputs, false, `${key}=${String(value)}`);
    assert.equal(result.withinSelectedLimit, false);
    for (const field of ["voltageDropVolts", "voltageDropPercent", "maximumVoltageDropVolts", "remainingVoltageDropVolts"]) assert.equal(result[field], null);
  }
  assert.equal(voltageDropSummary({ ...drop, maximumPercent: 101 }).hasCompleteInputs, false);
  assert.equal(voltageDropSummary({ ...drop, phase: "DC" }).hasCompleteInputs, false);
});

test("invalid factors cannot become unity and invalid options cannot produce a selected cable", () => {
  for (const key of ["designCurrentAmps", "ambientTemperatureFactor", "groupingFactor", "insulationFactor", "otherFactor"]) for (const value of invalid) {
    const result = cableSizingSummary({ ...cable, [key]: value });
    assert.equal(result.hasCompleteInputs, false, `${key}=${String(value)}`);
    assert.equal(result.hasSuitableCable, false);
    assert.equal(result.selectedCable, null);
    assert.equal(result.requiredTabulatedCurrentAmps, null);
  }
  for (const value of invalid) for (const key of ["sizeMm2", "tabulatedCurrentAmps"]) {
    assert.equal(cableSizingSummary({ ...cable, cableOptions: [{ ...cable.cableOptions[0], [key]: value }] }).hasCompleteInputs, false);
  }
  assert.equal(combinedCorrectionFactor({ ambientTemperatureFactor: 1 }), null);
  assert.equal(cableSizingSummary({ ...cable, cableOptions: [] }).hasCompleteInputs, false);
  assert.equal(cableSizingSummary({ ...cable, cableOptions: [null, cable.cableOptions[0]] }).hasSuitableCable, false);
});

test("verified correction factors above unity retain their entered value", () => {
  const result = cableSizingSummary({ ...cable, ambientTemperatureFactor: 1.12, designCurrentAmps: 30 });
  assert.equal(result.combinedCorrectionFactor, 1.12);
  assert.equal(result.hasSuitableCable, true);
  assert.ok(Math.abs(result.requiredTabulatedCurrentAmps - 30 / 1.12) < 1e-12);
});

test("overflow and underflow never produce a load, voltage-drop pass or cable selection", () => {
  for (const input of [{ powerWatts: 1e308, efficiency: 1e-308 }, { powerWatts: 5e-324, voltage: 1e308 }, { voltage: 1e-300, powerFactor: 1e-300 }]) {
    assert.equal(electricalLoadSummary({ ...load, ...input }).hasCompleteInputs, false);
  }
  for (const input of [{ designCurrentAmps: 1e308 }, { millivoltsPerAmpMetre: 5e-324, designCurrentAmps: .1 }, { nominalVoltage: 5e-324 }]) {
    assert.equal(voltageDropSummary({ ...drop, ...input }).hasCompleteInputs, false);
  }
  for (const input of [{ ambientTemperatureFactor: 1e308, groupingFactor: 1e308 }, { ambientTemperatureFactor: 1e-300, groupingFactor: 1e-300 }, { designCurrentAmps: 1e308, ambientTemperatureFactor: 1e-308 }, { ambientTemperatureFactor: 1e308 }]) {
    assert.equal(cableSizingSummary({ ...cable, ...input }).hasSuitableCable, false);
  }
});

test("unrounded voltage-drop and capacity comparisons distinguish close failures", () => {
  const atLimit = { ...drop, nominalVoltage: 200, maximumPercent: 5, designCurrentAmps: 20, routeLengthMetres: 25, millivoltsPerAmpMetre: 20 };
  assert.equal(voltageDropSummary(atLimit).withinSelectedLimit, true);
  assert.equal(voltageDropSummary({ ...atLimit, routeLengthMetres: 25.000001 }).withinSelectedLimit, false);
  assert.equal(cableSizingSummary({ ...cable, designCurrentAmps: 27 }).hasSuitableCable, true);
  assert.equal(cableSizingSummary({ ...cable, designCurrentAmps: 27.000001 }).hasSuitableCable, false);
});
