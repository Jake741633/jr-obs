import type { BusinessExpense, Invoice, PricingDocument } from "./models";

export type PaymentMethod = "Bank transfer" | "Card" | "Cash" | "Cheque" | "Direct debit" | "Other";
export type PaymentEntryType = "Payment" | "Deposit" | "Stage payment" | "Credit note" | "Refund";
export type ReconciliationStatus = "Allocated" | "Needs review" | "Reconciled";
export type DepositMode = "Fixed" | "Percentage";
export type DepositDueRule = "On acceptance" | "Specified date";

export interface PaymentRecord {
  id: string;
  customerId?: string;
  invoiceId?: string;
  paymentDate: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  notes: string;
  type: PaymentEntryType;
  reconciliationStatus: ReconciliationStatus;
  createdAt: string;
}

export interface DepositRequirement {
  id: string;
  pricingDocumentId: string;
  mode: DepositMode;
  value: number;
  dueRule: DepositDueRule;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledCashFlow {
  id: string;
  sourceType: "Stage payment" | "Expected deposit" | "Manual cash in" | "Manual cash out";
  sourceId?: string;
  description: string;
  dueDate: string;
  amount: number;
  direction: "In" | "Out";
  customerId?: string;
  invoiceId?: string;
  createdAt: string;
}

export function invoiceGross(invoice: Invoice) {
  const net = invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return net + (invoice.vatEnabled ? net * invoice.vatRate / 100 : 0);
}

export function paymentEffect(payment: PaymentRecord) {
  return payment.type === "Refund" ? -Math.abs(payment.amount) : Math.abs(payment.amount);
}

export function allocatedPaid(invoiceId: string, payments: PaymentRecord[]) {
  return payments.filter((payment) => payment.invoiceId === invoiceId).reduce((sum, payment) => sum + paymentEffect(payment), 0);
}

export function invoiceBalance(invoice: Invoice, payments: PaymentRecord[]) {
  return Math.max(0, invoiceGross(invoice) - allocatedPaid(invoice.id, payments));
}

export function calculatedInvoiceState(invoice: Invoice, payments: PaymentRecord[], today = new Date().toISOString().slice(0, 10)) {
  const total = invoiceGross(invoice);
  const paid = allocatedPaid(invoice.id, payments);
  if (paid >= total && total > 0) return "Paid" as const;
  if (paid > 0) return "Part paid" as const;
  if (invoice.status === "Overdue" || (invoice.dueDate && invoice.dueDate < today)) return "Overdue" as const;
  return "Due" as const;
}

export function depositAmount(document: PricingDocument, requirement?: DepositRequirement) {
  if (!requirement) return 0;
  const total = document.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * (document.vatEnabled ? 1 + document.vatRate / 100 : 1);
  return requirement.mode === "Percentage" ? total * requirement.value / 100 : requirement.value;
}

export function forecastWindow(days: number, invoices: Invoice[], payments: PaymentRecord[], schedules: ScheduledCashFlow[], expenses: BusinessExpense[], today = new Date().toISOString().slice(0, 10)) {
  const end = new Date(`${today}T12:00:00`); end.setDate(end.getDate() + days); const endDate = end.toISOString().slice(0, 10);
  const invoiceIn = invoices.filter((invoice) => invoice.dueDate >= today && invoice.dueDate <= endDate).reduce((sum, invoice) => sum + invoiceBalance(invoice, payments), 0);
  const scheduledIn = schedules.filter((item) => item.direction === "In" && item.dueDate >= today && item.dueDate <= endDate).reduce((sum, item) => sum + item.amount, 0);
  const scheduledOut = schedules.filter((item) => item.direction === "Out" && item.dueDate >= today && item.dueDate <= endDate).reduce((sum, item) => sum + item.amount, 0);
  const expenseOut = expenses.filter((expense) => expense.expenseDate >= today && expense.expenseDate <= endDate).reduce((sum, expense) => sum + expense.grossAmount, 0);
  return { cashIn: invoiceIn + scheduledIn, cashOut: scheduledOut + expenseOut, net: invoiceIn + scheduledIn - scheduledOut - expenseOut };
}
