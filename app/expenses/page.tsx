"use client";

import { FormEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Banknote, FileCheck2, Plus, Receipt, Trash2, WalletCards } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useExpensesCollection } from "../../lib/cloud/coreBusinessCollections";
import { cloudSafeFileRecord, persistPrivateFileRecordBytes, privateObjectPath, readPrivateUploadQueue, PRIVATE_FILE_UPLOAD_QUEUE_KEY } from "../../lib/cloud/privateFiles";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import type { SyncAuthorizationContext } from "../../lib/cloud/repository";
import { makeId, useCloudLocalCollection } from "../../lib/storage";
import type { BusinessExpense, ExpenseCategory, ExpensePaymentMethod, ExpenseStatus, Job } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const categories: ExpenseCategory[] = ["Materials", "Fuel", "Vehicle", "Tools", "Insurance", "Software", "Training", "Subcontractor", "Travel", "Office", "Other"];
const paymentMethods: ExpensePaymentMethod[] = ["Business card", "Bank transfer", "Cash", "Personal card", "Direct debit", "Other"];
const statuses: ExpenseStatus[] = ["Draft", "Ready", "Reconciled"];
const blankForm = { expenseDate: "", supplier: "", description: "", category: "Materials" as ExpenseCategory, paymentMethod: "Business card" as ExpensePaymentMethod, status: "Ready" as ExpenseStatus, jobId: "", netAmount: "0", vatAmount: "0", receiptUrl: "", notes: "" };

type ExpenseOwner = Pick<ReturnType<typeof useExpensesCollection>, "createItem" | "updateItem" | "removeItem"> & { mode: ReturnType<typeof useCloudIdentity>["mode"]; authorization: SyncAuthorizationContext | null };
type ExpenseDraft = { owner: ExpenseOwner; session: object; open: boolean; form: typeof blankForm; receiptDataUrl: string; receiptFileName: string };
type ExpenseCreation = { id: string; createdAt: string; attempt?: BusinessExpense; metadata?: BusinessExpense };
type ReceiptExpense = BusinessExpense & { customerId?: string; privateStoragePath?: string; signedDownloadUrl?: string };

function expenseSnapshot(expense: BusinessExpense & { signedDownloadUrl?: string }) {
  const persisted = { ...expense }; delete persisted.signedDownloadUrl;
  return JSON.stringify(persisted);
}

function formatDate(value: string) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-GB").format(new Date(`${value}T12:00:00`));
}

