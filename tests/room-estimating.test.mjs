import assert from "node:assert/strict";
import test from "node:test";

import {
  electricalRoomTemplates,
  normaliseRoomEstimate,
  roomEstimateFinancials,
  wholePropertyEstimateFinancials,
} from "../lib/roomEstimating.mjs";

const socket = {
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
};

const downlight = {
  ...socket,
  id: "downlight",
  name: "LED downlight",
  category: "Lighting",
  labourHours: 0.75,
  materialCost: 18,
  fixedSellingPrice: 80,
};

function closeTo(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}`);
}

test("room templates include the core domestic and site areas", () => {
  const keys = new Set(electricalRoomTemplates.map((room) => room.key));
  for (const key of ["kitchen", "bedroom", "bathroom", "garage", "loft", "office", "external", "custom"]) {
    assert.ok(keys.has(key), `Missing room template ${key}`);
  }
  assert.equal(keys.size, electricalRoomTemplates.length);
});

test("normalises room points without inventing quantities or retaining invalid links", () => {
  const room = normaliseRoomEstimate({
    id: " room-1 ",
    templateKey: "kitchen",
    name: " ",
    notes: " Customer note ",
    internalNotes: " Private note ",
    points: [
      { id: " point-1 ", priceBookItemId: " socket ", quantity: "4", notes: " Worktop sockets " },
      { id: "invalid-quantity", priceBookItemId: "downlight", quantity: -2 },
      { id: "missing-link", quantity: 3 },
    ],
  });

  assert.equal(room.id, "room-1");
  assert.equal(room.templateKey, "kitchen");
  assert.equal(room.name, "Kitchen");
  assert.equal(room.notes, "Customer note");
  assert.equal(room.internalNotes, "Private note");
  assert.deepEqual(room.points, [{
    id: "point-1",
    priceBookItemId: "socket",
    quantity: 4,
    notes: "Worktop sockets",
  }]);
});

test("unknown templates safely become custom rooms while preserving the supplied name", () => {
  const room = normaliseRoomEstimate({ templateKey: "unknown", name: "Plant room" });
  assert.equal(room.templateKey, "custom");
  assert.equal(room.name, "Plant room");
});

test("room financials calculate linked price-book quantities and ignore deleted items", () => {
  const summary = roomEstimateFinancials({
    id: "kitchen-1",
    templateKey: "kitchen",
    points: [
      { id: "p1", priceBookItemId: "socket", quantity: 4, notes: "Above worktop" },
      { id: "p2", priceBookItemId: "downlight", quantity: 6 },
      { id: "p3", priceBookItemId: "deleted-item", quantity: 10 },
    ],
  }, [socket, downlight]);

  assert.equal(summary.room.id, "kitchen-1");
  assert.equal(summary.pointCount, 10);
  closeTo(summary.labourHours, 8.5);
  closeTo(summary.labourCost, 255);
  closeTo(summary.materialCost, 188);
  closeTo(summary.sellingPrice, 860);
  closeTo(summary.grossProfit, 397);
  closeTo(summary.vat, 172);
  assert.equal(summary.lines.length, 2);
  assert.deepEqual(summary.lines.map((line) => line.priceBookItemId), ["socket", "downlight"]);
  assert.equal(summary.lines[0].notes, "Above worktop");
});

test("whole-property totals aggregate rooms without mutating their source records", () => {
  const rooms = [
    { id: "room-1", templateKey: "bedroom", points: [{ id: "a", priceBookItemId: "socket", quantity: 3 }] },
    { id: "room-2", templateKey: "bathroom", points: [{ id: "b", priceBookItemId: "downlight", quantity: 4 }] },
  ];
  const original = structuredClone(rooms);
  const summary = wholePropertyEstimateFinancials(rooms, [socket, downlight]);

  assert.deepEqual(rooms, original);
  assert.equal(summary.roomCount, 2);
  assert.equal(summary.pointCount, 7);
  closeTo(summary.labourHours, 6);
  closeTo(summary.labourCost, 180);
  closeTo(summary.materialCost, 132);
  closeTo(summary.sellingPrice, 605);
  closeTo(summary.grossProfit, 273);
  closeTo(summary.vat, 121);
  assert.equal(summary.rooms.length, 2);
});
