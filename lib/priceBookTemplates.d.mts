import type { PriceBookItem, PriceBookPricingMethod, PriceBookSector } from "./priceBook-core.mjs";

export interface ElectricalPointTemplate {
  key: string;
  name: string;
  category: string;
  unitLabel: string;
}

export interface CreatePriceBookTemplateOptions {
  id?: string;
  name?: string;
  description?: string;
  sector?: PriceBookSector;
  unitLabel?: string;
  pricingMethod?: PriceBookPricingMethod;
  labourHours?: number | string;
  labourCostRate?: number | string;
  labourSellRate?: number | string;
  materialCost?: number | string;
  materialMarkupPercent?: number | string;
  fixedSellingPrice?: number | string;
  overheadAllowance?: number | string;
  contingencyPercent?: number | string;
  vatRate?: number | string;
  active?: boolean;
  favourite?: boolean;
  notes?: string;
  now?: string;
}

export interface TemplatedPriceBookItem extends PriceBookItem {
  templateKey: string;
}

export const electricalPointTemplates: readonly ElectricalPointTemplate[];

export function createPriceBookItemFromTemplate(
  templateKey: string,
  options?: CreatePriceBookTemplateOptions,
): TemplatedPriceBookItem;

export function availableElectricalPointTemplates(
  existingItems?: Array<Partial<TemplatedPriceBookItem>>,
): ElectricalPointTemplate[];
