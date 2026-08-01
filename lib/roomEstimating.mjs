import { priceBookSelectionFinancials } from "./priceBook-core.mjs";

const roomDefinitions = [
  ["kitchen", "Kitchen"],
  ["utility", "Utility room"],
  ["lounge", "Lounge"],
  ["dining", "Dining room"],
  ["bedroom", "Bedroom"],
  ["bathroom", "Bathroom"],
  ["ensuite", "Ensuite"],
  ["hall", "Hall"],
  ["landing", "Landing"],
  ["garage", "Garage"],
  ["loft", "Loft"],
  ["office", "Office"],
  ["external", "External area"],
  ["custom", "Custom room or area"],
];

export const electricalRoomTemplates = Object.freeze(roomDefinitions.map(([key, name]) => Object.freeze({ key, name })));

function nonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

export function normaliseRoomEstimate(room = {}) {
  const templateKey = cleanText(room.templateKey) || "custom";
  const template = electricalRoomTemplates.find((candidate) => candidate.key === templateKey);
  const name = cleanText(room.name) || template?.name || "Custom room or area";
  const points = Array.isArray(room.points)
    ? room.points
      .map((point) => ({
        id: cleanText(point?.id),
        priceBookItemId: cleanText(point?.priceBookItemId),
        quantity: nonNegative(point?.quantity),
        notes: cleanText(point?.notes),
      }))
      .filter((point) => point.priceBookItemId && point.quantity > 0)
    : [];

  return {
    id: cleanText(room.id),
    templateKey: template?.key ?? "custom",
    name,
    notes: cleanText(room.notes),
    internalNotes: cleanText(room.internalNotes),
    points,
    createdAt: cleanText(room.createdAt),
    updatedAt: cleanText(room.updatedAt),
  };
}

export function roomEstimateFinancials(room, priceBookItems = []) {
  const normalisedRoom = normaliseRoomEstimate(room);
  const itemsById = new Map((Array.isArray(priceBookItems) ? priceBookItems : []).map((item) => [cleanText(item?.id), item]));

  const selections = normalisedRoom.points.flatMap((point) => {
    const item = itemsById.get(point.priceBookItemId);
    if (!item) return [];
    return [{ point, financials: priceBookSelectionFinancials(item, point.quantity) }];
  });

  return selections.reduce((summary, selection) => {
    summary.pointCount += selection.financials.quantity;
    summary.labourHours += selection.financials.labourHours;
    summary.labourCost += selection.financials.labourCost;
    summary.materialCost += selection.financials.materialCost;
    summary.totalCost += selection.financials.totalCost;
    summary.sellingPrice += selection.financials.sellingPrice;
    summary.grossProfit += selection.financials.grossProfit;
    summary.vat += selection.financials.vat;
    summary.lines.push({
      roomPointId: selection.point.id || undefined,
      priceBookItemId: selection.point.priceBookItemId,
      quantity: selection.financials.quantity,
      description: selection.financials.item.name,
      unitLabel: selection.financials.item.unitLabel,
      sellingPrice: selection.financials.sellingPrice,
      notes: selection.point.notes,
    });
    return summary;
  }, {
    room: normalisedRoom,
    pointCount: 0,
    labourHours: 0,
    labourCost: 0,
    materialCost: 0,
    totalCost: 0,
    sellingPrice: 0,
    grossProfit: 0,
    vat: 0,
    lines: [],
  });
}

export function wholePropertyEstimateFinancials(rooms, priceBookItems = []) {
  const roomRows = (Array.isArray(rooms) ? rooms : []).map((room) => roomEstimateFinancials(room, priceBookItems));
  return roomRows.reduce((summary, room) => {
    summary.roomCount += 1;
    summary.pointCount += room.pointCount;
    summary.labourHours += room.labourHours;
    summary.labourCost += room.labourCost;
    summary.materialCost += room.materialCost;
    summary.totalCost += room.totalCost;
    summary.sellingPrice += room.sellingPrice;
    summary.grossProfit += room.grossProfit;
    summary.vat += room.vat;
    summary.rooms.push(room);
    return summary;
  }, {
    roomCount: 0,
    pointCount: 0,
    labourHours: 0,
    labourCost: 0,
    materialCost: 0,
    totalCost: 0,
    sellingPrice: 0,
    grossProfit: 0,
    vat: 0,
    rooms: [],
  });
}
