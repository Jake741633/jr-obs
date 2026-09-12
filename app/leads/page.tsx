"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type TouchEvent as ReactTouchEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  CirclePoundSterling,
  FilePlus2,
  GripVertical,
  Mail,
  MessageSquareText,
  Phone,
  Plus,
  Search,
  Target,
  Trash2,
  TrendingUp,
  UserRoundSearch,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import {
  useBuildersCollection,
  useCustomersCollection,
  useLeadActivitiesCollection,
  usePricingDocumentsCollection,
  useSalesLeadsCollection,
} from "../../lib/cloud/coreBusinessCollections";
import { crmLeadStages, moveLeadStage, normaliseLeadStage } from "../../lib/crmPro";
import { makeId } from "../../lib/storage";
import type { LeadActivity, LeadPriority, LeadSource, LeadStage, SalesLead } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const stages: readonly LeadStage[] = crmLeadStages;
const sources: LeadSource[] = ["Website", "Google", "Referral", "Builder", "Repeat customer", "Social media", "MyJobsQuote", "MyBuilder", "Checkatrade", "Other"];
const priorities: LeadPriority[] = ["Low", "Normal", "High", "Urgent"];
const activityTypes: Exclude<LeadActivity["type"], "Stage change">[] = ["Call", "Text", "Email", "WhatsApp", "Site visit", "Note"];
const closedStages: LeadStage[] = ["Accepted", "Lost", "Completed", "Cancelled"];
const stageColours: Record<LeadStage, string> = {
  "New Lead": "border-sky-400/35 bg-sky-500/5",
  Contacted: "border-blue-400/35 bg-blue-500/5",
  "Survey Booked": "border-indigo-400/35 bg-indigo-500/5",
  "Survey Complete": "border-violet-400/35 bg-violet-500/5",
  "Quote Sent": "border-cyan-400/35 bg-cyan-500/5",
  "Follow-up Due": "border-amber-400/35 bg-amber-500/5",
  Accepted: "border-emerald-400/35 bg-emerald-500/5",
  Lost: "border-rose-400/35 bg-rose-500/5",
  Completed: "border-green-400/35 bg-green-500/5",
  Cancelled: "border-slate-600 bg-slate-900/70",
};
const priorityOrder: Record<LeadPriority, number> = { Urgent: 4, High: 3, Normal: 2, Low: 1 };
const today = new Date().toISOString().slice(0, 10);
const blank = {
  name: "",
  company: "",
  email: "",
  phone: "",
  siteAddress: "",
  workRequired: "",
  source: "Website" as LeadSource,
  stage: "New Lead" as LeadStage,
  priority: "Normal" as LeadPriority,
  estimatedValue: "0",
  nextAction: "Call customer",
  followUpDate: "",
  customerId: "",
  builderId: "",
  notes: "",
};

function displayDate(value: string) {
  return value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Not set";
}

function contactHref(lead: SalesLead) {
  if (lead.customerId) return `/crm?customer=${encodeURIComponent(lead.customerId)}`;
  if (lead.builderId) return `/builders/${encodeURIComponent(lead.builderId)}`;
  return "";
}

