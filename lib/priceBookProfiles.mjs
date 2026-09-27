const supportedSectors = new Set(["Domestic", "Commercial", "Industrial"]);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegative(value, fallback = 0) {
  return Math.max(0, finiteNumber(value, fallback));
}

function boundedPercentage(value, fallback = 0) {
  return Math.min(100, nonNegative(value, fallback));
}

function optionalNonNegative(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return nonNegative(value);
}

export function normalisePriceBookProfile(profile = {}) {
  const now = String(profile.updatedAt ?? profile.createdAt ?? "").trim();
  const name = String(profile.name ?? "").trim();
  if (!name) throw new Error("Price-book profiles require a name.");

  return {
    id: String(profile.id ?? "").trim(),
    name,
    description: String(profile.description ?? "").trim(),
    sector: supportedSectors.has(profile.sector) ? profile.sector : "Domestic",
    customerType: String(profile.customerType ?? "Standard").trim() || "Standard",
    labourSellRate: optionalNonNegative(profile.labourSellRate),
    labourCostRate: optionalNonNegative(profile.labourCostRate),
    materialMarkupPercent: optionalNonNegative(profile.materialMarkupPercent),
    overheadPercent: boundedPercentage(profile.overheadPercent),
    contingencyPercent: optionalNonNegative(profile.contingencyPercent),
    sellingPriceAdjustmentPercent: Math.max(-100, Math.min(500, finiteNumber(profile.sellingPriceAdjustmentPercent))),
    vatRate: optionalNonNegative(profile.vatRate),
    active: profile.active !== false,
    isDefault: profile.isDefault === true,
    builderId: String(profile.builderId ?? "").trim() || undefined,
    notes: String(profile.notes ?? "").trim(),
    createdAt: String(profile.createdAt ?? now).trim(),
    updatedAt: now,
  };
}

export function applyPriceBookProfile(item, sourceProfile) {
  if (!item || typeof item !== "object") throw new TypeError("A price-book item is required.");
  const profile = normalisePriceBookProfile(sourceProfile);
  const baseSellingPrice = nonNegative(item.fixedSellingPrice);
  const adjustedSellingPrice = baseSellingPrice * (1 + profile.sellingPriceAdjustmentPercent / 100);
  const materialCost = nonNegative(item.materialCost);
  const overheadAllowance = materialCost * (profile.overheadPercent / 100);

  return {
    ...item,
    sector: profile.sector,
    labourSellRate: profile.labourSellRate ?? nonNegative(item.labourSellRate),
    labourCostRate: profile.labourCostRate ?? nonNegative(item.labourCostRate),
    materialMarkupPercent: profile.materialMarkupPercent ?? nonNegative(item.materialMarkupPercent),
    contingencyPercent: profile.contingencyPercent ?? nonNegative(item.contingencyPercent),
    vatRate: profile.vatRate ?? nonNegative(item.vatRate, 20),
    fixedSellingPrice: item.pricingMethod === "Fixed" ? adjustedSellingPrice : baseSellingPrice,
    overheadAllowance: nonNegative(item.overheadAllowance) + overheadAllowance,
    pricingProfileId: profile.id || undefined,
    pricingProfileName: profile.name,
  };
}

export function choosePriceBookProfile(profiles, options = {}) {
  const available = (Array.isArray(profiles) ? profiles : [])
    .map((profile) => normalisePriceBookProfile(profile))
    .filter((profile) => profile.active);

  const builderId = String(options.builderId ?? "").trim();
  const sector = supportedSectors.has(options.sector) ? options.sector : undefined;

  if (builderId) {
    const builderProfile = available.find((profile) => profile.builderId === builderId && (!sector || profile.sector === sector));
    if (builderProfile) return builderProfile;
  }

  const defaultForSector = available.find((profile) => profile.isDefault && (!sector || profile.sector === sector));
  if (defaultForSector) return defaultForSector;

  return available.find((profile) => !sector || profile.sector === sector) ?? null;
}

export function priceBookProfileImpact(item, sourceProfile) {
  const profiled = applyPriceBookProfile(item, sourceProfile);
  return {
    originalFixedSellingPrice: nonNegative(item?.fixedSellingPrice),
    adjustedFixedSellingPrice: nonNegative(profiled.fixedSellingPrice),
    sellingPriceDifference: nonNegative(profiled.fixedSellingPrice) - nonNegative(item?.fixedSellingPrice),
    labourSellRate: nonNegative(profiled.labourSellRate),
    labourCostRate: nonNegative(profiled.labourCostRate),
    materialMarkupPercent: nonNegative(profiled.materialMarkupPercent),
    overheadAllowance: nonNegative(profiled.overheadAllowance),
    contingencyPercent: nonNegative(profiled.contingencyPercent),
    vatRate: nonNegative(profiled.vatRate),
  };
}