export default function ExpensesPage() {
  const expenses = useExpensesCollection();
  const jobs = useCloudLocalCollection<Job>("jr-os-jobs");
  const { identity, mode, isReady: identityReady } = useCloudIdentity();
  const organisationId = identity?.organisationId, userId = identity?.userId, role = identity?.role, customerSourceId = identity?.customerSourceId;
  const owner = useMemo<ExpenseOwner>(() => ({ createItem: expenses.createItem, updateItem: expenses.updateItem, removeItem: expenses.removeItem, mode,
    authorization: organisationId && userId && role ? { organisationId, userId, role, customerSourceId } : null,
  }), [expenses.createItem, expenses.updateItem, expenses.removeItem, mode, organisationId, userId, role, customerSourceId]);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const draftRef = useRef<ExpenseDraft | null>(null);
  const currentDraft = draft?.owner === owner ? draft : null;
  const form = currentDraft?.form ?? blankForm;
  const showForm = Boolean(currentDraft?.open);
  const receiptFileName = currentDraft?.receiptFileName ?? "";
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [notice, setNotice] = useState<{ owner: ExpenseOwner; text: string } | null>(null);
  const message = notice?.owner === owner ? notice.text : "";
  const [receiptQueueVersion, setReceiptQueueVersion] = useState(0);
  const queuedReceipts = useMemo(() => {
    // Queue bytes can change without changing the expense metadata collection.
    void receiptQueueVersion;
    return identityReady && owner.authorization && owner.mode !== "local" ? readPrivateUploadQueue(owner.authorization) : [];
  }, [owner, identityReady, receiptQueueVersion]);
  const receiptRead = useRef<{ reader: FileReader; session: object } | null>(null);
  const creationAttempts = useRef(new WeakMap<object, ExpenseCreation>());
  const completedRecords = useRef(new WeakSet<BusinessExpense>());
  const statusAttempts = useRef(new WeakMap<BusinessExpense, BusinessExpense>());
  const deleteAttempts = useRef(new WeakSet<BusinessExpense>());
  const ready = expenses.isReady && jobs.isReady && identityReady && (mode === "local" || Boolean(owner.authorization));
  const latest = useRef({ active: false, owner, ready, items: expenses.items, jobs: jobs.items });
  useLayoutEffect(() => {
    latest.current = { active: true, owner, ready, items: expenses.items, jobs: jobs.items };
    return () => { latest.current.active = false; };
  });
  useLayoutEffect(() => () => {
    const task = receiptRead.current; receiptRead.current = null;
    if (task?.reader.readyState === FileReader.LOADING) task.reader.abort();
  }, [owner]);
  useLayoutEffect(() => {
    const refresh = (event: Event) => {
      const key = (event as StorageEvent).key;
      if (event.type === "storage" && key && key !== PRIVATE_FILE_UPLOAD_QUEUE_KEY) return;
      if (latest.current.active && latest.current.owner === owner) setReceiptQueueVersion(value => value + 1);
    };
    window.addEventListener("jr-os-private-file-queue-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("jr-os-private-file-queue-changed", refresh); window.removeEventListener("storage", refresh); };
  }, [owner]);
  const active = () => latest.current.active && latest.current.owner === owner && latest.current.ready;
  const setMessage = (text: string) => setNotice({ owner, text });
  function publishDraft(next: ExpenseDraft | null) { draftRef.current = next; setDraft(next); }
  function stopReceipt() {
    const task = receiptRead.current; receiptRead.current = null;
    if (task?.reader.readyState === FileReader.LOADING) task.reader.abort();
  }
  function toggleForm() {
    if (!active()) return;
    const held = draftRef.current?.owner === owner ? draftRef.current : null;
    if (held !== currentDraft) return;
    stopReceipt();
    publishDraft(held ? { ...held, open: !held.open } : { owner, session: {}, open: true, form: { ...blankForm }, receiptDataUrl: "", receiptFileName: "" });
    setMessage("");
  }
  function changeForm(next: typeof blankForm) {
    if (!active() || !currentDraft?.open || draftRef.current !== currentDraft) return;
    publishDraft({ ...currentDraft, form: next }); setMessage("");
  }

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
  function receiptDisplay(expense: ReceiptExpense): { url?: string; external?: boolean; pending?: boolean } {
    if (expense.signedDownloadUrl) return { url: expense.signedDownloadUrl };
    if (expense.privateStoragePath) return { pending: true };
    if (expense.receiptDataUrl) return { url: expense.receiptDataUrl };
    const authorization = owner.authorization, fileName = expense.receiptFileName;
    if (authorization && fileName && expenses.items.filter(item => item.id === expense.id).length === 1) {
      const path = privateObjectPath(authorization.organisationId, expense.jobId, expense.id, fileName);
      const matches = queuedReceipts.filter(item => item.storageKey === "jr-os-expenses" && item.sourceId === expense.id && item.fileName === fileName
        && !item.parentSourceId && (item.jobSourceId ?? null) === (expense.jobId ?? null) && (item.customerSourceId ?? null) === (expense.customerId ?? null)
        && item.objectPath === path
        && typeof item.dataUrl === "string" && item.dataUrl.startsWith("data:"));
      if (matches.length === 1) return { url: matches[0].dataUrl };
    }
    return expense.receiptUrl ? { url: expense.receiptUrl, external: true } : {};
  }
  const missingReceipts = expenses.items.filter(expense => { const receipt = receiptDisplay(expense); return !receipt.url && !receipt.pending; }).length;

  function jobName(id?: string) {
    return jobs.items.find((job) => job.id === id)?.title || "Not linked to a job";
  }

  function addExpense(event: FormEvent) {
    event.preventDefault();
    if (!active() || !currentDraft?.open || draftRef.current !== currentDraft) return;
    if (receiptRead.current) { setMessage("Wait for the selected receipt to finish reading before saving."); return; }
    if (!form.expenseDate || !form.supplier.trim() || !form.description.trim()) {
      setMessage("Enter the expense date, supplier and description."); return;
    }
    const netAmount = Number(form.netAmount || 0), vatAmount = Number(form.vatAmount || 0);
    if (!Number.isFinite(netAmount) || !Number.isFinite(vatAmount) || netAmount < 0 || vatAmount < 0 || !Number.isFinite(netAmount + vatAmount)
      || !categories.includes(form.category) || !paymentMethods.includes(form.paymentMethod) || !statuses.includes(form.status)) {
      setMessage("Review the amounts, category, payment method and status. Amounts must be finite and zero or above."); return;
    }
    if (form.jobId && latest.current.jobs.filter(job => job.id === form.jobId).length !== 1) { setMessage("The linked job is unavailable or ambiguous. Review it before saving."); return; }
    const pending: ExpenseCreation = creationAttempts.current.get(currentDraft.session) || { id: makeId("expense"), createdAt: new Date().toISOString() };
    creationAttempts.current.set(currentDraft.session, pending);
    const expense: BusinessExpense = {
      id: pending.id, expenseDate: form.expenseDate, supplier: form.supplier.trim(), description: form.description.trim(), category: form.category,
      paymentMethod: form.paymentMethod, status: form.status, jobId: form.jobId || undefined, netAmount, vatAmount, grossAmount: netAmount + vatAmount,
      receiptDataUrl: currentDraft.receiptDataUrl || undefined, receiptFileName: currentDraft.receiptFileName || undefined, receiptUrl: form.receiptUrl.trim() || undefined,
      notes: form.notes.trim(), createdAt: pending.createdAt, updatedAt: pending.createdAt,
    };
    // Keep receipt bytes in this draft until they are durably queued; the
    // metadata hook must not race its bridge effect against that confirmation.
    const metadata = owner.mode === "local" ? expense : cloudSafeFileRecord("jr-os-expenses", expense);
    try {
      const matches = latest.current.items.filter(item => item.id === expense.id);
      if (matches.length) {
        // Only an unchanged, exact prior attempt can acknowledge a lost save response.
        if (matches.length !== 1 || !pending.attempt || !pending.metadata || expenseSnapshot(matches[0]) !== expenseSnapshot(pending.metadata) || expenseSnapshot(expense) !== expenseSnapshot(pending.attempt)) throw new Error("Expense identity changed.");
      } else { pending.attempt = expense; pending.metadata = metadata; expenses.createItem(metadata); }
      if (owner.mode !== "local") {
        if (!owner.authorization) throw new Error("Expense owner is unavailable.");
        persistPrivateFileRecordBytes("jr-os-expenses", expense, owner.authorization);
      }
    } catch {
      setMessage("Expense save could not be confirmed. Your draft and receipt are retained; keep this page open, review and retry here."); return;
    }
    stopReceipt(); publishDraft(null);
    setMessage(currentDraft.receiptDataUrl && owner.mode !== "local" ? "Expense saved on this device. Receipt queued for secure sync. Check sync status before switching devices." : "Expense saved on this device. Check sync status before switching devices.");
  }

  function readReceipt(file?: File) {
    if (!active() || !currentDraft?.open || draftRef.current !== currentDraft || !file) return;
    stopReceipt();
    if (file.size > 2_500_000) { setMessage("Receipt file is too large. Use a file under 2.5 MB."); return; }
    const reader = new FileReader(), task = { reader, session: currentDraft.session };
    receiptRead.current = task;
    publishDraft({ ...currentDraft, receiptDataUrl: "", receiptFileName: "" });
    const current = () => active() && receiptRead.current === task && draftRef.current?.owner === owner && draftRef.current.open && draftRef.current.session === task.session;
    reader.onload = () => {
      if (!current()) return;
      receiptRead.current = null;
      if (typeof reader.result !== "string" || !reader.result.startsWith("data:")) { setMessage("The receipt could not be read. Choose it again."); return; }
      publishDraft({ ...draftRef.current!, receiptDataUrl: reader.result, receiptFileName: file.name }); setMessage(`${file.name} attached.`);
    };
    const failed = () => { if (current()) { receiptRead.current = null; setMessage("The receipt could not be read. Choose it again; your expense draft is retained."); } };
    reader.onerror = failed; reader.onabort = failed;
    setMessage("Reading the selected receipt…");
    try { reader.readAsDataURL(file); } catch { failed(); }
  }

  function updateStatus(expense: BusinessExpense, status: ExpenseStatus) {
    if (!active() || completedRecords.current.has(expense)) return;
    try {
      if (!statuses.includes(status) || latest.current.items.filter(item => item.id === expense.id).length !== 1) throw new Error("Expense is unavailable.");
      const previousAttempt = statusAttempts.current.get(expense);
      const intended = previousAttempt?.status === status ? previousAttempt : { ...expense, status, updatedAt: new Date().toISOString() };
      statusAttempts.current.set(expense, intended);
      expenses.updateItem(expense.id, current => {
        if (previousAttempt === intended && expenseSnapshot(current) === expenseSnapshot(intended)) return current;
        if (expenseSnapshot(current) !== expenseSnapshot(expense)) throw new Error("Expense has changed.");
        return current.status === status ? current : { ...current, status, updatedAt: intended.updatedAt };
      });
    } catch { setMessage("Expense status save could not be confirmed. Review the saved expense and retry."); return; }
    completedRecords.current.add(expense);
    setMessage("Expense status saved on this device. Check sync status before switching devices.");
  }

  function deleteExpense(expense: BusinessExpense) {
    if (!active() || completedRecords.current.has(expense)) return;
    try {
      const matches = latest.current.items.filter(item => item.id === expense.id);
      if (!matches.length && deleteAttempts.current.has(expense)) {
        completedRecords.current.add(expense); setMessage("The expense is no longer on this device. Check sync status before switching devices."); return;
      }
      if (matches.length !== 1 || expenseSnapshot(matches[0]) !== expenseSnapshot(expense)) throw new Error("Expense has changed.");
      deleteAttempts.current.add(expense);
      expenses.removeItem(expense.id, current => { if (expenseSnapshot(current) !== expenseSnapshot(expense)) throw new Error("Expense has changed."); });
    } catch { setMessage("Expense deletion could not be confirmed. Review the saved expense and retry."); return; }
    completedRecords.current.add(expense);
    setMessage("Expense deleted on this device. Check sync status before switching devices.");
  }

  if (!ready) return <Card>Loading expenses…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance" title="Expenses & Receipts" description="Capture business costs, VAT, receipts and job-linked spending in one place." />

    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
      <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-4 text-sm"><option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-4 text-sm"><option value="">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
      <Button onClick={toggleForm}><Plus className="mr-2 size-4" />Add expense</Button>
    </div>

    {message ? <div role="status" className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><Banknote className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Gross spend</p><p className="mt-2 text-3xl font-bold">{money.format(totals.gross)}</p></Card>
      <Card><WalletCards className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Net spend</p><p className="mt-2 text-3xl font-bold">{money.format(totals.net)}</p></Card>
      <Card><FileCheck2 className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">VAT recorded</p><p className="mt-2 text-3xl font-bold">{money.format(totals.vat)}</p></Card>
      <Card><Receipt className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Needs attention</p><p className="mt-2 text-3xl font-bold">{unreconciled + missingReceipts}</p><p className="mt-1 text-xs text-slate-500">{unreconciled} unreconciled · {missingReceipts} missing receipts</p></Card>
    </section>

    {showForm ? <Card><form aria-label="Create expense" onSubmit={addExpense} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <p className="text-sm text-slate-400 md:col-span-2 xl:col-span-3">Keep this page open until the expense is saved. Leaving loses unsaved changes and receipts.</p>
      <InputField required label="Expense date" type="date" value={form.expenseDate} onChange={(event) => changeForm({ ...form, expenseDate: event.target.value })} />
      <InputField required label="Supplier" placeholder="CEF, Screwfix, fuel station…" value={form.supplier} onChange={(event) => changeForm({ ...form, supplier: event.target.value })} />
      <InputField required label="Description" value={form.description} onChange={(event) => changeForm({ ...form, description: event.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Category</span><select value={form.category} onChange={(event) => changeForm({ ...form, category: event.target.value as ExpenseCategory })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Payment method</span><select value={form.paymentMethod} onChange={(event) => changeForm({ ...form, paymentMethod: event.target.value as ExpensePaymentMethod })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Status</span><select value={form.status} onChange={(event) => changeForm({ ...form, status: event.target.value as ExpenseStatus })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Job</span><select value={form.jobId} onChange={(event) => changeForm({ ...form, jobId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">General business expense</option>{jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
      <InputField label="Net amount (£)" type="number" min="0" step="0.01" value={form.netAmount} onChange={(event) => changeForm({ ...form, netAmount: event.target.value })} />
      <InputField label="VAT amount (£)" type="number" min="0" step="0.01" value={form.vatAmount} onChange={(event) => changeForm({ ...form, vatAmount: event.target.value })} />
      <InputField label="Receipt URL" placeholder="Optional cloud link" value={form.receiptUrl} onChange={(event) => changeForm({ ...form, receiptUrl: event.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300 md:col-span-2"><span>Receipt image or PDF</span><input type="file" accept="image/*,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; readReceipt(file); }} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />{receiptFileName ? <span className="text-xs text-emerald-300">Attached: {receiptFileName}</span> : null}</label>
      <div className="md:col-span-2 xl:col-span-3"><TextareaField label="Notes" value={form.notes} onChange={(event) => changeForm({ ...form, notes: event.target.value })} /></div>
      <div className="md:col-span-2 xl:col-span-3 flex justify-end"><Button type="submit">Save expense</Button></div>
    </form></Card> : null}

    <section className="space-y-3">
      <h2 className="text-xl font-bold">Expense register</h2>
      {visibleExpenses.length === 0 ? <Card><p className="text-sm text-slate-400">No expenses match this selection.</p></Card> : visibleExpenses.map((expense) => { const receipt = receiptDisplay(expense); return <Card key={expense.id}>
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{expense.category} · {expense.paymentMethod}</p><h3 className="mt-1 text-lg font-bold">{expense.supplier}</h3><p className="text-sm text-slate-400">{expense.description}</p><p className="mt-1 text-xs text-slate-500">{formatDate(expense.expenseDate)} · {jobName(expense.jobId)}</p></div><button onClick={() => deleteExpense(expense)} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300" aria-label="Delete expense"><Trash2 className="size-4" /></button></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3"><div><p className="text-xs text-slate-500">Net</p><p className="font-semibold">{money.format(expense.netAmount)}</p></div><div><p className="text-xs text-slate-500">VAT</p><p className="font-semibold">{money.format(expense.vatAmount)}</p></div><div><p className="text-xs text-slate-500">Gross</p><p className="font-semibold">{money.format(expense.grossAmount)}</p></div></div>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4"><select value={expense.status} onChange={(event) => updateStatus(expense, event.target.value as ExpenseStatus)} className="min-h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm">{statuses.map((status) => <option key={status}>{status}</option>)}</select>{receipt.url ? <a href={receipt.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-cyan-300 hover:text-cyan-200">{receipt.external ? "Open receipt link" : "Open attached receipt"}</a> : receipt.pending ? <span className="text-sm text-slate-400">Receipt attached · download pending</span> : <span className="text-sm text-amber-300">Receipt missing</span>}</div>
      </Card>; })}
    </section>
  </div>;
}
