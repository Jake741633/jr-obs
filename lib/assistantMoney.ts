import type { AssistantAction, AssistantRecords } from "./assistantBriefing";
import type { AssistantAnswer } from "./assistantQuestions";
import type { Invoice } from "./models";
import type { PaymentRecord } from "./payments";
import { effectiveInvoicePaid, invoiceGross } from "./payments";
import { assistantDateKey, assistantDay, assistantInvoiceBalance } from "./assistantSignals-core.mjs";
import { hasSavedIdentity } from "./assistantIdentity";
import { invoiceReviewHref } from "./invoiceLink";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const outstandingStatus = (invoice: Invoice) => ["Sent", "Part paid", "Overdue"].includes(invoice.status);
const recorded = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value : fallback;
function identityCounts(records: { id: string }[]) {
  const counts = new Map<string, number>();
  for (const record of records) if (hasSavedIdentity(record.id)) counts.set(record.id, (counts.get(record.id) || 0) + 1);
  return counts;
}

/** Check the full loaded identity sets before scope or status filtering. Never pick a saved copy. */
function moneySnapshot(records: Pick<AssistantRecords, "invoices" | "payments">, now: Date, mode: "overdue" | "unpaid", jobId?: string) {
  const payments = records.payments || [];
  const invoiceCounts = identityCounts(records.invoices), paymentCounts = identityCounts(payments);
  const paymentsByInvoice = new Map<string, PaymentRecord[]>();
  for (const payment of payments) if (hasSavedIdentity(payment.invoiceId)) {
    const linked = paymentsByInvoice.get(payment.invoiceId);
    if (linked) linked.push(payment); else paymentsByInvoice.set(payment.invoiceId, [payment]);
  }
  const groups = new Map<string | null, Invoice[]>();
  for (const invoice of records.invoices) if (jobId === undefined || invoice.jobId === jobId) {
    const key = hasSavedIdentity(invoice.id) ? invoice.id : null;
    const group = groups.get(key);
    if (group) group.push(invoice); else groups.set(key, [invoice]);
  }
  const day = assistantDay(assistantDateKey(now))!;
  const entries: { invoice: Invoice; paid: number; pence: number; due: number | null }[] = [];
  const reviews: AssistantAction[] = [];
  let identityReviews = 0, paymentReviews = 0, invalidAmounts = 0, missingDates = 0;
  const invoiceFact = (invoice: Invoice) => `${recorded(invoice.number, "Number not recorded")} · ${recorded(invoice.title, "Untitled invoice")} · Status: ${recorded(invoice.status, "Not recorded")} · Due: ${recorded(invoice.dueDate, "Not recorded")}`;
  for (const [id, copies] of groups) {
    if (!copies.some(outstandingStatus)) continue;
    if (id === null || invoiceCounts.get(id) !== 1) {
      identityReviews++;
      reviews.push({ id: `invoice-source:${JSON.stringify(id)}`, category: "Money", priority: "Today", title: "Invoice identity needs review",
        reason: id === null ? "Saved invoice identities are missing. Their balances are withheld." : `${invoiceCounts.get(id)} loaded invoices share one identity. Their balances are withheld.`,
        nextStep: "Review the saved invoice copies before using a total or contacting a customer. No copy was chosen as authoritative.",
        href: "/invoices", actionLabel: "Review invoice inbox", dueDate: "", jobIds: [...new Set(copies.map((invoice) => invoice.jobId).filter((value): value is string => hasSavedIdentity(value)))],
        evidence: [id === null ? "Invoice identity not recorded" : `Saved identity: ${id}`, ...copies.map(invoiceFact).sort(), "Only copies within the requested job scope are described; identity checks use all loaded invoices."] });
      continue;
    }
    const invoice = copies[0];
    const linked = paymentsByInvoice.get(id) || [];
    const paymentProblems = (payment: PaymentRecord) => [
      !hasSavedIdentity(payment.id) ? "identity missing" : paymentCounts.get(payment.id) !== 1 ? "identity shared by multiple loaded payments" : "",
      !["Payment", "Deposit", "Stage payment", "Credit note", "Refund"].includes(payment.type) ? "type unsupported" : "",
      !Number.isFinite(payment.amount) || payment.amount < 0 || !Number.isSafeInteger(Math.round(payment.amount * 100)) ? "amount invalid or unsupported" : "",
    ].filter(Boolean);
    const problems = linked.flatMap((payment) => { const reasons = paymentProblems(payment); return reasons.length ? [`Payment ${recorded(payment.id, "identity not recorded")}: ${reasons.join("; ")}`] : []; });
    if (problems.length) {
      paymentReviews++;
      reviews.push({ id: `invoice-payment-review:${JSON.stringify(id)}`, category: "Money", priority: "Today", title: `Payment evidence needs review · ${recorded(invoice.number, "Number not recorded")}`,
        reason: "Linked payment evidence is uncertain. This invoice's balance is withheld, not treated as unpaid or settled.",
        nextStep: "Review the payment records and invoice before using a total or contacting the customer. No payment copy was chosen or discarded to calculate a balance.",
        href: "/payments", actionLabel: "Review payment records", dueDate: "", jobIds: hasSavedIdentity(invoice.jobId) ? [invoice.jobId] : [], evidence: [invoiceFact(invoice), `Invoice identity: ${id}`, ...problems.sort()] });
      continue;
    }
    const paid = effectiveInvoicePaid(invoice, linked);
    const gross = invoiceGross(invoice);
    const pence = Math.round(assistantInvoiceBalance(invoice, paid) * 100);
    if (!Number.isFinite(gross) || gross < 0 || !Number.isSafeInteger(Math.round(gross * 100)) || !Number.isFinite(invoice.amountPaid) || invoice.amountPaid < 0 || !Number.isSafeInteger(Math.round(paid * 100)) || !Number.isSafeInteger(pence)) { invalidAmounts++; continue; }
    if (pence <= 0) continue;
    const due = assistantDay(invoice.dueDate);
    if (due === null) missingDates++;
    if (mode === "overdue" && (due === null || due >= day)) continue;
    entries.push({ invoice, paid, pence, due });
  }
  entries.sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity) || a.invoice.id.localeCompare(b.invoice.id));
  reviews.sort((a, b) => a.id.localeCompare(b.id));
  const warnings = [
    ...(identityReviews ? [`${plural(identityReviews, "invoice identity review")} excluded from the total. Missing or duplicate identities cannot establish an authoritative invoice.`] : []),
    ...(paymentReviews ? [`${plural(paymentReviews, "invoice")} with uncertain linked payment evidence excluded from the total. Check the payment records; do not assume these invoices are unpaid or settled.`] : []),
    ...(invalidAmounts ? [`${plural(invalidAmounts, "invoice")} with invalid or unsupported amounts excluded from the total.`] : []),
    ...(missingDates && mode === "overdue" ? [`${plural(missingDates, "unpaid invoice")} with missing or invalid due dates cannot be classified as overdue.`] : []),
  ];
  return { entries, reviews, warnings, totalPence: entries.reduce((sum, entry) => sum + entry.pence, 0) };
}

