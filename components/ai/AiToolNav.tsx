import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  Calculator,
  CalendarCheck2,
  FilePenLine,
  PackageSearch,
  WandSparkles,
} from "lucide-react";

const tools = [
  {
    title: "Today's Assistant",
    detail: "Jobs, reminders and urgent work",
    href: "/ai#today",
    icon: CalendarCheck2,
    colour: "text-cyan-300",
  },
  {
    title: "AI Quote Builder",
    detail: "Turn notes or a transcript into a draft",
    href: "/ai/quote-builder",
    icon: FilePenLine,
    colour: "text-violet-300",
  },
  {
    title: "Materials Assistant",
    detail: "Suggest a job materials list",
    href: "/ai/materials",
    icon: PackageSearch,
    colour: "text-amber-300",
  },
  {
    title: "Pricing Assistant",
    detail: "Recover labour and overhead correctly",
    href: "/ai/pricing",
    icon: Calculator,
    colour: "text-emerald-300",
  },
  {
    title: "Business Coach",
    detail: "Revenue, margins and trends",
    href: "/ai/business-coach",
    icon: BrainCircuit,
    colour: "text-fuchsia-300",
  },
  {
    title: "AI Action Centre",
    detail: "Move records to the next stage",
    href: "/ai#action-centre",
    icon: WandSparkles,
    colour: "text-blue-300",
  },
] as const;

export function AiToolNav() {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tools.map(({ title, detail, href, icon: Icon, colour }) => (
        <Link
          key={title}
          href={href}
          className="group flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 transition hover:border-cyan-400/30 hover:bg-slate-900"
        >
          <span className={`grid size-11 shrink-0 place-items-center rounded-xl bg-slate-950 ${colour}`}>
            <Icon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-sm text-white">{title}</strong>
            <span className="mt-1 block text-xs text-slate-500">{detail}</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-cyan-300" />
        </Link>
      ))}
    </section>
  );
}
