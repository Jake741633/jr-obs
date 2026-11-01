import type { BusinessOverhead, LabourCostSettings, PricingLineItem, QuotePricingSettings, VatSettings } from "./models";
import { savedIdentityIndex } from "./assistantIdentity";
import { validEstimateAmount } from "./estimateCostReview";
import { reviewQuoteDraftLines } from "./quoteDraftLines";
import { calculateQuoteProfitability } from "./quoteEngine";

export type QuoteDraftPricingIssue = "lines" | "contingencyPercent" | "travelCost" | "travelPrice" | "parkingCost" | "parkingPrice" | "labourSettings" | "overheads" | "vat" | "totals";

export function reviewQuoteDraftPricing({ items, pricing, overheads, labourSettings, vatSettings }: {
  items: readonly PricingLineItem[]; pricing: QuotePricingSettings; overheads: readonly BusinessOverhead[];
  labourSettings: LabourCostSettings; vatSettings: Pick<VatSettings, "registrationStatus" | "defaultRate">;
}) {
  const issues: QuoteDraftPricingIssue[] = [];
  if (!reviewQuoteDraftLines(items).complete) issues.push("lines");
  for (const field of ["contingencyPercent", "travelCost", "travelPrice", "parkingCost", "parkingPrice"] as const) {
    if (!validEstimateAmount(pricing[field])) issues.push(field);
  }
  if (!validEstimateAmount(labourSettings.workingDaysPerYear) || labourSettings.workingDaysPerYear <= 0
    || !validEstimateAmount(labourSettings.billableHoursPerDay) || labourSettings.billableHoursPerDay <= 0
    || !validEstimateAmount(labourSettings.targetNetMargin) || labourSettings.targetNetMargin > 100) issues.push("labourSettings");
  const uniqueOverheads = savedIdentityIndex(overheads).unique;
  if (overheads.some(overhead => overhead.active !== false && (overhead.active !== true || !uniqueOverheads.has(overhead.id)
    || !validEstimateAmount(overhead.amount) || !["Weekly", "Monthly", "Annual"].includes(overhead.frequency)))) issues.push("overheads");
  if (!["Not registered", "Registration pending", "VAT registered"].includes(vatSettings.registrationStatus)
    || !validEstimateAmount(vatSettings.defaultRate) || vatSettings.defaultRate > 100) issues.push("vat");
  if (issues.length) return { complete: false, issues, profitability: null, totals: null };

  const profitability = calculateQuoteProfitability([...items], pricing, [...overheads], labourSettings);
  const lineSubtotal = items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const contingency = lineSubtotal * (pricing.contingencyPercent / 100);
  const net = profitability.sellingPrice, vatEnabled = vatSettings.registrationStatus === "VAT registered", vatRate = vatSettings.defaultRate;
  const vat = vatEnabled ? net * vatRate / 100 : 0, total = net + vat;
  if (!Object.values(profitability).every(value => Number.isFinite(value))
    || ![lineSubtotal, contingency, profitability.directCost, profitability.overheadHourlyCost, profitability.overheadCost, profitability.costPrice, net, vat, total].every(validEstimateAmount)) {
    issues.push("totals"); return { complete: false, issues, profitability: null, totals: null };
  }
  return { complete: true, issues, profitability,
    totals: { lineSubtotal, contingency, travelPrice: pricing.travelPrice, parkingPrice: pricing.parkingPrice, net, vatEnabled, vatRate, vat, total } };
}
