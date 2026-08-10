export interface PortalAppointmentTarget {
  id: string;
  jobId?: string;
}

export function portalRequestTargetMatchesJob<T extends PortalAppointmentTarget>(
  appointments: readonly T[],
  plannerEntryId: string,
  jobId: string,
): boolean;

export interface PortalPaymentInvoiceTarget {
  id: string;
  customerId?: string;
  jobId?: string;
}

export interface PortalPaymentLinkTarget {
  invoiceId: string;
  customerId?: string;
  jobId?: string;
}

export function portalPaymentLinkForInvoice<T extends PortalPaymentLinkTarget>(
  paymentLinks: readonly T[],
  invoice: PortalPaymentInvoiceTarget | undefined,
  customerId: string,
): T | (T & { customerId: string; jobId?: string }) | undefined;
