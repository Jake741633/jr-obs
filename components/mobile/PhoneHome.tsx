import Link from "next/link";
import { ArrowRight, LayoutGrid, Sparkles } from "lucide-react";
import { WorkspaceIcon } from "./WorkspaceIcon";

const shortcuts = [
  { label: "Jobs", detail: "Get to work", href: "/jobs", tone: "bg-cyan-400/15 text-cyan-300" },
  { label: "Quotes", detail: "Draft & price work", href: "/quotes/mobile", tone: "bg-violet-400/15 text-violet-300" },
  { label: "Customers", detail: "Find & contact", href: "/customers", tone: "bg-blue-400/15 text-blue-300" },
  { label: "Planner", detail: "Visits & bookings", href: "/planner", tone: "bg-amber-400/15 text-amber-300" },
  { label: "Materials", detail: "Codes & supplies", href: "/materials", tone: "bg-emerald-400/15 text-emerald-300" },
  { label: "Invoices", detail: "Review & get paid", href: "/invoices", tone: "bg-rose-400/15 text-rose-300" },
] as const;

export function PhoneHome() {
  return <section aria-labelledby="phone-home-title" className="space-y-5">
    <header className="flex items-center justify-between gap-3 px-1 pt-1">
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-wide text-cyan-300">JR Electrical Services</p>
        <h1 id="phone-home-title" className="mt-1 text-3xl font-bold tracking-tight">Let’s get to work</h1>
        <p className="mt-2 text-sm text-slate-400">Everything you need, a tap away.</p>
      </div>
    </header>

    <nav aria-label="Everyday tools" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {shortcuts.map(({ label, detail, href, tone }) => <Link key={href} href={href} className="group flex min-h-32 min-w-0 flex-col items-start justify-center rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm transition hover:border-slate-600 hover:bg-slate-900 active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 motion-reduce:transform-none motion-reduce:transition-none">
        <span className={`grid size-14 place-items-center rounded-2xl ${tone}`}><WorkspaceIcon href={href} className="size-8" /></span>
        <span className="mt-3 text-base font-bold text-white">{label}</span>
        <span className="mt-0.5 text-xs leading-5 text-slate-400">{detail}</span>
      </Link>)}
    </nav>

    <Link href="/ai/assistant" className="flex min-h-20 items-center gap-3 rounded-3xl border border-cyan-500/25 bg-gradient-to-r from-cyan-500/10 to-slate-900 px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-cyan-400 text-slate-950"><Sparkles aria-hidden="true" className="size-7" /></span>
      <span className="min-w-0 flex-1"><span className="block font-bold text-cyan-100">Ask JR AI</span><span className="mt-0.5 block text-xs leading-5 text-slate-400">What needs your attention today?</span></span>
      <ArrowRight aria-hidden="true" className="size-5 shrink-0 text-cyan-300" />
    </Link>

    <Link href="/menu" className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 px-4 text-sm font-semibold text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400">
      <span className="flex items-center gap-3"><LayoutGrid aria-hidden="true" className="size-6 text-slate-400" />All tools</span>
      <ArrowRight aria-hidden="true" className="size-5 text-slate-500" />
    </Link>
  </section>;
}