export function assistantMoneyAnswer(records: AssistantRecords, mode: "overdue" | "unpaid", now: Date, jobId?: string): AssistantAnswer {
  const { entries, reviews, warnings, totalPence } = moneySnapshot(records, now, mode, jobId);
  return { recognized: true, title: mode === "overdue" ? "Overdue invoices" : "Unpaid invoices",
    summary: Number.isSafeInteger(totalPence) ? `${warnings.length ? "Verified subtotal: " : ""}${money.format(totalPence / 100)} across ${plural(entries.length, "invoice")} in the loaded records.${warnings.length ? " Total incomplete until the flagged records are reviewed." : ""}` : "The combined amount is outside the supported total range. Review the individual invoices.",
    scope: `${mode === "overdue" ? `Due before ${assistantDateKey(now)}, with a positive remaining balance after recorded payments. Invoices due today are not overdue.` : "Sent, part-paid or overdue invoices with a positive remaining balance after recorded payments, including invoices not yet due. Draft, paid and cancelled invoices are excluded."} Uncertain invoice identities and linked payment evidence are review items, not debt claims.`, warnings,
    items: [...reviews.map((action) => ({ id: action.id, title: action.title, detail: `${action.reason} ${action.nextStep}`, evidence: action.evidence, href: action.href, actionLabel: action.actionLabel })),
      ...entries.map(({ invoice, paid, pence, due }) => ({ id: `invoice:${invoice.id}`, title: `${invoice.number} · ${invoice.title}`, detail: `${money.format(pence / 100)} outstanding · ${due === null ? "Due date needs review" : `Due ${invoice.dueDate}`}`, evidence: [`Status: ${invoice.status}`, `Effective recorded paid: ${money.format(paid)}`, "Invoice and ledger paid amounts are not added together. Check recent payments before contacting the customer."], href: invoiceReviewHref(invoice.id), actionLabel: invoiceReviewHref(invoice.id) === "/invoices" ? "Review invoice inbox" : "Review invoice" }))] };
}

export function assistantMoneyActions(records: AssistantRecords, now: Date): AssistantAction[] {
  const { entries, reviews } = moneySnapshot(records, now, "overdue");
  const today = assistantDay(assistantDateKey(now))!;
  return [...reviews, ...entries.map(({ invoice, paid, pence, due }): AssistantAction => ({ id: `invoice:${invoice.id}`, category: "Money", priority: "Now", title: `Chase ${invoice.number}`,
    reason: `${money.format(pence / 100)} remains unpaid, ${plural(today - due!, "day")} after the due date.`, nextStep: "Check for a recent payment, then review the invoice before contacting the customer.",
    href: invoiceReviewHref(invoice.id), actionLabel: invoiceReviewHref(invoice.id) === "/invoices" ? "Review invoice inbox" : "Review invoice", dueDate: invoice.dueDate, jobIds: invoice.jobId ? [invoice.jobId] : [],
    evidence: [invoice.title, `Status: ${invoice.status}`, `Due: ${invoice.dueDate}`, `Effective recorded paid: ${money.format(paid)}`, "Uses the higher of the invoice paid amount and linked ledger payments, including credits/refunds; these amounts are not added together."] }))];
}
