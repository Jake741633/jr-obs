import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateVoltageDrop,
  voltageDropSummary,
} from "../lib/electricalVoltageDrop-core.mjs";

test("single-phase voltage drop uses current length and mV per amp metre", () => {
  const drop = calculateVoltageDrop({
    currentAmps: 20,
    lengthMetres: 30,
    millivoltsPerAmpMetre: 18,
  });
  assert.equal(drop, 10.8);
});

test("invalid and negative voltage-drop inputs fail safely", () => {
  assert.equal(calculateVoltageDrop({ currentAmps: -10, lengthMetres: 30, millivoltsPerAmpMetre: 18 }), 0);
  assert.equal(calculateVoltageDrop({ currentAmps: 10, lengthMetres: "bad", millivoltsPerAmpMetre: 18 }), 0);
  assert.equal(calculateVoltageDrop({ currentAmps: 10, lengthMetres: 30, millivoltsPerAmpMetre: 0 }), 0);
});

test("voltage-drop summary reports percentage allowance and pass state", () => {
  const summary = voltageDropSummary({
    phase: "Single phase",
    currentAmps: 20,
    lengthMetres: 30,
    millivoltsPerAmpMetre: 18,
    nominalVoltage: 230,
    maximumDropPercent: 5,
  });

  assert.equal(summary.phase, "Single phase");
  assert.equal(summary.voltageDropVolts, 10.8);
  assert.equal(summary.maximumDropVolts, 11.5);
  assert.ok(summary.voltageDropPercent > 4.69 && summary.voltageDropPercent < 4.70);
  assert.ok(summary.remainingAllowanceVolts > 0.69 && summary.remainingAllowanceVolts < 0.71);
  assert.equal(summary.withinLimit, true);
});

test("voltage-drop summary identifies an exceeded limit", () => {
  const summary = voltageDropSummary({
    phase: "Three phase",
    currentAmps: 32,
    lengthMetres: 80,
    millivoltsPerAmpMetre: 7.3,
    nominalVoltage: 400,
    maximumDropPercent: 3,
  });

  assert.equal(summary.phase, "Three phase");
  assert.equal(summary.maximumDropVolts, 12);
  assert.equal(summary.withinLimit, false);
  assert.equal(summary.remainingAllowanceVolts, 0);
});

test("voltage-drop summary exposes explicit assumptions and design warning", () => {
  const summary = voltageDropSummary({
    phase: "Single phase",
    currentAmps: 16,
    lengthMetres: 20,
    millivoltsPerAmpMetre: 29,
  });

  assert.match(summary.assumptions.join(" "), /single phase/i);
  assert.match(summary.assumptions.join(" "), /mV\/A\/m/i);
  assert.match(summary.assumptions.join(" "), /design aid/i);
  assert.match(summary.assumptions.join(" "), /BS 7671/i);
});
