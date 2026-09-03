import assert from "node:assert/strict";
import test from "node:test";
import {
  cableSizingSummary,
  combinedCorrectionFactor,
  requiredTabulatedCurrent,
  selectMinimumCableSize,
} from "../lib/cableSizingCalculator-core.mjs";

test("correction factors multiply deterministically", () => {
  const factor = combinedCorrectionFactor({
    ambientTemperatureFactor: 0.94,
    groupingFactor: 0.8,
    insulationFactor: 0.5,
    otherFactor: 1,
  });

  assert.ok(Math.abs(factor - 0.376) < 1e-12);
});

test("invalid correction factors fall back safely to unity", () => {
  assert.equal(combinedCorrectionFactor({
    ambientTemperatureFactor: 0,
    groupingFactor: -1,
    insulationFactor: "bad",
    otherFactor: 2,
  }), 1);
});

test("required tabulated current divides design current by combined factors", () => {
  const required = requiredTabulatedCurrent({
    designCurrentAmps: 32,
    ambientTemperatureFactor: 0.94,
    groupingFactor: 0.8,
  });

  assert.ok(Math.abs(required - (32 / 0.752)) < 1e-12);
});

test("invalid design current fails safely", () => {
  assert.equal(requiredTabulatedCurrent({ designCurrentAmps: 0 }), 0);
  assert.equal(requiredTabulatedCurrent({ designCurrentAmps: -10 }), 0);
  assert.equal(requiredTabulatedCurrent({ designCurrentAmps: "bad" }), 0);
});

test("minimum cable selection returns the smallest verified suitable option", () => {
  const selected = selectMinimumCableSize({
    requiredCurrentAmps: 30,
    cableOptions: [
      { sizeMm2: 10, tabulatedCurrentAmps: 57, label: "10 mm²" },
      { sizeMm2: 4, tabulatedCurrentAmps: 32, label: "4 mm²" },
      { sizeMm2: 6, tabulatedCurrentAmps: 41, label: "6 mm²" },
      { sizeMm2: 2.5, tabulatedCurrentAmps: 27, label: "2.5 mm²" },
    ],
  });

  assert.equal(selected?.sizeMm2, 4);
  assert.equal(selected?.label, "4 mm²");
});

test("cable selection rejects missing or unsuitable options", () => {
  assert.equal(selectMinimumCableSize({ requiredCurrentAmps: 30, cableOptions: [] }), null);
  assert.equal(selectMinimumCableSize({
    requiredCurrentAmps: 50,
    cableOptions: [
      { sizeMm2: 2.5, tabulatedCurrentAmps: 27 },
      { sizeMm2: 4, tabulatedCurrentAmps: 32 },
    ],
  }), null);
});

test("cable sizing summary exposes calculation evidence and warnings", () => {
  const summary = cableSizingSummary({
    designCurrentAmps: 20,
    ambientTemperatureFactor: 0.94,
    groupingFactor: 0.8,
    cableOptions: [
      { sizeMm2: 2.5, tabulatedCurrentAmps: 27 },
      { sizeMm2: 4, tabulatedCurrentAmps: 32 },
    ],
  });

  assert.equal(summary.designCurrentAmps, 20);
  assert.ok(Math.abs(summary.combinedCorrectionFactor - 0.752) < 1e-12);
  assert.ok(Math.abs(summary.requiredTabulatedCurrentAmps - (20 / 0.752)) < 1e-12);
  assert.equal(summary.selectedCable?.sizeMm2, 2.5);
  assert.equal(summary.hasSuitableCable, true);

  const assumptions = summary.assumptions.join(" ");
  assert.match(assumptions, /verified BS 7671 tables/i);
  assert.match(assumptions, /manufacturer data/i);
  assert.match(assumptions, /design aid only/i);
  assert.match(assumptions, /voltage drop/i);
  assert.match(assumptions, /adiabatic/i);
});
