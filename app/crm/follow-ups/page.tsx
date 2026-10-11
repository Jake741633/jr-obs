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
  Sparkles,
  UserRoundSearch,
} from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { FollowUpRules } from "../../../components/crm/FollowUpRules";
import { useFollowUpActions } from "../../../components/crm/FollowUpActions";
import { contactEmailHref, contactPhoneHref } from "../../../lib/contactLinks";
import { followUpRulesError, resolveFollowUpSettings } from "../../../lib/crmFollowUpSettings";
import { useCloudIdentity } from "../../../lib/cloud/useCloudIdentity";
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
  type CrmFollowUpItem,
  type CrmFollowUpReason,
} from "../../../lib/crmPro";

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
function waitDescription(item: CrmFollowUpItem) {
  if (item.ageBasis === "unknown") return "Age unavailable";
  const basis = item.ageBasis === "contact" ? "since contact" : item.ageBasis === "enquiry" ? "since enquiry" : "waiting";
  return `${item.ageDays} day${item.ageDays === 1 ? "" : "s"} ${basis}`;
}
function recommendationReason(item: CrmFollowUpItem) {
  const signals = [`${item.priorityScore}/100 priority`, waitDescription(item)];
  if (item.estimatedValue > 0) signals.push(`${money.format(item.estimatedValue)} opportunity`);
  if (!canContact(item)) signals.push("contact details missing or need review");
  return signals.join(" · ");
}

function canContact(item: CrmFollowUpItem) { return Boolean(contactPhoneHref(item.phone) || contactEmailHref(item.email)); }

export default function FollowUpCentrePage() {
  const identity = useCloudIdentity();
  const key = JSON.stringify([identity.mode, identity.identity?.organisationId, identity.identity?.userId, identity.identity?.role, identity.identity?.customerSourceId]);
  return <FollowUpCentreSession key={key} />;
}

