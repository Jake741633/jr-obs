"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type TouchEvent as ReactTouchEvent } from "react";
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
import { leadSources, useLeadPipelineActions } from "../../components/crm/LeadPipelineActions";
import { PageHeader } from "../../components/ui/PageHeader";
import {
  useBuildersCollection,
  useCustomersCollection,
  useLeadActivitiesCollection,
  usePricingDocumentsCollection,
  useSalesLeadsCollection,
} from "../../lib/cloud/coreBusinessCollections";
import { crmLeadStages, moveLeadStage, normaliseLeadStage } from "../../lib/crmPro";
import { savedIdentityIndex } from "../../lib/assistantIdentity";
import { contactEmailHref, contactPhoneHref } from "../../lib/contactLinks";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { plannerDateKey, plannerViewDate } from "../../lib/scheduling";
import type { LeadPriority, LeadStage, SalesLead } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const stages: readonly LeadStage[] = crmLeadStages;
const sources = leadSources;
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

function displayDate(value: string) {
  return value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Not set";
}

function contactHref(lead: SalesLead) {
  if (lead.customerId) return `/crm?customer=${encodeURIComponent(lead.customerId)}`;
  if (lead.builderId) return `/builders/${encodeURIComponent(lead.builderId)}`;
  return "";
}

export default function LeadsPage() {
  const identity = useCloudIdentity();
  const key = JSON.stringify([identity.mode, identity.identity?.organisationId, identity.identity?.userId, identity.identity?.role, identity.identity?.customerSourceId]);
  return <LeadsSession key={key} />;
}

