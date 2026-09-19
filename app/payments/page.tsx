"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, CircleDollarSign, CreditCard, Plus, RefreshCw, WalletCards } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { usePaymentsCollection } from "../../lib/cloud/coreBusinessCollections";
import { makeId, useCloudLocalCollection } from "../../lib/storage";
import type { BusinessExpense, Customer, Invoice, PricingDocument } from "../../lib/models";
import type { DepositRequirement, PaymentEntryType, PaymentMethod, PaymentRecord, PortalPaymentLink, ReconciliationStatus, ScheduledCashFlow } from "../../lib/payments";
import { allocatedPaid, calculatedInvoiceState, depositAmount, forecastWindow, invoiceBalance, invoiceGross, invoiceHasOutstandingBalance, paymentTargetForInvoice } from "../../lib/payments";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const methods: PaymentMethod[] = ["Bank transfer", "Card", "Cash", "Cheque", "Direct debit", "Other"];
const types: PaymentEntryType[] = ["Payment", "Deposit", "Stage payment", "Credit note", "Refund"];
const blankPayment = { customerId: "", invoiceId: "", paymentDate: new Date().toISOString().slice(0, 10), amount: "", method: "Bank transfer" as PaymentMethod, reference: "", notes: "", type: "Payment" as PaymentEntryType, reconciliationStatus: "Allocated" as ReconciliationStatus };

