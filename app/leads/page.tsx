"use client";

import { FormEvent, useMemo, useState } from "react";
import { CirclePoundSterling, PhoneCall, Plus, Target, Trash2, UserRoundSearch } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { LeadActivity, LeadPriority, LeadSource, LeadStage, SalesLead } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const stages: LeadStage[] = ["New enquiry", "Contacted", "Survey booked", "Quote required", "Quote sent", "Won", "Lost"];
const sources: LeadSource[] = ["Website", "Google", "Referral", "Builder", "Repeat customer", "Social media", "MyBuilder", "Checkatrade", "Other"];
const priorities: LeadPriority[] = ["Low", "Normal", "High", "Urgent"];
const blank = { name: "", company: "", email: "", phone: "", siteAddress: "", workRequired: "", source: "Website" as LeadSource, stage: "New enquiry" as LeadStage, priority: "Normal" as LeadPriority, estimatedValue: "0", nextAction: "Call customer", followUpDate: "", notes: "" };

export default function LeadsPage() {
  const leads = useLocalStorageCollection<SalesLead>("jr-os-leads");
  const activities = useLocalStorageCollection<LeadActivity>("jr-os-lead-activities");
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);
  const [stageFilter, setStageFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [activityText, setActivityText] = useState<Record<string, string>>({});

  const openLeads = leads.items.filter((lead) => lead.stage !== "Won" && lead.stage !== "Lost");
  const pipelineValue = openLeads.reduce((sum, lead) => sum + lead.estimatedValue, 0);
  const wonValue = leads.items.filter((lead) => lead.stage === "Won").reduce((sum, lead) => sum + lead.estimatedValue, 0);
  const dueFollowUps = openLeads.filter((lead) => lead.followUpDate && lead.followUpDate <= new Date().toISOString().slice(0, 10)).length;

  const filtered = useMemo(() => leads.items.filter((lead) => (!stageFilter || lead.stage === stageFilter) && (!sourceFilter || lead.source === sourceFilter)), [leads.items, sourceFilter, stageFilter]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const now = new Date().toISOString();
    leads.add({ id: makeId("lead"), ...form, estimatedValue: Number(form.estimatedValue) || 0, notes: form.notes, createdAt: now, updatedAt: now });
    setForm(blank);
    setShowForm(false);
  }

  function changeStage(lead: SalesLead, stage: LeadStage) {
    leads.update(lead.id, { stage, updatedAt: new Date().toISOString() });
    activities.add({ id: makeId("activity"), leadId: lead.id, type: "Stage change", summary: `Moved to ${stage}`, completedBy: "Jake", completedAt: new Date().toISOString(), createdAt: new Date().toISOString() });
  }

  function addActivity(lead: SalesLead) {
    const summary = activityText[lead.id]?.trim();
    if (!summary) return;
    const now = new Date().toISOString();
    activities.add({ id: makeId("activity"), leadId: lead.id, type: "Note", summary, completedBy: "Jake", completedAt: now, createdAt: now });
    leads.update(lead.id, { nextAction: "Follow up", updatedAt: now });
    setActivityText((current) => ({ ...current, [lead.id]: "" }));
  }

  return (
    <main className="space-y-6">
      <PageHeader title="Leads & Sales Pipeline" description="Capture every enquiry, plan follow-ups and turn more opportunities into booked work." action={<Button onClick={() => setShowForm((value) => !value)}><Plus className="h-4 w-4" />New lead</Button>} />

      <section className="grid gap-4 md:grid-cols-4">
        <Card><UserRoundSearch className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{openLeads.length}</p><p className="text-sm text-slate-400">Open opportunities</p></Card>
        <Card><CirclePoundSterling className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{money.format(pipelineValue)}</p><p className="text-sm text-slate-400">Pipeline value</p></Card>
        <Card><Target className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{money.format(wonValue)}</p><p className="text-sm text-slate-400">Won value</p></Card>
        <Card><PhoneCall className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{dueFollowUps}</p><p className="text-sm text-slate-400">Follow-ups due</p></Card>
      </section>

      {showForm && <Card><form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <InputField label="Customer/contact" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        <InputField label="Company" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} />
        <InputField label="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <InputField label="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <InputField label="Site address" value={form.siteAddress} onChange={(event) => setForm({ ...form, siteAddress: event.target.value })} />
        <InputField label="Estimated value (£)" type="number" min="0" value={form.estimatedValue} onChange={(event) => setForm({ ...form, estimatedValue: event.target.value })} />
        <label className="space-y-1 text-sm"><span>Source</span><select className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value as LeadSource })}>{sources.map((source) => <option key={source}>{source}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span>Priority</span><select className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as LeadPriority })}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
        <InputField label="Next action" value={form.nextAction} onChange={(event) => setForm({ ...form, nextAction: event.target.value })} />
        <InputField label="Follow-up date" type="date" value={form.followUpDate} onChange={(event) => setForm({ ...form, followUpDate: event.target.value })} />
        <div className="md:col-span-2"><TextareaField label="Work required" value={form.workRequired} onChange={(event) => setForm({ ...form, workRequired: event.target.value })} required /></div>
        <div className="md:col-span-2"><TextareaField label="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
        <div className="md:col-span-2"><Button type="submit">Save lead</Button></div>
      </form></Card>}

      <Card><div className="flex flex-wrap gap-3">
        <select className="rounded-lg border border-slate-700 bg-slate-950 p-2" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="">All stages</option>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select>
        <select className="rounded-lg border border-slate-700 bg-slate-950 p-2" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="">All sources</option>{sources.map((source) => <option key={source}>{source}</option>)}</select>
      </div></Card>

      <section className="space-y-4">{filtered.map((lead) => {
        const leadActivities = activities.items.filter((activity) => activity.leadId === lead.id).slice(-3).reverse();
        return <Card key={lead.id}><div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">{lead.name}</h2><span className="rounded-full bg-slate-800 px-2 py-1 text-xs">{lead.priority}</span></div><p className="text-sm text-slate-400">{lead.company || lead.source} · {lead.phone || lead.email || "No contact details"}</p><p className="mt-3">{lead.workRequired}</p><p className="mt-2 text-sm text-slate-400">Next: {lead.nextAction || "Not set"}{lead.followUpDate ? ` · ${lead.followUpDate}` : ""}</p></div>
          <div className="text-right"><p className="text-xl font-semibold">{money.format(lead.estimatedValue)}</p><select className="mt-2 rounded-lg border border-slate-700 bg-slate-950 p-2" value={lead.stage} onChange={(event) => changeStage(lead, event.target.value as LeadStage)}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></div>
        </div>
        <div className="mt-4 flex gap-2"><input className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 p-2" placeholder="Add call, WhatsApp or follow-up note" value={activityText[lead.id] || ""} onChange={(event) => setActivityText((current) => ({ ...current, [lead.id]: event.target.value }))} /><Button onClick={() => addActivity(lead)}>Add note</Button><Button variant="secondary" onClick={() => leads.remove(lead.id)} aria-label="Delete lead"><Trash2 className="h-4 w-4" /></Button></div>
        {leadActivities.length > 0 && <div className="mt-4 space-y-2 border-t border-slate-800 pt-4">{leadActivities.map((activity) => <p key={activity.id} className="text-sm text-slate-400"><span className="font-medium text-slate-200">{activity.type}:</span> {activity.summary}</p>)}</div>}
        </Card>;
      })}{filtered.length === 0 && <Card><p className="text-slate-400">No leads match these filters.</p></Card>}</section>
    </main>
  );
}