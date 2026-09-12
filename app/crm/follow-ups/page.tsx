"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Mail,
  MessageSquareText,
  Phone,
  PoundSterling,
  RefreshCw,
  Settings2,
  Sparkles,
  UserRoundSearch,
} from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { InputField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import {
  useCrmFollowUpSettingsCollection,
  useCustomerInteractionsCollection,
  useCustomerProfilesCollection,
  useCustomersCollection,
  useLeadActivitiesCollection,
  usePricingDocumentsCollection,
  useSalesLeadsCollection,
} from "../../../lib/cloud/coreBusinessCollections";
import {
  buildFollowUpCentre,
  defaultCrmFollowUpSettings,
  normaliseLeadStage,
  type CrmFollowUpItem,
  type CrmFollowUpReason,
} from "../../../lib/crmPro";
import { makeId } from "../../../lib/storage";
import type { CrmFollowUpSettings, CustomerInteraction, LeadActivity, LeadStage } from "../../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const reasons: CrmFollowUpReason[] = ["Quote ageing", "No response", "Survey not booked", "Awaiting acceptance", "Lost opportunity", "Customer reminder"];
const reasonTone: Record<CrmFollowUpReason, string> = {
  "Quote ageing": "border-amber-400/30 bg-amber-500/5 text-amber-200",
  "No response": "border-rose-400/30 bg-rose-500/5 text-rose-200",
  "Survey not booked": "border-indigo-400/30 bg-indigo-500/5 text-indigo-200",
  "Awaiting acceptance": "border-cyan-400/30 bg-cyan-500/5 text-cyan-200",
  "Lost opportunity": "border-fuchsia-400/30 bg-fuchsia-500/5 text-fuchsia-200",
  "Customer reminder": "border-emerald-400/30 bg-emerald-500/5 text-emerald-200",
};
const today = new Date().toISOString().slice(0, 10);

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function recommendationReason(item: CrmFollowUpItem) {
  const signals = [`${item.priorityScore}/100 priority`, `${item.ageDays} day${item.ageDays === 1 ? "" : "s"} waiting`];
  if (item.estimatedValue > 0) signals.push(`${money.format(item.estimatedValue)} opportunity`);
  if (!item.phone && !item.email) signals.push("contact details missing");
  return signals.join(" · ");
}

export default function FollowUpCentrePage() {
  const leads = useSalesLeadsCollection();
  const leadActivities = useLeadActivitiesCollection();
  const documents = usePricingDocumentsCollection();
  const customers = useCustomersCollection();
  const profiles = useCustomerProfilesCollection();
  const interactions = useCustomerInteractionsCollection();
  const settingsStore = useCrmFollowUpSettingsCollection();
  const savedSettings = settingsStore.items[0] ?? defaultCrmFollowUpSettings;
  const [settingsDraft, setSettingsDraft] = useState<CrmFollowUpSettings | null>(null);
  const settings = settingsDraft ?? savedSettings;
  const [reasonFilter, setReasonFilter] = useState<CrmFollowUpReason | "">("");
  const [snoozeDays, setSnoozeDays] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");
  const ready = leads.isReady && leadActivities.isReady && documents.isReady && customers.isReady && profiles.isReady && interactions.isReady && settingsStore.isReady;

  const followUps = useMemo(() => buildFollowUpCentre({
    leads: leads.items,
    leadActivities: leadActivities.items,
    documents: documents.items,
    customers: customers.items,
    profiles: profiles.items,
    settings: savedSettings,
  }), [customers.items, documents.items, leadActivities.items, leads.items, profiles.items, savedSettings]);
  const filtered = reasonFilter ? followUps.filter((item) => item.reason === reasonFilter) : followUps;
  const totalValue = followUps.reduce((sum, item) => sum + item.estimatedValue, 0);
  const contactable = followUps.filter((item) => item.phone || item.email).length;
  const urgent = followUps.filter((item) => item.priorityScore >= 70).length;
  const topRecommendations = followUps.filter((item) => item.phone || item.email).slice(0, 5);

  function saveSettings() {
    const next = {
      ...settings,
      quoteAgeDays: Math.max(1, Number(settings.quoteAgeDays || 1)),
      noResponseDays: Math.max(1, Number(settings.noResponseDays || 1)),
      lostOpportunityDays: Math.max(1, Number(settings.lostOpportunityDays || 1)),
      highValueThreshold: Math.max(0, Number(settings.highValueThreshold || 0)),
      updatedAt: new Date().toISOString(),
    };
    settingsStore.setItems([next]);
    setSettingsDraft(next);
    setMessage("Follow-up rules saved. Priorities have been recalculated from live JR OS records.");
  }

  function logCustomerContact(item: CrmFollowUpItem, now: string) {
    if (!item.customerId) return;
    const interaction: CustomerInteraction = {
      id: makeId("interaction"),
      customerId: item.customerId,
      type: item.phone ? "Call" : "Email",
      summary: `Follow-up completed: ${item.reason}. ${item.detail}`,
      outcome: `Next review in ${savedSettings.noResponseDays} day${savedSettings.noResponseDays === 1 ? "" : "s"}`,
      completedBy: "JR OS CRM",
      interactionAt: now,
      createdAt: now,
    };
    interactions.setItems((current) => [interaction, ...current]);
  }

  function markContacted(item: CrmFollowUpItem) {
    const now = new Date().toISOString();
    const nextDate = addDays(today, savedSettings.noResponseDays);
    if (item.id.startsWith("quote-follow-up-") && item.quoteId) {
      documents.setItems((current) => current.map((document) => document.id === item.quoteId ? { ...document, lastFollowUpAt: now, nextFollowUpDate: nextDate, updatedAt: now } : document));
    } else if (item.leadId) {
      leads.setItems((current) => current.map((lead) => {
        if (lead.id !== item.leadId) return lead;
        const currentStage = normaliseLeadStage(lead.stage);
        const stage: LeadStage = currentStage === "New Lead" || currentStage === "Follow-up Due" ? "Contacted" : currentStage;
        return { ...lead, stage, lastContactAt: now, lostFollowUpCompletedAt: currentStage === "Lost" ? now : lead.lostFollowUpCompletedAt, followUpDate: currentStage === "Lost" ? "" : nextDate, nextAction: currentStage === "Lost" ? "Re-engagement completed" : "Await response", updatedAt: now };
      }));
      const activity: LeadActivity = { id: makeId("activity"), leadId: item.leadId, type: item.phone ? "Call" : "Email", summary: `Follow-up completed: ${item.reason}.`, completedBy: "JR OS CRM", completedAt: now, createdAt: now };
      leadActivities.setItems((current) => [activity, ...current]);
    } else if (item.customerId) {
      profiles.setItems((current) => current.map((profile) => profile.customerId === item.customerId ? { ...profile, nextFollowUpDate: "", updatedAt: now } : profile));
    }
    logCustomerContact(item, now);
    setMessage(`${item.title} marked contacted. The action is in CRM history${item.reason === "Lost opportunity" || item.reason === "Customer reminder" ? "." : ` and JR OS will check again on ${new Date(`${nextDate}T12:00:00`).toLocaleDateString("en-GB")}.`}`);
  }

  function postpone(item: CrmFollowUpItem) {
    const days = snoozeDays[item.id] || 3;
    const date = addDays(today, days);
    const now = new Date().toISOString();
    if (item.id.startsWith("quote-follow-up-") && item.quoteId) {
      documents.setItems((current) => current.map((document) => document.id === item.quoteId ? { ...document, nextFollowUpDate: date, updatedAt: now } : document));
    } else if (item.leadId) {
      leads.setItems((current) => current.map((lead) => lead.id === item.leadId ? { ...lead, followUpDate: date, updatedAt: now } : lead));
    } else if (item.customerId) {
      profiles.setItems((current) => current.map((profile) => profile.customerId === item.customerId ? { ...profile, nextFollowUpDate: date, updatedAt: now } : profile));
    }
    setMessage(`${item.title} postponed until ${new Date(`${date}T12:00:00`).toLocaleDateString("en-GB")}.`);
  }

  if (!ready) return <Card>Loading follow-up centre…</Card>;

  return <main className="space-y-6 pb-8">
    <PageHeader eyebrow="CRM Pro" title="Follow-up Centre" description="JR OS ranks the people and opportunities most worth contacting today from live CRM and quote history." action={<Link href="/leads" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-200">Sales pipeline <ArrowRight className="size-4" /></Link>} />
    {message ? <div role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">{message}</div> : null}

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <Card><CalendarClock className="size-5 text-amber-300" /><p className="mt-3 text-3xl font-bold">{followUps.length}</p><p className="text-xs text-slate-400">Follow-ups surfaced</p></Card>
      <Card><Sparkles className="size-5 text-rose-300" /><p className="mt-3 text-3xl font-bold">{urgent}</p><p className="text-xs text-slate-400">High-priority actions</p></Card>
      <Card><Phone className="size-5 text-cyan-300" /><p className="mt-3 text-3xl font-bold">{contactable}</p><p className="text-xs text-slate-400">Ready to contact</p></Card>
      <Card><PoundSterling className="size-5 text-emerald-300" /><p className="mt-3 text-2xl font-bold">{money.format(totalValue)}</p><p className="text-xs text-slate-400">Opportunity value</p></Card>
    </section>

    <Card className="border-fuchsia-400/25 bg-fuchsia-500/[0.03]">
      <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-fuchsia-500/10 text-fuchsia-300"><BrainCircuit className="size-5" /></span><div><p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300">AI contact recommendations</p><h2 className="mt-1 text-xl font-bold">Who to contact today</h2><p className="mt-1 text-sm text-slate-400">Ranked transparently by wait time, value, urgency and whether the person can be contacted now.</p></div></div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">{topRecommendations.map((item, index) => <a key={item.id} href={`#follow-${item.id}`} className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 transition hover:border-fuchsia-400/40"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-fuchsia-500/10 text-sm font-bold text-fuchsia-300">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{item.title}</span><span className="mt-1 block text-xs text-slate-500">{item.reason} · {recommendationReason(item)}</span></span><ArrowRight className="size-4 shrink-0 text-fuchsia-300" /></a>)}{topRecommendations.length === 0 ? <p className="text-sm text-emerald-300">No contactable follow-ups need attention today.</p> : null}</div>
    </Card>

    <details className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold"><Settings2 className="size-4 text-cyan-300" />Follow-up rules</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <InputField label="Quote ageing (days)" type="number" min="1" value={settings.quoteAgeDays} onChange={(event) => setSettingsDraft({ ...settings, quoteAgeDays: Number(event.target.value) })} />
        <InputField label="No response (days)" type="number" min="1" value={settings.noResponseDays} onChange={(event) => setSettingsDraft({ ...settings, noResponseDays: Number(event.target.value) })} />
        <InputField label="Lost opportunity window" type="number" min="1" value={settings.lostOpportunityDays} onChange={(event) => setSettingsDraft({ ...settings, lostOpportunityDays: Number(event.target.value) })} />
        <InputField label="High value threshold (£)" type="number" min="0" value={settings.highValueThreshold} onChange={(event) => setSettingsDraft({ ...settings, highValueThreshold: Number(event.target.value) })} />
      </div>
      <Button type="button" onClick={saveSettings} className="mt-4 min-h-12"><RefreshCw className="size-4" />Save and recalculate</Button>
    </details>

    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Contact queue</p><h2 className="mt-1 text-2xl font-bold">Recommended actions</h2></div><select aria-label="Filter follow-ups by reason" value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value as CrmFollowUpReason | "")} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm"><option value="">All reasons</option>{reasons.map((reason) => <option key={reason}>{reason}</option>)}</select></div>
      <div className="grid gap-4 xl:grid-cols-2">{filtered.map((item) => <Card key={item.id} className="scroll-mt-4" id={`follow-${item.id}`}>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${reasonTone[item.reason]}`}>{item.reason}</span><h3 className="mt-3 truncate text-xl font-bold">{item.title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p></div><span className={`grid size-14 shrink-0 place-items-center rounded-2xl text-lg font-black ${item.priorityScore >= 70 ? "bg-rose-500/10 text-rose-300" : item.priorityScore >= 45 ? "bg-amber-500/10 text-amber-300" : "bg-cyan-500/10 text-cyan-300"}`}>{item.priorityScore}</span></div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-slate-950 p-3"><Clock3 className="mx-auto size-4 text-amber-300" /><p className="mt-2 font-semibold">{item.ageDays} days</p></div><div className="rounded-xl bg-slate-950 p-3"><PoundSterling className="mx-auto size-4 text-emerald-300" /><p className="mt-2 font-semibold">{money.format(item.estimatedValue)}</p></div><Link href={item.href} className="rounded-xl bg-slate-950 p-3"><UserRoundSearch className="mx-auto size-4 text-cyan-300" /><p className="mt-2 font-semibold">Open record</p></Link></div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <a href={item.phone ? `tel:${item.phone}` : undefined} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-700 text-sm font-semibold ${item.phone ? "text-cyan-300" : "pointer-events-none opacity-30"}`}><Phone className="size-4" />Call</a>
          <a href={item.phone ? `sms:${item.phone}` : undefined} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-700 text-sm font-semibold ${item.phone ? "text-cyan-300" : "pointer-events-none opacity-30"}`}><MessageSquareText className="size-4" />Text</a>
          <a href={item.email ? `mailto:${item.email}?subject=${encodeURIComponent("JR Electrical Services follow-up")}` : undefined} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-700 text-sm font-semibold ${item.email ? "text-cyan-300" : "pointer-events-none opacity-30"}`}><Mail className="size-4" />Email</a>
        </div>
        <Button type="button" onClick={() => markContacted(item)} className="mt-3 min-h-12 w-full" disabled={!item.phone && !item.email}><CheckCircle2 className="size-4" />Mark contacted and log</Button>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2"><select aria-label={`Postpone ${item.title}`} value={snoozeDays[item.id] || 3} onChange={(event) => setSnoozeDays((current) => ({ ...current, [item.id]: Number(event.target.value) }))} className="min-h-12 min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm"><option value={1}>Tomorrow</option><option value={3}>In 3 days</option><option value={7}>In 1 week</option><option value={14}>In 2 weeks</option></select><Button type="button" variant="secondary" onClick={() => postpone(item)}>Postpone</Button></div>
      </Card>)}</div>
      {filtered.length === 0 ? <Card><p className="text-sm text-emerald-300">No follow-ups match this filter.</p></Card> : null}
    </section>
  </main>;
}