export default function LeadsPage() {
  const leads = useSalesLeadsCollection();
  const activities = useLeadActivitiesCollection();
  const customers = useCustomersCollection();
  const builders = useBuildersCollection();
  const documents = usePricingDocumentsCollection();
  const deepLinkHandled = useRef(false);
  const touchOrigin = useRef<Record<string, { x: number; y: number }>>({});
  const [draggedLeadId, setDraggedLeadId] = useState("");
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);
  const [stageFilter, setStageFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [search, setSearch] = useState("");
  const [activityText, setActivityText] = useState<Record<string, string>>({});
  const [activityKind, setActivityKind] = useState<Record<string, Exclude<LeadActivity["type"], "Stage change">>>({});
  const [outcomeText, setOutcomeText] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const ready = leads.isReady && activities.isReady && customers.isReady && builders.isReady && documents.isReady;

  useEffect(() => {
    if (deepLinkHandled.current || !ready) return;
    const frame = window.requestAnimationFrame(() => {
      const parameters = new URLSearchParams(window.location.search);
      const selectedLead = leads.items.find((lead) => lead.id === parameters.get("lead"));
      if (selectedLead) {
        setSearch(selectedLead.name);
        setStageFilter(normaliseLeadStage(selectedLead.stage));
      }
      if (parameters.get("action") === "create") {
        const customer = customers.items.find((item) => item.id === parameters.get("customerId"));
        const builder = builders.items.find((item) => item.id === parameters.get("builderId"));
        setForm({
          ...blank,
          name: customer?.name || builder?.contactName || "",
          company: builder?.companyName || "",
          email: customer?.email || builder?.email || "",
          phone: customer?.phone || builder?.phone || "",
          siteAddress: customer?.address || builder?.address || "",
          customerId: customer?.id || "",
          builderId: builder?.id || "",
          source: builder ? "Builder" : customer ? "Repeat customer" : (parameters.get("source") as LeadSource) || "Website",
        });
        setShowForm(true);
      }
      deepLinkHandled.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [builders.items, customers.items, leads.items, ready]);

  const normalisedLeads = useMemo(() => leads.items.map((lead) => ({ lead, stage: normaliseLeadStage(lead.stage) })), [leads.items]);
  const openLeads = normalisedLeads.filter(({ stage }) => !closedStages.includes(stage));
  const wonLeads = normalisedLeads.filter(({ stage }) => stage === "Accepted" || stage === "Completed");
  const lostLeads = normalisedLeads.filter(({ stage }) => stage === "Lost");
  const decidedLeads = wonLeads.length + lostLeads.length;
  const pipelineValue = openLeads.reduce((sum, { lead }) => sum + lead.estimatedValue, 0);
  const quotePipelineValue = normalisedLeads.filter(({ stage }) => stage === "Quote Sent" || stage === "Follow-up Due").reduce((sum, { lead }) => sum + lead.estimatedValue, 0);
  const conversionRate = decidedLeads ? wonLeads.length / decidedLeads * 100 : 0;
  const dueFollowUps = openLeads.filter(({ lead, stage }) => stage === "Follow-up Due" || Boolean(lead.followUpDate && lead.followUpDate <= today)).length;
  const builderOpportunities = openLeads.filter(({ lead }) => lead.source === "Builder" || Boolean(lead.builderId)).length;
  const recordedQuotes = documents.items.filter((document) => document.type === "Quote");
  const quoteDecisions = recordedQuotes.filter((document) => document.status === "Accepted" || document.status === "Declined");
  const quoteConversion = quoteDecisions.length ? quoteDecisions.filter((document) => document.status === "Accepted").length / quoteDecisions.length * 100 : 0;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.items
      .filter((lead) => (!stageFilter || normaliseLeadStage(lead.stage) === stageFilter) && (!sourceFilter || lead.source === sourceFilter))
      .filter((lead) => !term || `${lead.name} ${lead.company} ${lead.workRequired} ${lead.siteAddress} ${lead.phone} ${lead.email}`.toLowerCase().includes(term))
      .toSorted((left, right) => priorityOrder[right.priority] - priorityOrder[left.priority] || left.followUpDate.localeCompare(right.followUpDate) || right.updatedAt.localeCompare(left.updatedAt));
  }, [leads.items, search, sourceFilter, stageFilter]);

  const sourcePerformance = useMemo(() => sources.map((source) => {
    const sourceLeads = normalisedLeads.filter(({ lead }) => lead.source === source);
    const won = sourceLeads.filter(({ stage }) => stage === "Accepted" || stage === "Completed");
    const lost = sourceLeads.filter(({ stage }) => stage === "Lost");
    return { source, total: sourceLeads.length, won: won.length, lost: lost.length, value: won.reduce((sum, { lead }) => sum + lead.estimatedValue, 0), conversion: won.length + lost.length ? won.length / (won.length + lost.length) * 100 : 0 };
  }).filter((item) => item.total > 0).toSorted((left, right) => right.value - left.value || right.total - left.total), [normalisedLeads]);

  const lossReasons = useMemo(() => {
    const counts = new Map<string, number>();
    lostLeads.forEach(({ lead }) => {
      const reason = lead.lostReason?.trim() || "Reason not recorded";
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    });
    return [...counts.entries()].toSorted((left, right) => right[1] - left[1]);
  }, [lostLeads]);

  function resetForm() {
    setForm(blank);
    setShowForm(false);
  }

  function selectCustomer(customerId: string) {
    const customer = customers.items.find((item) => item.id === customerId);
    setForm((current) => ({ ...current, customerId, builderId: "", name: customer?.name || current.name, email: customer?.email || current.email, phone: customer?.phone || current.phone, siteAddress: customer?.address || current.siteAddress, source: customer ? "Repeat customer" : current.source }));
  }

  function selectBuilder(builderId: string) {
    const builder = builders.items.find((item) => item.id === builderId);
    setForm((current) => ({ ...current, builderId, customerId: "", name: builder?.contactName || current.name, company: builder?.companyName || current.company, email: builder?.email || current.email, phone: builder?.phone || current.phone, siteAddress: builder?.address || current.siteAddress, source: builder ? "Builder" : current.source }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const now = new Date().toISOString();
    const lead: SalesLead = {
      id: makeId("lead"),
      ...form,
      customerId: form.customerId || undefined,
      builderId: form.builderId || undefined,
      estimatedValue: Number(form.estimatedValue) || 0,
      createdAt: now,
      updatedAt: now,
    };
    leads.setItems((current) => [lead, ...current]);
    activities.setItems((current) => [{ id: makeId("activity"), leadId: lead.id, type: "Note", summary: `Enquiry captured from ${lead.source}.`, completedBy: "JR OS CRM", completedAt: now, createdAt: now }, ...current]);
    resetForm();
    setMessage(`${lead.name} added to New Lead.`);
  }

  function changeStage(lead: SalesLead, stage: LeadStage, method = "Pipeline") {
    const previous = normaliseLeadStage(lead.stage);
    if (previous === stage) return;
    const now = new Date().toISOString();
    leads.setItems((current) => current.map((item) => item.id === lead.id ? {
      ...item,
      stage,
      lastContactAt: stage === "Contacted" ? now : item.lastContactAt,
      completedAt: stage === "Completed" ? now : item.completedAt,
      nextAction: stage === "Follow-up Due" ? "Contact customer today" : stage === "Accepted" ? "Book work" : item.nextAction,
      updatedAt: now,
    } : item));
    activities.setItems((current) => [{ id: makeId("activity"), leadId: lead.id, type: "Stage change", summary: `${method}: ${previous} → ${stage}`, completedBy: "JR OS CRM", completedAt: now, createdAt: now }, ...current]);
    setMessage(`${lead.name} moved to ${stage}.`);
  }

  function moveBy(lead: SalesLead, direction: -1 | 1, method: string) {
    changeStage(lead, moveLeadStage(normaliseLeadStage(lead.stage), direction), method);
  }

  function dropInto(stage: LeadStage) {
    const lead = leads.items.find((item) => item.id === draggedLeadId);
    if (lead) changeStage(lead, stage, "Drag and drop");
    setDraggedLeadId("");
  }

  function startSwipe(lead: SalesLead, event: ReactTouchEvent) {
    const touch = event.touches[0];
    touchOrigin.current[lead.id] = { x: touch.clientX, y: touch.clientY };
  }

  function finishSwipe(lead: SalesLead, event: ReactTouchEvent) {
    const origin = touchOrigin.current[lead.id];
    const touch = event.changedTouches[0];
    delete touchOrigin.current[lead.id];
    if (!origin || !touch) return;
    const horizontal = touch.clientX - origin.x;
    const vertical = touch.clientY - origin.y;
    if (Math.abs(horizontal) >= 64 && Math.abs(horizontal) > Math.abs(vertical) * 1.2) moveBy(lead, horizontal < 0 ? 1 : -1, "Mobile swipe");
  }

  function addActivity(lead: SalesLead) {
    const summary = activityText[lead.id]?.trim();
    if (!summary) return;
    const now = new Date().toISOString();
    const type = activityKind[lead.id] || "Note";
    activities.setItems((current) => [{ id: makeId("activity"), leadId: lead.id, type, summary, completedBy: "Jake", completedAt: now, createdAt: now }, ...current]);
    leads.setItems((current) => current.map((item) => item.id === lead.id ? { ...item, nextAction: "Follow up", lastContactAt: type === "Note" ? item.lastContactAt : now, updatedAt: now } : item));
    setActivityText((current) => ({ ...current, [lead.id]: "" }));
    setMessage(`${type} logged for ${lead.name}.`);
  }

  function saveOutcome(lead: SalesLead) {
    const reason = outcomeText[lead.id]?.trim();
    if (!reason) return;
    const stage = normaliseLeadStage(lead.stage);
    const now = new Date().toISOString();
    leads.setItems((current) => current.map((item) => item.id === lead.id ? { ...item, lostReason: stage === "Lost" ? reason : item.lostReason, cancelledReason: stage === "Cancelled" ? reason : item.cancelledReason, updatedAt: now } : item));
    activities.setItems((current) => [{ id: makeId("activity"), leadId: lead.id, type: "Note", summary: `${stage} reason: ${reason}`, completedBy: "JR OS CRM", completedAt: now, createdAt: now }, ...current]);
    setOutcomeText((current) => ({ ...current, [lead.id]: "" }));
    setMessage(`${stage} reason saved for reporting.`);
  }

  function removeLead(lead: SalesLead) {
    if (!window.confirm(`Delete ${lead.name}'s opportunity and activity history?`)) return;
    leads.remove((item) => item.id === lead.id);
    activities.setItems((current) => current.filter((activity) => activity.leadId !== lead.id));
  }

  function quoteLink(lead: SalesLead) {
    const party = lead.customerId ? `customerId=${encodeURIComponent(lead.customerId)}` : lead.builderId ? `builderId=${encodeURIComponent(lead.builderId)}` : "";
    return party ? `/quotes?action=create&${party}` : "/quotes";
  }

  function leadCard(lead: SalesLead, mobile: boolean) {
    const stage = normaliseLeadStage(lead.stage);
    const stageIndex = stages.indexOf(stage);
    const leadActivities = activities.items.filter((activity) => activity.leadId === lead.id).toSorted((left, right) => right.completedAt.localeCompare(left.completedAt)).slice(0, 3);
    const relationshipLink = contactHref(lead);
    const reason = stage === "Lost" ? lead.lostReason : stage === "Cancelled" ? lead.cancelledReason : "";
    return <Card className={`touch-pan-y ${stageColours[stage]} ${mobile ? "p-4" : "cursor-grab p-4 active:cursor-grabbing"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><h3 className="truncate font-bold">{lead.name}</h3><span className="rounded-full bg-slate-950/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300">{lead.priority}</span></div>
          <p className="mt-1 truncate text-xs text-slate-400">{lead.company || lead.source}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-sm font-bold text-emerald-300">{!mobile ? <GripVertical className="size-4 text-slate-500" /> : null}{money.format(lead.estimatedValue)}</div>
      </div>
      <p className="mt-3 line-clamp-3 text-sm leading-5 text-slate-200">{lead.workRequired}</p>
      <div className="mt-3 rounded-xl bg-slate-950/60 p-3 text-xs text-slate-400"><p className="font-semibold text-slate-200">Next: {lead.nextAction || "Not set"}</p><p className={lead.followUpDate && lead.followUpDate <= today ? "mt-1 text-amber-300" : "mt-1"}>Follow up {displayDate(lead.followUpDate)}</p></div>
      <div className="mt-3 grid grid-cols-5 gap-1">
        <a aria-label={`Call ${lead.name}`} href={lead.phone ? `tel:${lead.phone}` : undefined} className={`flex min-h-11 items-center justify-center rounded-xl bg-slate-950/70 ${lead.phone ? "text-cyan-300" : "pointer-events-none text-slate-700"}`}><Phone className="size-4" /></a>
        <a aria-label={`Text ${lead.name}`} href={lead.phone ? `sms:${lead.phone}` : undefined} className={`flex min-h-11 items-center justify-center rounded-xl bg-slate-950/70 ${lead.phone ? "text-cyan-300" : "pointer-events-none text-slate-700"}`}><MessageSquareText className="size-4" /></a>
        <a aria-label={`Email ${lead.name}`} href={lead.email ? `mailto:${lead.email}` : undefined} className={`flex min-h-11 items-center justify-center rounded-xl bg-slate-950/70 ${lead.email ? "text-cyan-300" : "pointer-events-none text-slate-700"}`}><Mail className="size-4" /></a>
        <Link aria-label={`Create quote for ${lead.name}`} href={quoteLink(lead)} className="flex min-h-11 items-center justify-center rounded-xl bg-slate-950/70 text-violet-300"><FilePlus2 className="size-4" /></Link>
        {relationshipLink ? <Link aria-label={`Open relationship for ${lead.name}`} href={relationshipLink} className="flex min-h-11 items-center justify-center rounded-xl bg-slate-950/70 text-emerald-300"><UserRoundSearch className="size-4" /></Link> : <span className="flex min-h-11 items-center justify-center rounded-xl bg-slate-950/70 text-slate-700"><UserRoundSearch className="size-4" /></span>}
      </div>
      {mobile ? <div className="mt-3 grid grid-cols-[3rem_1fr_3rem] items-center gap-2">
        <button type="button" aria-label="Previous lead stage" disabled={stageIndex === 0} onClick={() => moveBy(lead, -1, "Mobile action")} className="flex min-h-12 items-center justify-center rounded-xl border border-slate-700 disabled:opacity-30"><ArrowLeft className="size-4" /></button>
        <select aria-label={`Stage for ${lead.name}`} value={stage} onChange={(event) => changeStage(lead, event.target.value as LeadStage, "Stage selector")} className="min-h-12 min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-semibold"><option>{stage}</option>{stages.filter((item) => item !== stage).map((item) => <option key={item}>{item}</option>)}</select>
        <button type="button" aria-label="Next lead stage" disabled={stageIndex === stages.length - 1} onClick={() => moveBy(lead, 1, "Mobile action")} className="flex min-h-12 items-center justify-center rounded-xl border border-slate-700 disabled:opacity-30"><ArrowRight className="size-4" /></button>
        <p className="col-span-3 text-center text-[10px] text-slate-500">Swipe left or right to move this opportunity</p>
      </div> : null}
      {(stage === "Lost" || stage === "Cancelled") ? <div className="mt-3 rounded-xl border border-rose-400/20 bg-slate-950/70 p-3"><p className="text-xs font-semibold text-rose-200">{stage} reason</p><p className="mt-1 text-xs text-slate-400">{reason || "Not recorded yet"}</p><div className="mt-2 flex gap-2"><input aria-label={`${stage} reason for ${lead.name}`} value={outcomeText[lead.id] || ""} onChange={(event) => setOutcomeText((current) => ({ ...current, [lead.id]: event.target.value }))} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm" placeholder="Reason for reporting" /><Button type="button" onClick={() => saveOutcome(lead)}>Save</Button></div></div> : null}
      <details className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-300">Contact log · {leadActivities.length} recent</summary>
        <div className="mt-3 grid gap-2">
          <select aria-label={`Activity type for ${lead.name}`} value={activityKind[lead.id] || "Note"} onChange={(event) => setActivityKind((current) => ({ ...current, [lead.id]: event.target.value as Exclude<LeadActivity["type"], "Stage change"> }))} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm">{activityTypes.map((type) => <option key={type}>{type}</option>)}</select>
          <div className="flex gap-2"><input aria-label={`Activity note for ${lead.name}`} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm" placeholder="What happened?" value={activityText[lead.id] || ""} onChange={(event) => setActivityText((current) => ({ ...current, [lead.id]: event.target.value }))} /><Button type="button" onClick={() => addActivity(lead)}>Log</Button></div>
          {leadActivities.map((activity) => <p key={activity.id} className="text-xs leading-5 text-slate-400"><span className="font-semibold text-slate-200">{activity.type}:</span> {activity.summary}</p>)}
        </div>
      </details>
      <button type="button" onClick={() => removeLead(lead)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="size-4" />Delete opportunity</button>
    </Card>;
  }

  if (!ready) return <Card>Loading sales pipeline…</Card>;

  return <main className="space-y-6 pb-8">
    <PageHeader eyebrow="CRM Pro" title="Sales Pipeline" description="Move every enquiry from first contact through survey, quote, acceptance and completion." action={<div className="grid gap-2 sm:grid-cols-2"><Link href="/crm/follow-ups" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-amber-400/30 px-4 text-sm font-semibold text-amber-200">Follow-ups</Link><Button onClick={() => showForm ? resetForm() : setShowForm(true)}><Plus className="size-4" />{showForm ? "Close form" : "New lead"}</Button></div>} />
    {message ? <div role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">{message}</div> : null}

    <section className="grid grid-cols-2 gap-3 xl:grid-cols-6 xl:gap-4">
      <Card><UserRoundSearch className="size-5 text-sky-300" /><p className="mt-3 text-2xl font-bold">{openLeads.length}</p><p className="text-xs text-slate-400">Open opportunities</p></Card>
      <Card><CirclePoundSterling className="size-5 text-emerald-300" /><p className="mt-3 text-2xl font-bold">{money.format(pipelineValue)}</p><p className="text-xs text-slate-400">Open pipeline</p></Card>
      <Card><FilePlus2 className="size-5 text-violet-300" /><p className="mt-3 text-2xl font-bold">{money.format(quotePipelineValue)}</p><p className="text-xs text-slate-400">Quote pipeline</p></Card>
      <Card><TrendingUp className="size-5 text-cyan-300" /><p className="mt-3 text-2xl font-bold">{conversionRate.toFixed(1)}%</p><p className="text-xs text-slate-400">Lead win rate · quotes {quoteConversion.toFixed(1)}%</p></Card>
      <Card><CalendarClock className="size-5 text-amber-300" /><p className="mt-3 text-2xl font-bold">{dueFollowUps}</p><p className="text-xs text-slate-400">Follow-ups due</p></Card>
      <Card><Building2 className="size-5 text-fuchsia-300" /><p className="mt-3 text-2xl font-bold">{builderOpportunities}</p><p className="text-xs text-slate-400">Builder opportunities</p></Card>
    </section>

    {showForm ? <Card><form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Link customer</span><select value={form.customerId} onChange={(event) => selectCustomer(event.target.value)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">New or unlinked contact</option>{customers.items.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Link builder / contractor</span><select value={form.builderId} onChange={(event) => selectBuilder(event.target.value)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">No builder linked</option>{builders.items.map((builder) => <option key={builder.id} value={builder.id}>{builder.companyName}</option>)}</select></label>
      <InputField label="Customer/contact" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
      <InputField label="Company" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} />
      <InputField label="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
      <InputField label="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
      <InputField label="Site address" value={form.siteAddress} onChange={(event) => setForm({ ...form, siteAddress: event.target.value })} />
      <InputField label="Estimated value (£)" type="number" min="0" value={form.estimatedValue} onChange={(event) => setForm({ ...form, estimatedValue: event.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Source</span><select className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value as LeadSource })}>{sources.map((source) => <option key={source}>{source}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Priority</span><select className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as LeadPriority })}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
      <InputField label="Next action" value={form.nextAction} onChange={(event) => setForm({ ...form, nextAction: event.target.value })} />
      <InputField label="Follow-up date" type="date" value={form.followUpDate} onChange={(event) => setForm({ ...form, followUpDate: event.target.value })} />
      <div className="md:col-span-2"><TextareaField label="Work required" value={form.workRequired} onChange={(event) => setForm({ ...form, workRequired: event.target.value })} required /></div>
      <div className="md:col-span-2"><TextareaField label="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
      <div className="md:col-span-2"><Button type="submit" className="min-h-12 w-full md:w-auto">Save lead</Button></div>
    </form></Card> : null}

    <Card><div className="grid gap-3 md:grid-cols-3">
      <label className="relative"><span className="sr-only">Search pipeline</span><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search contacts, work or address" className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-3 text-sm" /></label>
      <select aria-label="Filter by stage" className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="">All stages</option>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select>
      <select aria-label="Filter by source" className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="">All sources</option>{sources.map((source) => <option key={source}>{source}</option>)}</select>
    </div></Card>

    <section className="space-y-4 lg:hidden" aria-label="Mobile sales pipeline">
      {filtered.map((lead) => <article key={lead.id} onTouchStart={(event) => startSwipe(lead, event)} onTouchEnd={(event) => finishSwipe(lead, event)}>{leadCard(lead, true)}</article>)}
      {filtered.length === 0 ? <Card><p className="text-sm text-slate-400">No opportunities match these filters.</p></Card> : null}
    </section>

    <section className="hidden lg:block" aria-label="Desktop sales pipeline">
      <div className="mb-3 flex items-center gap-2 text-sm text-slate-400"><GripVertical className="size-4" />Drag cards between stages. The board scrolls horizontally without compressing the cards.</div>
      <div className="flex snap-x gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageItems = filtered.filter((lead) => normaliseLeadStage(lead.stage) === stage);
          return <section key={stage} data-pipeline-stage={stage} onDragOver={(event: ReactDragEvent) => event.preventDefault()} onDrop={() => dropInto(stage)} className={`min-h-64 w-[19rem] shrink-0 snap-start rounded-2xl border p-3 ${stageColours[stage]}`}>
            <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-bold">{stage}</h2><span className="rounded-full bg-slate-950/80 px-2 py-1 text-xs">{stageItems.length}</span></div>
            <div className="space-y-3">{stageItems.map((lead) => <article key={lead.id} draggable onDragStart={() => setDraggedLeadId(lead.id)} onDragEnd={() => setDraggedLeadId("")} className={draggedLeadId === lead.id ? "opacity-40" : "opacity-100"}>{leadCard(lead, false)}</article>)}{stageItems.length === 0 ? <div className="rounded-xl border border-dashed border-slate-700/70 p-4 text-center text-xs text-slate-500">Drop an opportunity here</div> : null}</div>
          </section>;
        })}
      </div>
    </section>

    <section className="space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300">Win / loss reporting</p><h2 className="mt-1 text-2xl font-bold">What is converting</h2><p className="mt-1 text-sm text-slate-400">Decided opportunities are grouped by source so the strongest routes are visible.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{sourcePerformance.map((result) => <Card key={result.source}><div className="flex items-center justify-between gap-2"><h3 className="font-bold">{result.source}</h3><Target className="size-4 text-cyan-300" /></div><p className="mt-3 text-2xl font-bold">{result.conversion.toFixed(1)}%</p><p className="mt-1 text-xs text-slate-400">{result.won} won · {result.lost} lost · {result.total} total</p><p className="mt-3 text-sm font-semibold text-emerald-300">{money.format(result.value)} won value</p></Card>)}</div>
      {sourcePerformance.length === 0 ? <Card><p className="text-sm text-slate-400">Win/loss reporting will appear once opportunities have been recorded.</p></Card> : null}
      {lossReasons.length > 0 ? <Card><h3 className="font-bold">Recorded loss reasons</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{lossReasons.map(([reason, count]) => <div key={reason} className="flex items-center justify-between gap-3 rounded-xl bg-slate-950 p-3 text-sm"><span>{reason}</span><span className="rounded-full bg-rose-500/10 px-2 py-1 text-xs font-bold text-rose-300">{count}</span></div>)}</div></Card> : null}
    </section>
  </main>;
}
