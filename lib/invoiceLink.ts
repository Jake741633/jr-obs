function validInvoiceId(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= 300;
}

export function invoiceReviewHref(invoiceId: string) {
  return validInvoiceId(invoiceId) ? `/invoices?invoice=${encodeURIComponent(invoiceId)}` : "/invoices";
}

/** An invoice parameter selects a saved identity only; it takes precedence over create links. */
export function invoiceFromLink(search: string): { invoiceId: string | null } | null {
  const ids = new URLSearchParams(search).getAll("invoice");
  if (!ids.length) return null;
  return { invoiceId: ids.length === 1 && validInvoiceId(ids[0]) ? ids[0] : null };
}
