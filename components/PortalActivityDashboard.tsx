"use client";

import Link from "next/link";
import { BellRing, CalendarClock, MessageSquare, UserRoundCheck } from "lucide-react";
import { Card } from "./ui/Card";
import { useLocalStorageCollection } from "../lib/storage";
import type { PortalActivity, PortalApprovalRecord, PortalRequest } from "../lib/customerPortal";
import type { Customer } from "../lib/models";

export function PortalActivityDashboard() {
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const approvals = useLocalStorageCollection<PortalApprovalRecord>("jr-os-portal-approvals");
  const requests = useLocalStorageCollection<PortalRequest>("jr-os-portal-requests");
  const activity = useLocalStorageCollection<PortalActivity>("jr-os-portal-activity");
  if (![customers,approvals,requests,activity].every((store) => store.isReady)) return <Card>Loading portal activity…</Card>;
  const openRequests = requests.items.filter((item) => item.status !== "Resolved");
  const appointmentChanges = openRequests.filter((item) => item.type === "Appointment change");
  const extraWork = openRequests.filter((item) => item.type === "Additional work");
  const recent = [...activity.items].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,5);
  const customerName = (id: string) => customers.items.find((item) => item.id === id)?.name || "Customer";
  return <section className="space-y-4">
    <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Customer portal</p><h2 className="mt-1 text-2xl font-bold">Portal activity and customer actions</h2></div><Link href="/customer-portal" className="text-sm font-semibold text-cyan-300">Open portal</Link></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><UserRoundCheck className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Approval history</p><p className="mt-2 text-3xl font-bold">{approvals.items.length}</p></Card>
      <Card><BellRing className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Open customer actions</p><p className="mt-2 text-3xl font-bold">{openRequests.length}</p></Card>
      <Card><CalendarClock className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Appointment changes</p><p className="mt-2 text-3xl font-bold">{appointmentChanges.length}</p></Card>
      <Card><MessageSquare className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Additional work requests</p><p className="mt-2 text-3xl font-bold">{extraWork.length}</p></Card>
    </div>
    <Card><h3 className="font-bold">Recent portal activity</h3><div className="mt-4 space-y-3">{recent.length ? recent.map((item) => <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="flex justify-between gap-3"><p className="font-medium">{customerName(item.customerId)} · {item.action}</p><p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString("en-GB")}</p></div><p className="mt-1 text-sm text-slate-400">{item.detail}</p></div>) : <p className="text-sm text-slate-500">No customer portal activity yet.</p>}</div></Card>
  </section>;
}
