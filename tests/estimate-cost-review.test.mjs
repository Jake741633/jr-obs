import assert from "node:assert/strict";
import test from "node:test";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";
const { reviewEstimateCosts } = loadLocalTs(new URL("../lib/estimateCostReview.ts", import.meta.url));
const line = { quantity: 3, unitCost: 4.123, unitPrice: 9.875 };

test("cost review preserves precision, distinguishes unknown from zero, and blocks empty estimates", () => {
  const complete = reviewEstimateCosts([line, { quantity: 1, unitCost: 0, unitPrice: 0 }]);
  assert.equal(complete.complete, true); assert.equal(complete.knownCost, 12.37); assert.equal(complete.sellingTotal, 29.63);
  const missing = reviewEstimateCosts([line, { ...line, unitCost: undefined }]);
  assert.equal(missing.complete, false); assert.equal(missing.missingCosts, 1); assert.equal(missing.knownCost, 12.37);
  assert.equal(reviewEstimateCosts([]).complete, false);
});
test("cost review blocks invalid values, products and totals without silently dropping selected lines", () => {
  for (const patch of [{ quantity: 0 }, { quantity: -1 }, { quantity: Infinity }, { quantity: NaN }, { unitCost: -1 }, { unitCost: NaN }, { unitCost: Infinity }, { unitPrice: -1 }, { unitPrice: NaN }, { unitPrice: Infinity }, { quantity: 1e9, unitCost: 1e9 }]) {
    const result = reviewEstimateCosts([{ ...line, ...patch }]);
    assert.equal(result.complete, false, JSON.stringify(patch));
    assert.ok(Number.isFinite(result.knownCost));
    assert.ok(Number.isFinite(result.sellingTotal));
  }
  assert.equal(reviewEstimateCosts([{ quantity: 1, unitCost: 6e8, unitPrice: 6e8 }, { quantity: 1, unitCost: 6e8, unitPrice: 6e8 }]).complete, false);
});
