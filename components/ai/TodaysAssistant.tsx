"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  BellRing,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
  FileText,
  Plus,
  ReceiptText,
  UserRound,
} from "lucide-react";
import { invoiceTotal } from "../../lib/workflow";
import type { AiRecommendation } from "../../lib/aiCommandCentre";
import type { AiReminder, AiReminderPriority, Customer, CustomerProfile, Invoice, Job, PlannerEntry, PricingDocument } from "../../lib/models";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { InputField, TextareaField } from "../ui/FormField";

interface TodaySnapshot {
  today: string;
  todaysJobs: Job[];
  todaysPlanner: PlannerEntry[];
  overdueInvoices: Invoice[];
  quoteFollowUps: PricingDocument[];
  dueReminders: AiReminder[];
  customerFollowUps: CustomerProfile[];
  urgentActions: AiRecommendation[];
}

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const priorities: AiReminderPriority[] = ["Normal", "High", "Urgent"];

export function TodaysAssistant({
  snapshot,
  customers,
  onAddReminder,
  onToggleReminder,
}: {
  snapshot: TodaySnapshot;
  customers: Customer[];
  onAddReminder: (input: { title: string; dueDate: string; dueTime: string; priority: AiReminderPriority; customerId?: string; notes: string }) => void;
  onToggleReminder: (id: string) => void;
}) {
  const [showReminder, setShowReminder] = useState(false);
  const [form, setForm] = useState({
    title: "",
    dueDate: snapshot.today,
    dueTime: "",
    priority: "Normal" as AiReminderPriority,
    customerId: "",
    notes: "",
  });
  const customerNames = new Map(customers.map((customer) => [customer.id, customer.name]));
  const overdueValue = snapshot.overdueInvoices.reduce((sum, invoice) => sum + Math.max(0, invoiceTotal(invoice) - invoice.amountPaid), 0);

  function submitReminder(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || !form.dueDate) return;
    onAddReminder({
      title: form.title.trim(),
      dueDate: form.dueDate,
      dueTime: form.dueTime,
      priority: form.priority,
      customerId: form.customerId || undefined,
      notes: form.notes.trim(),
    });
    setForm({ title: "", dueDate: snapshot.today, dueTime: "", priority: "Normal", customerId: "", notes: "" });
    setShowReminder(false);
  }

  return (
    <section id="today" className="scroll-mt-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">Today&apos;s Assistant</p>
          <h2 className="mt-1 text-2xl font-bold">What needs your attention today</h2>
          <p className="mt-1 text-sm text-slate-400">Jobs, money, quote follow-ups, CRM reminders and urgent workflow steps in one view.</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setShowReminder((current) => !current)}>
          <Plus className="mr-2 size-4" />
          {showReminder ? "Close reminder" : "Add reminder"}
        </Button>
      </div>

      {showReminder ? (
        <Card>
          <form onSubmit={submitReminder} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <InputField required label="Reminder" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Call customer, collect parts..." />
            <InputField required label="Due date" type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
            <InputField label="Time" type="time" value={form.dueTime} onChange={(event) => setForm({ ...form, dueTime: event.target.value })} />
            <label className="grid gap-2 text-sm font-medium text-slate-300">
              <span>Priority</span>
              <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as AiReminderPriority })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">
                {priorities.map((priority) => <option key={priority}>{priority}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-300">
              <span>Customer (optional)</span>
              <select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">
                <option value="">No customer</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
            </label>
            <TextareaField label="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            <div className="md:col-span-2 xl:col-span-3 flex justify-end"><Button type="submit">Save reminder</Button></div>
          </form>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="flex items-center justify-between"><BriefcaseBusiness className="size-5 text-cyan-300" /><span className="text-2xl font-bold">{snapshot.todaysJobs.length}</span></div>
          <h3 className="mt-3 font-semibold">Today&apos;s jobs</h3>
          <div className="mt-3 space-y-2">
            {snapshot.todaysJobs.slice(0, 4).map((job) => (
              <Link key={job.id} href={`/jobs/${job.id}`} className="block rounded-lg bg-slate-950 px-3 py-2 text-sm hover:bg-slate-800">
                <span className="block font-medium">{job.title}</span>
                <span className="mt-1 block truncate text-xs text-slate-500">{job.siteAddress}</span>
              </Link>
            ))}
            {!snapshot.todaysJobs.length ? <p className="text-sm text-slate-500">No jobs start today.</p> : null}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between"><ReceiptText className="size-5 text-red-300" /><span className="text-lg font-bold text-red-300">{money.format(overdueValue)}</span></div>
          <h3 className="mt-3 font-semibold">Overdue invoices</h3>
          <div className="mt-3 space-y-2">
            {snapshot.overdueInvoices.slice(0, 4).map((invoice) => (
              <Link key={invoice.id} href="/invoices" className="flex items-center justify-between gap-3 rounded-lg bg-slate-950 px-3 py-2 text-sm hover:bg-slate-800">
                <span className="truncate">{invoice.number}</span>
                <strong className="shrink-0 text-red-300">{money.format(Math.max(0, invoiceTotal(invoice) - invoice.amountPaid))}</strong>
              </Link>
            ))}
            {!snapshot.overdueInvoices.length ? <p className="text-sm text-slate-500">Nothing overdue.</p> : null}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between"><FileText className="size-5 text-violet-300" /><span className="text-2xl font-bold">{snapshot.quoteFollowUps.length}</span></div>
          <h3 className="mt-3 font-semibold">Quotes to follow up</h3>
          <div className="mt-3 space-y-2">
            {snapshot.quoteFollowUps.slice(0, 4).map((quote) => (
              <Link key={quote.id} href={`/quotes/${quote.id}`} className="block rounded-lg bg-slate-950 px-3 py-2 text-sm hover:bg-slate-800">
                <span className="block font-medium">{quote.number} · {quote.title}</span>
                <span className="mt-1 block text-xs text-slate-500">Sent {new Date(quote.updatedAt).toLocaleDateString("en-GB")}</span>
              </Link>
            ))}
            {!snapshot.quoteFollowUps.length ? <p className="text-sm text-slate-500">No follow-ups due yet.</p> : null}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between"><BellRing className="size-5 text-amber-300" /><span className="text-2xl font-bold">{snapshot.dueReminders.length + snapshot.customerFollowUps.length}</span></div>
          <h3 className="mt-3 font-semibold">Reminders</h3>
          <div className="mt-3 space-y-2">
            {snapshot.dueReminders.slice(0, 3).map((reminder) => (
              <button key={reminder.id} type="button" onClick={() => onToggleReminder(reminder.id)} className="flex w-full items-start gap-2 rounded-lg bg-slate-950 px-3 py-2 text-left text-sm hover:bg-slate-800">
                <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded border ${reminder.priority === "Urgent" ? "border-red-400 text-red-300" : "border-slate-700 text-slate-500"}`}><Check className="size-3" /></span>
                <span><span className="block font-medium">{reminder.title}</span><span className="mt-1 block text-xs text-slate-500">{reminder.dueTime || "Any time"}{reminder.customerId ? ` · ${customerNames.get(reminder.customerId) || "Customer"}` : ""}</span></span>
              </button>
            ))}
            {snapshot.customerFollowUps.slice(0, 2).map((profile) => (
              <Link key={profile.id} href="/crm" className="flex items-start gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm hover:bg-slate-800">
                <UserRound className="mt-0.5 size-4 shrink-0 text-cyan-300" />
                <span><span className="block font-medium">{customerNames.get(profile.customerId) || "Customer follow-up"}</span><span className="mt-1 block text-xs text-slate-500">{profile.followUpReason || "CRM follow-up due"}</span></span>
              </Link>
            ))}
            {!snapshot.dueReminders.length && !snapshot.customerFollowUps.length ? <p className="text-sm text-slate-500">No reminders due.</p> : null}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-cyan-400/20">
          <div className="flex items-center gap-3"><CalendarDays className="size-5 text-cyan-300" /><div><h3 className="font-semibold">Today&apos;s planner</h3><p className="text-sm text-slate-500">{snapshot.todaysPlanner.length} diary entr{snapshot.todaysPlanner.length === 1 ? "y" : "ies"}</p></div></div>
          <div className="mt-4 space-y-2">
            {snapshot.todaysPlanner.slice(0, 5).map((entry) => <Link key={entry.id} href="/planner" className="flex items-center gap-3 rounded-lg border border-slate-800 px-3 py-2 text-sm hover:bg-slate-800"><Clock3 className="size-4 text-slate-500" /><span className="font-medium">{entry.startTime || "TBC"}</span><span className="truncate text-slate-400">{entry.title}</span></Link>)}
            {!snapshot.todaysPlanner.length ? <p className="text-sm text-slate-500">No planner entries today.</p> : null}
          </div>
        </Card>

        <Card className="border-red-400/20">
          <div className="flex items-center gap-3"><CircleAlert className="size-5 text-red-300" /><div><h3 className="font-semibold">Urgent actions</h3><p className="text-sm text-slate-500">Highest-priority issues found in saved records</p></div></div>
          <div className="mt-4 space-y-2">
            {snapshot.urgentActions.map((action) => <Link key={action.id} href={action.href} className="block rounded-lg border border-slate-800 px-3 py-2 hover:bg-slate-800"><span className="text-sm font-medium text-red-200">{action.title}</span><span className="mt-1 block text-xs text-slate-500">{action.detail}</span></Link>)}
            {!snapshot.urgentActions.length ? <p className="text-sm text-slate-500">No urgent actions detected.</p> : null}
          </div>
        </Card>
      </div>
    </section>
  );
}
