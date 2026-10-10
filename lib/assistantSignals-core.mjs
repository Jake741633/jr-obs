/** Date-only comparisons use calendar days in the device's local timezone. */
export function assistantDateKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** @param {string | undefined} value */
export function assistantDay(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp / 86400000 : null;
}

/** @param {import('./models').Invoice} invoice @param {number} [paidAmount] */
export function assistantInvoiceBalance(invoice, paidAmount = invoice.amountPaid) {
  const subtotal = invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const total = subtotal * (invoice.vatEnabled ? 1 + invoice.vatRate / 100 : 1);
  const balance = Math.round((total - paidAmount) * 100) / 100;
  return Number.isFinite(balance) ? Math.max(0, balance) : 0;
}

/** @param {import('./models').Invoice} invoice @param {Date} [now] @param {number} [paidAmount] */
export function isAssistantInvoiceOverdue(invoice, now = new Date(), paidAmount = invoice.amountPaid) {
  const due = assistantDay(invoice.dueDate);
  const today = assistantDay(assistantDateKey(now));
  return ["Sent", "Part paid", "Overdue"].includes(invoice.status)
    && assistantInvoiceBalance(invoice, paidAmount) > 0 && due !== null && today !== null && due < today;
}

/** A scheduled follow-up takes precedence over the default three-day reminder.
 * @param {import('./models').PricingDocument} quote @param {Date} [now]
 */
export function assistantQuoteFollowUpDue(quote, now = new Date()) {
  if (quote.type !== "Quote" || quote.status !== "Sent") return false;
  const today = assistantDay(assistantDateKey(now));
  if (today === null) return false;
  if (quote.nextFollowUpDate) {
    const scheduled = assistantDay(quote.nextFollowUpDate);
    return scheduled !== null && scheduled <= today;
  }
  const lastContact = Date.parse(quote.lastFollowUpAt || quote.updatedAt);
  if (!Number.isFinite(lastContact) || lastContact > now.getTime()) return false;
  if (now.getTime() - lastContact >= 3 * 86400000) return true;
  // Recent contact suppresses repeated reminders, even near expiry.
  if (quote.lastFollowUpAt) return false;
  const expiry = assistantDay(quote.validUntil);
  return expiry !== null && expiry - today <= 7;
}
