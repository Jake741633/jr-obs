"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, Plus } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { InputField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { makeId, useLocalStorageCollection } from "../../../lib/storage";
import type { Customer, Invoice } from "../../../lib/models";
import type { PaymentRecord, ScheduledCashFlow } from "../../../lib/payments";
import { allocatedPaid, invoiceBalance, invoiceGross, paymentEffect } from "../../../lib/payments";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const blank = { description: "", dueDate: "", amount: "", direction: "In" as "In" | "Out", sourceType: "Stage payment" as ScheduledCashFlow["sourceType"], customerId: "", invoiceId: "" };

export default function CustomerAccountsPage() {
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");
  const payments = useLocalStorageCollection<PaymentRecord>("jr-os-payments");
  const schedules = useLocalStorageCollection<ScheduledCashFlow>("jr-os-scheduled-cash-flow");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState("");

  const accounts = useMemo(() => customers.items.map((customer) => {
    const customerInvoices = invoices.items.filter((invoice) => invoice.customerId === customer.id);
    const customerPayments = payments.items.filter((payment) => payment.customerId === customer.id || customerInvoices.some((invoice) => invoice.id === payment.invoiceId));
    const invoiced = customerInvoices.reduce((sum, invoice) => sum + invoiceGross(invoice), 0);
    const paid = customerPayments.filter((payment) => payment.type !== "Credit note").reduce((sum, payment) => sum + paymentEffect(payment), 0);
    const credits = customerPayments.filter((payment) => payment.type === "Credit note").reduce((sum, payment) => sum + Math.abs(payment.amount), 0);
    const balance = customerInvoices.reduce((sum, invoice) => sum + invoiceBalance(invoice, payments.items), 0) - credits;
    return { customer, customerInvoices, customerPayments, invoiced, paid, credits, balance };
  }), [customers.items, invoices.items, payments.items]);
  const visible = selectedCustomerId ? accounts.filter((account) => account.customer.id === selectedCustomerId) : accounts;

  function addSchedule(event: FormEvent) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!form.description.trim() || !form.dueDate || !Number.isFinite(amount) || amount <= 0) return setMessage("Enter a description, due date and valid amount.");
    schedules.setItems((current) => [{ id: makeId("cash-flow"), sourceType: form.sourceType, description: form.description.trim(), dueDate: form.dueDate, amount, direction: form.direction, customerId: form.customerId || undefined, invoiceId: form.invoiceId || undefined, createdAt: new Date().toISOString() }, ...current]);
    setForm(blank); setMessage("Scheduled cash-flow entry added.");
  }

  if (![customers, invoices, payments, schedules].every((store) => store.isReady)) return <Card>Loading customer accounts…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance" title="Customer Accounts & Staged Payments" description="Review invoices, payments, credits and balances, then schedule expected cash movements." action={<Link href="/payments" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300"><ArrowLeft className="size-4" />Payments centre</Link>} />
    {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}
    <Card><label className="grid gap-2 text-sm"><span>Customer account</span><select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">All customers</option>{customers.items.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label></Card>
    <section className="grid gap-4 xl:grid-cols-2">{visible.map((account) => <Card key={account.customer.id}><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">{account.customer.name}</h2><p className="text-sm text-slate-500">{account.customer.email || account.customer.phone || "No contact details"}</p></div><p className={`text-xl font-bold ${account.balance > 0 ? "text-amber-300" : "text-emerald-300"}`}>{money.format(account.balance)}</p></div><div className="mt-4 grid gap-3 sm:grid-cols-4"><div><p className="text-xs text-slate-500">Invoiced</p><p className="font-semibold">{money.format(account.invoiced)}</p></div><div><p className="text-xs text-slate-500">Payments</p><p className="font-semibold">{money.format(account.paid)}</p></div><div><p className="text-xs text-slate-500">Credits</p><p className="font-semibold">{money.format(account.credits)}</p></div><div><p className="text-xs text-slate-500">Current balance</p><p className="font-semibold">{money.format(account.balance)}</p></div></div><div className="mt-4 space-y-2 border-t border-slate-800 pt-4">{account.customerInvoices.map((invoice) => <div key={invoice.id} className="flex justify-between text-sm"><span>{invoice.number} · {invoice.title}</span><span>{money.format(invoiceBalance(invoice, payments.items))} due</span></div>)}{account.customerPayments.slice(0,5).map((payment) => <div key={payment.id} className="flex justify-between text-sm text-slate-400"><span>{payment.paymentDate} · {payment.type}</span><span>{money.format(payment.amount)}</span></div>)}</div></Card>)}</section>
    <Card><h2 className="flex items-center gap-2 text-xl font-bold"><CalendarClock className="size-5" />Schedule staged or expected cash flow</h2><form onSubmit={addSchedule} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><InputField label="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /><InputField label="Due date" type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /><InputField label="Amount (£)" type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /><label className="grid gap-2 text-sm"><span>Type</span><select value={form.sourceType} onChange={(event) => setForm({ ...form, sourceType: event.target.value as ScheduledCashFlow["sourceType"] })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>Stage payment</option><option>Expected deposit</option><option>Manual cash in</option><option>Manual cash out</option></select></label><label className="grid gap-2 text-sm"><span>Direction</span><select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value as "In" | "Out" })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>In</option><option>Out</option></select></label><label className="grid gap-2 text-sm"><span>Customer</span><select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">None</option>{customers.items.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><label className="grid gap-2 text-sm"><span>Invoice</span><select value={form.invoiceId} onChange={(event) => setForm({ ...form, invoiceId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">None</option>{invoices.items.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.number}</option>)}</select></label><div className="flex items-end"><Button type="submit"><Plus className="mr-2 size-4" />Add schedule</Button></div></form><div className="mt-5 space-y-2">{schedules.items.sort((a,b) => a.dueDate.localeCompare(b.dueDate)).map((item) => <div key={item.id} className="grid gap-2 rounded-xl border border-slate-800 p-3 md:grid-cols-4"><span>{item.dueDate}</span><span>{item.description}</span><span>{item.sourceType}</span><span className={`text-right font-semibold ${item.direction === "In" ? "text-emerald-300" : "text-rose-300"}`}>{item.direction === "In" ? "+" : "-"}{money.format(item.amount)}</span></div>)}</div></Card>
  </div>;
}
