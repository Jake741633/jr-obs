const templateDefinitions = [
  ["double-socket", "Double socket point", "Power", "point"],
  ["single-socket", "Single socket point", "Power", "point"],
  ["usb-socket", "USB socket point", "Power", "point"],
  ["fused-spur", "Switched fused spur", "Controls", "point"],
  ["cooker-outlet", "Cooker outlet", "Power", "point"],
  ["cooker-switch", "Cooker control switch", "Controls", "point"],
  ["isolator", "Local isolator", "Controls", "point"],
  ["downlight", "LED downlight", "Lighting", "point"],
  ["pendant", "Pendant light point", "Lighting", "point"],
  ["batten", "Batten light fitting", "Lighting", "point"],
  ["external-light", "External light point", "Lighting", "point"],
  ["smoke-alarm", "Smoke alarm", "Fire and life safety", "device"],
  ["heat-alarm", "Heat alarm", "Fire and life safety", "device"],
  ["extract-fan", "Extract fan", "Heating and ventilation", "item"],
  ["data-point", "Data point", "Data and communications", "point"],
  ["tv-point", "TV point", "Data and communications", "point"],
  ["consumer-unit", "Consumer unit replacement", "Distribution", "item"],
  ["rcbo", "RCBO installation", "Distribution", "device"],
  ["spd", "Surge protection device", "Distribution", "device"],
  ["afdd", "Arc fault detection device", "Distribution", "device"],
  ["ev-charger", "EV charger installation", "EV and renewables", "item"],
  ["new-circuit", "New final circuit", "Distribution", "circuit"],
  ["eicr", "Electrical installation condition report", "Testing and certification", "report"],
  ["fault-finding", "Initial fault finding", "Testing and certification", "visit"],
];

export const electricalPointTemplates = Object.freeze(templateDefinitions.map(([key, name, category, unitLabel]) => Object.freeze({
  key,
  name,
  category,
  unitLabel,
})));

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function createPriceBookItemFromTemplate(templateKey, options = {}) {
  const template = electricalPointTemplates.find((candidate) => candidate.key === templateKey);
  if (!template) throw new Error(`Unknown electrical point template: ${templateKey}`);

  const now = String(options.now ?? new Date().toISOString());
  const pricingMethod = options.pricingMethod === "Calculated" ? "Calculated" : "Fixed";

  return {
    id: String(options.id ?? "").trim(),
    name: String(options.name ?? template.name).trim() || template.name,
    description: String(options.description ?? "").trim(),
    category: template.category,
    sector: ["Domestic", "Commercial", "Industrial"].includes(options.sector) ? options.sector : "Domestic",
    unitLabel: String(options.unitLabel ?? template.unitLabel).trim() || template.unitLabel,
    pricingMethod,
    labourHours: finiteNonNegative(options.labourHours),
    labourCostRate: finiteNonNegative(options.labourCostRate),
    labourSellRate: finiteNonNegative(options.labourSellRate),
    materialCost: finiteNonNegative(options.materialCost),
    materialMarkupPercent: finiteNonNegative(options.materialMarkupPercent),
    fixedSellingPrice: finiteNonNegative(options.fixedSellingPrice),
    overheadAllowance: finiteNonNegative(options.overheadAllowance),
    contingencyPercent: finiteNonNegative(options.contingencyPercent),
    vatRate: finiteNonNegative(options.vatRate ?? 20),
    active: options.active !== false,
    favourite: options.favourite === true,
    supplierItemIds: [],
    notes: String(options.notes ?? "").trim(),
    templateKey: template.key,
    createdAt: now,
    updatedAt: now,
  };
}

export function availableElectricalPointTemplates(existingItems = []) {
  const usedKeys = new Set((Array.isArray(existingItems) ? existingItems : [])
    .map((item) => String(item?.templateKey ?? "").trim())
    .filter(Boolean));

  return electricalPointTemplates.filter((template) => !usedKeys.has(template.key));
}
