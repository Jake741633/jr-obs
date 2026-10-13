const supportedSectors = new Set(["Domestic", "Commercial", "Industrial"]);

export const priceBookCategories = Object.freeze([
  "Power",
  "Lighting",
  "Controls",
  "Fire and life safety",
  "Data and communications",
  "Heating and ventilation",
  "Distribution",
  "EV and renewables",
  "Containment",
  "Testing and certification",
  "Plant and three phase",
  "Other",
]);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegative(value, fallback = 0) {
  return Math.max(0, finiteNumber(value, fallback));
}

function percentage(value, fallback = 0) {
  return Math.min(100, nonNegative(value, fallback));
}

export function normalisePriceBookItem(item) {
  if (!item || typeof item !== "object") throw new TypeError("A price book item is required.");

  const name = String(item.name ?? "").trim();
  if (!name) throw new Error("Price book items require a name.");

  const category = priceBookCategories.includes(item.category) ? item.category : "Other";
  const sector = supportedSectors.has(item.sector) ? item.sector : "Domestic";
  const pricingMethod = item.pricingMethod === "Calculated" ? "Calculated" : "Fixed";

  return {
    ...item,
    id: String(item.id ?? "").trim(),
    name,
    description: String(item.description ?? "").trim(),
    category,
    sector,
    unitLabel: String(item.unitLabel ?? "point").trim() || "point",
    pricingMethod,
    labourHours: nonNegative(item.labourHours),
    labourCostRate: nonNegative(item.labourCostRate),
    labourSellRate: nonNegative(item.labourSellRate),
    materialCost: nonNegative(item.materialCost),
    materialMarkupPercent: percentage(item.materialMarkupPercent),
    fixedSellingPrice: nonNegative(item.fixedSellingPrice),
    overheadAllowance: nonNegative(item.overheadAllowance),
    contingencyPercent: percentage(item.contingencyPercent),
    vatRate: percentage(item.vatRate, 20),
    active: item.active !== false,
    favourite: item.favourite === true,
    supplierItemIds: Array.isArray(item.supplierItemIds)
      ? [...new Set(item.supplierItemIds.map((value) => String(value).trim()).filter(Boolean))]
      : [],
    notes: String(item.notes ?? "").trim(),
    updatedAt: String(item.updatedAt ?? "").trim(),
    createdAt: String(item.createdAt ?? "").trim(),
  };
}

export function priceBookUnitFinancials(source) {
  const item = normalisePriceBookItem(source);
  const labourCost = item.labourHours * item.labourCostRate;
  const labourSelling = item.labourHours * item.labourSellRate;
  const materialSelling = item.materialCost * (1 + item.materialMarkupPercent / 100);
  const calculatedBaseSelling = labourSelling + materialSelling + item.overheadAllowance;
  const contingency = calculatedBaseSelling * (item.contingencyPercent / 100);
  const calculatedSellingPrice = calculatedBaseSelling + contingency;
  const sellingPrice = item.pricingMethod === "Fixed" && item.fixedSellingPrice > 0
    ? item.fixedSellingPrice
    : calculatedSellingPrice;
  const totalCost = labourCost + item.materialCost + item.overheadAllowance;
  const grossProfit = sellingPrice - totalCost;
  const grossMargin = sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0;
  const vat = sellingPrice * (item.vatRate / 100);

  return {
    labourCost,
    labourSelling,
    materialCost: item.materialCost,
    materialSelling,
    overheadAllowance: item.overheadAllowance,
    contingency,
    totalCost,
    sellingPrice,
    grossProfit,
    grossMargin,
    vat,
    sellingPriceIncludingVat: sellingPrice + vat,
  };
}

export function priceBookSelectionFinancials(source, quantity = 1) {
  const item = normalisePriceBookItem(source);
  const safeQuantity = nonNegative(quantity);
  const unit = priceBookUnitFinancials(item);

  return {
    item,
    quantity: safeQuantity,
    unit,
    labourHours: item.labourHours * safeQuantity,
    labourCost: unit.labourCost * safeQuantity,
    materialCost: unit.materialCost * safeQuantity,
    totalCost: unit.totalCost * safeQuantity,
    sellingPrice: unit.sellingPrice * safeQuantity,
    grossProfit: unit.grossProfit * safeQuantity,
    vat: unit.vat * safeQuantity,
    sellingPriceIncludingVat: unit.sellingPriceIncludingVat * safeQuantity,
  };
}

export function priceBookSelectionToQuoteLine(source, quantity, lineId) {
  const selection = priceBookSelectionFinancials(source, quantity);
  if (!String(lineId ?? "").trim()) throw new Error("A quote line ID is required.");

  return {
    id: String(lineId).trim(),
    description: selection.item.name,
    category: selection.item.category,
    quantity: selection.quantity,
    unit: selection.item.unitLabel,
    unitCost: selection.unit.totalCost,
    unitPrice: selection.unit.sellingPrice,
    priceBookItemId: selection.item.id || undefined,
    internalNotes: selection.item.notes,
  };
}

export function priceBookQuoteSummary(selections, options = {}) {
  const rows = Array.isArray(selections) ? selections : [];
  const travel = nonNegative(options.travel);
  const parking = nonNegative(options.parking);
  const plantHire = nonNegative(options.plantHire);
  const additionalOverheads = nonNegative(options.additionalOverheads);
  const contingencyPercent = percentage(options.contingencyPercent);
  const vatRate = percentage(options.vatRate, 20);

  const totals = rows.reduce((summary, selection) => {
    const financials = priceBookSelectionFinancials(selection.item, selection.quantity);
    summary.labourHours += financials.labourHours;
    summary.labourCost += financials.labourCost;
    summary.materialCost += financials.materialCost;
    summary.directCost += financials.totalCost;
    summary.pointSellingPrice += financials.sellingPrice;
    return summary;
  }, {
    labourHours: 0,
    labourCost: 0,
    materialCost: 0,
    directCost: 0,
    pointSellingPrice: 0,
  });

  const extras = travel + parking + plantHire + additionalOverheads;
  const subtotalBeforeContingency = totals.pointSellingPrice + extras;
  const contingency = subtotalBeforeContingency * (contingencyPercent / 100);
  const subtotal = subtotalBeforeContingency + contingency;
  const totalCost = totals.directCost + extras;
  const grossProfit = subtotal - totalCost;
  const grossMargin = subtotal > 0 ? (grossProfit / subtotal) * 100 : 0;
  const vat = subtotal * (vatRate / 100);

  return {
    ...totals,
    travel,
    parking,
    plantHire,
    additionalOverheads,
    contingency,
    subtotal,
    totalCost,
    grossProfit,
    grossMargin,
    vat,
    totalIncludingVat: subtotal + vat,
    profitPerLabourHour: totals.labourHours > 0 ? grossProfit / totals.labourHours : 0,
  };
}
