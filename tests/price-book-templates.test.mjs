import assert from "node:assert/strict";
import test from "node:test";

import {
  availableElectricalPointTemplates,
  createPriceBookItemFromTemplate,
  electricalPointTemplates,
} from "../lib/priceBookTemplates.mjs";

test("electrical point templates expose the core quoting catalogue without duplicate keys", () => {
  const keys = electricalPointTemplates.map((template) => template.key);

  assert.ok(keys.includes("double-socket"));
  assert.ok(keys.includes("downlight"));
  assert.ok(keys.includes("consumer-unit"));
  assert.ok(keys.includes("fault-finding"));
  assert.equal(new Set(keys).size, keys.length);
});

test("creates a configurable price-book item from a template without inventing prices", () => {
  const item = createPriceBookItemFromTemplate("double-socket", {
    id: "price-book-1",
    sector: "Commercial",
    pricingMethod: "Calculated",
    labourHours: 1.5,
    labourCostRate: 32,
    labourSellRate: 62,
    materialCost: 28,
    materialMarkupPercent: 25,
    overheadAllowance: 6,
    contingencyPercent: 5,
    vatRate: 20,
    now: "2026-08-01T20:00:00.000Z",
  });

  assert.equal(item.id, "price-book-1");
  assert.equal(item.name, "Double socket point");
  assert.equal(item.category, "Power");
  assert.equal(item.unitLabel, "point");
  assert.equal(item.sector, "Commercial");
  assert.equal(item.pricingMethod, "Calculated");
  assert.equal(item.fixedSellingPrice, 0);
  assert.equal(item.labourHours, 1.5);
  assert.equal(item.materialCost, 28);
  assert.equal(item.templateKey, "double-socket");
  assert.equal(item.createdAt, "2026-08-01T20:00:00.000Z");
  assert.equal(item.updatedAt, "2026-08-01T20:00:00.000Z");
});

test("template creation sanitises invalid numeric and sector input", () => {
  const item = createPriceBookItemFromTemplate("downlight", {
    sector: "Unknown",
    labourHours: -2,
    materialCost: "not-a-number",
    fixedSellingPrice: -100,
    vatRate: -20,
  });

  assert.equal(item.sector, "Domestic");
  assert.equal(item.labourHours, 0);
  assert.equal(item.materialCost, 0);
  assert.equal(item.fixedSellingPrice, 0);
  assert.equal(item.vatRate, 0);
});

test("rejects unknown electrical point templates", () => {
  assert.throws(
    () => createPriceBookItemFromTemplate("unknown-template"),
    /unknown electrical point template/i,
  );
});

test("available templates exclude only templates already represented by saved items", () => {
  const available = availableElectricalPointTemplates([
    { id: "existing-1", templateKey: "double-socket" },
    { id: "custom-1", name: "Custom containment item" },
    { id: "existing-2", templateKey: "downlight" },
  ]);
  const keys = available.map((template) => template.key);

  assert.equal(keys.includes("double-socket"), false);
  assert.equal(keys.includes("downlight"), false);
  assert.equal(keys.includes("consumer-unit"), true);
  assert.equal(keys.includes("fault-finding"), true);
});
