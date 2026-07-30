"use client";

import { FormEvent, useMemo, useState } from "react";
import { Banknote, FileCheck2, Plus, Receipt, Trash2, WalletCards } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { BusinessExpense, ExpenseCategory, ExpensePaymentMethod, ExpenseStatus, Job } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const categories: ExpenseCategory[] = ["Materials", "Fuel", "Vehicle", "Tools", "Insurance", "Software", "Training", "Subcontractor", "Travel", "Office", "Other"];
const paymentMethods: ExpensePaymentMethod[] = ["Business card", "Bank transfer", "Cash", "Personal card", "Direct debit", "Other"];
const statuses: ExpenseStatus[] = ["Draft", "Ready", "Reconciled"];
const blankForm = { expenseDate: "", supplier: "", description: "", category: "Materials" as ExpenseCategory, paymentMethod: "Business card" as ExpensePaymentMethod, status: "Ready" as ExpenseStatus, jobId: "", netAmount: "0", vatAmount: "0", receiptUrl: "", notes: "" };

function formatDate(value: string) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-GB").format(new Date(`${value}T12:00:00`));
}

export default function ExpensesPage() {
  const expenses = useLocalStorageCollection<BusinessExpense>("jr-os-expenses");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const [form, setForm] = useState(blankForm);
  const [showForm, setShowForm] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [message, setMessage] = useState("");
  const [receiptDataUrl, setReceiptDataUrl] = useState("");
  const [receiptFileName, setReceiptFileName] = useState("");

  const visibleExpenses = useMemo(() => expenses.items
    .filter((expense) => !categoryFilter || expense.category === categoryFilter)
    .filter((expense) => !statusFilter || expense.status === statusFilter)
    .toSorted((a, b) => b.expenseDate.localeCompare(a.expenseDate)), [expenses.items, categoryFilter, statusFilter]);

  const totals = useMemo(() => visibleExpenses.reduce((sum, expense) => ({
    net: sum.net + expense.netAmount,
    vat: sum.vat + expense.vatAmount,
    gross: sum.gross + expense.grossAmount,
  }), { net: 0, vat: 0, gross: 0 }), [visibleExpenses]);

  const unreconciled = expenses.items.filter((expense) => expense.status !== "Reconciled").length;
  const missingReceipts = expenses.items.filter((expense) => !expense.receiptDataUrl && !expense.receiptUrl).length;

  function jobName(id?: string) {
    return jobs.items.find((job) => job.id === id)?.title || "Not linked to a job";
  }

  function addExpense(event: FormEvent) {
    event.preventDefault();
    if (!form.expenseDate || !form.supplier.trim() || !form.description.trim()) {
      setMessage("Enter the expense date, supplier and description.");
      return;
    }
    const netAmount = Number(form.netAmount || 0);
    const vatAmount = Number(form.vatAmount || 0);
    const now = new Date().toISOString();
    const expense: BusinessExpense = {
      id: makeId("expense"), expenseDate: form.expenseDate, supplier: form.supplier.trim(), description: form.description.trim(), category: form.category,
      paymentMethod: form.paymentMethod, status: form.status, jobId: form.jobId || undefined, netAmount, vatAmount, grossAmount: netAmount + vatAmount,
      receiptDataUrl: receiptDataUrl || undefined, receiptFileName: receiptFileName || undefined, receiptUrl: form.receiptUrl.trim() || undefined,
      notes: form.notes.trim(), createdAt: now, updatedAt: now,
    };
    expenses.setItems((current) => [expense, ...current]);
    setForm(blankForm); setReceiptDataUrl(""); setReceiptFileName(""); setShowForm(false); setMessage("Expense saved.");
  }

  function readReceipt(file?: File) {
    if (!file) return;
    if (file.size > 2_500_000) { setMessage("Receipt file is too large. Use a file under 2.5 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { setReceiptDataUrl(String(reader.result || "")); setReceiptFileName(file.name); setMessage(`${file.name} attached.`); };
    reader.readAsDataURL(file);
  }

  function updateStatus(id: string, status: ExpenseStatus) {
    expenses.setItems((current) => current.map((expense) => expense.id === id ? { ...expense, status, updatedAt: new Date().toISOString() } : expense));
  }

  if (!expenses.isReady || !jobs.isReady) return <Card>Loading expenses…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance" title="Expenses & Receipts" description="Capture business costs, VAT, receipts and job-linked spending in one place." />

    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
      <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-4 text-sm"><option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-4 text-sm"><option value="">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
      <Button onClick={() => setShowForm((current) => !current)}><Plus className="mr-2 size-4" />Add expense</Button>
    </div>

    {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><Banknote className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Gross spend</p><p className="mt-2 text-3xl font-bold">{money.format(totals.gross)}</p></Card>
      <Card><WalletCards className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Net spend</p><p className="mt-2 text-3xl font-bold">{money.format(totals.net)}</p></Card>
      <Card><FileCheck2 className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">VAT recorded</p><p className="mt-2 text-3xl font-bold">{money.format(totals.vat)}</p></Card>
      <Card><Receipt className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Needs attention</p><p className="mt-2 text-3xl font-bold">{unreconciled + missingReceipts}</p><p className="mt-1 text-xs text-slate-500">{unreconciled} unreconciled · {missingReceipts} missing receipts</p></Card>
    </section>

    {showForm ? <Card><form onSubmit={addExpense} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <InputField required label="Expense date" type="date" value={form.expenseDate} onChange={(event) => setForm({ ...form, expenseDate: event.target.value })} />
      <InputField required label="Supplier" placeholder="CEF, Screwfix, fuel station…" value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} />
      <InputField required label="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Category</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as ExpenseCategory })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Payment method</span><select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as ExpensePaymentMethod })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ExpenseStatus })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Job</span><select value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">General business expense</option>{jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
      <InputField label="Net amount (£)" type="number" min="0" step="0.01" value={form.netAmount} onChange={(event) => setForm({ ...form, netAmount: event.target.value })} />
      <InputField label="VAT amount (£)" type="number" min="0" step="0.01" value={form.vatAmount} onChange={(event) => setForm({ ...form, vatAmount: event.target.value })} />
      <InputField label="Receipt URL" placeholder="Optional cloud link" value={form.receiptUrl} onChange={(event) => setForm({ ...form, receiptUrl: event.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300 md:col-span-2"><span>Receipt image or PDF</span><input type="file" accept="image/*,application/pdf" onChange={(event) => readReceipt(event.target.files?.[0])} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />{receiptFileName ? <span className="text-xs text-emerald-300">Attached: {receiptFileName}</span> : null}</label>
      <div className="md:col-span-2 xl:col-span-3"><TextareaField label="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
      <div className="md:col-span-2 xl:col-span-3 flex justify-end"><Button type="submit">Save expense</Button></div>
    </form></Card> : null}

    <section className="space-y-3">
      <h2 className="text-xl font-bold">Expense register</h2>
      {visibleExpenses.length === 0 ? <Card><p className="text-sm text-slate-400">No expenses match this selection.</p></Card> : visibleExpenses.map((expense) => <Card key={expense.id}>
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{expense.category} · {expense.paymentMethod}</p><h3 className="mt-1 text-lg font-bold">{expense.supplier}</h3><p className="text-sm text-slate-400">{expense.description}</p><p className="mt-1 text-xs text-slate-500">{formatDate(expense.expenseDate)} · {jobName(expense.jobId)}</p></div><button onClick={() => expenses.remove((item) => item.id === expense.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300" aria-label="Delete expense"><Trash2 className="size-4" /></button></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3"><div><p className="text-xs text-slate-500">Net</p><p className="font-semibold">{money.format(expense.netAmount)}</p></div><div><p className="text-xs text-slate-500">VAT</p><p className="font-semibold">{money.format(expense.vatAmount)}</p></div><div><p className="text-xs text-slate-500">Gross</p><p className="font-semibold">{money.format(expense.grossAmount)}</p></div></div>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4"><select value={expense.status} onChange={(event) => updateStatus(expense.id, event.target.value as ExpenseStatus)} className="min-h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm">{statuses.map((status) => <option key={status}>{status}</option>)}</select>{expense.receiptDataUrl ? <a href={expense.receiptDataUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-cyan-300 hover:text-cyan-200">Open attached receipt</a> : expense.receiptUrl ? <a href={expense.receiptUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-cyan-300 hover:text-cyan-200">Open receipt link</a> : <span className="text-sm text-amber-300">Receipt missing</span>}</div>
      </Card>)}
    </section>
  </div>;
}
