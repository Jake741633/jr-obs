import assert from "node:assert/strict";
import test from "node:test";

import {
  adiabaticSummary,
  maximumAdiabaticFaultCurrent,
  requiredAdiabaticConductorSize,
} from "../lib/adiabaticCalculator-core.mjs";

function approximatelyEqual(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) < tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}`);
}

test("calculates required conductor size from fault current time and k factor", () => {
  approximatelyEqual(requiredAdiabaticConductorSize({
    faultCurrentAmps: 1000,
    disconnectionTimeSeconds: 0.4,
    kFactor: 115,
  }), (1000 * Math.sqrt(0.4)) / 115);
});

test("required conductor size fails safely for invalid or incomplete inputs", () => {
  assert.equal(requiredAdiabaticConductorSize({
    faultCurrentAmps: -1000,
    disconnectionTimeSeconds: 0.4,
    kFactor: 115,
  }), 0);
  assert.equal(requiredAdiabaticConductorSize({
    faultCurrentAmps: 1000,
    disconnectionTimeSeconds: 0,
    kFactor: 115,
  }), 0);
  assert.equal(requiredAdiabaticConductorSize({
    faultCurrentAmps: 1000,
    disconnectionTimeSeconds: 0.4,
    kFactor: "invalid",
  }), 0);
});

test("calculates maximum supported fault current for an entered conductor", () => {
  approximatelyEqual(maximumAdiabaticFaultCurrent({
    conductorSizeMm2: 6,
    disconnectionTimeSeconds: 0.4,
    kFactor: 115,
  }), (115 * 6) / Math.sqrt(0.4));
});

test("maximum fault current fails safely for invalid or incomplete inputs", () => {
  assert.equal(maximumAdiabaticFaultCurrent({
    conductorSizeMm2: 0,
    disconnectionTimeSeconds: 0.4,
    kFactor: 115,
  }), 0);
  assert.equal(maximumAdiabaticFaultCurrent({
    conductorSizeMm2: 6,
    disconnectionTimeSeconds: -1,
    kFactor: 115,
  }), 0);
  assert.equal(maximumAdiabaticFaultCurrent({
    conductorSizeMm2: 6,
    disconnectionTimeSeconds: 0.4,
    kFactor: 0,
  }), 0);
});

test("summary passes an adequate conductor and reports positive margin", () => {
  const result = adiabaticSummary({
    faultCurrentAmps: 1000,
    disconnectionTimeSeconds: 0.4,
    conductorSizeMm2: 6,
    kFactor: 115,
  });

  const required = (1000 * Math.sqrt(0.4)) / 115;
  approximatelyEqual(result.requiredConductorSizeMm2, required);
  approximatelyEqual(result.maximumFaultCurrentAmps, (115 * 6) / Math.sqrt(0.4));
  assert.equal(result.hasCompleteInputs, true);
  assert.equal(result.conductorIsAdequate, true);
  approximatelyEqual(result.sizeMarginMm2, 6 - required);
});

test("summary fails an undersized conductor and reports negative margin", () => {
  const result = adiabaticSummary({
    faultCurrentAmps: 2000,
    disconnectionTimeSeconds: 1,
    conductorSizeMm2: 10,
    kFactor: 115,
  });

  assert.equal(result.hasCompleteInputs, true);
  assert.equal(result.conductorIsAdequate, false);
  approximatelyEqual(result.requiredConductorSizeMm2, 2000 / 115);
  assert.ok(result.sizeMarginMm2 < 0);
});

test("summary treats equality with the required size as adequate", () => {
  const required = requiredAdiabaticConductorSize({
    faultCurrentAmps: 1150,
    disconnectionTimeSeconds: 1,
    kFactor: 115,
  });
  const result = adiabaticSummary({
    faultCurrentAmps: 1150,
    disconnectionTimeSeconds: 1,
    conductorSizeMm2: required,
    kFactor: 115,
  });

  assert.equal(required, 10);
  assert.equal(result.conductorIsAdequate, true);
  assert.equal(result.sizeMarginMm2, 0);
});

test("summary returns deterministic defaults when inputs are malformed", () => {
  const result = adiabaticSummary({
    faultCurrentAmps: "invalid",
    disconnectionTimeSeconds: -1,
    conductorSizeMm2: null,
    kFactor: 0,
  });

  assert.equal(result.faultCurrentAmps, 0);
  assert.equal(result.disconnectionTimeSeconds, 0);
  assert.equal(result.conductorSizeMm2, 0);
  assert.equal(result.kFactor, 0);
  assert.equal(result.requiredConductorSizeMm2, 0);
  assert.equal(result.maximumFaultCurrentAmps, 0);
  assert.equal(result.hasCompleteInputs, false);
  assert.equal(result.conductorIsAdequate, false);
  assert.equal(result.sizeMarginMm2, 0);
  assert.ok(result.assumptions.some((assumption) => assumption.includes("verified k-factor")));
});
