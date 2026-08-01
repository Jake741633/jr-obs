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

export interface QuotePresentationDefaultsRecord extends QuotePresentationSettings {
  id: "quote-presentation-defaults";
  updatedAt: string;
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

export const defaultQuotePresentationRecord: QuotePresentationDefaultsRecord = {
  id: "quote-presentation-defaults",
  ...defaultQuotePresentationSettings,
  updatedAt: new Date(0).toISOString(),
};

export const quotePresentationPresets = {
  fixedPrice: defaultQuotePresentationSettings,
  labourOnly: {
    ...defaultQuotePresentationSettings,
    mode: "Itemised",
    showLabour: true,
    showSubtotal: true,
  },
  materialsAndLabour: {
    ...defaultQuotePresentationSettings,
    mode: "Itemised",
    showLabour: true,
    showMaterials: true,
    showQuantities: true,
    showSubtotal: true,
  },
  fullBreakdown: {
    mode: "Itemised",
    showLabour: true,
    showMaterials: true,
    showTravel: true,
    showParking: true,
    showPlantHire: true,
    showContingency: true,
    showOther: true,
    showQuantities: true,
    showUnitPrices: true,
    showSubtotal: true,
    showVatLine: true,
  },
} satisfies Record<string, QuotePresentationSettings>;

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
