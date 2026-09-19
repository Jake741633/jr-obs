import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPriceBookProfile,
  choosePriceBookProfile,
  normalisePriceBookProfile,
  priceBookProfileImpact,
} from "../lib/priceBookProfiles.mjs";

const baseItem = {
  id: "price-1",
  name: "Double socket point",
  category: "Power",
  sector: "Domestic",
  unitLabel: "point",
  pricingMethod: "Fixed",
  labourHours: 1.5,
  labourCostRate: 30,
  labourSellRate: 55,
  materialCost: 25,
  materialMarkupPercent: 20,
  fixedSellingPrice: 100,
  overheadAllowance: 5,
  contingencyPercent: 5,
  vatRate: 20,
};

function assertClose(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}`);
}

test("normalises configurable price book profiles safely", () => {
  const profile = normalisePriceBookProfile({
    id: "profile-1",
    name: "  Builder rate  ",
    sector: "Commercial",
    customerType: "Builder",
    labourSellRate: "65",
    labourCostRate: -10,
    materialMarkupPercent: "25",
    overheadPercent: 120,
    contingencyPercent: "7.5",
    sellingPriceAdjustmentPercent: 750,
    vatRate: "20",
    builderId: " builder-1 ",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T11:00:00.000Z",
  });

  assert.equal(profile.name, "Builder rate");
  assert.equal(profile.sector, "Commercial");
  assert.equal(profile.labourSellRate, 65);
  assert.equal(profile.labourCostRate, 0);
  assert.equal(profile.materialMarkupPercent, 25);
  assert.equal(profile.overheadPercent, 100);
  assert.equal(profile.contingencyPercent, 7.5);
  assert.equal(profile.sellingPriceAdjustmentPercent, 500);
  assert.equal(profile.builderId, "builder-1");
});

test("rejects profiles without a name", () => {
  assert.throws(() => normalisePriceBookProfile({ name: "   " }), /require a name/i);
});

test("applies a profile without mutating the source item", () => {
  const original = structuredClone(baseItem);
  const profiled = applyPriceBookProfile(baseItem, {
    id: "profile-2",
    name: "Commercial uplift",
    sector: "Commercial",
    labourSellRate: 70,
    labourCostRate: 35,
    materialMarkupPercent: 30,
    overheadPercent: 10,
    contingencyPercent: 8,
    sellingPriceAdjustmentPercent: 15,
    vatRate: 20,
  });

  assert.deepEqual(baseItem, original);
  assert.equal(profiled.sector, "Commercial");
  assert.equal(profiled.labourSellRate, 70);
  assert.equal(profiled.labourCostRate, 35);
  assert.equal(profiled.materialMarkupPercent, 30);
  assert.equal(profiled.contingencyPercent, 8);
  assertClose(profiled.fixedSellingPrice, 115);
  assertClose(profiled.overheadAllowance, 7.5);
  assert.equal(profiled.pricingProfileId, "profile-2");
  assert.equal(profiled.pricingProfileName, "Commercial uplift");
});

test("does not alter fixed selling price for calculated items", () => {
  const profiled = applyPriceBookProfile({ ...baseItem, pricingMethod: "Calculated" }, {
    name: "Calculated profile",
    sellingPriceAdjustmentPercent: 25,
  });

  assert.equal(profiled.fixedSellingPrice, 100);
});

test("chooses a matching builder profile before a sector default", () => {
  const profiles = [
    { id: "default", name: "Commercial default", sector: "Commercial", isDefault: true },
    { id: "builder", name: "Preferred builder", sector: "Commercial", builderId: "builder-1" },
    { id: "inactive", name: "Inactive builder", sector: "Commercial", builderId: "builder-1", active: false },
  ];

  assert.equal(choosePriceBookProfile(profiles, { builderId: "builder-1", sector: "Commercial" })?.id, "builder");
  assert.equal(choosePriceBookProfile(profiles, { builderId: "missing", sector: "Commercial" })?.id, "default");
});

test("falls back to the first active sector profile and returns null when none match", () => {
  const profiles = [
    { id: "domestic", name: "Domestic", sector: "Domestic" },
    { id: "industrial", name: "Industrial", sector: "Industrial" },
  ];

  assert.equal(choosePriceBookProfile(profiles, { sector: "Industrial" })?.id, "industrial");
  assert.equal(choosePriceBookProfile([], { sector: "Commercial" }), null);
});

test("reports profile impact for preview before applying", () => {
  const impact = priceBookProfileImpact(baseItem, {
    name: "Builder discount",
    labourSellRate: 50,
    labourCostRate: 28,
    materialMarkupPercent: 15,
    overheadPercent: 8,
    contingencyPercent: 4,
    sellingPriceAdjustmentPercent: -10,
    vatRate: 20,
  });

  assert.equal(impact.originalFixedSellingPrice, 100);
  assertClose(impact.adjustedFixedSellingPrice, 90);
  assertClose(impact.sellingPriceDifference, -10);
  assert.equal(impact.labourSellRate, 50);
  assert.equal(impact.labourCostRate, 28);
  assert.equal(impact.materialMarkupPercent, 15);
  assertClose(impact.overheadAllowance, 7);
  assert.equal(impact.contingencyPercent, 4);
  assert.equal(impact.vatRate, 20);
});
