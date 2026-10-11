"use client";

import Link from "next/link";
import { FormEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Eye, Mail, MapPin, Pencil, Phone, Search, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { EntityEmptyState } from "../../components/crm/EntityEmptyState";
import { useCustomersCollection } from "../../lib/cloud/coreBusinessCollections";
import { makeId, useCloudLocalCollection } from "../../lib/storage";
import { contactEmailHref, contactPhoneHref } from "../../lib/contactLinks";
import { savedIdentityIndex } from "../../lib/assistantIdentity";
import { canDeleteRecords, canEditFinance } from "../../lib/cloud/permissions";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import type { Customer, Job } from "../../lib/models";

const blank = { name: "", email: "", phone: "", address: "", notes: "" };
type CustomerScope = { key: string };
type CustomerDraft = { id: string; createdAt: string; editingId: string | null; expected: string; form: typeof blank; scope: CustomerScope; saved: boolean };
function customerEditSnapshot(customer: Customer) {
  return JSON.stringify([customer.createdAt, customer.name ?? "", customer.email ?? "", customer.phone ?? "", customer.address ?? "", customer.notes ?? ""]);
}

export default function CustomersPage() {
  const identityState = useCloudIdentity();
  const customers = useCustomersCollection();
  const { items, isReady } = customers;
  const jobs = useCloudLocalCollection<Job>("jr-os-jobs");
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(8);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const draft = useRef<CustomerDraft | null>(null);
  const deletedRecords = useRef(new WeakSet<Customer>());
  const scopeKey = JSON.stringify([identityState.mode, identityState.identity?.organisationId, identityState.identity?.userId, identityState.identity?.role, identityState.identity?.customerSourceId]);
  const scope = useMemo(() => ({ key: scopeKey }), [scopeKey]);
  const editRestricted = identityState.mode !== "local" && !canEditFinance(identityState.identity?.role);
  const deleteRestricted = identityState.mode !== "local" && !canDeleteRecords(identityState.identity?.role);
  const formReady = identityState.isReady && isReady;
  const customerIndex = useMemo(() => savedIdentityIndex(items), [items]);
  const latest = useRef({ scope, ready: false, jobsReady: false, editRestricted: true, deleteRestricted: true, customers: items, jobs: jobs.items });
  useLayoutEffect(() => {
    latest.current = { scope, ready: formReady, jobsReady: jobs.isReady, editRestricted, deleteRestricted, customers: items, jobs: jobs.items };
    return () => { latest.current = { ...latest.current, ready: false, jobsReady: false, editRestricted: true, deleteRestricted: true }; };
  }, [scope, formReady, jobs.isReady, editRestricted, deleteRestricted, items, jobs.items]);

  const filtered = useMemo(() => {
    const words = search.trim().toLocaleLowerCase("en-GB").split(/\s+/).filter(Boolean);
    return items.filter((item) => {
      const searchable = [item.name, item.email, item.phone, item.address, typeof item.phone === "string" ? item.phone.replace(/[\s().-]/g, "") : ""].filter((value) => typeof value === "string").join(" ").toLocaleLowerCase("en-GB");
      return words.every((word) => searchable.includes(word));
    });
  }, [items, search]);

  const linkedJobCounts = useMemo(() => {
    const counts = new Map<string, number>();
    jobs.items.forEach((job) => {
      if (job.customerId) counts.set(job.customerId, (counts.get(job.customerId) ?? 0) + 1);
    });
    return counts;
  }, [jobs.items]);

  function resetForm() {
    draft.current = null;
    setForm(blank);
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  function requireAccess(deleting = false) {
    const current = latest.current;
    if (current.scope !== scope || !current.ready) throw new Error("Wait for the current account's customer records to finish loading.");
    if (deleting ? current.deleteRestricted : current.editRestricted) throw new Error(deleting ? "Only an owner or administrator can delete a customer." : "Customer changes are managed by the office.");
  }

  function requireCustomer(id: string) {
    const customer = savedIdentityIndex(latest.current.customers).unique.get(id);
    if (!customer) throw new Error("This customer is unavailable or its saved identity is ambiguous. Review the current records before making changes.");
    return customer;
  }

  function openForm() {
    try { requireAccess(); } catch (error) { setError(error instanceof Error ? error.message : "Customer changes are unavailable."); return; }
    if (draft.current?.scope === scope) { setError("Save or close the open customer form first."); return; }
    // A new object also invalidates callbacks from a previously closed blank form.
    const next = { ...blank };
    draft.current = { id: "", createdAt: "", editingId: null, expected: "", form: next, scope, saved: false };
    setForm(next); setEditingId(null); setShowForm(true); setError(""); setMessage("");
  }

  function closeForm() {
    if (draft.current?.form !== form || draft.current.scope !== scope || latest.current.scope !== scope) return;
    resetForm();
  }

  function changeForm(next: typeof blank) {
    if (!draft.current || draft.current.form !== form || draft.current.scope !== scope || latest.current.scope !== scope) return;
    draft.current.form = next;
    setForm(next); setError("");
  }

  function startEdit(customer: Customer, reload = false) {
    try {
      requireAccess();
      if (customerEditSnapshot(requireCustomer(customer.id)) !== customerEditSnapshot(customer)) throw new Error("This customer has changed. Review the saved details before editing.");
    } catch (error) { setError(error instanceof Error ? error.message : "This customer is unavailable."); return; }
    if (draft.current?.scope === scope && (!reload || draft.current.editingId !== customer.id)) { setError("Save or close the open customer form before editing another customer."); return; }
    const next = { name: customer.name ?? "", email: customer.email ?? "", phone: customer.phone ?? "", address: customer.address ?? "", notes: customer.notes ?? "" };
    draft.current = { id: customer.id, createdAt: customer.createdAt, editingId: customer.id, expected: customerEditSnapshot(customer), form: next, scope, saved: false };
    setForm(next);
    setEditingId(customer.id);
    setShowForm(true); setError(""); setMessage("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const active = draft.current;
    if (!showForm || !active || active.saved || active.form !== form || active.editingId !== editingId || active.scope !== scope) return;
    try { requireAccess(); } catch (error) { setError(`${error instanceof Error ? error.message : "Customer changes are unavailable."} Your draft is still here.`); return; }
    if (!form.name.trim()) { setError("Customer name is required."); return; }
    if (!form.email.trim() && !form.phone.trim()) { setError("Add at least a phone number or email address."); return; }
    const now = new Date().toISOString();
    const payload = { ...form, name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), address: form.address.trim(), updatedAt: now };
    try {
      if (editingId) {
        requireCustomer(editingId);
        customers.updateItem(editingId, (current) => {
          if (customerEditSnapshot(current) !== active.expected) throw new Error("This customer's editable details have changed. Your draft is retained; use saved values to review the current record before editing again.");
          return { ...current, ...payload };
        });
      } else {
        active.id ||= makeId("cus");
        active.createdAt ||= now;
        customers.createItem({ id: active.id, ...payload, createdAt: active.createdAt });
      }
    } catch (error) { setError(`Customer save could not be confirmed. Your draft is still here. ${error instanceof Error ? error.message : "Please try again."}`); return; }
    active.saved = true;
    resetForm();
    setSearch(""); setLimit(8);
    setMessage("Customer saved on this device. Check sync status before switching devices.");
  }

  function checkLinkedJobs(customer: Customer) {
    if (!latest.current.jobsReady) throw new Error("Wait for linked job records to finish loading before deleting a customer.");
    const linkedJobs = latest.current.jobs.filter((job) => job.customerId === customer.id).length;
    if (linkedJobs > 0) throw new Error(`${customer.name} cannot be deleted because ${linkedJobs} job${linkedJobs === 1 ? " is" : "s are"} linked to this customer. Review the linked jobs first.`);
  }

  function deleteCustomer(customer: Customer) {
    if (deletedRecords.current.has(customer)) return;
    try {
      requireAccess(true);
      if (draft.current?.editingId === customer.id) throw new Error("Save or close this customer's edit form before deleting it.");
      const current = requireCustomer(customer.id);
      if (JSON.stringify(current) !== JSON.stringify(customer)) throw new Error("This customer has changed. Review the saved record before deleting.");
      checkLinkedJobs(customer);
      if (!window.confirm(`Delete ${customer.name}? This cannot be undone.`)) return;
      requireAccess(true);
      requireCustomer(customer.id);
      checkLinkedJobs(customer);
      customers.removeItem(customer.id, (saved) => {
        if (JSON.stringify(saved) !== JSON.stringify(customer)) throw new Error("This customer has changed. Review the saved record before deleting.");
      });
      deletedRecords.current.add(customer);
      setError(""); setMessage("Customer deleted on this device. Check sync status before switching devices.");
    } catch (error) { setError(`Deletion could not be confirmed. ${error instanceof Error ? error.message : "Review the saved customer and retry."}`); }
  }

  return <div className="space-y-5 pb-24 sm:space-y-6 sm:pb-0">
    <PageHeader eyebrow="CRM" title="Customers" description="Keep customer contact details, addresses and notes together for future jobs and quotes." action={editRestricted ? undefined : <Button disabled={!formReady && !showForm} onClick={() => showForm ? closeForm() : openForm()}><UserPlus className="mr-2 size-4" />{showForm ? "Close form" : "Add customer"}</Button>} />
    {editRestricted ? <Card>Customer changes are managed by the office. Deletion requires an owner or administrator.</Card> : null}
    {error && (!showForm || editRestricted) ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">{error}</p> : null}
    {message ? <p role="status" className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-200">{message}</p> : null}
    {showForm && !editRestricted ? <Card><form aria-label={editingId ? "Edit customer" : "Create customer"} onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <p className="text-sm text-slate-400 md:col-span-2">Keep this page open until the customer is saved. Leaving or closing this form loses unsaved changes.</p>
      <InputField required label="Customer name" value={form.name} onChange={(e) => changeForm({ ...form, name: e.target.value })} />
      <InputField label="Phone" type="tel" value={form.phone} onChange={(e) => changeForm({ ...form, phone: e.target.value })} />
      <InputField label="Email" type="email" value={form.email} onChange={(e) => changeForm({ ...form, email: e.target.value })} />
      <InputField label="Address" value={form.address} onChange={(e) => changeForm({ ...form, address: e.target.value })} />
      <div className="md:col-span-2"><TextareaField label="Notes" value={form.notes} onChange={(e) => changeForm({ ...form, notes: e.target.value })} /></div>
      {error ? <p role="alert" className="md:col-span-2 text-sm text-red-300">{error}</p> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end md:col-span-2">{editingId ? <Button type="button" variant="secondary" onClick={() => { if (draft.current?.form !== form || draft.current.scope !== scope) return; try { requireAccess(); startEdit(requireCustomer(editingId), true); } catch (error) { setError(error instanceof Error ? error.message : "This customer is unavailable."); } }}>Use saved values</Button> : null}<Button className="w-full sm:w-auto" disabled={!formReady} type="submit">{editingId ? "Update customer" : "Save customer"}</Button></div>
    </form></Card> : null}
    <section aria-label="Find customers" className="space-y-3">
      <label className="grid gap-2 text-sm font-semibold"><span>Find a customer</span><span className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setLimit(8); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} autoComplete="off" enterKeyHint="search" placeholder="Name, phone, email or address" className="min-h-12 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-base outline-none focus:border-cyan-400 sm:text-sm" /></span></label>
      <div className="flex flex-wrap items-center justify-between gap-2">{isReady ? <p role="status" className="text-sm text-slate-400">Showing {Math.min(limit, filtered.length)} of {filtered.length} matching customer records</p> : null}<button type="button" onClick={() => { setSearch(""); setLimit(8); }} className="min-h-12 rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-300">Clear customer search</button></div>
    </section>
    {!isReady ? <Card>Loading customers…</Card> : filtered.length === 0 ? <EntityEmptyState icon={<Users className="size-6" />} title={items.length ? "No matching customers" : "No customers yet"} description={items.length ? "Try a different search." : "Add your first customer to begin building the JR OS customer database."} /> : <section aria-label="Customer records" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.slice(0, limit).map((customer) => {
      const linkedJobs = linkedJobCounts.get(customer.id) ?? 0;
      const phoneHref = contactPhoneHref(customer.phone), emailHref = contactEmailHref(customer.email);
      return <Card key={customer.id}>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
          <div className="min-w-0"><h2 className="break-words text-lg font-bold">{customer.name}</h2><p className="mt-1 text-xs text-slate-500">{jobs.isReady ? `${linkedJobs} linked job record${linkedJobs === 1 ? "" : "s"}` : "Linked jobs loading…"}</p></div>
          <div className="grid grid-flow-col auto-cols-fr gap-2"><Link href={`/customers/${encodeURIComponent(customer.id)}`} aria-label={`View ${customer.name}`} className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-cyan-300"><Eye className="size-4" /></Link>{!editRestricted ? <button disabled={!formReady || !customerIndex.unique.has(customer.id) || showForm} onClick={() => startEdit(customer)} aria-label={`Edit ${customer.name}`} className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-cyan-300 disabled:opacity-40"><Pencil className="size-4" /></button> : null}{!deleteRestricted ? <button disabled={!formReady || !jobs.isReady || !customerIndex.unique.has(customer.id) || (showForm && editingId === customer.id)} onClick={() => deleteCustomer(customer)} aria-label={`Delete ${customer.name}`} className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-slate-800 text-slate-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"><Trash2 className="size-4" /></button> : null}</div>
        </div>
        <div className="mt-4 space-y-2 text-sm text-slate-400">
          {customer.phone ? phoneHref ? <a href={phoneHref} aria-label={`Call ${customer.name} on ${customer.phone}`} className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-800 px-3 text-cyan-200"><Phone className="size-4 shrink-0" /><span className="break-words">{customer.phone}</span></a> : <p className="flex items-start gap-2"><Phone className="mt-0.5 size-4 shrink-0" /><span className="break-words">{customer.phone}<span className="block text-xs text-amber-200">Review phone format to call</span></span></p> : null}
          {customer.email ? emailHref ? <a href={emailHref} aria-label={`Email ${customer.name} at ${customer.email}`} className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-800 px-3 text-cyan-200"><Mail className="size-4 shrink-0" /><span className="min-w-0 break-all">{customer.email}</span></a> : <p className="flex items-start gap-2"><Mail className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 break-all">{customer.email}<span className="block text-xs text-amber-200">Review email format to compose</span></span></p> : null}
          {customer.address ? <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" /><span className="break-words">{customer.address}</span></p> : null}
        </div>
      </Card>;
    })}</section>}
    {isReady && filtered.length > limit ? <button type="button" onClick={() => setLimit((value) => value + 8)} className="min-h-12 w-full rounded-xl border border-slate-700 px-4 text-sm font-semibold">Show more customers ({filtered.length - limit} remaining)</button> : null}
  </div>;
}
