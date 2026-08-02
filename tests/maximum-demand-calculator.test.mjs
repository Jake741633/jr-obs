import assert from "node:assert/strict";
import test from "node:test";
import {
  maximumDemandSummary,
  normaliseMaximumDemandLoad,
} from "../lib/maximumDemandCalculator-core.mjs";

test("normalises maximum-demand loads without inventing unsafe values", () => {
  assert.deepEqual(normaliseMaximumDemandLoad({
    id: "socket-ring",
    description: " Socket ring ",
    quantity: 2.9,
    connectedCurrentAmps: 32,
    demandFactor: 0.5,
    phase: "L2",
  }), {
    id: "socket-ring",
    description: "Socket ring",
    quantity: 2,
    connectedCurrentAmps: 32,
    demandFactor: 0.5,
    phase: "L2",
    connectedTotalAmps: 64,
    diversifiedCurrentAmps: 32,
  });
});

test("invalid load inputs fall back safely and demand factors remain bounded", () => {
  const normalised = normaliseMaximumDemandLoad({
    quantity: 0,
    connectedCurrentAmps: -40,
    demandFactor: 4,
    phase: "L9",
    description: "   ",
  }, 3);

  assert.equal(normalised.id, "load-4");
  assert.equal(normalised.description, "Load 4");
  assert.equal(normalised.quantity, 1);
  assert.equal(normalised.connectedCurrentAmps, 0);
  assert.equal(normalised.demandFactor, 1);
  assert.equal(normalised.phase, "L1");
  assert.equal(normalised.diversifiedCurrentAmps, 0);

  assert.equal(normaliseMaximumDemandLoad({ demandFactor: -1 }).demandFactor, 0);
  assert.equal(normaliseMaximumDemandLoad({ demandFactor: "invalid" }).demandFactor, 1);
});

test("single-phase loads total connected and diversified current by phase", () => {
  const summary = maximumDemandSummary({
    loads: [
      { description: "Cooker", connectedCurrentAmps: 40, demandFactor: 0.5, phase: "L1" },
      { description: "Shower", connectedCurrentAmps: 45, demandFactor: 1, phase: "L2" },
      { description: "Lighting", quantity: 2, connectedCurrentAmps: 6, demandFactor: 0.75, phase: "L1" },
    ],
  });

  assert.equal(summary.totalConnectedCurrentAmps, 97);
  assert.equal(summary.totalDiversifiedCurrentAmps, 74);
  assert.deepEqual(summary.phaseDemandAmps, { L1: 29, L2: 45, L3: 0 });
  assert.equal(summary.maximumPhaseDemandAmps, 45);
  assert.equal(summary.phaseImbalanceAmps, 45);
  assert.equal(summary.overallDemandFactor, 74 / 97);
});

test("three-phase loads contribute their diversified line current to every phase", () => {
  const summary = maximumDemandSummary({
    loads: [
      { description: "Three-phase plant", connectedCurrentAmps: 20, demandFactor: 0.8, phase: "Three phase" },
      { description: "Office sockets", connectedCurrentAmps: 16, demandFactor: 0.5, phase: "L3" },
    ],
  });

  assert.deepEqual(summary.phaseDemandAmps, { L1: 16, L2: 16, L3: 24 });
  assert.equal(summary.maximumPhaseDemandAmps, 24);
  assert.equal(summary.phaseImbalanceAmps, 8);
  assert.equal(summary.totalConnectedCurrentAmps, 36);
  assert.equal(summary.totalDiversifiedCurrentAmps, 24);
});

test("zero and full demand factors remain deterministic", () => {
  const summary = maximumDemandSummary({
    loads: [
      { connectedCurrentAmps: 32, demandFactor: 0, phase: "L1" },
      { connectedCurrentAmps: 32, demandFactor: 1, phase: "L1" },
    ],
  });

  assert.equal(summary.totalConnectedCurrentAmps, 64);
  assert.equal(summary.totalDiversifiedCurrentAmps, 32);
  assert.equal(summary.phaseDemandAmps.L1, 32);
  assert.equal(summary.overallDemandFactor, 0.5);
});

test("empty and malformed summaries return a complete zero-value result", () => {
  for (const input of [undefined, null, {}, { loads: "invalid" }]) {
    const summary = maximumDemandSummary(input);
    assert.deepEqual(summary.loads, []);
    assert.equal(summary.totalConnectedCurrentAmps, 0);
    assert.equal(summary.totalDiversifiedCurrentAmps, 0);
    assert.equal(summary.overallDemandFactor, 0);
    assert.deepEqual(summary.phaseDemandAmps, { L1: 0, L2: 0, L3: 0 });
    assert.equal(summary.maximumPhaseDemandAmps, 0);
    assert.equal(summary.phaseImbalanceAmps, 0);
    assert.equal(summary.assumptions.length, 4);
  }
});
