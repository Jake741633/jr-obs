import { wholePropertyEstimateFinancials, wholePropertyEstimateToQuoteLines } from "./roomEstimating.mjs";

function cleanText(value) {
  return String(value ?? "").trim();
}

function positiveNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

/**
 * Builds a Quote Builder-compatible draft from saved room estimates.
 * Internal room costs stay in the financial summary and are never copied
 * into customer-facing quote lines.
 */
export function buildRoomEstimateQuoteDraft({
  rooms = [],
  priceBookItems = [],
  customerId = "",
  builderId = "",
  jobId = "",
  title = "Room-by-room electrical estimate",
  notes = "",
  exclusions = "",
  vatEnabled = false,
  vatRate = 20,
  makeId = (value) => value,
} = {}) {
  const lines = wholePropertyEstimateToQuoteLines(rooms, priceBookItems, makeId);
  const financials = wholePropertyEstimateFinancials(rooms, priceBookItems);
  const safeVatRate = positiveNumber(vatRate, 20);
  const subtotal = lines.reduce((total, line) => total + positiveNumber(line.quantity) * positiveNumber(line.unitPrice), 0);
  const vat = vatEnabled ? subtotal * (safeVatRate / 100) : 0;

  return {
    customerId: cleanText(customerId),
    builderId: cleanText(builderId),
    jobId: cleanText(jobId),
    title: cleanText(title) || "Room-by-room electrical estimate",
    status: "Draft",
    pricingMode: "fixed-price",
    items: lines,
    notes: cleanText(notes),
    exclusions: cleanText(exclusions),
    internalNotes: `Created from ${financials.roomCount} room estimate${financials.roomCount === 1 ? "" : "s"} containing ${financials.pointCount} priced point${financials.pointCount === 1 ? "" : "s"}.`,
    vatEnabled: Boolean(vatEnabled),
    vatRate: safeVatRate,
    subtotal,
    vat,
    total: subtotal + vat,
    source: {
      type: "room-estimator",
      roomIds: financials.rooms.map((room) => room.room.id).filter(Boolean),
    },
    financials,
  };
}
