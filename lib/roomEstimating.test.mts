import assert from "node:assert/strict";
import test from "node:test";

import type { PriceBookItem, PriceBookQuoteLine } from "./priceBook-core.mjs";
import {
  roomEstimateFinancials,
  roomEstimateToQuoteLines,
  type RoomEstimateInput,
  wholePropertyEstimateFinancials,
  wholePropertyEstimateToQuoteLines,
} from "./roomEstimating.mjs";

const priceBook: PriceBookItem[] = [{
  id: "socket",
  name: "Double socket point",
  description: "",
  category: "Power",
  sector: "Domestic",
  unitLabel: "point",
  pricingMethod: "Fixed",
  labourHours: 1,
  labourCostRate: 30,
  labourSellRate: 55,
  materialCost: 20,
  materialMarkupPercent: 20,
  fixedSellingPrice: 95,
  overheadAllowance: 5,
  contingencyPercent: 0,
  vatRate: 20,
  active: true,
  favourite: true,
  supplierItemIds: [],
  notes: "",
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
}];

const room: RoomEstimateInput = {
  id: "kitchen-1",
  templateKey: "kitchen",
  internalNotes: "Check cable route before first fix",
  points: [{
    id: "socket-row",
    priceBookItemId: "socket",
    quantity: 4,
    notes: "Above worktop",
  }],
};

test("room estimating declarations match runtime financial results", () => {
  const summary = roomEstimateFinancials(room, priceBook);
  assert.equal(summary.room.name, "Kitchen");
  assert.equal(summary.lines[0]?.unitSellingPrice, 95);
  assert.equal(summary.sellingPrice, 380);
});

test("room quote conversion returns typed customer-safe lines", () => {
  const lines: PriceBookQuoteLine[] = roomEstimateToQuoteLines(room, priceBook, (value) => `line-${value}`);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.category, "Other");
  assert.equal(lines[0]?.unitPrice, 95);
  assert.equal(lines[0]?.quantity, 4);
  assert.match(lines[0]?.description ?? "", /Kitchen: Double socket point/);
  assert.match(lines[0]?.internalNotes ?? "", /Check cable route/);
});

test("whole-property declarations preserve typed totals and quote lines", () => {
  const rooms: RoomEstimateInput[] = [room, { ...room, id: "bedroom-1", templateKey: "bedroom", points: [{ ...room.points?.[0], id: "bedroom-sockets", quantity: 2 }] }];
  const summary = wholePropertyEstimateFinancials(rooms, priceBook);
  const lines: PriceBookQuoteLine[] = wholePropertyEstimateToQuoteLines(rooms, priceBook, (value) => `quote-${value}`);

  assert.equal(summary.roomCount, 2);
  assert.equal(summary.pointCount, 6);
  assert.equal(summary.sellingPrice, 570);
  assert.equal(lines.length, 2);
  assert.notEqual(lines[0]?.id, lines[1]?.id);
});
