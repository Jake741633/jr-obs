"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, MapPin, Plus, Trash2, Users } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { Job, PlannerEntry, PlannerEntryType, TeamMember } from "../../lib/models";

const entryTypes: PlannerEntryType[] = ["Job", "Survey", "Delivery", "Training", "Holiday", "Office", "Other"];
const statuses: PlannerEntry["status"][] = ["Planned", "Confirmed", "Complete", "Cancelled"];
const blankForm = { title: "", type: "Job" as PlannerEntryType, date: "", startTime: "08:00", endTime: "16:30", jobId: "", teamMemberIds: [] as string[], location: "", notes: "", status: "Planned" as PlannerEntry["status"] };

function dateNumber(value: string) { return Number(value.replaceAll("-", "")) || 0; }
function displayDate(value: string) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "No date"; }

export default function PlannerPage() {
  const entries = useLocalStorageCollection<PlannerEntry>("jr-os-planner");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const team = useLocalStorageCollection<TeamMember>("jr-os-team");
  const [form, setForm] = useState(blankForm);
  const [showForm, setShowForm] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [message, setMessage] = useState("");

  const visibleEntries = useMemo(() => entries.items
    .filter((entry) => !selectedMemberId || entry.teamMemberIds.includes(selectedMemberId))
    .toSorted((a, b) => dateNumber(a.date) - dateNumber(b.date) || a.startTime.localeCompare(b.startTime)), [entries.items, selectedMemberId]);

  const conflicts = useMemo(() => {
    const keys = new Map<string, number>();
    for (const entry of entries.items.filter((item) => item.status !== "Cancelled")) {
      for (const memberId of entry.teamMemberIds) {
        const key = `${memberId}-${entry.date}`;
        keys.set(key, (keys.get(key) || 0) + 1);
      }
    }
    return [...keys.values()].filter((count) => count > 1).length;
  }, [entries.items]);

  const confirmedCount = visibleEntries.filter((entry) => entry.status === "Confirmed").length;
  const unassignedCount = visibleEntries.filter((entry) => entry.teamMemberIds.length === 0).length;

  function memberName(id: string) { return team.items.find((member) => member.id === id)?.name || "Unknown"; }
  function jobName(id?: string) { return jobs.items.find((job) => job.id === id)?.title || "No linked job"; }

  function toggleMember(id: string) {
    setForm((current) => ({ ...current, teamMemberIds: current.teamMemberIds.includes(id) ? current.teamMemberIds.filter((memberId) => memberId !== id) : [...current.teamMemberIds, id] }));
  }

  function addEntry(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || !form.date) { setMessage("Enter a title and date."); return; }
    const now = new Date().toISOString();
    const entry: PlannerEntry = { id: makeId("planner"), title: form.title.trim(), type: form.type, date: form.date, startTime: form.startTime, endTime: form.endTime, jobId: form.jobId || undefined, teamMemberIds: form.teamMemberIds, location: form.location.trim(), notes: form.notes.trim(), status: form.status, createdAt: now, updatedAt: now };
    entries.setItems((current) => [...current, entry]);
    setForm(blankForm); setShowForm(false); setMessage("Planner entry saved.");
  }

  function updateStatus(id: string, status: PlannerEntry["status"]) {
    entries.setItems((current) => current.map((entry) => entry.id === id ? { ...entry, status, updatedAt: new Date().toISOString() } : entry));
  }

  if (!entries.isReady || !jobs.isReady || !team.isReady) return <Card>Loading planner…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Operations" title="Resource Planner" description="Schedule electricians, surveys, deliveries, training and holidays across live work." />

    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
      <select value={selectedMemberId} onChange={(event) => setSelectedMemberId(event.target.value)} className="min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-4 text-sm"><option value="">All team members</option>{team.items.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
      <Button onClick={() => setShowForm((current) => !current)}><Plus className="mr-2 size-4" />Add booking</Button>
    </div>

    {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><CalendarDays className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Bookings</p><p className="mt-2 text-3xl font-bold">{visibleEntries.length}</p></Card>
      <Card><CheckCircle2 className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Confirmed</p><p className="mt-2 text-3xl font-bold">{confirmedCount}</p></Card>
      <Card><Users className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Unassigned</p><p className="mt-2 text-3xl font-bold">{unassignedCount}</p></Card>
      <Card><AlertTriangle className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Possible clashes</p><p className="mt-2 text-3xl font-bold">{conflicts}</p></Card>
    </section>

    {showForm ? <Card><form onSubmit={addEntry} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <InputField required label="Booking title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Type</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as PlannerEntryType })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{entryTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
      <InputField required label="Date" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
      <InputField label="Start time" type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} />
      <InputField label="End time" type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as PlannerEntry["status"] })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Linked job</span><select value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">No linked job</option>{jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
      <InputField label="Location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
      <div className="md:col-span-2 xl:col-span-3"><p className="mb-2 text-sm font-medium text-slate-300">Assign team</p><div className="flex flex-wrap gap-2">{team.items.filter((member) => member.status === "Active").map((member) => <button type="button" key={member.id} onClick={() => toggleMember(member.id)} className={`rounded-full border px-3 py-2 text-sm ${form.teamMemberIds.includes(member.id) ? "border-cyan-400 bg-cyan-500/10 text-cyan-200" : "border-slate-700 bg-slate-950 text-slate-400"}`}>{member.name}</button>)}</div></div>
      <div className="md:col-span-2 xl:col-span-3"><TextareaField label="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
      <div className="md:col-span-2 xl:col-span-3 flex justify-end"><Button type="submit">Save booking</Button></div>
    </form></Card> : null}

    <section className="space-y-3">
      <h2 className="text-xl font-bold">Schedule</h2>
      {visibleEntries.length === 0 ? <Card><p className="text-sm text-slate-400">No planner entries for this selection.</p></Card> : visibleEntries.map((entry) => <Card key={entry.id}><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{entry.type} · {displayDate(entry.date)}</p><h3 className="mt-1 text-lg font-bold">{entry.title}</h3><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-400"><span className="inline-flex items-center gap-1"><Clock3 className="size-4" />{entry.startTime || "Any time"}{entry.endTime ? `–${entry.endTime}` : ""}</span>{entry.location ? <span className="inline-flex items-center gap-1"><MapPin className="size-4" />{entry.location}</span> : null}<span>{jobName(entry.jobId)}</span></div>{entry.teamMemberIds.length ? <p className="mt-3 text-sm text-slate-300">Assigned: {entry.teamMemberIds.map(memberName).join(", ")}</p> : <p className="mt-3 text-sm font-medium text-amber-300">No team assigned</p>}{entry.notes ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-400">{entry.notes}</p> : null}</div><div className="flex min-w-52 items-center gap-2"><select value={entry.status} onChange={(event) => updateStatus(entry.id, event.target.value as PlannerEntry["status"])} className="min-h-10 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm">{statuses.map((status) => <option key={status}>{status}</option>)}</select><button onClick={() => entries.remove((item) => item.id === entry.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300" aria-label="Delete planner entry"><Trash2 className="size-4" /></button></div></div></Card>)}
    </section>
  </div>;
}
