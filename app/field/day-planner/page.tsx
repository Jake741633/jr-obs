"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, MapPin, Navigation, Play, Square, TimerReset, UserRound } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { useCustomersCollection, useJobsCollection, usePlannerCollection, useTeamCollection, useTimesheetsCollection } from "../../../lib/cloud/coreBusinessCollections";
import { useCloudIdentity } from "../../../lib/cloud/useCloudIdentity";
import { dayPlannerSummary, formatMinutes, paidMinutes, sequenceDayEntries } from "../../../lib/engineerDayPlanner-core.mjs";
import { normaliseJobStatus, transitionJobStatus } from "../../../lib/jobManagement-core.mjs";
import { fieldOperatorMemberId } from "../../../lib/siteDiaryIdentity-core.mjs";
import { makeId } from "../../../lib/storage";
import type { ScheduledPlannerEntry } from "../../../lib/scheduling";

const today = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);
const mapsHref = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

export default function EngineerDayPlannerPage() {
  const planner = usePlannerCollection();
  const jobs = useJobsCollection();
  const customers = useCustomersCollection();
  const team = useTeamCollection();
  const timesheets = useTimesheetsCollection();
  const identityState = useCloudIdentity();
  const [date, setDate] = useState(today());
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState("");
  const [finishedAt, setFinishedAt] = useState("");
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");

  const entries = useMemo<ScheduledPlannerEntry[]>(() => sequenceDayEntries(planner.items, date) as ScheduledPlannerEntry[], [planner.items, date]);
  const jobsById = useMemo(() => new Map(jobs.items.map((job) => [job.id, job])), [jobs.items]);
  const customersById = useMemo(() => new Map(customers.items.map((customer) => [customer.id, customer])), [customers.items]);
  const operatorMemberId = useMemo(() => fieldOperatorMemberId({
    identity: identityState.identity,
    teamMembers: team.items,
    mode: identityState.mode,
  }), [identityState.identity, identityState.mode, team.items]);
  const cloudFieldMode = identityState.mode !== "local";
  const summary = useMemo(() => dayPlannerSummary(planner.items, timesheets.items, date), [planner.items, timesheets.items, date]);

  const ready = [planner, jobs, customers, team, timesheets].every((collection) => collection.isReady) && identityState.isReady;
  if (!ready) return <Card>Loading engineer day planner…</Card>;

  function startEntry(entry: ScheduledPlannerEntry) {
    if (!operatorMemberId) {
      setMessage("Your active team identity could not be resolved. Refresh your account before starting a visit.");
      return;
    }
    if (cloudFieldMode && !entry.jobId) {
      setMessage("Unlinked planner entries are read-only for field cloud sessions because field time must be bound to an assigned job.");
      return;
    }
    const time = nowTime();
    setActiveEntryId(entry.id);
    setStartedAt(time);
    setFinishedAt("");
    setBreakMinutes("0");
    setNotes("");
    planner.setItems((current) => current.map((item) => item.id === entry.id ? { ...item, status: "Confirmed", updatedAt: new Date().toISOString() } : item));
    if (entry.jobId) {
      const job = jobs.items.find((item) => item.id === entry.jobId);
      if (job && normaliseJobStatus(job.status) === "Scheduled") {
        const result = transitionJobStatus({ job, nextStatus: "First fix", now: new Date().toISOString(), timelineId: makeId("timeline"), completedBy: "Engineer Day Planner" });
        jobs.setItems((current) => current.map((item) => item.id === job.id ? result.job : item));
      }
    }
    setMessage(`${entry.title} started at ${time}.`);
  }

  function stopEntry(entry: ScheduledPlannerEntry) {
    const time = nowTime();
    setActiveEntryId(entry.id);
    setFinishedAt(time);
    setMessage(`${entry.title} stopped at ${time}. Review the time log and save it.`);
  }

  function saveTime(event: FormEvent, entry: ScheduledPlannerEntry) {
    event.preventDefault();
    if (!operatorMemberId) return setMessage("Your active team identity could not be resolved. Refresh your account before saving time.");
    if (cloudFieldMode && !entry.jobId) return setMessage("Field cloud time must be bound to an assigned job before it can be saved.");
    if (!startedAt) return setMessage("Start the visit before saving time.");
    if (!finishedAt) return setMessage("Stop the visit before saving time.");
    const now = new Date().toISOString();
    const record = {
      id: makeId("timesheet"),
      teamMemberId: operatorMemberId,
      jobId: entry.jobId || undefined,
      workDate: date,
      startedAt,
      finishedAt,
      breakMinutes: Math.max(0, Number(breakMinutes || 0)),
      notes: notes.trim() || `Recorded from ${entry.title}`,
      status: "Draft" as const,
      createdAt: now,
      updatedAt: now,
    };
    timesheets.setItems((current) => [record, ...current]);
    planner.setItems((current) => current.map((item) => item.id === entry.id ? { ...item, status: "Complete", updatedAt: now } : item));
    setMessage(`${formatMinutes(paidMinutes(record))} saved for ${entry.title}.`);
    setActiveEntryId(null);
    setStartedAt("");
    setFinishedAt("");
    setBreakMinutes("0");
    setNotes("");
  }

  return <div className="space-y-5 pb-24 sm:space-y-6 sm:pb-0">
    <PageHeader eyebrow="Mobile workspace" title="Engineer day planner" description="Run today’s assigned visits in order, log arrival and departure, and save labour time against your active field identity." />

    {cloudFieldMode && !operatorMemberId ? <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-100"><p className="font-semibold">Field identity could not be resolved.</p><p className="mt-1 text-xs text-amber-100/70">Planner and timesheet writes remain locked until this signed-in account maps to exactly one active team member.</p></div> : null}

    <Card>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Working date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base sm:text-sm" /></label>
    </Card>

    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card><p className="text-xs text-slate-400">Scheduled</p><p className="mt-2 text-3xl font-bold">{summary.scheduled}</p></Card>
      <Card><p className="text-xs text-slate-400">Complete</p><p className="mt-2 text-3xl font-bold text-emerald-300">{summary.completed}</p></Card>
      <Card><p className="text-xs text-slate-400">Remaining</p><p className="mt-2 text-3xl font-bold text-amber-200">{summary.remaining}</p></Card>
      <Card><p className="text-xs text-slate-400">Logged time</p><p className="mt-2 text-2xl font-bold">{formatMinutes(summary.paidMinutes)}</p></Card>
    </section>

    {message ? <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    {!entries.length ? <Card><CalendarDays className="size-5 text-slate-500" /><h2 className="mt-3 font-semibold">No visits scheduled</h2><p className="mt-2 text-sm text-slate-400">Add diary entries in the Resource Planner and they will appear here in time order.</p><Link href="/planner" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-4 text-sm font-semibold">Open resource planner</Link></Card> : <section className="space-y-4">{entries.map((entry, index) => {
      const job = entry.jobId ? jobsById.get(entry.jobId) : undefined;
      const customer = customersById.get(entry.customerId || job?.customerId || "");
      const isActive = activeEntryId === entry.id;
      const cloudWriteLocked = cloudFieldMode && (!entry.jobId || !operatorMemberId);
      return <Card key={entry.id} className={isActive ? "border-cyan-400/40" : undefined}>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Stop {index + 1}</p><h2 className="mt-1 break-words text-xl font-bold">{entry.title}</h2><div className="mt-2"><span className="inline-flex rounded-full border border-slate-700 bg-slate-950/60 px-2.5 py-1 text-xs font-semibold text-slate-300">{entry.status}</span></div></div><div className="rounded-full border border-slate-700 px-3 py-1 text-sm font-semibold text-slate-300">{entry.startTime}</div></div>
        <div className="mt-4 space-y-2 text-sm text-slate-400">{customer ? <p className="flex items-center gap-2"><UserRound className="size-4 text-cyan-400" />{customer.name}</p> : null}<p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" />{entry.location || job?.siteAddress || "No address saved"}</p><p className="flex items-center gap-2"><Clock3 className="size-4 text-cyan-400" />{entry.startTime}–{entry.endTime}</p></div>
        <div className="mt-4 grid grid-cols-2 gap-2"><a href={mapsHref(entry.location || job?.siteAddress || "")} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-cyan-400 px-3 text-sm font-semibold text-slate-950"><Navigation className="mr-2 size-4" />Navigate</a>{job ? <Link href={`/jobs/${job.id}`} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-700 px-3 text-sm font-semibold">Open job</Link> : <Link href="/planner" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-700 px-3 text-sm font-semibold">Open booking</Link>}</div>
        {cloudWriteLocked ? <p className="mt-4 text-sm text-amber-200">{!entry.jobId ? "This booking is not linked to an assigned job, so field time is read-only." : "Your active team identity must be resolved before field time can be recorded."}</p> : <div className="mt-4 grid grid-cols-2 gap-2"><Button type="button" disabled={entry.status === "Complete"} onClick={() => startEntry(entry)}><Play className="mr-2 size-4" />Arrived</Button><Button type="button" variant="secondary" disabled={!isActive || !startedAt} onClick={() => stopEntry(entry)}><Square className="mr-2 size-4" />Departed</Button></div>}
        {isActive ? <form onSubmit={(event) => saveTime(event, entry)} className="mt-5 grid gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4 sm:grid-cols-2"><label className="grid gap-2 text-sm"><span>Arrived</span><input type="time" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base" /></label><label className="grid gap-2 text-sm"><span>Departed</span><input type="time" value={finishedAt} onChange={(event) => setFinishedAt(event.target.value)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base" /></label><label className="grid gap-2 text-sm"><span>Break minutes</span><input type="number" min="0" value={breakMinutes} onChange={(event) => setBreakMinutes(event.target.value)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base" /></label><label className="grid gap-2 text-sm"><span>Time to save</span><div className="flex min-h-12 items-center rounded-xl border border-slate-800 bg-slate-900 px-3 font-semibold">{formatMinutes(paidMinutes({ startedAt, finishedAt, breakMinutes: Number(breakMinutes || 0) }))}</div></label><label className="grid gap-2 text-sm sm:col-span-2"><span>Work notes</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base" /></label><div className="sm:col-span-2"><Button className="w-full" type="submit" disabled={!finishedAt}><TimerReset className="mr-2 size-4" />Save time and complete visit</Button></div></form> : null}
        {entry.status === "Complete" ? <p className="mt-4 flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="size-4" />Visit complete</p> : null}
      </Card>;
    })}</section>}
  </div>;
}
