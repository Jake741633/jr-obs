import type { BusinessOverhead, LabourCostSettings, PricingLineItem, QuotePricingSettings } from "./models";

export const defaultQuotePricingSettings: QuotePricingSettings = {
  contingencyPercent: 0,
  materialMarkupPercent: 20,
  travelCost: 0,
  travelPrice: 0,
  parkingCost: 0,
  parkingPrice: 0,
};

export function annualOverheadCost(overhead: BusinessOverhead) {
  if (!overhead.active) return 0;
  if (overhead.frequency === "Weekly") return overhead.amount * 52;
  if (overhead.frequency === "Monthly") return overhead.amount * 12;
  return overhead.amount;
}

export function calculateQuoteProfitability(
  items: PricingLineItem[],
  pricing: QuotePricingSettings,
  overheads: BusinessOverhead[],
  labourSettings: LabourCostSettings,
) {
  const lineCost = items.reduce((sum, item) => sum + item.quantity * (item.unitCost ?? item.unitPrice), 0);
  const lineSellingPrice = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const labourHours = items
    .filter((item) => item.category === "Labour")
    .reduce((sum, item) => sum + (item.labourHours ?? (item.labourMode === "Hours" ? item.quantity : 0)), 0);
  const annualOverheads = overheads.reduce((sum, overhead) => sum + annualOverheadCost(overhead), 0);
  const annualBillableHours = labourSettings.workingDaysPerYear * labourSettings.billableHoursPerDay;
  const overheadHourlyCost = annualBillableHours > 0 ? annualOverheads / annualBillableHours : 0;
  const overheadCost = labourHours * overheadHourlyCost;
  const directCost = lineCost + pricing.travelCost + pricing.parkingCost;
  const contingency = lineSellingPrice * (pricing.contingencyPercent / 100);
  const sellingPrice = lineSellingPrice + contingency + pricing.travelPrice + pricing.parkingPrice;
  const costPrice = directCost + overheadCost;
  const grossProfit = sellingPrice - directCost;
  const expectedProfit = sellingPrice - costPrice;

  return {
    labourHours,
    overheadHourlyCost,
    directCost,
    overheadCost,
    costPrice,
    sellingPrice,
    grossProfit,
    expectedProfit,
    grossMargin: sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0,
    netMargin: sellingPrice > 0 ? (expectedProfit / sellingPrice) * 100 : 0,
  };
}
