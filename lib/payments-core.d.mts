export interface PaymentInvoiceTarget {
  id: string;
  customerId?: string;
}

export interface CanonicalPaymentTarget {
  invoiceId?: string;
  customerId?: string;
}

export function paymentTargetForInvoice(
  invoices: readonly PaymentInvoiceTarget[],
  invoiceId?: string,
  selectedCustomerId?: string,
): CanonicalPaymentTarget | undefined;