function FollowUpCentreSession() {
  const leads = useSalesLeadsCollection();
  const leadActivities = useLeadActivitiesCollection();
  const documents = usePricingDocumentsCollection();
  const customers = useCustomersCollection();
  const profiles = useCustomerProfilesCollection();
  const interactions = useCustomerInteractionsCollection();
  const settingsStore = useCrmFollowUpSettingsCollection();
  const resolvedSettings = resolveFollowUpSettings(settingsStore.items);
  const savedSettings = resolvedSettings.settings;
  const rulesIssue = resolvedSettings.error || followUpRulesError(savedSettings);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(8);
  const [reasonFilter, setReasonFilter] = useState<CrmFollowUpReason | "">("");
  const actions = useFollowUpActions({ leads, leadActivities, documents, customers, profiles, interactions, settingsStore });
  const ready = leads.isReady && leadActivities.isReady && documents.isReady && customers.isReady && profiles.isReady && interactions.isReady && settingsStore.isReady;

  const followUps = useMemo(() => rulesIssue ? [] : buildFollowUpCentre({
    leads: leads.items,
    leadActivities: leadActivities.items,
    documents: documents.items,
    customers: customers.items,
    profiles: profiles.items,
    settings: savedSettings,
  }), [customers.items, documents.items, leadActivities.items, leads.items, profiles.items, savedSettings, rulesIssue]);
  const words = search.trim().toLocaleLowerCase("en-GB").split(/\s+/).filter(Boolean);
  const filtered = followUps.filter(item => {
    const searchable = [item.title, item.detail, item.reason, item.phone, item.email, typeof item.phone === "string" ? item.phone.replace(/[\s().-]/g, "") : ""].filter(value => typeof value === "string").join(" ").toLocaleLowerCase("en-GB");
    return (!reasonFilter || item.reason === reasonFilter) && words.every(word => searchable.includes(word));
  });
  const totalValue = followUps.reduce((sum, item) => sum + item.estimatedValue, 0);
  const contactable = followUps.filter(canContact).length;
  const urgent = followUps.filter((item) => item.priorityScore >= 70).length;
  const topRecommendations = filtered.filter(canContact).slice(0, 5);

  const header = <PageHeader eyebrow="CRM Pro" title="Follow-up Centre" description="JR OS ranks the people and opportunities most worth contacting today from live CRM and quote history." action={<Link href="/leads" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-200">Sales pipeline <ArrowRight className="size-4" /></Link>} />;
  const rulesEditor = <FollowUpRules key="rules" store={settingsStore} />;
  if (!ready) return <main className="space-y-6 pb-8">{header}{rulesEditor}{actions.panel}<Card>Loading follow-up centre…</Card></main>;
  if (rulesIssue) return <main className="space-y-6 pb-8">{header}{rulesEditor}{actions.panel}<Card><h1 className="text-xl font-bold">Follow-up rules need review</h1><p className="mt-2 text-sm text-amber-200">{rulesIssue}</p><p className="mt-2 text-sm text-slate-400">The queue is paused until one valid set of rules is available.</p></Card></main>;

  return <main className="space-y-6 pb-8">
    {header}
    {rulesEditor}
    {actions.panel}

    <details className="rounded-2xl border border-slate-800 p-4"><summary className="min-h-12 cursor-pointer font-semibold">Follow-up overview</summary><p className="my-3 text-sm text-slate-400">Figures describe the full loaded queue, independently of search and reason filters.</p><section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <Card><CalendarClock className="size-5 text-amber-300" /><p className="mt-3 text-3xl font-bold">{followUps.length}</p><p className="text-xs text-slate-400">Follow-ups surfaced</p></Card>
      <Card><Sparkles className="size-5 text-rose-300" /><p className="mt-3 text-3xl font-bold">{urgent}</p><p className="text-xs text-slate-400">High-priority actions</p></Card>
      <Card><Phone className="size-5 text-cyan-300" /><p className="mt-3 text-3xl font-bold">{contactable}</p><p className="text-xs text-slate-400">Ready to contact</p></Card>
      <Card><PoundSterling className="size-5 text-emerald-300" /><p className="mt-3 text-2xl font-bold">{money.format(totalValue)}</p><p className="text-xs text-slate-400">Opportunity value</p></Card>
    </section></details>

    <details className="rounded-2xl border border-fuchsia-400/25 p-4"><summary className="min-h-12 cursor-pointer font-semibold">Who to contact today</summary><Card className="border-fuchsia-400/25 bg-fuchsia-500/[0.03]">
      <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-fuchsia-500/10 text-fuchsia-300"><BrainCircuit className="size-5" /></span><div><p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300">AI contact recommendations</p><h2 className="mt-1 text-xl font-bold">Who to contact today</h2><p className="mt-1 text-sm text-slate-400">Ranked by wait time, value, urgency and usable contact details. Matches the queue filters; tap a recommendation to open its record.</p></div></div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">{topRecommendations.map((item, index) => <Link key={item.id} href={item.href} className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 transition hover:border-fuchsia-400/40"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-fuchsia-500/10 text-sm font-bold text-fuchsia-300">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{item.title}</span><span className="mt-1 block text-xs text-slate-500">{item.reason} · {recommendationReason(item)}</span></span><ArrowRight className="size-4 shrink-0 text-fuchsia-300" /></Link>)}{topRecommendations.length === 0 ? <p className="text-sm text-emerald-300">No follow-ups with a supported contact match these filters.</p> : null}</div>
    </Card></details>

    <section aria-label="Follow-up queue" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Contact queue</p><h2 className="mt-1 text-2xl font-bold">Recommended actions</h2></div><select aria-label="Filter follow-ups by reason" value={reasonFilter} onChange={(event) => { setReasonFilter(event.target.value as CrmFollowUpReason | ""); setLimit(8); }} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="">All reasons</option>{reasons.map((reason) => <option key={reason}>{reason}</option>)}</select></div>
      <label className="grid gap-2 text-sm font-semibold"><span>Find a follow-up</span><input type="search" value={search} onChange={event => { setSearch(event.target.value); setLimit(8); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} placeholder="Name, quote, work, phone or email" className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base" /></label>
      <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-slate-400">Showing {Math.min(limit, filtered.length)} of {filtered.length} matching follow-ups</p><Button type="button" variant="secondary" className="min-h-12" onClick={() => { setSearch(""); setReasonFilter(""); setLimit(8); }}>Clear follow-up filters</Button></div>
      <div className="grid gap-4 xl:grid-cols-2">{filtered.slice(0, limit).map((item) => {
        const phoneHref = contactPhoneHref(item.phone), emailHref = contactEmailHref(item.email);
        const contactClass = "flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-700 text-sm font-semibold text-cyan-300 disabled:opacity-30";
        return <Card key={item.id} className="scroll-mt-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${reasonTone[item.reason]}`}>{item.reason}</span><h3 className="mt-3 break-words text-xl font-bold">{item.title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p></div><span className={`grid size-14 shrink-0 place-items-center rounded-2xl text-lg font-black ${item.priorityScore >= 70 ? "bg-rose-500/10 text-rose-300" : item.priorityScore >= 45 ? "bg-amber-500/10 text-amber-300" : "bg-cyan-500/10 text-cyan-300"}`}>{item.priorityScore}</span></div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-slate-950 p-3"><Clock3 className="mx-auto size-4 text-amber-300" /><p className="mt-2 font-semibold">{waitDescription(item)}</p></div><div className="rounded-xl bg-slate-950 p-3"><PoundSterling className="mx-auto size-4 text-emerald-300" /><p className="mt-2 font-semibold">{money.format(item.estimatedValue)}</p></div><Link href={item.href} className="rounded-xl bg-slate-950 p-3"><UserRoundSearch className="mx-auto size-4 text-cyan-300" /><p className="mt-2 font-semibold">Open record</p></Link></div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {phoneHref ? <a href={phoneHref} className={contactClass}><Phone className="size-4" />Call</a> : <button type="button" disabled className={contactClass}><Phone className="size-4" />Call</button>}
          {phoneHref ? <a href={phoneHref.replace("tel:", "sms:")} className={contactClass}><MessageSquareText className="size-4" />Text</a> : <button type="button" disabled className={contactClass}><MessageSquareText className="size-4" />Text</button>}
          {emailHref ? <a href={`${emailHref}?subject=${encodeURIComponent("JR Electrical Services follow-up")}`} className={contactClass}><Mail className="size-4" />Email</a> : <button type="button" disabled className={contactClass}><Mail className="size-4" />Email</button>}
        </div>
        {item.phone && !phoneHref ? <p className="mt-2 break-words text-xs text-amber-200">Review phone format before calling or texting: {item.phone}</p> : null}
        {item.email && !emailHref ? <p className="mt-2 break-words text-xs text-amber-200">Review email format before composing: {item.email}</p> : null}
        <div className="mt-3 grid grid-cols-2 gap-2"><Button type="button" onClick={() => actions.openContact(item)} className="min-h-12" disabled={!actions.canStart}><CheckCircle2 className="size-4" />Log contact</Button><Button type="button" variant="secondary" className="min-h-12" onClick={() => actions.openPostpone(item)} disabled={!actions.canStart}>Postpone</Button></div>
      </Card>; })}</div>
      {filtered.length > limit ? <Button type="button" variant="secondary" className="min-h-12 w-full" onClick={() => setLimit(current => current + 8)}>Show more follow-ups</Button> : null}
      {filtered.length === 0 ? <Card><p className="text-sm text-emerald-300">No follow-ups match this filter.</p></Card> : null}
    </section>
  </main>;
}