export default function PaymentsPage() {
  const payments = usePaymentsCollection();
  const deposits = useCloudLocalCollection<DepositRequirement>("jr-os-deposit-requirements");
  const schedules = useCloudLocalCollection<ScheduledCashFlow>("jr-os-scheduled-cash-flow");
  const links = useCloudLocalCollection<PortalPaymentLink>("jr-os-portal-payment-links");
  const invoices = useCloudLocalCollection<Invoice>("jr-os-invoices");
  const customers = useCloudLocalCollection<Customer>("jr-os-customers");
  const documents = useCloudLocalCollection<PricingDocument>("jr-os-pricing-documents");
  const expenses = useCloudLocalCollection<BusinessExpense>("jr-os-expenses");
  const [form, setForm] = useState(blankPayment);
  const [depositDocId, setDepositDocId] = useState("");
  const [depositMode, setDepositMode] = useState<"Fixed" | "Percentage">("Percentage");
  const [depositValue, setDepositValue] = useState("20");
  const [depositDueRule, setDepositDueRule] = useState<"On acceptance" | "Specified date">("On acceptance");
  const [depositDueDate, setDepositDueDate] = useState("");
  const [message, setMessage] = useState("");

  const ready = [payments, deposits, schedules, links, invoices, customers, documents, expenses].every((store) => store.isReady);
  const customerName = (id?: string) => customers.items.find((item) => item.id === id)?.name || "Unassigned";
  const invoiceName = (id?: string) => invoices.items.find((item) => item.id === id)?.number || "Unallocated";
  const forecasts = [7, 30, 90].map((days) => ({ days, ...forecastWindow(days, invoices.items, payments.items, schedules.items, expenses.items) }));
  const unallocated = payments.items.filter((payment) => !payment.invoiceId || payment.reconciliationStatus === "Needs review");
  const partPaid = invoices.items.filter((invoice) => calculatedInvoiceState(invoice, payments.items) === "Part paid");
  const overdue = invoices.items.filter((invoice) => calculatedInvoiceState(invoice, payments.items) === "Overdue");
  const acceptedDocs = documents.items.filter((item) => item.status === "Accepted");

  function savePayment(event: FormEvent) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!form.paymentDate || !Number.isFinite(amount) || amount <= 0) return setMessage("Enter a valid payment date and amount.");
    const target = paymentTargetForInvoice(invoices.items, form.invoiceId, form.customerId);
    if (!target) return setMessage("The selected invoice and customer do not match. Review the payment allocation.");
    payments.setItems((current) => [{ id: makeId("payment"), customerId: target.customerId, invoiceId: target.invoiceId, paymentDate: form.paymentDate, amount, method: form.method, reference: form.reference.trim(), notes: form.notes.trim(), type: form.type, reconciliationStatus: target.invoiceId ? form.reconciliationStatus : "Needs review", createdAt: new Date().toISOString() }, ...current]);
    setForm(blankPayment); setMessage("Payment record added. Previous records were not changed.");
  }

  function reallocatePayment(payment: PaymentRecord, nextInvoiceId: string) {
    const target = paymentTargetForInvoice(invoices.items, nextInvoiceId, payment.customerId);
    if (!target) return setMessage("The selected invoice belongs to a different customer or is no longer available.");
    payments.setItems((current) => current.map((item) => item.id === payment.id ? {
      ...item,
      customerId: target.customerId,
      invoiceId: target.invoiceId,
      reconciliationStatus: target.invoiceId ? "Allocated" : "Needs review",
    } : item));
  }

  function reconcilePayment(payment: PaymentRecord) {
    if (!payment.invoiceId) return setMessage("Allocate the payment to an invoice before reconciling it.");
    const target = paymentTargetForInvoice(invoices.items, payment.invoiceId, payment.customerId);
    if (!target?.invoiceId) return setMessage("The payment customer does not match its invoice. Review the allocation first.");
    payments.setItems((current) => current.map((item) => item.id === payment.id ? {
      ...item,
      customerId: target.customerId,
      invoiceId: target.invoiceId,
      reconciliationStatus: "Reconciled",
    } : item));
  }

  function saveDeposit(event: FormEvent) {
    event.preventDefault();
    const value = Number(depositValue);
    if (!depositDocId || !Number.isFinite(value) || value <= 0) return setMessage("Choose an accepted quote or estimate and enter a deposit value.");
    const now = new Date().toISOString();
    deposits.setItems((current) => {
      const existing = current.find((item) => item.pricingDocumentId === depositDocId);
      return existing ? current.map((item) => item.id === existing.id ? { ...item, mode: depositMode, value, dueRule: depositDueRule, dueDate: depositDueRule === "Specified date" ? depositDueDate : undefined, updatedAt: now } : item) : [{ id: makeId("deposit-rule"), pricingDocumentId: depositDocId, mode: depositMode, value, dueRule: depositDueRule, dueDate: depositDueRule === "Specified date" ? depositDueDate : undefined, createdAt: now, updatedAt: now }, ...current];
    });
    setMessage("Deposit requirement saved.");
  }

  function createDepositInvoice(document: PricingDocument) {
    const existing = invoices.items.find((invoice) => invoice.quoteId === document.id && invoice.title.toLowerCase().includes("deposit"));
    if (existing) return setMessage(`${existing.number} is already the deposit invoice for this document.`);
    const requirement = deposits.items.find((item) => item.pricingDocumentId === document.id);
    const amount = depositAmount(document, requirement);
    if (!requirement || amount <= 0) return setMessage("Add a deposit requirement first.");
    const now = new Date().toISOString();
    const number = `INV-${String(invoices.items.length + 1).padStart(4, "0")}`;
    const dueDate = requirement.dueRule === "Specified date" ? requirement.dueDate || now.slice(0, 10) : now.slice(0, 10);
    invoices.setItems((current) => [{ id: makeId("invoice"), number, status: "Draft", customerId: document.customerId, builderId: document.builderId, jobId: document.jobId, quoteId: document.id, title: `Deposit - ${document.title}`, issueDate: now.slice(0, 10), dueDate, vatEnabled: false, vatRate: 0, items: [{ id: makeId("invoice-line"), description: `Deposit for ${document.number}`, category: "Other", quantity: 1, unitPrice: amount }], amountPaid: 0, notes: "Created from accepted quote or estimate deposit requirement.", paymentDetails: "", createdAt: now, updatedAt: now }, ...current]);
    setMessage(`${number} created without duplicating an existing deposit invoice.`);
  }

  function saveLink(invoice: Invoice, url: string, providerName: string, providerConfigured: boolean) {
    const customerId = invoice.customerId;
    if (!customerId) return setMessage("Assign the invoice to a customer before creating its payment link.");
    if (!["Sent", "Part paid", "Overdue"].includes(invoice.status)) return setMessage("Only a sent or active unpaid customer invoice can have a portal payment link.");
    if (!invoiceHasOutstandingBalance(invoice, payments.items)) return setMessage("This invoice has no outstanding balance, so its payment link cannot be issued.");
    let paymentUrl = url.trim();
    if (providerConfigured) {
      try {
        const parsedUrl = new URL(paymentUrl);
        if (parsedUrl.protocol !== "https:") return setMessage("Configured customer payment links must use HTTPS.");
        paymentUrl = parsedUrl.toString();
      } catch {
        return setMessage("Enter a valid HTTPS payment URL before enabling the provider.");
      }
    }
    const existingLink = links.items.find((item) => item.invoiceId === invoice.id);
    const existingLinkIsUnboundLegacy = existingLink && existingLink.customerId == null && existingLink.jobId == null;
    if (existingLink && !existingLinkIsUnboundLegacy && (existingLink.customerId !== customerId || (existingLink.jobId ?? null) !== (invoice.jobId ?? null))) {
      return setMessage("This invoice was reassigned. Retire its old payment link before issuing a replacement.");
    }
    const now = new Date().toISOString();
    links.setItems((current) => {
      const existing = current.find((item) => item.invoiceId === invoice.id);
      const record = { id: existing?.id || makeId("payment-link"), customerId, jobId: invoice.jobId, invoiceId: invoice.id, paymentUrl, providerName: providerName.trim(), providerConfigured, updatedAt: now };
      return existing ? current.map((item) => item.id === existing.id ? record : item) : [record, ...current];
    });
  }

  if (!ready) return <Card>Loading payments and cash flow…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance" title="Payments, Deposits & Cash-Flow Control" description="Record immutable payments, allocate receipts, manage deposits and forecast cash movement." />
    {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><Banknote className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Payments recorded</p><p className="mt-2 text-3xl font-bold">{payments.items.length}</p></Card>
      <Card><AlertTriangle className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Needs reconciliation</p><p className="mt-2 text-3xl font-bold">{unallocated.length}</p></Card>
      <Card><WalletCards className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Part-paid invoices</p><p className="mt-2 text-3xl font-bold">{partPaid.length}</p></Card>
      <Card><CircleDollarSign className="size-5 text-rose-300" /><p className="mt-3 text-sm text-slate-400">Overdue invoices</p><p className="mt-2 text-3xl font-bold">{overdue.length}</p></Card>
    </section>

    <section className="grid gap-6 xl:grid-cols-2">
      <Card><h2 className="text-xl font-bold">Record payment</h2><form onSubmit={savePayment} className="mt-4 grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm"><span>Customer</span><select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Unassigned</option>{customers.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-2 text-sm"><span>Allocate to invoice</span><select value={form.invoiceId} onChange={(e) => setForm({ ...form, invoiceId: e.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Leave unallocated</option>{invoices.items.map((item) => <option key={item.id} value={item.id}>{item.number} · {item.title}</option>)}</select></label><InputField label="Payment date" type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} /><InputField label="Amount (£)" type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /><label className="grid gap-2 text-sm"><span>Type</span><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as PaymentEntryType })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{types.map((item) => <option key={item}>{item}</option>)}</select></label><label className="grid gap-2 text-sm"><span>Method</span><select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{methods.map((item) => <option key={item}>{item}</option>)}</select></label><InputField label="Reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /><div className="md:col-span-2"><TextareaField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div><div className="md:col-span-2 flex justify-end"><Button type="submit"><Plus className="mr-2 size-4" />Add payment record</Button></div></form></Card>

      <Card><h2 className="text-xl font-bold">Deposit requirements</h2><form onSubmit={saveDeposit} className="mt-4 grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm md:col-span-2"><span>Accepted quote or estimate</span><select value={depositDocId} onChange={(e) => setDepositDocId(e.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose document</option>{acceptedDocs.map((item) => <option key={item.id} value={item.id}>{item.number} · {item.title}</option>)}</select></label><label className="grid gap-2 text-sm"><span>Deposit type</span><select value={depositMode} onChange={(e) => setDepositMode(e.target.value as "Fixed" | "Percentage")} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>Percentage</option><option>Fixed</option></select></label><InputField label={depositMode === "Percentage" ? "Percentage" : "Fixed amount (£)"} type="number" min="0" step="0.01" value={depositValue} onChange={(e) => setDepositValue(e.target.value)} /><label className="grid gap-2 text-sm"><span>Due</span><select value={depositDueRule} onChange={(e) => setDepositDueRule(e.target.value as "On acceptance" | "Specified date")} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>On acceptance</option><option>Specified date</option></select></label>{depositDueRule === "Specified date" ? <InputField label="Deposit due date" type="date" value={depositDueDate} onChange={(e) => setDepositDueDate(e.target.value)} /> : <div /> }<div className="md:col-span-2 flex justify-end"><Button type="submit">Save requirement</Button></div></form><div className="mt-5 space-y-2">{acceptedDocs.map((doc) => { const requirement = deposits.items.find((item) => item.pricingDocumentId === doc.id); return <div key={doc.id} className="flex items-center justify-between rounded-xl border border-slate-800 p-3"><div><p className="font-medium">{doc.number}</p><p className="text-xs text-slate-500">{requirement ? `${money.format(depositAmount(doc, requirement))} · ${requirement.dueRule}` : "No deposit requirement"}</p></div><Button variant="secondary" onClick={() => createDepositInvoice(doc)}>Create deposit invoice</Button></div>; })}</div></Card>
    </section>

    <section className="space-y-4"><h2 className="text-2xl font-bold">Cash-flow forecast</h2><div className="grid gap-4 md:grid-cols-3">{forecasts.map((forecast) => <Card key={forecast.days}><p className="text-sm text-slate-400">Next {forecast.days} days</p><p className="mt-3 text-sm">Cash in <span className="float-right font-semibold text-emerald-300">{money.format(forecast.cashIn)}</span></p><p className="mt-2 text-sm">Cash out <span className="float-right font-semibold text-rose-300">{money.format(forecast.cashOut)}</span></p><p className="mt-4 border-t border-slate-800 pt-3 text-lg font-bold">Net <span className={`float-right ${forecast.net < 0 ? "text-rose-300" : "text-cyan-300"}`}>{money.format(forecast.net)}</span></p></Card>)}</div></section>

    <section className="grid gap-6 xl:grid-cols-2"><Card><h2 className="text-xl font-bold">Invoice balances and payment links</h2><div className="mt-4 space-y-3">{invoices.items.map((invoice) => { const link = links.items.find((item) => item.invoiceId === invoice.id); const state = calculatedInvoiceState(invoice, payments.items); return <div key={invoice.id} className="rounded-xl border border-slate-800 p-4"><div className="flex justify-between gap-4"><div><p className="font-semibold">{invoice.number} · {customerName(invoice.customerId)}</p><p className="text-sm text-slate-500">{state} · Paid {money.format(allocatedPaid(invoice.id, payments.items))} · Outstanding {money.format(invoiceBalance(invoice, payments.items))}</p></div><span className="text-sm font-semibold">{money.format(invoiceGross(invoice))}</span></div><div className="mt-3 grid gap-2 md:grid-cols-3"><input defaultValue={link?.providerName || ""} id={`provider-${invoice.id}`} placeholder="Provider" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /><input defaultValue={link?.paymentUrl || ""} id={`url-${invoice.id}`} placeholder="Payment URL" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /><label className="flex items-center gap-2 text-sm"><input id={`configured-${invoice.id}`} type="checkbox" defaultChecked={link?.providerConfigured || false} /> Real provider configured</label></div><Button variant="secondary" className="mt-3" onClick={() => saveLink(invoice, (document.getElementById(`url-${invoice.id}`) as HTMLInputElement)?.value || "", (document.getElementById(`provider-${invoice.id}`) as HTMLInputElement)?.value || "", (document.getElementById(`configured-${invoice.id}`) as HTMLInputElement)?.checked || false)}><CreditCard className="mr-2 size-4" />Save payment link</Button></div>; })}</div></Card><Card><h2 className="text-xl font-bold">Reconciliation queue</h2><div className="mt-4 space-y-3">{unallocated.length === 0 ? <p className="text-sm text-slate-400">No payments need review.</p> : unallocated.map((payment) => <div key={payment.id} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"><p className="font-semibold">{money.format(payment.amount)} · {payment.type}</p><p className="text-sm text-slate-400">{customerName(payment.customerId)} · {invoiceName(payment.invoiceId)} · {payment.reference || "No reference"}</p><div className="mt-3 flex gap-2"><select value={payment.invoiceId || ""} onChange={(e) => reallocatePayment(payment, e.target.value)} className="min-h-10 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm"><option value="">Unallocated</option>{invoices.items.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.number}</option>)}</select><Button variant="secondary" onClick={() => reconcilePayment(payment)}><CheckCircle2 className="mr-2 size-4" />Reconcile</Button></div></div>)}</div></Card></section>

    <Card><h2 className="text-xl font-bold">Immutable payment history</h2><div className="mt-4 space-y-2">{payments.items.map((payment) => <div key={payment.id} className="grid gap-2 rounded-xl border border-slate-800 p-3 md:grid-cols-6"><span>{payment.paymentDate}</span><span>{customerName(payment.customerId)}</span><span>{invoiceName(payment.invoiceId)}</span><span>{payment.type}</span><span>{payment.method}</span><span className="text-right font-semibold">{money.format(payment.amount)}</span></div>)}</div></Card>
  </div>;
}
