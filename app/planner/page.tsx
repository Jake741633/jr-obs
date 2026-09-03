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
import { dateWithinView, detectScheduleClashes, entryCustomer, entryEndDate, recurringDates, type DiaryView, type RecurrenceFrequency, type ScheduledPlannerEntry, type VisitPhase } from "../../lib/scheduling";
import type { FleetVehicle, Job, PlannerEntryType, TeamMember } from "../../lib/models";

const types: PlannerEntryType[] = ["Job", "Survey", "Delivery", "Training", "Holiday", "Office", "Other"];
const statuses: ScheduledPlannerEntry["status"][] = ["Planned", "Confirmed", "Complete", "Cancelled"];
const phases: VisitPhase[] = ["General", "First fix", "Second fix", "Maintenance", "Inspection", "Follow-up"];
const recurrences: RecurrenceFrequency[] = ["None", "Weekly", "Monthly"];
const today = () => new Date().toISOString().slice(0, 10);
const fieldClass = "min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm";
const blankForm = { title: "", type: "Job" as PlannerEntryType, date: today(), endDate: today(), startTime: "08:00", endTime: "16:30", estimatedDurationMinutes: "510", customerId: "", jobId: "", teamMemberIds: [] as string[], vehicleId: "", visitPhase: "General" as VisitPhase, recurrence: "None" as RecurrenceFrequency, recurrenceCount: "1", location: "", notes: "", status: "Planned" as ScheduledPlannerEntry["status"] };

function displayDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
function shiftDate(value: string, amount: number, view: DiaryView) { const date = new Date(`${value}T12:00:00`); if (view === "month") date.setMonth(date.getMonth() + amount); else date.setDate(date.getDate() + amount * (view === "week" ? 7 : 1)); return date.toISOString().slice(0, 10); }
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
  const [form, setForm] = useState(blankForm);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");

  const clashes = useMemo(() => detectScheduleClashes(entries.items, team.items, vehicles.items), [entries.items, team.items, vehicles.items]);
  const visible = useMemo(() => entries.items.filter((entry) => dateWithinView(entry.date, anchor, view)).toSorted((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)), [entries.items, anchor, view]);
  const allocatedJobIds = useMemo(() => new Set(entries.items.filter((entry) => entry.status !== "Cancelled").map((entry) => entry.jobId).filter(Boolean)), [entries.items]);
  const unallocatedJobs = jobs.items.filter((job) => !allocatedJobIds.has(job.id) && job.status !== "Complete" && job.status !== "On hold");

  useEffect(() => {
    if (deepLinkHandled.current || !customers.isReady || !jobs.isReady) return;
    const frame = window.requestAnimationFrame(() => {
      const parameters = new URLSearchParams(window.location.search);
      if (parameters.get("action") === "create") {
        const customerId = parameters.get("customerId") || "";
        const jobId = parameters.get("jobId") || "";
        const requestedType = parameters.get("type");
        const customer = customers.items.find((item) => item.id === customerId);
        const job = jobs.items.find((item) => item.id === jobId);
        const type = types.includes(requestedType as PlannerEntryType) ? requestedType as PlannerEntryType : "Job";
        setForm({
          ...blankForm,
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
  function selectCustomer(customerId: string) { const customer = customers.items.find((item) => item.id === customerId); setForm((current) => ({ ...current, customerId, title: current.title || (customer ? `${current.type} · ${customer.name}` : ""), location: current.location || customer?.address || "" })); }
  function selectJob(jobId: string) { const job = jobs.items.find((item) => item.id === jobId); setForm((current) => ({ ...current, customerId: job?.customerId || current.customerId, jobId, title: current.title || job?.title || "", location: current.location || job?.siteAddress || "", date: current.date || job?.startDate || today(), endDate: current.endDate || job?.targetCompletionDate || current.date })); }
  function addUnallocated(job: Job) { setForm({ ...blankForm, customerId: job.customerId || "", jobId: job.id, title: job.title, location: job.siteAddress, date: job.startDate || today(), endDate: job.targetCompletionDate || job.startDate || today() }); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }

  function saveEntry(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || !form.date) return setMessage("Enter a title and start date.");
    const now = new Date().toISOString();
    const groupId = form.recurrence === "None" ? undefined : makeId("recurrence");
    const dates = recurringDates(form.date, form.recurrence, Number(form.recurrenceCount));
    const durationDays = Math.max(0, Math.round((new Date(`${form.endDate}T12:00:00`).getTime() - new Date(`${form.date}T12:00:00`).getTime()) / 86400000));
    const records: ScheduledPlannerEntry[] = dates.map((date) => {
      const end = new Date(`${date}T12:00:00`); end.setDate(end.getDate() + durationDays);
      return { id: makeId("planner"), title: form.title.trim(), type: form.type, date, endDate: end.toISOString().slice(0, 10), startTime: form.startTime, endTime: form.endTime, estimatedDurationMinutes: Math.max(0, Number(form.estimatedDurationMinutes || 0)), customerId: form.customerId || undefined, jobId: form.jobId || undefined, teamMemberIds: form.teamMemberIds, vehicleId: form.vehicleId || undefined, visitPhase: form.visitPhase, recurrence: form.recurrence, recurrenceCount: dates.length, recurrenceGroupId: groupId, location: form.location.trim(), notes: form.notes.trim(), status: form.status, createdAt: now, updatedAt: now };
    });
    entries.setItems((current) => [...current, ...records]);
    setForm(blankForm); setShowForm(false); setMessage(`${records.length} diary entr${records.length === 1 ? "y" : "ies"} saved. Any clashes remain visible below.`);
  }

  function moveEntry(entry: ScheduledPlannerEntry, days: number) {
    const start = new Date(`${entry.date}T12:00:00`); const end = new Date(`${entryEndDate(entry)}T12:00:00`); start.setDate(start.getDate() + days); end.setDate(end.getDate() + days);
    entries.setItems((current) => current.map((item) => item.id === entry.id ? { ...item, date: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), updatedAt: new Date().toISOString() } : item));
  }

  function markStarted(entry: ScheduledPlannerEntry) {
    if (entry.jobId) jobs.setItems((current) => current.map((job) => job.id === entry.jobId ? { ...job, status: "In progress", updatedAt: new Date().toISOString() } : job));
    entries.setItems((current) => current.map((item) => item.id === entry.id ? { ...item, status: "Confirmed", updatedAt: new Date().toISOString() } : item));
    setMessage(`${entry.title} marked as started.`);
  }

  if (![entries, jobs, customers, team, vehicles].every((store) => store.isReady)) return <Card>Loading scheduling centre…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Operations" title="Scheduling, Diary & Dispatch Centre" description="Plan jobs and visits, assign staff and vehicles, spot clashes and dispatch today’s work." action={<Button onClick={() => setShowForm((value) => !value)}><Plus className="mr-2 size-4" />Add diary entry</Button>} />
    {message ? <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><CalendarDays className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Visible diary entries</p><p className="mt-2 text-3xl font-bold">{visible.length}</p></Card>
      <Card><Users className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Unallocated jobs</p><p className="mt-2 text-3xl font-bold">{unallocatedJobs.length}</p></Card>
      <Card><CarFront className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Active vehicles</p><p className="mt-2 text-3xl font-bold">{vehicles.items.filter((item) => item.status === "Active").length}</p></Card>
      <Card><AlertTriangle className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Scheduling clashes</p><p className="mt-2 text-3xl font-bold">{clashes.length}</p></Card>
    </section>

    {clashes.length ? <Card className="border-amber-400/30"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 text-amber-300" /><div><h2 className="font-bold">Clashes need review</h2><p className="mt-1 text-sm text-slate-400">Saving is allowed, but staff, vehicles or jobs overlap.</p><div className="mt-3 space-y-1 text-sm text-amber-200">{clashes.slice(0, 8).map((clash, index) => <p key={`${clash.entryId}-${clash.otherEntryId}-${index}`}>{clash.kind}: {clash.label}</p>)}</div></div></div></Card> : null}

    {showForm ? <Card><form onSubmit={saveEntry} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <InputField required label="Entry title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Customer</span><select className={fieldClass} value={form.customerId} onChange={(event) => selectCustomer(event.target.value)}><option value="">No linked customer</option>{customers.items.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Linked job</span><select className={fieldClass} value={form.jobId} onChange={(event) => selectJob(event.target.value)}><option value="">Appointment only</option>{jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Entry type</span><select className={fieldClass} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as PlannerEntryType })}>{types.map((type) => <option key={type}>{type}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Visit phase</span><select className={fieldClass} value={form.visitPhase} onChange={(event) => setForm({ ...form, visitPhase: event.target.value as VisitPhase })}>{phases.map((phase) => <option key={phase}>{phase}</option>)}</select></label>
      <InputField label="Start date" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value, endDate: form.endDate || event.target.value })} />
      <InputField label="End date" type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
      <InputField label="Start time" type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} />
      <InputField label="End time" type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} />
      <InputField label="Estimated duration (minutes)" type="number" min="0" value={form.estimatedDurationMinutes} onChange={(event) => setForm({ ...form, estimatedDurationMinutes: event.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Vehicle</span><select className={fieldClass} value={form.vehicleId} onChange={(event) => setForm({ ...form, vehicleId: event.target.value })}><option value="">No vehicle</option>{vehicles.items.filter((vehicle) => vehicle.status === "Active").map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.registration} · {vehicle.make} {vehicle.model}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Repeat</span><select className={fieldClass} value={form.recurrence} onChange={(event) => setForm({ ...form, recurrence: event.target.value as RecurrenceFrequency })}>{recurrences.map((item) => <option key={item}>{item}</option>)}</select></label>
      <InputField label="Number of visits" type="number" min="1" max="24" value={form.recurrenceCount} onChange={(event) => setForm({ ...form, recurrenceCount: event.target.value })} />
      <InputField label="Travel address" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Status</span><select className={fieldClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ScheduledPlannerEntry["status"] })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <div className="md:col-span-2 xl:col-span-4"><p className="mb-2 text-sm font-medium text-slate-300">Assign electricians or staff</p><div className="flex flex-wrap gap-2">{team.items.filter((member) => member.status === "Active").map((member) => <button type="button" key={member.id} onClick={() => toggleMember(member.id)} className={`rounded-full border px-3 py-2 text-sm ${form.teamMemberIds.includes(member.id) ? "border-cyan-400 bg-cyan-500/10 text-cyan-200" : "border-slate-700 text-slate-400"}`}>{member.name}</button>)}</div></div>
      <div className="md:col-span-2 xl:col-span-4"><TextareaField label="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
      <div className="md:col-span-2 xl:col-span-4 flex justify-end"><Button type="submit">Save without blocking clashes</Button></div>
    </form></Card> : null}

    <section className="grid gap-6 xl:grid-cols-[1fr_2fr]">
      <Card><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Unallocated jobs</h2><p className="text-sm text-slate-500">Assign these into the diary.</p></div><span className="rounded-full bg-slate-800 px-3 py-1 text-sm">{unallocatedJobs.length}</span></div><div className="mt-4 space-y-3">{unallocatedJobs.length ? unallocatedJobs.map((job) => <button key={job.id} onClick={() => addUnallocated(job)} className="w-full rounded-xl border border-slate-800 p-4 text-left hover:border-cyan-400/40"><p className="font-semibold">{job.title}</p><p className="mt-1 text-sm text-slate-500">{job.siteAddress || "No address"}</p><p className="mt-2 text-xs text-cyan-300">Assign to diary</p></button>) : <p className="text-sm text-slate-500">All active jobs are allocated.</p>}</div></Card>

      <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex rounded-xl border border-slate-800 p-1">{(["day", "week", "month"] as DiaryView[]).map((item) => <button key={item} onClick={() => setView(item)} className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize ${view === item ? "bg-cyan-400 text-slate-950" : "text-slate-400"}`}>{item}</button>)}</div><div className="flex items-center gap-2"><button onClick={() => setAnchor(shiftDate(anchor, -1, view))} className="rounded-xl border border-slate-800 p-2"><ChevronLeft className="size-4" /></button><button onClick={() => setAnchor(today())} className="rounded-xl border border-slate-800 px-3 py-2 text-sm">Today</button><button onClick={() => setAnchor(shiftDate(anchor, 1, view))} className="rounded-xl border border-slate-800 p-2"><ChevronRight className="size-4" /></button></div></div>
        <Card><p className="text-sm text-slate-400">{view[0].toUpperCase() + view.slice(1)} diary centred on</p><p className="mt-1 text-xl font-bold">{displayDate(anchor)}</p></Card>
        {visible.length ? visible.map((entry) => { const job = jobs.items.find((item) => item.id === entry.jobId); const customer = entryCustomer(entry, jobs.items, customers.items); const vehicle = vehicles.items.find((item) => item.id === entry.vehicleId); const entryClashes = clashes.filter((item) => item.entryId === entry.id || item.otherEntryId === entry.id); return <Card key={entry.id} className={entryClashes.length ? "border-amber-400/30" : undefined}><div className="flex flex-col gap-4 lg:flex-row lg:justify-between"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{entry.visitPhase || entry.type} · {displayDate(entry.date)}{entryEndDate(entry) !== entry.date ? ` to ${displayDate(entryEndDate(entry))}` : ""}</p><h3 className="mt-1 text-xl font-bold">{entry.title}</h3><div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-400"><span className="inline-flex items-center gap-1"><Clock3 className="size-4" />{entry.startTime || "Any time"}{entry.endTime ? `–${entry.endTime}` : ""}</span><span>{job?.status || entry.status}</span>{vehicle ? <span className="inline-flex items-center gap-1"><CarFront className="size-4" />{vehicle.registration}</span> : null}</div><p className="mt-3 flex items-start gap-2 text-sm text-slate-400"><MapPin className="mt-0.5 size-4 shrink-0" />{entry.location || job?.siteAddress || "No travel address"}</p><p className="mt-2 text-sm text-slate-300">Customer: {customer?.name || "Not linked"}</p><p className="mt-1 text-sm text-slate-300">Workers: {entry.teamMemberIds.length ? entry.teamMemberIds.map((id) => team.items.find((member) => member.id === id)?.name || "Unknown").join(", ") : "Unallocated"}</p>{entryClashes.length ? <p className="mt-3 text-sm font-semibold text-amber-300">{entryClashes.length} clash warning{entryClashes.length === 1 ? "" : "s"}</p> : null}</div><div className="flex flex-wrap items-start gap-2 lg:max-w-64 lg:justify-end"><button onClick={() => moveEntry(entry, -1)} className="rounded-xl border border-slate-700 px-3 py-2 text-sm">Previous day</button><button onClick={() => moveEntry(entry, 1)} className="rounded-xl border border-slate-700 px-3 py-2 text-sm">Next day</button><Button onClick={() => markStarted(entry)}>Start job</Button>{entry.location || job?.siteAddress ? <a href={mapsUrl(entry.location || job?.siteAddress || "")} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-xl border border-slate-700 px-3 py-2 text-sm"><Navigation className="mr-2 size-4" />Navigate</a> : null}{customer?.phone ? <a href={`tel:${customer.phone}`} className="inline-flex items-center rounded-xl border border-slate-700 px-3 py-2 text-sm"><Phone className="mr-2 size-4" />Call</a> : null}{job ? <Link href={`/jobs/${job.id}`} className="rounded-xl border border-slate-700 px-3 py-2 text-sm">View job</Link> : null}</div></div></Card>; }) : <Card><p className="text-sm text-slate-500">No diary entries in this {view}.</p></Card>}
      </div>
    </section>
  </div>;
}
