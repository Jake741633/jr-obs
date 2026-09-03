import assert from "node:assert/strict";
import test from "node:test";

import {
  normalisePriceBookItem,
  priceBookQuoteSummary,
  priceBookSelectionFinancials,
  priceBookSelectionToQuoteLine,
  priceBookUnitFinancials,
} from "../lib/priceBook-core.mjs";

const calculatedSpotlight = {
  id: "price-spotlight",
  name: "LED spotlight point",
  category: "Lighting",
  sector: "Domestic",
  unitLabel: "point",
  pricingMethod: "Calculated",
  labourHours: 0.75,
  labourCostRate: 30,
  labourSellRate: 60,
  materialCost: 18,
  materialMarkupPercent: 25,
  overheadAllowance: 4,
  contingencyPercent: 10,
  vatRate: 20,
  notes: "Includes standard white fitting.",
};

function assertClose(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}`);
}

test("price book normalisation preserves valid electrical pricing data and removes unsafe values", () => {
  const item = normalisePriceBookItem({
    ...calculatedSpotlight,
    supplierItemIds: ["cef-1", "cef-1", "", "tlc-2"],
    labourHours: -2,
    materialMarkupPercent: 150,
    sector: "Unknown",
  });

  assert.equal(item.labourHours, 0);
  assert.equal(item.materialMarkupPercent, 100);
  assert.equal(item.sector, "Domestic");
  assert.deepEqual(item.supplierItemIds, ["cef-1", "tlc-2"]);
});

test("calculated price per point includes labour material markup overhead and contingency", () => {
  const result = priceBookUnitFinancials(calculatedSpotlight);

  assert.equal(result.labourCost, 22.5);
  assert.equal(result.labourSelling, 45);
  assert.equal(result.materialSelling, 22.5);
  assert.equal(result.contingency, 7.15);
  assert.equal(result.totalCost, 44.5);
  assert.equal(result.sellingPrice, 78.65);
  assertClose(result.grossProfit, 34.15);
  assertClose(result.vat, 15.73);
  assertClose(result.sellingPriceIncludingVat, 94.38);
});

test("fixed prices remain authoritative while retaining underlying cost and profit evidence", () => {
  const result = priceBookSelectionFinancials({
    ...calculatedSpotlight,
    id: "price-double-socket",
    name: "Double socket point",
    category: "Power",
    pricingMethod: "Fixed",
    fixedSellingPrice: 95,
  }, 4);

  assert.equal(result.quantity, 4);
  assert.equal(result.labourHours, 3);
  assert.equal(result.totalCost, 178);
  assert.equal(result.sellingPrice, 380);
  assert.equal(result.grossProfit, 202);
  assert.equal(result.vat, 76);
});

test("price book selections convert into existing quote lines without exposing calculations", () => {
  const line = priceBookSelectionToQuoteLine(calculatedSpotlight, 6, "line-1");

  assert.deepEqual(line, {
    id: "line-1",
    description: "LED spotlight point",
    category: "Lighting",
    quantity: 6,
    unit: "point",
    unitCost: 44.5,
    unitPrice: 78.65,
    priceBookItemId: "price-spotlight",
    internalNotes: "Includes standard white fitting.",
  });
  assert.equal("labourCost" in line, false);
  assert.equal("grossProfit" in line, false);
});

test("quote summary combines point pricing with job extras VAT margin and profit per hour", () => {
  const summary = priceBookQuoteSummary([
    { item: calculatedSpotlight, quantity: 8 },
    {
      item: {
        ...calculatedSpotlight,
        id: "price-socket",
        name: "Double socket point",
        category: "Power",
        pricingMethod: "Fixed",
        fixedSellingPrice: 100,
        labourHours: 1,
        labourCostRate: 30,
        materialCost: 25,
        overheadAllowance: 5,
      },
      quantity: 4,
    },
  ], {
    travel: 40,
    parking: 20,
    plantHire: 50,
    additionalOverheads: 30,
    contingencyPercent: 5,
    vatRate: 20,
  });

  assert.equal(summary.labourHours, 10);
  assert.equal(summary.labourCost, 300);
  assert.equal(summary.materialCost, 244);
  assert.equal(summary.pointSellingPrice, 1029.2);
  assertClose(summary.subtotal, 1227.66);
  assert.equal(summary.totalCost, 736);
  assertClose(summary.grossProfit, 491.66);
  assertClose(summary.vat, 245.532);
  assertClose(summary.totalIncludingVat, 1473.192);
  assertClose(summary.profitPerLabourHour, 49.166);
});
