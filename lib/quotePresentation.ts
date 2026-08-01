import type { PricingLineItem } from "./models";

export type QuotePresentationMode = "Fixed price" | "Itemised";

export interface QuotePresentationSettings {
  mode: QuotePresentationMode;
  showLabour: boolean;
  showMaterials: boolean;
  showTravel: boolean;
  showParking: boolean;
  showPlantHire: boolean;
  showContingency: boolean;
  showOther: boolean;
  showQuantities: boolean;
  showUnitPrices: boolean;
  showSubtotal: boolean;
  showVatLine: boolean;
}

export const defaultQuotePresentationSettings: QuotePresentationSettings = {
  mode: "Fixed price",
  showLabour: false,
  showMaterials: false,
  showTravel: false,
  showParking: false,
  showPlantHire: false,
  showContingency: false,
  showOther: false,
  showQuantities: false,
  showUnitPrices: false,
  showSubtotal: false,
  showVatLine: true,
};

const categoryVisibility: Record<PricingLineItem["category"], keyof QuotePresentationSettings> = {
  Labour: "showLabour",
  Materials: "showMaterials",
  Travel: "showTravel",
  Parking: "showParking",
  "Plant Hire": "showPlantHire",
  Contingency: "showContingency",
  Other: "showOther",
};

export function visibleQuoteItems(
  items: PricingLineItem[],
  settings: QuotePresentationSettings = defaultQuotePresentationSettings,
) {
  if (settings.mode === "Fixed price") return [];
  return items.filter((item) => Boolean(settings[categoryVisibility[item.category]]));
}

export function quotePresentationSummary(settings: QuotePresentationSettings) {
  if (settings.mode === "Fixed price") return "Customer sees one fixed total without internal cost breakdowns.";

  const shown = Object.entries(categoryVisibility)
    .filter(([, key]) => settings[key])
    .map(([category]) => category);

  return shown.length
    ? `Customer sees: ${shown.join(", ")}.`
    : "Customer sees the total only; all sections are hidden.";
}
