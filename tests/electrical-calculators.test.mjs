import assert from "node:assert/strict";
import test from "node:test";
import {
  apparentPowerVa,
  electricalLoadSummary,
  singlePhaseCurrent,
  threePhaseCurrent,
} from "../lib/electricalCalculators-core.mjs";

test("single-phase current uses voltage power factor and efficiency", () => {
  const current = singlePhaseCurrent({ powerWatts: 4600, voltage: 230, powerFactor: 1, efficiency: 1 });
  assert.equal(current, 20);

  const adjusted = singlePhaseCurrent({ powerWatts: 2300, voltage: 230, powerFactor: 0.8, efficiency: 0.9 });
  assert.ok(Math.abs(adjusted - 13.8888888889) < 0.000001);
});

test("three-phase current uses line voltage and root three", () => {
  const current = threePhaseCurrent({ powerWatts: 12000, voltage: 400, powerFactor: 1, efficiency: 1 });
  assert.ok(Math.abs(current - 17.3205080757) < 0.000001);
});

test("apparent power is derived from active power and power factor", () => {
  assert.equal(apparentPowerVa({ activePowerWatts: 8000, powerFactor: 0.8 }), 10000);
});

test("invalid and negative inputs fail safely without inventing load", () => {
  assert.equal(singlePhaseCurrent({ powerWatts: -1000, voltage: 230 }), 0);
  assert.equal(threePhaseCurrent({ powerWatts: "invalid", voltage: 400 }), 0);
  assert.equal(apparentPowerVa({ activePowerWatts: -1, powerFactor: 0.8 }), 0);
});

test("electrical load summary normalises assumptions and keeps design warning explicit", () => {
  const summary = electricalLoadSummary({
    phase: "Three phase",
    powerWatts: 15000,
    voltage: 400,
    powerFactor: 0.85,
    efficiency: 0.92,
  });

  assert.equal(summary.phase, "Three phase");
  assert.equal(summary.powerWatts, 15000);
  assert.equal(summary.voltage, 400);
  assert.equal(summary.powerFactor, 0.85);
  assert.equal(summary.efficiency, 0.92);
  assert.ok(summary.currentAmps > 27 && summary.currentAmps < 28);
  assert.ok(summary.apparentPowerVa > 17647 && summary.apparentPowerVa < 17648);
  assert.match(summary.assumptions.join(" "), /design aid only/);
  assert.match(summary.assumptions.join(" "), /does not select a cable or protective device/);
});

test("power factor and efficiency are clamped to safe usable values", () => {
  const summary = electricalLoadSummary({ phase: "Single phase", powerWatts: 2300, voltage: 230, powerFactor: 5, efficiency: 0 });
  assert.equal(summary.powerFactor, 1);
  assert.equal(summary.efficiency, 1);
  assert.equal(summary.currentAmps, 10);
});
