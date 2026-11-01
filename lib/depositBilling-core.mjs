const currencyFormat = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
export function roundedPence(amount) {
  if (!Number.isFinite(amount)) return NaN;
  const pence = Math.round(Number(currencyFormat.format(amount)) * 100);
  return Number.isSafeInteger(pence) ? pence : NaN;
}

export function payablePence(amount) {
  const pence = roundedPence(amount);
  if (!Number.isFinite(pence) || amount < 0) throw new Error("Review invalid invoice amounts before billing.");
  return pence;
}

const issuedStatuses = new Set(["Sent", "Part paid", "Paid", "Overdue"]);
const identity = (value) => typeof value === "string" && value.trim() ? value : undefined;

export function linkedBillingInvoices({ invoices, quoteId, jobId, customerId, builderId }) {
  const linked = invoices.filter((invoice) => invoice.status !== "Cancelled"
    && ((identity(quoteId) && invoice.quoteId === quoteId) || (identity(jobId) && invoice.jobId === jobId)));
  for (const invoice of linked) {
    if (!identity(invoice.id) || invoices.filter((item) => item.id === invoice.id).length !== 1
      || identity(invoice.customerId) !== identity(customerId) || identity(invoice.builderId) !== identity(builderId)
      || (identity(invoice.quoteId) && invoice.quoteId !== quoteId)
      || (identity(invoice.jobId) && invoice.jobId !== jobId)) {
      throw new Error("Review the invoice identities and customer, quote and job links before billing.");
    }
  }
  return linked;
}

export function finalInvoiceItems({ items, quoteId, jobId, customerId, builderId, vatEnabled, vatRate, invoices, createId }) {
  const linked = linkedBillingInvoices({ invoices, quoteId, jobId, customerId, builderId });
  const deposits = [];
  for (const invoice of linked) {
    if (invoice.purpose !== "Deposit") throw new Error("Review the existing linked invoice before creating another final invoice.");
    if (!identity(invoice.quoteId) || !identity(invoice.depositRequirementId)) throw new Error("Review the explicit deposit quote and requirement links before final billing.");
    if (invoice.status === "Draft") throw new Error("Issue or cancel the draft deposit invoice before creating the final invoice.");
    if (identity(invoice.depositRequirementId) && deposits.some((deposit) => deposit.invoice.depositRequirementId === invoice.depositRequirementId)) {
      throw new Error("Review duplicate deposit invoices for the same requirement before final billing.");
    }
    if (!issuedStatuses.has(invoice.status)) throw new Error("Review the deposit invoice status before final billing.");
    if (invoice.vatEnabled !== vatEnabled || (vatEnabled && invoice.vatRate !== vatRate)) {
      throw new Error("Review inconsistent deposit invoice VAT before final billing.");
    }
    if (invoices.some((other) => other.status !== "Cancelled" && other.appliedDepositInvoiceIds?.includes(invoice.id))) {
      throw new Error("This deposit invoice has already been applied. Review the linked final invoice.");
    }
    if (!Array.isArray(invoice.items) || !invoice.items.length
      || invoice.items.some((item) => !Number.isFinite(item.quantity) || !Number.isFinite(item.unitPrice) || item.quantity <= 0 || item.unitPrice < 0)) {
      throw new Error("Review invalid deposit invoice amounts before final billing.");
    }
    const net = invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    if (!Number.isFinite(net) || net <= 0) throw new Error("Review invalid deposit invoice amounts before final billing.");
    const gross = net + (vatEnabled ? net * vatRate / 100 : 0);
    const pence = payablePence(gross);
    if (pence <= 0 || Math.abs(gross - pence / 100) > 0.0000001) throw new Error("Review historical deposit amounts with fractional payable pennies before final billing.");
    deposits.push({ invoice, net, pence });
  }
  const net = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const divisor = vatEnabled ? 1 + vatRate / 100 : 1;
  const contractPence = payablePence(net + (vatEnabled ? net * vatRate / 100 : 0));
  const depositPence = deposits.reduce((sum, deposit) => sum + deposit.pence, 0);
  if (!Number.isSafeInteger(depositPence) || depositPence > contractPence) {
    throw new Error("Review deposit invoices exceeding the agreed final scope.");
  }
  const resultItems = [...items, ...deposits.map(({ invoice, net }) => ({ id: createId("invoice-line"), description: `Deposit already invoiced on ${invoice.number}`, category: "Other", quantity: 1, unitPrice: -net }))];
  if (deposits.length) {
    const remainingNet = resultItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const targetPence = contractPence - depositPence;
    const targetNet = targetPence / 100 / divisor;
    const remainingGross = remainingNet + (vatEnabled ? remainingNet * vatRate / 100 : 0);
    if (targetPence === 0 ? remainingNet !== 0 : payablePence(remainingGross) !== targetPence) {
      resultItems.push({ id: createId("invoice-line"), description: "Payable balance rounding adjustment", category: "Other", quantity: 1, unitPrice: targetNet - remainingNet });
    }
    const finalNet = resultItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    if (payablePence(finalNet + (vatEnabled ? finalNet * vatRate / 100 : 0)) !== targetPence) {
      throw new Error("Review the final invoice payable rounding before billing.");
    }
  }
  return { items: resultItems, appliedDepositInvoiceIds: deposits.map(({ invoice }) => invoice.id) };
}
