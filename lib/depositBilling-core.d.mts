import type { Invoice, PricingLineItem } from './models';
export interface BillingLinks { invoices: Invoice[]; quoteId?: string; jobId?: string; customerId?: string; builderId?: string; }
export function linkedBillingInvoices(input: BillingLinks): Invoice[];
export function finalInvoiceItems(input: BillingLinks & { items: PricingLineItem[]; vatEnabled: boolean; vatRate: number; createId: (prefix: string) => string }): { items: PricingLineItem[]; appliedDepositInvoiceIds: string[] };

export function payablePence(amount: number): number;

export function roundedPence(amount: number): number;
