import assert from "node:assert/strict";
import test from "node:test";
import {
  maximumVoltageDropVolts,
  voltageDropPercent,
  voltageDropSummary,
  voltageDropVolts,
} from "../lib/voltageDropCalculator-core.mjs";

test("voltage drop uses design current route length and mV per amp metre", () => {
  const drop = voltageDropVolts({
    designCurrentAmps: 20,
    routeLengthMetres: 30,
    millivoltsPerAmpMetre: 18,
  });
  assert.equal(drop, 10.8);
});

test("invalid and negative voltage-drop inputs fail safely", () => {
  assert.equal(voltageDropVolts({ designCurrentAmps: -10, routeLengthMetres: 30, millivoltsPerAmpMetre: 18 }), 0);
  assert.equal(voltageDropVolts({ designCurrentAmps: 10, routeLengthMetres: "bad", millivoltsPerAmpMetre: 18 }), 0);
  assert.equal(voltageDropVolts({ designCurrentAmps: 10, routeLengthMetres: 30, millivoltsPerAmpMetre: 0 }), 0);
  assert.equal(voltageDropPercent({ voltageDrop: 10, nominalVoltage: 0 }), 0);
});

test("voltage-drop summary reports percentage allowance and pass state", () => {
  const summary = voltageDropSummary({
    phase: "Single phase",
    designCurrentAmps: 20,
    routeLengthMetres: 30,
    millivoltsPerAmpMetre: 18,
    nominalVoltage: 230,
    maximumPercent: 5,
  });

  assert.equal(summary.phase, "Single phase");
  assert.equal(summary.voltageDropVolts, 10.8);
  assert.equal(summary.maximumVoltageDropVolts, 11.5);
  assert.ok(summary.voltageDropPercent > 4.69 && summary.voltageDropPercent < 4.70);
  assert.ok(summary.remainingVoltageDropVolts > 0.69 && summary.remainingVoltageDropVolts < 0.71);
  assert.equal(summary.withinSelectedLimit, true);
});

test("voltage-drop summary identifies an exceeded limit", () => {
  const summary = voltageDropSummary({
    phase: "Three phase",
    designCurrentAmps: 32,
    routeLengthMetres: 80,
    millivoltsPerAmpMetre: 7.3,
    nominalVoltage: 400,
    maximumPercent: 3,
  });

  assert.equal(summary.phase, "Three phase");
  assert.equal(summary.maximumVoltageDropVolts, 12);
  assert.equal(summary.withinSelectedLimit, false);
  assert.equal(summary.remainingVoltageDropVolts, 0);
});

test("maximum voltage drop is derived from nominal voltage and selected percentage", () => {
  assert.ok(Math.abs(maximumVoltageDropVolts({ nominalVoltage: 230, maximumPercent: 3 }) - 6.9) < 1e-12);
  assert.equal(maximumVoltageDropVolts({ nominalVoltage: 400, maximumPercent: 5 }), 20);
});

test("voltage-drop summary exposes explicit assumptions and design warning", () => {
  const summary = voltageDropSummary({
    phase: "Single phase",
    designCurrentAmps: 16,
    routeLengthMetres: 20,
    millivoltsPerAmpMetre: 29,
  });

  const assumptions = summary.assumptions.join(" ");
  assert.match(assumptions, /single phase/i);
  assert.match(assumptions, /mV\/A\/m/i);
  assert.match(assumptions, /design aid/i);
  assert.match(assumptions, /BS 7671/i);
});
