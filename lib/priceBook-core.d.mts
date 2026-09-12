export type PriceBookSector = "Domestic" | "Commercial" | "Industrial";
export type PriceBookPricingMethod = "Fixed" | "Calculated";

export interface PriceBookItem {
  id: string;
  name: string;
  description: string;
  category: string;
  sector: PriceBookSector;
  unitLabel: string;
  pricingMethod: PriceBookPricingMethod;
  labourHours: number;
  labourCostRate: number;
  labourSellRate: number;
  materialCost: number;
  materialMarkupPercent: number;
  fixedSellingPrice: number;
  overheadAllowance: number;
  contingencyPercent: number;
  vatRate: number;
  active: boolean;
  favourite: boolean;
  supplierItemIds: string[];
  notes: string;
  updatedAt: string;
  createdAt: string;
}

export interface PriceBookUnitFinancials {
  labourCost: number;
  labourSelling: number;
  materialCost: number;
  materialSelling: number;
  overheadAllowance: number;
  contingency: number;
  totalCost: number;
  sellingPrice: number;
  grossProfit: number;
  grossMargin: number;
  vat: number;
  sellingPriceIncludingVat: number;
}

export interface PriceBookSelectionFinancials {
  item: PriceBookItem;
  quantity: number;
  unit: PriceBookUnitFinancials;
  labourHours: number;
  labourCost: number;
  materialCost: number;
  totalCost: number;
  sellingPrice: number;
  grossProfit: number;
  vat: number;
  sellingPriceIncludingVat: number;
}

export interface PriceBookQuoteLine {
  id: string;
  description: string;
  category: "Other";
  quantity: number;
  unit: string;
  unitCost: number;
  unitPrice: number;
  priceBookItemId?: string;
  internalNotes: string;
}

export interface PriceBookQuoteOptions {
  travel?: number;
  parking?: number;
  plantHire?: number;
  additionalOverheads?: number;
  contingencyPercent?: number;
  vatRate?: number;
}

export interface PriceBookQuoteSummary {
  labourHours: number;
  labourCost: number;
  materialCost: number;
  directCost: number;
  pointSellingPrice: number;
  travel: number;
  parking: number;
  plantHire: number;
  additionalOverheads: number;
  contingency: number;
  subtotal: number;
  totalCost: number;
  grossProfit: number;
  grossMargin: number;
  vat: number;
  totalIncludingVat: number;
  profitPerLabourHour: number;
}

export const priceBookCategories: readonly string[];

export function normalisePriceBookItem(item: Partial<PriceBookItem> & Pick<PriceBookItem, "name">): PriceBookItem;
export function priceBookUnitFinancials(source: Partial<PriceBookItem> & Pick<PriceBookItem, "name">): PriceBookUnitFinancials;
export function priceBookSelectionFinancials(source: Partial<PriceBookItem> & Pick<PriceBookItem, "name">, quantity?: number): PriceBookSelectionFinancials;
export function priceBookSelectionToQuoteLine(source: Partial<PriceBookItem> & Pick<PriceBookItem, "name">, quantity: number, lineId: string): PriceBookQuoteLine;
export function priceBookQuoteSummary(selections: Array<{ item: Partial<PriceBookItem> & Pick<PriceBookItem, "name">; quantity: number }>, options?: PriceBookQuoteOptions): PriceBookQuoteSummary;
