import assert from "node:assert/strict";
import test from "node:test";

import { buildRoomEstimateQuoteDraft } from "../lib/roomEstimateQuoteDraft.mjs";

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

const rooms = [
  {
    id: "kitchen-1",
    templateKey: "kitchen",
    internalNotes: "Stone worktops",
    points: [{ id: "socket-a", priceBookItemId: "socket", quantity: 4, notes: "Above worktop" }],
  },
  {
    id: "bathroom-1",
    templateKey: "bathroom",
    points: [{ id: "light-a", priceBookItemId: "downlight", quantity: 6 }],
  },
];

test("builds a linked fixed-price quote draft from room estimates", () => {
  const draft = buildRoomEstimateQuoteDraft({
    rooms,
    priceBookItems: [socket, downlight],
    customerId: " customer-1 ",
    builderId: " builder-1 ",
    jobId: " job-1 ",
    title: " Kitchen and bathroom ",
    notes: " Customer-facing scope ",
    exclusions: " Making good excluded ",
    makeId: (value) => `quote-${value}`,
  });

  assert.equal(draft.customerId, "customer-1");
  assert.equal(draft.builderId, "builder-1");
  assert.equal(draft.jobId, "job-1");
  assert.equal(draft.title, "Kitchen and bathroom");
  assert.equal(draft.status, "Draft");
  assert.equal(draft.pricingMode, "fixed-price");
  assert.equal(draft.items.length, 2);
  assert.deepEqual(draft.items.map((item) => item.id), [
    "quote-1-kitchen-1-socket-a",
    "quote-2-bathroom-1-light-a",
  ]);
  assert.deepEqual(draft.source, {
    type: "room-estimator",
    roomIds: ["kitchen-1", "bathroom-1"],
  });
  assert.equal(draft.notes, "Customer-facing scope");
  assert.equal(draft.exclusions, "Making good excluded");
});

test("calculates subtotal and VAT from customer-safe quote lines", () => {
  const draft = buildRoomEstimateQuoteDraft({
    rooms,
    priceBookItems: [socket, downlight],
    vatEnabled: true,
    vatRate: 20,
  });

  assert.equal(draft.subtotal, 860);
  assert.equal(draft.vat, 172);
  assert.equal(draft.total, 1032);
  assert.equal(draft.vatEnabled, true);
  assert.equal(draft.vatRate, 20);
});

test("keeps internal costs and profit out of customer-facing quote lines", () => {
  const draft = buildRoomEstimateQuoteDraft({ rooms, priceBookItems: [socket, downlight] });

  for (const item of draft.items) {
    assert.equal(item.unitCost, 0);
    assert.equal("labourCost" in item, false);
    assert.equal("materialCost" in item, false);
    assert.equal("grossProfit" in item, false);
  }

  assert.equal(draft.financials.labourCost, 300);
  assert.equal(draft.financials.materialCost, 188);
  assert.equal(draft.financials.grossProfit, 322);
  assert.match(draft.internalNotes, /2 room estimates containing 10 priced points/);
});

test("uses safe defaults for empty and invalid draft input", () => {
  const draft = buildRoomEstimateQuoteDraft({
    title: "   ",
    vatEnabled: true,
    vatRate: -5,
    rooms: null,
    priceBookItems: null,
  });

  assert.equal(draft.title, "Room-by-room electrical estimate");
  assert.equal(draft.items.length, 0);
  assert.equal(draft.subtotal, 0);
  assert.equal(draft.vatRate, 20);
  assert.equal(draft.vat, 0);
  assert.equal(draft.total, 0);
  assert.deepEqual(draft.source.roomIds, []);
});
