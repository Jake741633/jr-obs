"use client";

import { FormEvent, useMemo, useState } from "react";
import { CalendarClock, MessageSquareText, Plus, Star, UsersRound } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { Customer, CustomerInteraction, CustomerInteractionType, CustomerProfile, CustomerTag, Invoice, Job } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const today = new Date().toISOString().slice(0, 10);
const tags: CustomerTag[] = ["Domestic", "Landlord", "Commercial", "Builder", "Repeat customer", "VIP", "Maintenance", "Other"];
const interactionTypes: CustomerInteractionType[] = ["Call", "Email", "WhatsApp", "Site visit", "Review request", "Note"];

function invoiceTotal(invoice: Invoice) {
  const net = invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return invoice.vatEnabled ? net * (1 + invoice.vatRate / 100) : net;
}

export default function CrmPage() {
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const profiles = useLocalStorageCollection<CustomerProfile>("jr-os-customer-profiles");
  const interactions = useLocalStorageCollection<CustomerInteraction>("jr-os-customer-interactions");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [interactionType, setInteractionType] = useState<CustomerInteractionType>("Call");
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  const [message, setMessage] = useState("");

  const selectedCustomer = customers.items.find((customer) => customer.id === selectedCustomerId);
  const selectedProfile = profiles.items.find((profile) => profile.customerId === selectedCustomerId);
  const customerJobs = jobs.items.filter((job) => job.customerId === selectedCustomerId);
  const customerInvoices = invoices.items.filter((invoice) => invoice.customerId === selectedCustomerId);
  const customerInteractions = interactions.items
    .filter((interaction) => interaction.customerId === selectedCustomerId)
    .slice()
    .sort((a, b) => b.interactionAt.localeCompare(a.interactionAt));

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers.items;
    return customers.items.filter((customer) => [customer.name, customer.email, customer.phone, customer.address].some((value) => value.toLowerCase().includes(term)));
  }, [customers.items, search]);

  const followUpsDue = profiles.items.filter((profile) => profile.nextFollowUpDate && profile.nextFollowUpDate <= today).length;
  const reviewsReceived = profiles.items.filter((profile) => profile.reviewStatus === "Received").length;
  const totalCustomerValue = invoices.items.filter((invoice) => invoice.status === "Paid").reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  const selectedLifetimeValue = customerInvoices.filter((invoice) => invoice.status === "Paid").reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);

  function ensureProfile(customerId: string) {
    const existing = profiles.items.find((profile) => profile.customerId === customerId);
    if (existing) return existing;
    const now = new Date().toISOString();
    const profile: CustomerProfile = {
      id: makeId("profile"), customerId, tags: [], preferredContact: "Phone", nextFollowUpDate: "", followUpReason: "",
      reviewStatus: "Not requested", portalEnabled: false, portalNote: "", createdAt: now, updatedAt: now,
    };
    profiles.setItems((current) => [...current, profile]);
    return profile;
  }

  function updateProfile(changes: Partial<CustomerProfile>) {
    if (!selectedCustomerId) return;
    const existing = profiles.items.find((profile) => profile.customerId === selectedCustomerId);
    const now = new Date().toISOString();
    if (!existing) {
      const base = ensureProfile(selectedCustomerId);
      profiles.setItems((current) => current.map((profile) => profile.id === base.id ? { ...profile, ...changes, updatedAt: now } : profile));
      return;
    }
    profiles.setItems((current) => current.map((profile) => profile.id === existing.id ? { ...profile, ...changes, updatedAt: now } : profile));
  }

  function toggleTag(tag: CustomerTag) {
    const currentTags = selectedProfile?.tags || [];
    updateProfile({ tags: currentTags.includes(tag) ? currentTags.filter((item) => item !== tag) : [...currentTags, tag] });
  }

  function addInteraction(event: FormEvent) {
    event.preventDefault();
    if (!selectedCustomerId || !summary.trim()) return;
    const now = new Date().toISOString();
    const interaction: CustomerInteraction = {
      id: makeId("interaction"), customerId: selectedCustomerId, type: interactionType, summary: summary.trim(), outcome: outcome.trim(), completedBy: "Jake", interactionAt: now, createdAt: now,
    };
    interactions.setItems((current) => [...current, interaction]);
    setSummary("");
    setOutcome("");
    setMessage("Interaction added to the customer timeline.");
  }

  return (
    <main className="space-y-6">
      <PageHeader title="CRM & Customer Care" description="Keep customer history, follow-ups, reviews, jobs and account value together." />

      <section className="grid gap-4 md:grid-cols-4">
        <Card><UsersRound className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{customers.items.length}</p><p className="text-sm text-slate-400">Customers</p></Card>
        <Card><CalendarClock className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{followUpsDue}</p><p className="text-sm text-slate-400">Follow-ups due</p></Card>
        <Card><Star className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{reviewsReceived}</p><p className="text-sm text-slate-400">Reviews received</p></Card>
        <Card><MessageSquareText className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{money.format(totalCustomerValue)}</p><p className="text-sm text-slate-400">Paid customer value</p></Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <InputField label="Search customers" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, phone, email or address" />
          <div className="mt-4 max-h-[620px] space-y-2 overflow-y-auto">
            {filteredCustomers.map((customer) => {
              const profile = profiles.items.find((item) => item.customerId === customer.id);
              return <button key={customer.id} type="button" onClick={() => { setSelectedCustomerId(customer.id); setMessage(""); }} className={`w-full rounded-lg border p-3 text-left ${selectedCustomerId === customer.id ? "border-sky-500 bg-sky-500/10" : "border-slate-800 bg-slate-950"}`}>
                <p className="font-medium">{customer.name}</p>
                <p className="text-xs text-slate-400">{customer.phone || customer.email || "No contact details"}</p>
                {profile?.tags.length ? <p className="mt-2 text-xs text-slate-500">{profile.tags.join(" · ")}</p> : null}
              </button>;
            })}
            {filteredCustomers.length === 0 && <p className="text-sm text-slate-400">No customers found.</p>}
          </div>
        </Card>

        {!selectedCustomer && <Card><p className="text-slate-400">Select a customer to open their CRM record.</p></Card>}

        {selectedCustomer && <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><h2 className="text-2xl font-semibold">{selectedCustomer.name}</h2><p className="text-slate-400">{selectedCustomer.phone || "No phone"} · {selectedCustomer.email || "No email"}</p><p className="mt-2 text-sm">{selectedCustomer.address}</p></div>
              <div className="text-right"><p className="text-2xl font-semibold">{money.format(selectedLifetimeValue)}</p><p className="text-sm text-slate-400">Lifetime paid value</p></div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">{tags.map((tag) => <button type="button" key={tag} onClick={() => toggleTag(tag)} className={`rounded-full px-3 py-1 text-sm ${selectedProfile?.tags.includes(tag) ? "bg-sky-500 text-slate-950" : "bg-slate-800 text-slate-300"}`}>{tag}</button>)}</div>
          </Card>

          <section className="grid gap-4 md:grid-cols-3">
            <Card><p className="text-sm text-slate-400">Jobs</p><p className="mt-2 text-3xl font-semibold">{customerJobs.length}</p><p className="mt-2 text-xs text-slate-500">{customerJobs.filter((job) => job.status === "Complete").length} complete</p></Card>
            <Card><p className="text-sm text-slate-400">Invoices</p><p className="mt-2 text-3xl font-semibold">{customerInvoices.length}</p><p className="mt-2 text-xs text-slate-500">{customerInvoices.filter((invoice) => invoice.status === "Paid").length} paid</p></Card>
            <Card><p className="text-sm text-slate-400">Interactions</p><p className="mt-2 text-3xl font-semibold">{customerInteractions.length}</p><p className="mt-2 text-xs text-slate-500">Calls, messages, visits and notes</p></Card>
          </section>

          <Card>
            <h3 className="text-lg font-semibold">Customer care settings</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm"><span>Preferred contact</span><select className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" value={selectedProfile?.preferredContact || "Phone"} onChange={(event) => updateProfile({ preferredContact: event.target.value as CustomerProfile["preferredContact"] })}><option>Phone</option><option>Email</option><option>WhatsApp</option></select></label>
              <InputField label="Next follow-up" type="date" value={selectedProfile?.nextFollowUpDate || ""} onChange={(event) => updateProfile({ nextFollowUpDate: event.target.value })} />
              <InputField label="Follow-up reason" value={selectedProfile?.followUpReason || ""} onChange={(event) => updateProfile({ followUpReason: event.target.value })} />
              <label className="space-y-1 text-sm"><span>Review status</span><select className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" value={selectedProfile?.reviewStatus || "Not requested"} onChange={(event) => updateProfile({ reviewStatus: event.target.value as CustomerProfile["reviewStatus"] })}><option>Not requested</option><option>Requested</option><option>Received</option></select></label>
              <label className="flex items-center gap-3 rounded-lg border border-slate-800 p-3 text-sm"><input type="checkbox" checked={selectedProfile?.portalEnabled || false} onChange={(event) => updateProfile({ portalEnabled: event.target.checked })} />Customer portal enabled</label>
              <InputField label="Portal note" value={selectedProfile?.portalNote || ""} onChange={(event) => updateProfile({ portalNote: event.target.value })} placeholder="What the customer should see next" />
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold">Add interaction</h3>
            <form onSubmit={addInteraction} className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm"><span>Type</span><select className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" value={interactionType} onChange={(event) => setInteractionType(event.target.value as CustomerInteractionType)}>{interactionTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
              <InputField label="Outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="Booked survey, left voicemail..." />
              <div className="md:col-span-2"><TextareaField label="Summary" value={summary} onChange={(event) => setSummary(event.target.value)} required placeholder="What was discussed or completed?" /></div>
              <div className="md:col-span-2"><Button type="submit"><Plus className="h-4 w-4" />Add to timeline</Button></div>
            </form>
            {message && <p className="mt-3 text-sm text-emerald-400">{message}</p>}
          </Card>

          <Card>
            <h3 className="text-lg font-semibold">Customer timeline</h3>
            <div className="mt-4 space-y-3">
              {customerInteractions.map((interaction) => <div key={interaction.id} className="rounded-lg border border-slate-800 bg-slate-950 p-4"><div className="flex items-center justify-between gap-3"><p className="font-medium">{interaction.type}</p><p className="text-xs text-slate-500">{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(interaction.interactionAt))}</p></div><p className="mt-2 text-sm">{interaction.summary}</p>{interaction.outcome && <p className="mt-1 text-sm text-slate-400">Outcome: {interaction.outcome}</p>}</div>)}
              {customerInteractions.length === 0 && <p className="text-sm text-slate-400">No customer interactions recorded yet.</p>}
            </div>
          </Card>
        </div>}
      </section>
    </main>
  );
}
