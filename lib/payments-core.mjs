function nonBlankId(value) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function paymentTargetForInvoice(invoices, invoiceId, selectedCustomerId) {
  const targetInvoiceId = nonBlankId(invoiceId);
  const targetCustomerId = nonBlankId(selectedCustomerId);

  if (!targetInvoiceId) {
    return { invoiceId: undefined, customerId: targetCustomerId };
  }

  const invoice = invoices.find((candidate) => candidate.id === targetInvoiceId);
  const invoiceCustomerId = nonBlankId(invoice?.customerId);
  if (!invoice || !invoiceCustomerId) return undefined;
  if (targetCustomerId && targetCustomerId !== invoiceCustomerId) return undefined;

  return { invoiceId: targetInvoiceId, customerId: invoiceCustomerId };
}
