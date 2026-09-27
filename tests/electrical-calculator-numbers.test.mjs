import assert from "node:assert/strict";
import test from "node:test";
import { finiteCalculatorNumber, positiveCalculatorNumber, nonNegativeCalculatorNumber, formatCalculatorNumber } from "../lib/electricalCalculatorNumbers-core.mjs";

test("engineering numeric parser supports decimal and scientific input and explicit zero", () => {
  for (const [input, expected] of [[0, 0], ["0", 0], [".35", 0.35], [" 1e3 ", 1000], ["+2.5", 2.5], ["-2.5", -2.5]]) assert.equal(finiteCalculatorNumber(input), expected);
  assert.equal(nonNegativeCalculatorNumber("0"), 0);
  assert.equal(positiveCalculatorNumber("0"), null);
  assert.equal(nonNegativeCalculatorNumber(-1), null);
});

test("engineering numeric parser never coerces blanks or other types into values", () => {
  for (const value of ["", " ", "1,000", "1A", "0x10", "0b10", "1e999", undefined, null, true, false, [], [1], {}, Symbol("number"), NaN, Infinity, () => 1]) {
    assert.equal(finiteCalculatorNumber(value), null);
    assert.equal(positiveCalculatorNumber(value), null);
    assert.equal(nonNegativeCalculatorNumber(value), null);
  }
});

test("calculator formatting preserves unavailable results and readable extreme magnitudes", () => {
  for (const value of [null, undefined, Infinity, NaN]) assert.equal(formatCalculatorNumber(value), "—");
  assert.equal(formatCalculatorNumber(0), "0");
  assert.equal(formatCalculatorNumber(0.0000001), "1.000e-7");
  assert.equal(formatCalculatorNumber(1e20), "1.000e+20");
  assert.equal(formatCalculatorNumber(400000), "400,000");
});
