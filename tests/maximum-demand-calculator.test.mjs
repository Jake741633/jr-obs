import assert from "node:assert/strict";
import test from "node:test";
import { maximumDemandSummary, normaliseMaximumDemandLoad, maximumDemandFactorFromPercent } from "../lib/maximumDemandCalculator-core.mjs";

const load = { id: "load-a", description: " Load A ", quantity: 1, connectedCurrentAmps: 32, demandFactor: .5, phase: "L1" };

test("normalises complete maximum-demand loads without rounding quantities", () => {
  const result = normaliseMaximumDemandLoad({ ...load, quantity: "2", phase: "L2" });
  assert.equal(result.description, "Load A");
  assert.equal(result.quantity, 2);
  assert.equal(result.connectedTotalAmps, 64);
  assert.equal(result.diversifiedCurrentAmps, 32);
  assert.equal(result.hasCompleteInputs, true);
  assert.deepEqual(result.errors, []);
  for (const quantity of [2.9, .5, 0, -1, Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = normaliseMaximumDemandLoad({ ...load, quantity });
    assert.equal(invalid.quantity, null);
    assert.equal(invalid.connectedTotalAmps, null);
    assert.equal(invalid.diversifiedCurrentAmps, null);
  }
});

test("every missing or malformed field leaves its row and the complete schedule unavailable", () => {
  for (const key of ["quantity", "connectedCurrentAmps", "demandFactor"]) for (const value of [undefined, null, "", " ", "invalid", "0x10", true, [], {}, NaN, Infinity, "1e-999"]) {
    const invalid = normaliseMaximumDemandLoad({ ...load, [key]: value });
    assert.equal(invalid.hasCompleteInputs, false, `${key}=${String(value)}`);
    assert.equal(invalid.diversifiedCurrentAmps, null);
    const summary = maximumDemandSummary({ loads: [load, { ...load, [key]: value }] });
    assert.equal(summary.hasCompleteInputs, false);
    assert.equal(summary.maximumPhaseDemandAmps, null);
    assert.deepEqual(summary.phaseDemandAmps, { L1: null, L2: null, L3: null });
    assert.equal(summary.loads[0].diversifiedCurrentAmps, 16);
  }
});

test("unsupported phases are rejected instead of allocating their current to L1", () => {
  for (const phase of [undefined, null, "", "L9", "DC", ["L1"]]) {
    const result = normaliseMaximumDemandLoad({ ...load, phase });
    assert.equal(result.phase, null);
    assert.equal(result.hasCompleteInputs, false);
  }
});

test("single-phase loads total connected and diversified current by phase", () => {
  const summary = maximumDemandSummary({ loads: [
    { ...load, description: "Cooker", connectedCurrentAmps: 40, demandFactor: .5, phase: "L1" },
    { ...load, description: "Shower", connectedCurrentAmps: 45, demandFactor: 1, phase: "L2" },
    { ...load, description: "Lighting", quantity: 2, connectedCurrentAmps: 6, demandFactor: .75, phase: "L1" },
  ] });
  assert.equal(summary.hasCompleteInputs, true);
  assert.equal(summary.totalConnectedCurrentAmps, 97);
  assert.equal(summary.totalDiversifiedCurrentAmps, 74);
  assert.deepEqual(summary.phaseDemandAmps, { L1: 29, L2: 45, L3: 0 });
  assert.equal(summary.maximumPhaseDemandAmps, 45);
  assert.equal(summary.phaseImbalanceAmps, 45);
  assert.equal(summary.overallDemandFactor, 74 / 97);
});

test("balanced three-phase loads contribute diversified line current to every phase", () => {
  const summary = maximumDemandSummary({ loads: [
    { ...load, connectedCurrentAmps: 20, demandFactor: .8, phase: "Three phase" },
    { ...load, connectedCurrentAmps: 16, demandFactor: .5, phase: "L3" },
  ] });
  assert.deepEqual(summary.phaseDemandAmps, { L1: 16, L2: 16, L3: 24 });
  assert.equal(summary.maximumPhaseDemandAmps, 24);
  assert.equal(summary.phaseImbalanceAmps, 8);
  assert.equal(summary.totalConnectedCurrentAmps, 36);
  assert.equal(summary.totalDiversifiedCurrentAmps, 24);
  assert.match(summary.assumptions.join(" "), /bookkeeping totals, not supply current/);
});

test("explicit zero and full demand factors retain their meaning but out-of-range factors are rejected", () => {
  const summary = maximumDemandSummary({ loads: [{ ...load, demandFactor: 0 }, { ...load, demandFactor: 1 }] });
  assert.equal(summary.totalConnectedCurrentAmps, 64);
  assert.equal(summary.totalDiversifiedCurrentAmps, 32);
  assert.equal(summary.phaseDemandAmps.L1, 32);
  assert.equal(summary.overallDemandFactor, .5);
  assert.equal(maximumDemandSummary({ loads: [{ ...load, demandFactor: "0" }] }).maximumPhaseDemandAmps, 0);
  for (const demandFactor of [-.01, 1.0001]) assert.equal(normaliseMaximumDemandLoad({ ...load, demandFactor }).hasCompleteInputs, false);
});

test("UI percentage conversion preserves blank versus zero and rejects underflow", () => {
  assert.equal(maximumDemandFactorFromPercent("66"), .66);
  assert.equal(maximumDemandFactorFromPercent("0"), 0);
  assert.equal(maximumDemandFactorFromPercent("100"), 1);
  for (const input of ["", " ", null, undefined, true, [], "bad", -1, 100.01, "1e-999", "5e-324"]) assert.equal(maximumDemandFactorFromPercent(input), null);
});

test("empty, missing and malformed schedules do not report zero demand", () => {
  for (const input of [undefined, null, {}, { loads: [] }, { loads: "invalid" }, { loads: [null] }]) {
    const summary = maximumDemandSummary(input);
    assert.equal(summary.hasCompleteInputs, false);
    for (const field of ["totalConnectedCurrentAmps", "totalDiversifiedCurrentAmps", "overallDemandFactor", "maximumPhaseDemandAmps", "phaseImbalanceAmps"]) assert.equal(summary[field], null);
    assert.deepEqual(summary.phaseDemandAmps, { L1: null, L2: null, L3: null });
    assert.ok(summary.errors.length);
  }
});

test("row overflow or nonzero underflow cannot become a plausible schedule", () => {
  for (const patch of [{ connectedCurrentAmps: 1e308, quantity: 10 }, { connectedCurrentAmps: 5e-324, demandFactor: .01 }]) {
    const summary = maximumDemandSummary({ loads: [{ ...load, ...patch }] });
    assert.equal(summary.hasCompleteInputs, false);
    assert.equal(summary.maximumPhaseDemandAmps, null);
    assert.match(summary.errors.join(" "), /numeric range/);
  }
});

test("aggregate overflow and a nonzero demand ratio that underflows invalidate all totals", () => {
  for (const loads of [
    [{ ...load, connectedCurrentAmps: 1e308 }, { ...load, connectedCurrentAmps: 1e308 }],
    [{ ...load, connectedCurrentAmps: 1e308, demandFactor: 0 }, { ...load, connectedCurrentAmps: 5e-324, demandFactor: 1 }],
  ]) {
    const summary = maximumDemandSummary({ loads });
    assert.equal(summary.loads.every((row) => row.hasCompleteInputs), true);
    assert.equal(summary.hasCompleteInputs, false);
    assert.equal(summary.maximumPhaseDemandAmps, null);
    assert.match(summary.errors.join(" "), /schedule.*numeric range/);
  }
});