function LeadsSession() {
  const today = plannerDateKey();
  const leads = useSalesLeadsCollection();
  const activities = useLeadActivitiesCollection();
  const customers = useCustomersCollection();
  const builders = useBuildersCollection();
  const documents = usePricingDocumentsCollection();
  const deepLinkHandled = useRef(false);
  const touchOrigin = useRef<Record<string, { x: number; y: number }>>({});
  const [draggedLeadId, setDraggedLeadId] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(8);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [linkReady, setLinkReady] = useState(false);

  const actions = useLeadPipelineActions({ leads, activities, customers, builders });
  const { openCapture } = actions;
  const ready = actions.ready && leads.isReady && activities.isReady && customers.isReady && builders.isReady && documents.isReady;

  useEffect(() => {
    if (deepLinkHandled.current || !ready) return;
    const frame = window.requestAnimationFrame(() => {
      const parameters = new URLSearchParams(window.location.search);
      setLinkReady(true);
      if (parameters.has("lead")) {
        setSelectedLeadId(parameters.get("lead"));
        deepLinkHandled.current = true;
        return;
      }
      if (parameters.get("action") === "create") openCapture(parameters);
      deepLinkHandled.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [openCapture, ready]);

  const leadIndex = useMemo(() => savedIdentityIndex(leads.items), [leads.items]);
  const normalisedLeads = useMemo(() => leadIndex.selectable.map((lead) => ({ lead, stage: normaliseLeadStage(lead.stage) })), [leadIndex]);
  const openLeads = normalisedLeads.filter(({ stage }) => !closedStages.includes(stage));
  const wonLeads = normalisedLeads.filter(({ stage }) => stage === "Accepted" || stage === "Completed");
  const lostLeads = normalisedLeads.filter(({ stage }) => stage === "Lost");
  const decidedLeads = wonLeads.length + lostLeads.length;
  const pipelineValue = openLeads.reduce((sum, { lead }) => sum + lead.estimatedValue, 0);
  const quotePipelineValue = normalisedLeads.filter(({ stage }) => stage === "Quote Sent" || stage === "Follow-up Due").reduce((sum, { lead }) => sum + lead.estimatedValue, 0);
  const conversionRate = decidedLeads ? wonLeads.length / decidedLeads * 100 : 0;
  const dueFollowUps = openLeads.filter(({ lead, stage }) => {
    const date = plannerViewDate(lead.followUpDate);
    if (date && date > today) return false;
    return stage === "Follow-up Due" || Boolean(date && date <= today);
  }).length;
  const builderOpportunities = openLeads.filter(({ lead }) => lead.source === "Builder" || Boolean(lead.builderId)).length;
  const recordedQuotes = documents.items.filter((document) => document.type === "Quote");
  const quoteDecisions = recordedQuotes.filter((document) => document.status === "Accepted" || document.status === "Declined");
  const quoteConversion = quoteDecisions.length ? quoteDecisions.filter((document) => document.status === "Accepted").length / quoteDecisions.length * 100 : 0;

  const filtered = useMemo(() => {
    const words = search.trim().toLocaleLowerCase("en-GB").split(/\s+/).filter(Boolean);
    return leadIndex.selectable
      .filter((lead) => selectedLeadId === null || lead.id === selectedLeadId)
      .filter((lead) => (!stageFilter || normaliseLeadStage(lead.stage) === stageFilter) && (!sourceFilter || lead.source === sourceFilter))
      .filter((lead) => {
        const searchable = [lead.name, lead.company, lead.workRequired, lead.siteAddress, lead.phone, lead.email, typeof lead.phone === "string" ? lead.phone.replace(/[\s().-]/g, "") : ""].filter(value => typeof value === "string").join(" ").toLocaleLowerCase("en-GB");
        return words.every(word => searchable.includes(word));
      })
      .toSorted((left, right) => priorityOrder[right.priority] - priorityOrder[left.priority] || left.followUpDate.localeCompare(right.followUpDate) || right.updatedAt.localeCompare(left.updatedAt));
  }, [leadIndex, search, sourceFilter, stageFilter, selectedLeadId]);
  const visible = filtered.slice(0, limit);
  const selectedLead = selectedLeadId === null ? undefined : leadIndex.unique.get(selectedLeadId);

  function clearFilters() { setSearch(""); setStageFilter(""); setSourceFilter(""); setLimit(8); }

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

  function changeStage(lead: SalesLead, stage: LeadStage, method = "Pipeline") {
    actions.reviewStage(lead, stage, method);
  }

  function moveBy(lead: SalesLead, direction: -1 | 1, method: string) {
    changeStage(lead, moveLeadStage(normaliseLeadStage(lead.stage), direction), method);
  }

  function dropInto(stage: LeadStage) {
    const lead = leadIndex.unique.get(draggedLeadId);
    if (lead) changeStage(lead, stage, "Drag and drop");
    setDraggedLeadId("");
  }

  function startSwipe(lead: SalesLead, event: ReactTouchEvent) {
    if (!actions.canStart || (event.target as HTMLElement | undefined)?.closest?.("button,a,input,select,textarea,summary,details")) return;
    const touch = event.touches[0];
    if (!touch) return;
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

  function quoteLink(lead: SalesLead) {
    const party = lead.customerId ? `customerId=${encodeURIComponent(lead.customerId)}` : lead.builderId ? `builderId=${encodeURIComponent(lead.builderId)}` : "";
    return party ? `/quotes?action=create&${party}` : "/quotes";
  }

  function leadCard(lead: SalesLead, mobile: boolean) {
    const phoneHref = contactPhoneHref(lead.phone), emailHref = contactEmailHref(lead.email);
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
        {phoneHref ? <a aria-label={`Call ${lead.name}`} href={phoneHref} className="flex min-h-12 items-center justify-center rounded-xl bg-slate-950/70 text-cyan-300"><Phone className="size-4" /></a> : <button type="button" disabled aria-label={`Call ${lead.name}`} className="min-h-12 rounded-xl bg-slate-950/70 text-slate-700"><Phone className="mx-auto size-4" /></button>}
        {phoneHref ? <a aria-label={`Text ${lead.name}`} href={phoneHref.replace("tel:", "sms:")} className="flex min-h-12 items-center justify-center rounded-xl bg-slate-950/70 text-cyan-300"><MessageSquareText className="size-4" /></a> : <button type="button" disabled aria-label={`Text ${lead.name}`} className="min-h-12 rounded-xl bg-slate-950/70 text-slate-700"><MessageSquareText className="mx-auto size-4" /></button>}
        {emailHref ? <a aria-label={`Email ${lead.name}`} href={emailHref} className="flex min-h-12 items-center justify-center rounded-xl bg-slate-950/70 text-cyan-300"><Mail className="size-4" /></a> : <button type="button" disabled aria-label={`Email ${lead.name}`} className="min-h-12 rounded-xl bg-slate-950/70 text-slate-700"><Mail className="mx-auto size-4" /></button>}
        <Link aria-label={`Create quote for ${lead.name}`} href={quoteLink(lead)} className="flex min-h-11 items-center justify-center rounded-xl bg-slate-950/70 text-violet-300"><FilePlus2 className="size-4" /></Link>
        {relationshipLink ? <Link aria-label={`Open relationship for ${lead.name}`} href={relationshipLink} className="flex min-h-11 items-center justify-center rounded-xl bg-slate-950/70 text-emerald-300"><UserRoundSearch className="size-4" /></Link> : <span className="flex min-h-11 items-center justify-center rounded-xl bg-slate-950/70 text-slate-700"><UserRoundSearch className="size-4" /></span>}
      </div>
      {lead.phone && !phoneHref ? <p className="mt-2 break-words text-xs text-amber-200">Review phone format: {lead.phone}</p> : null}
      {lead.email && !emailHref ? <p className="mt-2 break-words text-xs text-amber-200">Review email format: {lead.email}</p> : null}
      {mobile ? <div className="mt-3 grid grid-cols-[3rem_1fr_3rem] items-center gap-2">
        <button type="button" aria-label="Previous lead stage" disabled={!actions.canStart || stageIndex === 0} onClick={() => moveBy(lead, -1, "Mobile action")} className="flex min-h-12 items-center justify-center rounded-xl border border-slate-700 disabled:opacity-30"><ArrowLeft className="size-4" /></button>
        <select aria-label={`Stage for ${lead.name}`} value={stage} disabled={!actions.canStart} onChange={(event) => changeStage(lead, event.target.value as LeadStage, "Stage selector")} className="min-h-12 min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-semibold"><option>{stage}</option>{stages.filter((item) => item !== stage).map((item) => <option key={item}>{item}</option>)}</select>
        <button type="button" aria-label="Next lead stage" disabled={!actions.canStart || stageIndex === stages.length - 1} onClick={() => moveBy(lead, 1, "Mobile action")} className="flex min-h-12 items-center justify-center rounded-xl border border-slate-700 disabled:opacity-30"><ArrowRight className="size-4" /></button>
        <p className="col-span-3 text-center text-[10px] text-slate-500">Swipe left or right to review a stage change</p>
      </div> : null}
      {(stage === "Lost" || stage === "Cancelled") ? <div className="mt-3 rounded-xl border border-rose-400/20 bg-slate-950/70 p-3"><p className="text-xs font-semibold text-rose-200">{stage} reason</p><p className="mt-1 break-words text-sm text-slate-400">{reason || "Not recorded yet"}</p><Button type="button" className="mt-3 min-h-12 w-full" disabled={!actions.canStart} onClick={() => actions.openRecordAction(lead, "outcome")}>Edit outcome reason</Button></div> : null}
      <details className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
        <summary className="flex min-h-12 cursor-pointer items-center text-sm font-semibold text-slate-300">Contact log · {leadActivities.length} recent</summary>
        <div className="mt-3 grid gap-2">
          <Button type="button" className="min-h-12 w-full" disabled={!actions.canStart} onClick={() => actions.openRecordAction(lead, "activity")}>Log activity</Button>
          {leadActivities.map((activity) => <p key={activity.id} className="text-xs leading-5 text-slate-400"><span className="font-semibold text-slate-200">{activity.type}:</span> {activity.summary}</p>)}
        </div>
      </details>
      <button type="button" disabled={!actions.canDelete} onClick={() => actions.openRecordAction(lead, "delete")} className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="size-4" />Delete opportunity</button>
    </Card>;
  }

  if (!ready || !linkReady) return <>{actions.panel}<Card>Loading sales pipeline…</Card></>;

  return <main className="space-y-6 pb-8">
    <PageHeader eyebrow="CRM Pro" title="Sales Pipeline" description="Move every enquiry from first contact through survey, quote, acceptance and completion." action={<div className="grid gap-2 sm:grid-cols-2"><Link href="/crm/follow-ups" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-amber-400/30 px-4 text-sm font-semibold text-amber-200">Follow-ups</Link><Button disabled={!actions.canStart} onClick={() => openCapture()}><Plus className="size-4" />New lead</Button></div>} />
    {actions.panel}

    {leadIndex.unusableCount ? <p role="alert" className="rounded-xl border border-amber-400/30 p-4 text-sm text-amber-200">{leadIndex.unusableCount} opportunities have missing or duplicate identities and are withheld from this pipeline and its totals. Review their source records.</p> : null}
    <details className="rounded-2xl border border-slate-800 p-4"><summary className="min-h-12 cursor-pointer font-semibold">Pipeline overview</summary><p className="my-3 text-sm text-slate-400">Figures describe all uniquely identified opportunities, independently of filters and the selected lead.</p><section className="grid grid-cols-2 gap-3 xl:grid-cols-6 xl:gap-4">
      <Card><UserRoundSearch className="size-5 text-sky-300" /><p className="mt-3 text-2xl font-bold">{openLeads.length}</p><p className="text-xs text-slate-400">Open opportunities</p></Card>
      <Card><CirclePoundSterling className="size-5 text-emerald-300" /><p className="mt-3 text-2xl font-bold">{money.format(pipelineValue)}</p><p className="text-xs text-slate-400">Open pipeline</p></Card>
      <Card><FilePlus2 className="size-5 text-violet-300" /><p className="mt-3 text-2xl font-bold">{money.format(quotePipelineValue)}</p><p className="text-xs text-slate-400">Quote pipeline</p></Card>
      <Card><TrendingUp className="size-5 text-cyan-300" /><p className="mt-3 text-2xl font-bold">{conversionRate.toFixed(1)}%</p><p className="text-xs text-slate-400">Lead win rate · quotes {quoteConversion.toFixed(1)}%</p></Card>
      <Card><CalendarClock className="size-5 text-amber-300" /><p className="mt-3 text-2xl font-bold">{dueFollowUps}</p><p className="text-xs text-slate-400">Follow-ups due</p></Card>
      <Card><Building2 className="size-5 text-fuchsia-300" /><p className="mt-3 text-2xl font-bold">{builderOpportunities}</p><p className="text-xs text-slate-400">Builder opportunities</p></Card>
    </section></details>

    <Card><div className="grid gap-3 md:grid-cols-3">
      <label className="relative"><span className="sr-only">Search pipeline</span><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setLimit(8); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} placeholder="Name, work, address, phone or email" className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-3 text-base" /></label>
      <select aria-label="Filter by stage" className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base" value={stageFilter} onChange={(event) => { setStageFilter(event.target.value); setLimit(8); }}><option value="">All stages</option>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select>
      <select aria-label="Filter by source" className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base" value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); setLimit(8); }}><option value="">All sources</option>{sources.map((source) => <option key={source}>{source}</option>)}</select>
    </div></Card>

    {selectedLeadId !== null ? <Card><p role={selectedLead ? "status" : "alert"} className="text-sm">{selectedLead ? `Selected opportunity: ${selectedLead.name}. Only this exact saved lead is shown.` : "The linked opportunity is unavailable or has a missing or duplicate identity. No other lead has been selected."}</p><Button type="button" variant="secondary" className="mt-3 min-h-12" onClick={() => { setSelectedLeadId(null); clearFilters(); }}>Show all opportunities</Button></Card> : null}
    <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-slate-400">Showing {Math.min(limit, filtered.length)} of {filtered.length} matching opportunities</p><Button type="button" variant="secondary" className="min-h-12" onClick={clearFilters}>Clear pipeline filters</Button></div>

    <section className="space-y-4 lg:hidden" aria-label="Mobile sales pipeline">
      {visible.map((lead) => <article key={lead.id} onTouchStart={(event) => startSwipe(lead, event)} onTouchEnd={(event) => finishSwipe(lead, event)}>{leadCard(lead, true)}</article>)}
      {filtered.length === 0 ? <Card><p className="text-sm text-slate-400">No opportunities match these filters.</p></Card> : null}
    </section>

    <section className="hidden lg:block" aria-label="Desktop sales pipeline">
      <div className="mb-3 flex items-center gap-2 text-sm text-slate-400"><GripVertical className="size-4" />Drag cards to review a stage change. The board scrolls horizontally without compressing the cards.</div>
      <div className="flex snap-x gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageItems = filtered.filter((lead) => normaliseLeadStage(lead.stage) === stage);
          const visibleStageItems = visible.filter((lead) => normaliseLeadStage(lead.stage) === stage);
          return <section key={stage} data-pipeline-stage={stage} onDragOver={(event: ReactDragEvent) => event.preventDefault()} onDrop={() => dropInto(stage)} className={`min-h-64 w-[19rem] shrink-0 snap-start rounded-2xl border p-3 ${stageColours[stage]}`}>
            <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-bold">{stage}</h2><span className="rounded-full bg-slate-950/80 px-2 py-1 text-xs">{visibleStageItems.length} of {stageItems.length}</span></div>
            <div className="space-y-3">{visibleStageItems.map((lead) => <article key={lead.id} draggable={actions.canStart} onDragStart={() => setDraggedLeadId(lead.id)} onDragEnd={() => setDraggedLeadId("")} className={draggedLeadId === lead.id ? "opacity-40" : "opacity-100"}>{leadCard(lead, false)}</article>)}{stageItems.length === 0 ? <div className="rounded-xl border border-dashed border-slate-700/70 p-4 text-center text-xs text-slate-500">Drop an opportunity here</div> : visibleStageItems.length < stageItems.length ? <p className="mt-3 text-xs text-slate-400">Use Show more opportunities below or filter to this stage.</p> : null}</div>
          </section>;
        })}
      </div>
    </section>
    {filtered.length > limit ? <Button type="button" variant="secondary" className="min-h-12 w-full" onClick={() => setLimit(current => current + 8)}>Show more opportunities</Button> : null}

    <details className="rounded-2xl border border-slate-800 p-4"><summary className="min-h-12 cursor-pointer font-semibold">Win / loss reporting</summary><section className="mt-4 space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300">Win / loss reporting</p><h2 className="mt-1 text-2xl font-bold">What is converting</h2><p className="mt-1 text-sm text-slate-400">Decided opportunities are grouped by source so the strongest routes are visible.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{sourcePerformance.map((result) => <Card key={result.source}><div className="flex items-center justify-between gap-2"><h3 className="font-bold">{result.source}</h3><Target className="size-4 text-cyan-300" /></div><p className="mt-3 text-2xl font-bold">{result.conversion.toFixed(1)}%</p><p className="mt-1 text-xs text-slate-400">{result.won} won · {result.lost} lost · {result.total} total</p><p className="mt-3 text-sm font-semibold text-emerald-300">{money.format(result.value)} won value</p></Card>)}</div>
      {sourcePerformance.length === 0 ? <Card><p className="text-sm text-slate-400">Win/loss reporting will appear once opportunities have been recorded.</p></Card> : null}
      {lossReasons.length > 0 ? <Card><h3 className="font-bold">Recorded loss reasons</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{lossReasons.map(([reason, count]) => <div key={reason} className="flex items-center justify-between gap-3 rounded-xl bg-slate-950 p-3 text-sm"><span>{reason}</span><span className="rounded-full bg-rose-500/10 px-2 py-1 text-xs font-bold text-rose-300">{count}</span></div>)}</div></Card> : null}
    </section></details>
  </main>;
}
