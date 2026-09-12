import type { PricingLineItem } from "./models";

export type QuotePresentationMode = "Fixed price" | "Itemised";
export type QuotePresentationAudience = "Customer" | "Internal" | "Engineer";

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
  showLineTotals?: boolean;
  showSubtotal: boolean;
  showVatLine: boolean;
  showTotal?: boolean;
  showCostPrices?: boolean;
  showOverheads?: boolean;
  showMarkup?: boolean;
  showInternalNotes?: boolean;
}

export interface QuotePresentationDefaultsRecord extends QuotePresentationSettings {
  id: "quote-presentation-defaults";
  updatedAt: string;
}

export interface QuotePresentationOverrideRecord extends QuotePresentationSettings {
  id: string;
  documentNumber: string;
  profiles?: Partial<Record<QuotePresentationAudience, QuotePresentationSettings>>;
  updatedAt: string;
}

export const quotePresentationOverridesStorageKey = "jr-os-quote-presentation-overrides";

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
  showLineTotals: false,
  showSubtotal: false,
  showVatLine: true,
  showTotal: true,
  showCostPrices: false,
  showOverheads: false,
  showMarkup: false,
  showInternalNotes: false,
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
    showLineTotals: true,
    showSubtotal: true,
  },
  materialsAndLabour: {
    ...defaultQuotePresentationSettings,
    mode: "Itemised",
    showLabour: true,
    showMaterials: true,
    showQuantities: true,
    showLineTotals: true,
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
    showLineTotals: true,
    showSubtotal: true,
    showVatLine: true,
    showTotal: true,
    showCostPrices: false,
    showOverheads: false,
    showMarkup: false,
    showInternalNotes: false,
  },
} satisfies Record<string, QuotePresentationSettings>;

export const internalQuotePresentationSettings: QuotePresentationSettings = {
  ...quotePresentationPresets.fullBreakdown,
  showCostPrices: true,
  showOverheads: true,
  showMarkup: true,
  showInternalNotes: true,
};

export const engineerQuotePresentationSettings: QuotePresentationSettings = {
  ...defaultQuotePresentationSettings,
  mode: "Itemised",
  showLabour: true,
  showMaterials: true,
  showPlantHire: true,
  showOther: true,
  showQuantities: true,
  showLineTotals: false,
  showVatLine: false,
  showTotal: false,
};

export const quotePresentationAudiences: QuotePresentationAudience[] = ["Customer", "Internal", "Engineer"];

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
  if (settings.mode === "Fixed price") return "One fixed total is shown without internal cost breakdowns.";

  const shown = Object.entries(categoryVisibility)
    .filter(([, key]) => settings[key])
    .map(([category]) => category);

  return shown.length
    ? `Visible sections: ${shown.join(", ")}.`
    : "All item sections are hidden.";
}

export function presentationForAudience(
  record: QuotePresentationOverrideRecord | undefined,
  audience: QuotePresentationAudience,
  customerFallback: QuotePresentationSettings = defaultQuotePresentationSettings,
) {
  if (audience === "Customer") {
    return { ...defaultQuotePresentationSettings, ...customerFallback, ...(record ?? {}), ...(record?.profiles?.Customer ?? {}) };
  }
  const fallback = audience === "Internal" ? internalQuotePresentationSettings : engineerQuotePresentationSettings;
  return { ...fallback, ...(record?.profiles?.[audience] ?? {}) };
}

export function presentationOverrideFor(
  records: QuotePresentationOverrideRecord[],
  documentNumber: string,
) {
  return records.find((record) => record.documentNumber === documentNumber);
}
