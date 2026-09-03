import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateEarthFaultLoopImpedance,
  earthFaultLoopSummary,
  maximumPermittedEarthFaultLoop,
  prospectiveEarthFaultCurrent,
} from "../lib/earthFaultLoopCalculator-core.mjs";

test("calculates earth fault loop impedance from Ze plus R1 plus R2", () => {
  const result = calculateEarthFaultLoopImpedance({
    externalEarthFaultLoopOhms: 0.35,
    lineConductorResistanceOhms: 0.18,
    cpcResistanceOhms: 0.3,
  });

  assert.ok(Math.abs(result - 0.83) < 1e-12);
});

test("invalid and negative impedance inputs fall back safely", () => {
  assert.equal(calculateEarthFaultLoopImpedance({
    externalEarthFaultLoopOhms: -1,
    lineConductorResistanceOhms: "invalid",
    cpcResistanceOhms: 0.25,
  }), 0.25);
});

test("applies the designer-selected permitted percentage", () => {
  assert.equal(maximumPermittedEarthFaultLoop({
    tabulatedMaximumZsOhms: 1.37,
    permittedPercentage: 80,
  }), 1.096);
});

test("clamps permitted percentages and requires a positive verified limit", () => {
  assert.equal(maximumPermittedEarthFaultLoop({
    tabulatedMaximumZsOhms: 2,
    permittedPercentage: 120,
  }), 2);
  assert.equal(maximumPermittedEarthFaultLoop({
    tabulatedMaximumZsOhms: 2,
    permittedPercentage: -20,
  }), 0);
  assert.equal(maximumPermittedEarthFaultLoop({
    tabulatedMaximumZsOhms: 0,
    permittedPercentage: 80,
  }), 0);
});

test("calculates simplified prospective earth fault current", () => {
  assert.equal(prospectiveEarthFaultCurrent({
    nominalVoltage: 230,
    earthFaultLoopImpedanceOhms: 0.5,
  }), 460);
});

test("prospective earth fault current returns zero without positive impedance", () => {
  assert.equal(prospectiveEarthFaultCurrent({
    nominalVoltage: 230,
    earthFaultLoopImpedanceOhms: 0,
  }), 0);
});

test("summary passes when calculated Zs is below the selected limit", () => {
  const result = earthFaultLoopSummary({
    nominalVoltage: 230,
    externalEarthFaultLoopOhms: 0.35,
    lineConductorResistanceOhms: 0.18,
    cpcResistanceOhms: 0.3,
    tabulatedMaximumZsOhms: 1.37,
    permittedPercentage: 80,
  });

  assert.ok(Math.abs(result.calculatedZsOhms - 0.83) < 1e-12);
  assert.equal(result.permittedMaximumZsOhms, 1.096);
  assert.equal(result.hasVerifiedLimit, true);
  assert.equal(result.withinSelectedLimit, true);
  assert.ok(Math.abs(result.marginOhms - 0.266) < 1e-12);
  assert.ok(Math.abs(result.prospectiveEarthFaultCurrentAmps - (230 / 0.83)) < 1e-12);
});

test("summary fails with a negative margin when calculated Zs exceeds the limit", () => {
  const result = earthFaultLoopSummary({
    externalEarthFaultLoopOhms: 0.5,
    lineConductorResistanceOhms: 0.4,
    cpcResistanceOhms: 0.3,
    tabulatedMaximumZsOhms: 1,
    permittedPercentage: 100,
  });

  assert.equal(result.calculatedZsOhms, 1.2);
  assert.equal(result.withinSelectedLimit, false);
  assert.ok(Math.abs(result.marginOhms + 0.2) < 1e-12);
});

test("summary treats equality with the selected limit as compliant", () => {
  const result = earthFaultLoopSummary({
    externalEarthFaultLoopOhms: 0.4,
    lineConductorResistanceOhms: 0.3,
    cpcResistanceOhms: 0.3,
    tabulatedMaximumZsOhms: 1,
  });

  assert.equal(result.calculatedZsOhms, 1);
  assert.equal(result.permittedMaximumZsOhms, 1);
  assert.equal(result.withinSelectedLimit, true);
  assert.equal(result.marginOhms, 0);
});

test("summary reports no assessment when a verified limit is missing", () => {
  const result = earthFaultLoopSummary({
    externalEarthFaultLoopOhms: 0.35,
    lineConductorResistanceOhms: 0.18,
    cpcResistanceOhms: 0.3,
  });

  assert.equal(result.hasVerifiedLimit, false);
  assert.equal(result.withinSelectedLimit, false);
  assert.equal(result.marginOhms, 0);
  assert.equal(result.permittedMaximumZsOhms, 0);
  assert.ok(result.assumptions.some((assumption) => assumption.includes("verified tabulated maximum Zs")));
});

test("summary normalises malformed inputs to deterministic defaults", () => {
  const result = earthFaultLoopSummary({
    nominalVoltage: "invalid",
    externalEarthFaultLoopOhms: -1,
    lineConductorResistanceOhms: "invalid",
    cpcResistanceOhms: null,
    tabulatedMaximumZsOhms: -2,
    permittedPercentage: "invalid",
  });

  assert.equal(result.nominalVoltage, 230);
  assert.equal(result.calculatedZsOhms, 0);
  assert.equal(result.permittedPercentage, 100);
  assert.equal(result.hasVerifiedLimit, false);
  assert.equal(result.prospectiveEarthFaultCurrentAmps, 0);
});
