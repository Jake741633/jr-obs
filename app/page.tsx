import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CalendarDays, FileText, PoundSterling, Users } from "lucide-react";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";

const metrics = [
  { label: "Active jobs", value: "3", detail: "1 starting this week", icon: BriefcaseBusiness },
  { label: "Open quotes", value: "7", detail: "£18,450 pipeline", icon: FileText },
  { label: "Outstanding", value: "£3,280", detail: "2 invoices overdue", icon: PoundSterling },
  { label: "Customers", value: "24", detail: "4 added this month", icon: Users },
];

export default function Home() {
  return <div className="space-y-6"><PageHeader eyebrow="Owner dashboard" title="Command Centre" description="A clear view of today, your pipeline and the next actions that keep JR Electrical moving." action={<Link href="/jobs" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950">Open jobs <ArrowRight className="size-4" /></Link>} />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, detail, icon: Icon }) => <Card key={label}><div className="flex items-start justify-between"><div><p className="text-sm text-slate-400">{label}</p><p className="mt-3 text-3xl font-black tracking-tight">{value}</p></div><span className="rounded-xl bg-slate-800 p-2 text-cyan-300"><Icon className="size-5" /></span></div><p className="mt-3 text-xs text-slate-500">{detail}</p></Card>)}</section>
    <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]"><Card><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Today</h2><p className="text-sm text-slate-500">Wednesday, 29 July</p></div><CalendarDays className="size-5 text-cyan-300" /></div><div className="mt-5 space-y-3">{[["08:00", "Commercial lighting survey", "Virgin Media office"],["13:30", "Rewire quote visit", "Epsom"],["16:30", "Call supplier", "Confirm consumer unit stock"]].map(([time,title,detail]) => <div key={time} className="flex gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4"><span className="text-sm font-bold text-cyan-300">{time}</span><div><p className="font-medium">{title}</p><p className="text-sm text-slate-500">{detail}</p></div></div>)}</div></Card>
    <Card><h2 className="text-lg font-bold">Quick actions</h2><p className="mt-1 text-sm text-slate-500">Jump straight into common work.</p><div className="mt-5 grid gap-3">{[["Add customer","/customers"],["Create job","/jobs"],["Prepare quote","/quotes"],["Record payment","/invoices"]].map(([label,href]) => <Link key={href} href={href} className="flex items-center justify-between rounded-xl border border-slate-800 px-4 py-3 text-sm font-medium text-slate-300 hover:border-slate-700 hover:bg-slate-800">{label}<ArrowRight className="size-4" /></Link>)}</div></Card></section>
  </div>;
}
