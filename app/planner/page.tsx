"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, CarFront, ChevronLeft, ChevronRight, Clock3, MapPin, Navigation, Phone, Plus, Users } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useCustomersCollection, useJobsCollection, usePlannerCollection } from "../../lib/cloud/coreBusinessCollections";
import { makeId, useCloudLocalCollection } from "../../lib/storage";
import { dateWithinView, detectScheduleClashes, entryCustomer, entryEndDate, jobVisitPlan, plannerViewDate, plannerDateKey, shiftPlannerDate, recurringDates, type DiaryView, type RecurrenceFrequency, type ScheduledPlannerEntry, type VisitPhase } from "../../lib/scheduling";
import type { FleetVehicle, Job, PlannerEntryType, TeamMember } from "../../lib/models";
import { isJobInactiveStatus, isJobOnSiteStatus, normaliseJobStatus } from "../../lib/jobManagement-core.mjs";

const types: PlannerEntryType[] = ["Job", "Survey", "Delivery", "Training", "Holiday", "Office", "Other"];
const statuses: ScheduledPlannerEntry["status"][] = ["Planned", "Confirmed", "Complete", "Cancelled"];
const phases: VisitPhase[] = ["General", "First fix", "Second fix", "Maintenance", "Inspection", "Follow-up"];
const recurrences: RecurrenceFrequency[] = ["None", "Weekly", "Monthly"];
const today = () => plannerDateKey();
const fieldClass = "min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm";
const blankForm = { title: "", type: "Job" as PlannerEntryType, date: today(), endDate: today(), startTime: "08:00", endTime: "16:30", estimatedDurationMinutes: "510", customerId: "", jobId: "", teamMemberIds: [] as string[], vehicleId: "", visitPhase: "General" as VisitPhase, recurrence: "None" as RecurrenceFrequency, recurrenceCount: "1", location: "", notes: "", status: "Planned" as ScheduledPlannerEntry["status"] };
type BookingDraft = { records: ScheduledPlannerEntry[]; saved: number; complete: boolean; createdAt: string; groupId?: string };

function displayDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
function freshForm() { return { ...blankForm, date: today(), endDate: today() }; }
function mapsUrl(address: string) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`; }

export default function PlannerPage() {
  const entries = usePlannerCollection();
  const jobs = useJobsCollection();
  const customers = useCustomersCollection();
  const team = useCloudLocalCollection<TeamMember>("jr-os-team");
  const vehicles = useCloudLocalCollection<FleetVehicle>("jr-os-fleet");
  const deepLinkHandled = useRef(false);
  const [view, setView] = useState<DiaryView>("week");
  const [anchor, setAnchor] = useState(today());
  const [form, setForm] = useState(freshForm);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const bookingDraft = useRef<BookingDraft | null>(null);
  const bookingGeneration = useRef(0);
  const [generation, setGeneration] = useState(0);
  const [bookingProgress, setBookingProgress] = useState<{ saved: number; total: number; remaining: { id: string; date: string }[] } | null>(null);
  const [currentDay, setCurrentDay] = useState(today);
  const [visitQuery, setVisitQuery] = useState("");
  const [visitLimit, setVisitLimit] = useState(4);
  const ready = [entries, jobs, customers, team, vehicles].every((store) => store.isReady);

  const clashes = useMemo(() => detectScheduleClashes(entries.items, team.items, vehicles.items), [entries.items, team.items, vehicles.items]);
  const visible = useMemo(() => entries.items.filter((entry) => dateWithinView(entry.date, anchor, view, entryEndDate(entry))).toSorted((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)), [entries.items, anchor, view]);
  const visitChecks = useMemo(() => jobs.items.filter((job) => !isJobInactiveStatus(job.status)).map((job) => ({ job, plan: jobVisitPlan(job.id, entries.items, currentDay) })).filter(({ plan }) => !plan.upcoming.length || plan.uncertain.length), [jobs.items, entries.items, currentDay]);
  const visitWords = visitQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matchingVisitChecks = visitChecks.filter(({ job }) => visitWords.every((word) => `${job.title} ${job.siteAddress} ${job.status}`.toLowerCase().includes(word)));

  useEffect(() => {
    const update = () => setCurrentDay(today());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);

  useEffect(() => {
    if (deepLinkHandled.current || !customers.isReady || !jobs.isReady) return;
    const frame = window.requestAnimationFrame(() => {
      const parameters = new URLSearchParams(window.location.search);
      const requestedDate = plannerViewDate(parameters.get("date"));
      if (requestedDate && parameters.get("action") !== "create") {
        setAnchor(requestedDate);
        setView("day");
      }
      if (parameters.get("action") === "create") {
        const customerId = parameters.get("customerId") || "";
        const jobId = parameters.get("jobId") || "";
        const requestedType = parameters.get("type");
        const customer = customers.items.find((item) => item.id === customerId);
        const job = jobs.items.find((item) => item.id === jobId);
        const type = types.includes(requestedType as PlannerEntryType) ? requestedType as PlannerEntryType : "Job";
        setForm({
          ...freshForm(),
          type,
          customerId: customer?.id || job?.customerId || "",
          jobId: job?.id || "",
          title: job?.title || (customer ? `${type} · ${customer.name}` : type),
          location: job?.siteAddress || customer?.address || "",
          date: job?.startDate || today(),
          endDate: job?.targetCompletionDate || job?.startDate || today(),
          visitPhase: type === "Survey" ? "Inspection" : "General",
          estimatedDurationMinutes: type === "Survey" ? "90" : blankForm.estimatedDurationMinutes,
        });
        setShowForm(true);
        setMessage(`${type} booking prepared${customer ? ` for ${customer.name}` : ""}. Choose the date and save.`);
      }
      deepLinkHandled.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [customers.isReady, customers.items, jobs.isReady, jobs.items]);

  function toggleMember(id: string) { setForm((current) => ({ ...current, teamMemberIds: current.teamMemberIds.includes(id) ? current.teamMemberIds.filter((value) => value !== id) : [...current.teamMemberIds, id] })); }
  function nextBookingGeneration() { bookingGeneration.current++; setGeneration(bookingGeneration.current); }
  function selectCustomer(customerId: string) { const customer = customers.items.find((item) => item.id === customerId); setForm((current) => ({ ...current, customerId, title: current.title || (customer ? `${current.type} · ${customer.name}` : ""), location: current.location || customer?.address || "" })); }
  function selectJob(jobId: string) { const job = jobs.items.find((item) => item.id === jobId); setForm((current) => ({ ...current, customerId: job?.customerId || current.customerId, jobId, title: current.title || job?.title || "", location: current.location || job?.siteAddress || "", date: current.date || job?.startDate || today(), endDate: current.endDate || job?.targetCompletionDate || current.date })); }
  function toggleBookingForm() {
    if (bookingDraft.current?.saved && !bookingDraft.current.complete) { setShowForm(true); return; }
    nextBookingGeneration();
    if (!showForm && bookingDraft.current?.complete) { bookingDraft.current = null; setForm(freshForm()); }
    setShowForm(!showForm);
  }
  function prepareNextVisit(job: Job) {
    if (bookingDraft.current?.saved && !bookingDraft.current.complete) return;
    const plan = jobVisitPlan(job.id, entries.items, currentDay);
    if (isJobInactiveStatus(job.status) || plan.upcoming.length || plan.uncertain.length) return;
    nextBookingGeneration();
    bookingDraft.current = null;
    const savedStart = plannerViewDate(job.startDate || null);
    const start = savedStart && savedStart >= currentDay ? savedStart : currentDay;
    const savedEnd = plannerViewDate(job.targetCompletionDate || null);
    const end = savedEnd && savedEnd >= start ? savedEnd : start;
    setForm({ ...freshForm(), customerId: job.customerId || "", jobId: job.id, title: job.title, location: job.siteAddress, date: start, endDate: end });
    setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function keepSavedVisits() {
    const draft = bookingDraft.current;
    if (generation !== bookingGeneration.current || !draft?.saved || draft.complete) return;
    draft.complete = true;
    nextBookingGeneration();
    setBookingProgress(null); setForm(freshForm()); setShowForm(false);
    setMessage(`${draft.saved} of ${draft.records.length} visits saved on this device. The remaining visits were not booked. Check sync status and the diary before creating more.`);
  }

  function saveEntry(event: FormEvent) {
    event.preventDefault();
    if (generation !== bookingGeneration.current || bookingDraft.current?.complete) return;
    if (!ready) return setMessage("Wait for scheduling records to finish loading before saving a booking.");
    // Once any visit is saved, retain the original series and retry only its unsaved tail.
    let draft = bookingDraft.current;
    if (!draft?.saved) {
      if (!form.title.trim()) return setMessage("Enter an entry title.");
      if (!plannerViewDate(form.date) || !plannerViewDate(form.endDate) || form.endDate < form.date) return setMessage("Choose valid start and end dates, with the end on or after the start.");
      const dates = recurringDates(form.date, form.recurrence, Number(form.recurrenceCount));
      const durationDays = (Date.parse(`${form.endDate}T00:00:00Z`) - Date.parse(`${form.date}T00:00:00Z`)) / 86400000;
      const endDates = dates.map((date) => shiftPlannerDate(date, durationDays));
      if (!dates.length || endDates.some((date) => date === null)) return setMessage("These dates fall outside the supported diary range. Review the dates and recurrence.");
      const duration = Number(form.estimatedDurationMinutes || 0);
      if (!Number.isFinite(duration) || duration < 0) return setMessage("Enter a valid estimated duration of zero or more minutes.");
      const now = draft?.createdAt || new Date().toISOString();
      const groupId = form.recurrence === "None" ? undefined : draft?.groupId || makeId("recurrence");
      const records: ScheduledPlannerEntry[] = dates.map((date, index) => {
        return { id: draft?.records[index]?.id || makeId("planner"), title: form.title.trim(), type: form.type, date, endDate: endDates[index]!, startTime: form.startTime, endTime: form.endTime, estimatedDurationMinutes: duration, customerId: form.customerId || undefined, jobId: form.jobId || undefined, teamMemberIds: [...form.teamMemberIds], vehicleId: form.vehicleId || undefined, visitPhase: form.visitPhase, recurrence: form.recurrence, recurrenceCount: dates.length, recurrenceGroupId: groupId, location: form.location.trim(), notes: form.notes.trim(), status: form.status, createdAt: now, updatedAt: now };
      });
      draft = { records, saved: 0, complete: false, createdAt: now, groupId };
      bookingDraft.current = draft;
    }
    try {
      while (draft.saved < draft.records.length) {
        entries.createItem(draft.records[draft.saved]);
        draft.saved++;
      }
    } catch (error) {
      setBookingProgress(draft.saved ? { saved: draft.saved, total: draft.records.length, remaining: draft.records.slice(draft.saved).map(({ id, date }) => ({ id, date })) } : null);
      setMessage(`${draft.saved} of ${draft.records.length} visits saved on this device. ${draft.saved ? "The remaining visits could not be confirmed. Retry only the remaining visits, or keep the saved visits only." : "Booking save could not be confirmed. Your form is retained; review and retry."} ${error instanceof Error ? error.message : ""}`);
      return;
    }
    draft.complete = true;
    setBookingProgress(null);
    setAnchor(draft.records[0].date);
    setForm(freshForm()); setShowForm(false); setMessage(`${draft.records.length} diary entr${draft.records.length === 1 ? "y" : "ies"} saved on this device. Check sync status before switching devices. Any clashes remain visible below.`);
  }

  function moveEntry(entry: ScheduledPlannerEntry, days: number) {
    if (!ready) { setMessage("Wait for scheduling records to finish loading before moving a visit."); return; }
    try {
      const moved = entries.updateItem(entry.id, (current) => {
        if (JSON.stringify(current) !== JSON.stringify(entry)) throw new Error("This visit has changed. Review its current record before moving it.");
        if (!["Planned", "Confirmed"].includes(current.status)) throw new Error("Only planned or confirmed visits can be moved. Review completed or cancelled history separately.");
        const date = shiftPlannerDate(current.date, days);
        const endDate = shiftPlannerDate(entryEndDate(current), days);
        if (!date || !endDate || endDate < date) throw new Error("This entry has invalid or unsupported dates. Review it before moving it.");
        return { ...current, date, endDate, updatedAt: new Date().toISOString() };
      });
      setMessage(`${moved.title} moved to ${displayDate(moved.date)} on this device. Check sync status before switching devices. Any clashes remain visible.`);
    } catch (error) {
      setMessage(`Visit move could not be confirmed. Review and retry. ${error instanceof Error ? error.message : ""}`);
    }
  }

  function markStarted(entry: ScheduledPlannerEntry) {
    if (!ready) { setMessage("Wait for scheduling records to finish loading before confirming a visit."); return; }
    let currentEntry: ScheduledPlannerEntry;
    let savedJob: Job | undefined;
    let startedJob = false;
    try {
      // Validate the current visit without writing before attempting a job save.
      currentEntry = entries.updateItem(entry.id, (current) => {
        if (JSON.stringify(current) !== JSON.stringify(entry)) throw new Error("This visit has changed. Review its current record before confirming it.");
        if (!["Planned", "Confirmed"].includes(current.status)) throw new Error("Completed or cancelled visits cannot be started or reconfirmed.");
        return current;
      });
      if (currentEntry.type === "Job" && currentEntry.jobId) {
        savedJob = jobs.updateItem(currentEntry.jobId, (current) => {
          if (isJobOnSiteStatus(current.status)) return current;
          if (normaliseJobStatus(current.status) !== "Scheduled") throw new Error(`Job status is ${current.status}. Review the job before starting; only scheduled jobs can start here.`);
          startedJob = true;
          return { ...current, status: "First fix", updatedAt: new Date().toISOString() };
        });
      }
    } catch (error) {
      setMessage(`Start or confirmation could not be confirmed. Review the saved records before retrying. ${error instanceof Error ? error.message : ""}`);
      return;
    }
    try {
      entries.updateItem(currentEntry.id, (current) => {
        if (JSON.stringify(current) !== JSON.stringify(currentEntry)) throw new Error("This visit has changed. Review its current record before confirming it.");
        return current.status === "Confirmed" ? current : { ...current, status: "Confirmed", updatedAt: new Date().toISOString() };
      });
      setMessage(`${currentEntry.title}: ${startedJob ? "job saved as First fix and " : ""}visit confirmed on this device.${savedJob && !startedJob ? ` Job status remains ${savedJob.status}.` : ""} Check sync status before switching devices.`);
    } catch (error) {
      setMessage(`${startedJob ? "Job saved as First fix on this device, but " : ""}visit confirmation could not be confirmed. Review the records and retry Confirm visit; the saved job will not be restarted. ${error instanceof Error ? error.message : ""}`);
    }
  }

  if (!ready) return <Card>Loading scheduling centre…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Operations" title="Scheduling, Diary & Dispatch Centre" description="Plan jobs and visits, assign staff and vehicles, spot clashes and dispatch today’s work." action={<Button onClick={toggleBookingForm}><Plus className="mr-2 size-4" />{bookingProgress ? "Review booking save" : "Add diary entry"}</Button>} />
    {message ? <div role="status" className="break-words rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><CalendarDays className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Visible diary entries</p><p className="mt-2 text-3xl font-bold">{visible.length}</p></Card>
      <Card><Users className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Jobs needing visit review</p><p className="mt-2 text-3xl font-bold">{visitChecks.length}</p></Card>
      <Card><CarFront className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Active vehicles</p><p className="mt-2 text-3xl font-bold">{vehicles.items.filter((item) => item.status === "Active").length}</p></Card>
      <Card><AlertTriangle className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Scheduling clashes</p><p className="mt-2 text-3xl font-bold">{clashes.length}</p></Card>
    </section>

    {clashes.length ? <Card className="border-amber-400/30"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 text-amber-300" /><div><h2 className="font-bold">Clashes need review</h2><p className="mt-1 text-sm text-slate-400">Saving is allowed, but staff, vehicles or jobs overlap.</p><div className="mt-3 space-y-1 text-sm text-amber-200">{clashes.slice(0, 8).map((clash, index) => <p key={`${clash.entryId}-${clash.otherEntryId}-${index}`}>{clash.kind}: {clash.label}</p>)}</div></div></div></Card> : null}

    {showForm ? <Card><form onSubmit={saveEntry} className="space-y-4">
      {bookingProgress ? <div role="status" className="space-y-2 break-words text-sm text-amber-200"><p>{bookingProgress.saved} of {bookingProgress.total} visits saved. The original booking details are locked while you finish this series.</p><p>Retry only the remaining visits. Leaving this page keeps the saved visits but loses the remaining draft; review the diary before booking again.</p><ul className="list-inside list-disc">{bookingProgress.remaining.map((entry) => <li key={entry.id}>Not confirmed: {displayDate(entry.date)}</li>)}</ul></div> : null}
      <fieldset disabled={Boolean(bookingProgress)} className="grid min-w-0 gap-4 disabled:opacity-60 md:grid-cols-2 xl:grid-cols-4">
      <InputField required label="Entry title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Customer</span><select className={fieldClass} value={form.customerId} onChange={(event) => selectCustomer(event.target.value)}><option value="">No linked customer</option>{customers.items.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Linked job</span><select className={fieldClass} value={form.jobId} onChange={(event) => selectJob(event.target.value)}><option value="">Appointment only</option>{jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Entry type</span><select className={fieldClass} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as PlannerEntryType })}>{types.map((type) => <option key={type}>{type}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Visit phase</span><select className={fieldClass} value={form.visitPhase} onChange={(event) => setForm({ ...form, visitPhase: event.target.value as VisitPhase })}>{phases.map((phase) => <option key={phase}>{phase}</option>)}</select></label>
      <InputField label="Start date" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value, endDate: form.endDate || event.target.value })} />
      <InputField label="End date" required type="date" min={form.date} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
      <InputField label="Start time" type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} />
      <InputField label="End time" type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} />
      <InputField label="Estimated duration (minutes)" type="number" min="0" value={form.estimatedDurationMinutes} onChange={(event) => setForm({ ...form, estimatedDurationMinutes: event.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Vehicle</span><select className={fieldClass} value={form.vehicleId} onChange={(event) => setForm({ ...form, vehicleId: event.target.value })}><option value="">No vehicle</option>{vehicles.items.filter((vehicle) => vehicle.status === "Active").map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.registration} · {vehicle.make} {vehicle.model}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Repeat</span><select className={fieldClass} value={form.recurrence} onChange={(event) => setForm({ ...form, recurrence: event.target.value as RecurrenceFrequency })}>{recurrences.map((item) => <option key={item}>{item}</option>)}</select></label>
      <InputField label="Number of visits" disabled={form.recurrence === "None"} type="number" min="1" max="24" value={form.recurrenceCount} onChange={(event) => setForm({ ...form, recurrenceCount: event.target.value })} />
      <InputField label="Travel address" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Status</span><select className={fieldClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ScheduledPlannerEntry["status"] })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <div className="md:col-span-2 xl:col-span-4"><p className="mb-2 text-sm font-medium text-slate-300">Assign electricians or staff</p><div className="flex flex-wrap gap-2">{team.items.filter((member) => member.status === "Active").map((member) => <button type="button" key={member.id} onClick={() => toggleMember(member.id)} className={`rounded-full border px-3 py-2 text-sm ${form.teamMemberIds.includes(member.id) ? "border-cyan-400 bg-cyan-500/10 text-cyan-200" : "border-slate-700 text-slate-400"}`}>{member.name}</button>)}</div></div>
      {form.recurrence === "Monthly" ? <p className="text-sm text-slate-400 md:col-span-2 xl:col-span-4">Monthly visits keep the original day of the month, using the last day in shorter months. Each visit keeps the same number of calendar days.</p> : null}
      <div className="md:col-span-2 xl:col-span-4"><TextareaField label="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-3">{bookingProgress ? <button type="button" onClick={keepSavedVisits} className="min-h-12 rounded-xl border border-slate-700 px-4 text-sm">Keep saved visits only</button> : null}<Button type="submit">{bookingProgress ? "Retry remaining visits" : "Save without blocking clashes"}</Button></div>
    </form></Card> : null}

    <section className="grid gap-6 xl:grid-cols-[1fr_2fr]">
      <Card>
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Next visit planning</h2><span className="rounded-full bg-slate-800 px-3 py-1 text-sm">{visitChecks.length}</span></div>
        <p className="mt-2 text-sm text-slate-400">Active jobs without an ongoing or future planned/confirmed work visit, plus uncertain work bookings. Past visits, surveys and deliveries do not book the next work visit.</p>
        <div className="mt-4"><InputField label="Find a job for its next visit" type="search" value={visitQuery} onChange={(event) => { setVisitQuery(event.target.value); setVisitLimit(4); }} /></div>
        <p role="status" className="mt-3 text-sm text-slate-400">{matchingVisitChecks.length} of {visitChecks.length} jobs match · loaded records as of {currentDay}.</p>
        {visitQuery ? <button onClick={() => { setVisitQuery(""); setVisitLimit(4); }} className="mt-2 min-h-12 rounded-xl border border-slate-700 px-3 text-sm">Clear job search</button> : null}
        <div className="mt-4 space-y-3">{matchingVisitChecks.slice(0, visitLimit).map(({ job, plan }) => <article key={job.id} aria-label={`Next visit · ${job.title}`} className="min-w-0 break-words rounded-xl border border-slate-800 p-4">
          <h3 className="font-semibold">{job.title}</h3><p className="mt-1 text-sm text-slate-400">{job.siteAddress || "No address"} · {job.status}</p>
          <p className="mt-2 text-sm text-amber-200">{plan.uncertain.length ? "Review uncertain work bookings before creating another visit." : "No ongoing or future work visit found in loaded records."}</p>
          {plan.upcoming.length ? <p className="mt-1 text-sm text-slate-400">{plan.upcoming.length} planned/confirmed work visit(s) also recorded.</p> : null}
          {plan.uncertain.length ? <ul className="mt-2 space-y-1 text-sm text-slate-400">{plan.uncertain.map((entry) => <li key={entry.id}>{entry.title} · {entry.status} · {entry.date || "Start missing"} to {entryEndDate(entry) || "End missing"} · dates or status need review</li>)}</ul> : null}
          <div className="mt-3 flex flex-wrap gap-2"><button disabled={Boolean(bookingProgress) || Boolean(plan.uncertain.length) || Boolean(plan.upcoming.length)} onClick={() => prepareNextVisit(job)} className="min-h-12 rounded-xl border border-cyan-400/30 px-3 text-sm text-cyan-200 disabled:opacity-40">Book next visit</button><Link href={`/jobs/${encodeURIComponent(job.id)}`} className="inline-flex min-h-12 items-center rounded-xl border border-slate-700 px-3 text-sm">Review job</Link></div>
        </article>)}</div>
        {matchingVisitChecks.length > visitLimit ? <button onClick={() => setVisitLimit((value) => value + 4)} className="mt-4 min-h-12 w-full rounded-xl border border-slate-700 px-3 text-sm">Show more jobs ({matchingVisitChecks.length - visitLimit} remaining)</button> : null}
        {!matchingVisitChecks.length ? <p className="mt-4 text-sm text-slate-400">{visitChecks.length ? "No jobs match this search." : "No next-visit checks flagged in loaded records. Check sync status and the diary before planning more work."}</p> : null}
      </Card>

      <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex rounded-xl border border-slate-800 p-1">{(["day", "week", "month"] as DiaryView[]).map((item) => <button key={item} onClick={() => setView(item)} className={`min-h-12 rounded-lg px-4 py-2 text-sm font-semibold capitalize ${view === item ? "bg-cyan-400 text-slate-950" : "text-slate-400"}`}>{item}</button>)}</div><div className="flex items-center gap-2"><button aria-label={`Previous ${view}`} onClick={() => setAnchor(shiftPlannerDate(anchor, -1, view) || anchor)} className="min-h-12 min-w-12 rounded-xl border border-slate-800 p-2"><ChevronLeft className="size-4" /></button><button onClick={() => setAnchor(today())} className="min-h-12 rounded-xl border border-slate-800 px-3 py-2 text-sm">Today</button><button aria-label={`Next ${view}`} onClick={() => setAnchor(shiftPlannerDate(anchor, 1, view) || anchor)} className="min-h-12 min-w-12 rounded-xl border border-slate-800 p-2"><ChevronRight className="size-4" /></button></div></div>
        <Card><p className="text-sm text-slate-400">{view[0].toUpperCase() + view.slice(1)} diary centred on</p><p className="mt-1 text-xl font-bold">{displayDate(anchor)}</p></Card>
        {visible.length ? visible.map((entry) => { const job = jobs.items.find((item) => item.id === entry.jobId); const customer = entryCustomer(entry, jobs.items, customers.items); const vehicle = vehicles.items.find((item) => item.id === entry.vehicleId); const entryClashes = clashes.filter((item) => item.entryId === entry.id || item.otherEntryId === entry.id); const activeVisit = ["Planned", "Confirmed"].includes(entry.status); const startsJob = entry.type === "Job" && Boolean(entry.jobId) && (!job || !isJobOnSiteStatus(job.status)); return <Card key={entry.id} className={entryClashes.length ? "border-amber-400/30" : undefined}><div className="flex flex-col gap-4 lg:flex-row lg:justify-between"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{entry.visitPhase || entry.type} · {displayDate(entry.date)}{entryEndDate(entry) !== entry.date ? ` to ${displayDate(entryEndDate(entry))}` : ""}</p><h3 className="mt-1 text-xl font-bold">{entry.title}</h3><div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-400"><span className="inline-flex items-center gap-1"><Clock3 className="size-4" />{entry.startTime || "Any time"}{entry.endTime ? `–${entry.endTime}` : ""}</span><span>Visit: {entry.status}</span>{job ? <span>Job: {job.status}</span> : entry.jobId ? <span className="text-amber-300">Linked job unavailable</span> : null}{vehicle ? <span className="inline-flex items-center gap-1"><CarFront className="size-4" />{vehicle.registration}</span> : null}</div><p className="mt-3 flex items-start gap-2 text-sm text-slate-400"><MapPin className="mt-0.5 size-4 shrink-0" />{entry.location || job?.siteAddress || "No travel address"}</p><p className="mt-2 text-sm text-slate-300">Customer: {customer?.name || "Not linked"}</p><p className="mt-1 text-sm text-slate-300">Workers: {entry.teamMemberIds.length ? entry.teamMemberIds.map((id) => team.items.find((member) => member.id === id)?.name || "Unknown").join(", ") : "Unallocated"}</p>{entryClashes.length ? <p className="mt-3 text-sm font-semibold text-amber-300">{entryClashes.length} clash warning{entryClashes.length === 1 ? "" : "s"}</p> : null}</div><div className="flex flex-wrap items-start gap-2 lg:max-w-64 lg:justify-end"><button disabled={!activeVisit} onClick={() => moveEntry(entry, -1)} className="min-h-12 rounded-xl border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">Move back a day</button><button disabled={!activeVisit} onClick={() => moveEntry(entry, 1)} className="min-h-12 rounded-xl border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">Move ahead a day</button><Button disabled={!activeVisit || (startsJob ? !job || normaliseJobStatus(job.status) !== "Scheduled" : entry.status === "Confirmed")} onClick={() => markStarted(entry)}>{startsJob ? "Start job" : "Confirm visit"}</Button>{entry.location || job?.siteAddress ? <a href={mapsUrl(entry.location || job?.siteAddress || "")} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center rounded-xl border border-slate-700 px-3 py-2 text-sm"><Navigation className="mr-2 size-4" />Navigate</a> : null}{customer?.phone ? <a href={`tel:${customer.phone}`} className="inline-flex min-h-12 items-center rounded-xl border border-slate-700 px-3 py-2 text-sm"><Phone className="mr-2 size-4" />Call</a> : null}{job ? <Link href={`/jobs/${encodeURIComponent(job.id)}`} className="min-h-12 rounded-xl border border-slate-700 px-3 py-2 text-sm">View job</Link> : null}</div></div></Card>; }) : <Card><p className="text-sm text-slate-500">No diary entries in this {view}.</p></Card>}
      </div>
    </section>
  </div>;
}
