"use client";

import Link from "next/link";
import { CalendarDays, Clock3, MapPin, Navigation, Phone, Users } from "lucide-react";
import { Card } from "./ui/Card";
import { useLocalStorageCollection } from "../lib/storage";
import { entryCustomer, plannerStorageKey, type ScheduledPlannerEntry } from "../lib/scheduling";
import type { Customer, Job, TeamMember } from "../lib/models";

const today = () => new Date().toISOString().slice(0, 10);
function mapsUrl(address: string) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`; }

export function ScheduleOverview({ mobile = false }: { mobile?: boolean }) {
  const entries = useLocalStorageCollection<ScheduledPlannerEntry>(plannerStorageKey);
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const team = useLocalStorageCollection<TeamMember>("jr-os-team");
  if (![entries, jobs, customers, team].every((store) => store.isReady)) return <Card>Loading schedule…</Card>;

  const date = today();
  const todays = entries.items.filter((entry) => entry.status !== "Cancelled" && entry.date <= date && (entry.endDate || entry.date) >= date).toSorted((a, b) => a.startTime.localeCompare(b.startTime));
  const upcoming = entries.items.filter((entry) => entry.status !== "Cancelled" && entry.date > date).toSorted((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)).slice(0, mobile ? 3 : 5);

  return <section className="space-y-4">
    <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Dispatch</p><h2 className="mt-1 text-2xl font-bold">Today&apos;s schedule</h2><p className="mt-1 text-sm text-slate-400">Live from the Scheduling, Diary & Dispatch Centre.</p></div><Link href="/planner" className="text-sm font-semibold text-cyan-300">Open diary</Link></div>
    <div className={`grid gap-4 ${mobile ? "" : "xl:grid-cols-[1.4fr_1fr]"}`}>
      <Card><div className="flex items-center gap-2"><CalendarDays className="size-5 text-cyan-300" /><h3 className="font-bold">Today</h3><span className="ml-auto rounded-full bg-slate-800 px-3 py-1 text-sm">{todays.length}</span></div><div className="mt-4 space-y-3">{todays.length ? todays.map((entry) => {
        const job = jobs.items.find((item) => item.id === entry.jobId);
        const customer = entryCustomer(entry, jobs.items, customers.items);
        const address = entry.location || job?.siteAddress || "";
        return <div key={entry.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{entry.startTime || "Any time"}{entry.endTime ? `–${entry.endTime}` : ""}</p><h4 className="mt-1 font-bold">{entry.title}</h4><p className="mt-1 text-sm text-slate-500">{customer?.name || "No customer linked"} · {job?.status || entry.status}</p></div>{job ? <Link href={`/jobs/${job.id}`} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold">Job</Link> : null}</div>{address ? <p className="mt-3 flex items-start gap-2 text-sm text-slate-400"><MapPin className="mt-0.5 size-4 shrink-0" />{address}</p> : null}<p className="mt-2 flex items-center gap-2 text-sm text-slate-400"><Users className="size-4" />{entry.teamMemberIds.length ? entry.teamMemberIds.map((id) => team.items.find((member) => member.id === id)?.name || "Unknown").join(", ") : "Unallocated"}</p><div className="mt-3 flex flex-wrap gap-2">{address ? <a href={mapsUrl(address)} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold"><Navigation className="mr-1 size-3" />Navigate</a> : null}{customer?.phone ? <a href={`tel:${customer.phone}`} className="inline-flex items-center rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold"><Phone className="mr-1 size-3" />Call</a> : null}{job ? <Link href={`/field?job=${job.id}`} className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950">Start job</Link> : null}</div></div>;
      }) : <p className="rounded-xl border border-dashed border-slate-800 p-5 text-center text-sm text-slate-500">Nothing scheduled today.</p>}</div></Card>
      <Card><div className="flex items-center gap-2"><Clock3 className="size-5 text-violet-300" /><h3 className="font-bold">Upcoming work</h3></div><div className="mt-4 space-y-3">{upcoming.length ? upcoming.map((entry) => <Link key={entry.id} href="/planner" className="block rounded-xl border border-slate-800 p-3 hover:border-slate-700"><p className="text-xs font-semibold text-cyan-300">{new Date(`${entry.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · {entry.startTime || "Any time"}</p><p className="mt-1 font-medium">{entry.title}</p><p className="mt-1 truncate text-sm text-slate-500">{entry.location || "No address"}</p></Link>) : <p className="text-sm text-slate-500">No upcoming diary entries.</p>}</div></Card>
    </div>
  </section>;
}
