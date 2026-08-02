"use client";

import Link from "next/link";
import { AlertTriangle, ClipboardList, PackageOpen, ShieldAlert, UsersRound } from "lucide-react";
import { useSiteDiariesCollection } from "../../lib/cloud/coreBusinessCollections";
import { siteDiaryAttentionSummary } from "../../lib/siteDiaryAttention-core.mjs";
import { Card } from "../ui/Card";

type SiteDiaryAttentionItem = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  priority: "Urgent" | "High" | "Normal";
  dueDate: string;
  href: string;
};

const priorityTone = {
  Urgent: "border-rose-400/30 bg-rose-400/5 text-rose-100",
  High: "border-amber-400/30 bg-amber-400/5 text-amber-100",
  Normal: "border-slate-700 bg-slate-950 text-slate-200",
} as const;

const kindIcon = {
  Materials: PackageOpen,
  Safety: ShieldAlert,
  Customer: UsersRound,
  Builder: UsersRound,
  Delay: AlertTriangle,
  "Follow-up": ClipboardList,
} as const;

export function SiteDiaryAttentionPanel() {
  const diaries = useSiteDiariesCollection();
  const summary = siteDiaryAttentionSummary(diaries.items) as {
    total: number;
    urgent: number;
    materials: number;
    items: SiteDiaryAttentionItem[];
  };

  if (!diaries.isReady) return <Card>Loading site diary actions…</Card>;

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">Site diary intelligence</p>
        <h2 className="mt-1 text-2xl font-bold">Daily progress actions</h2>
        <p className="mt-1 text-sm text-slate-400">Derived from existing cloud and offline diary records. No duplicate tasks are created.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><p className="text-sm text-slate-400">Open actions</p><p className="mt-2 text-3xl font-black">{summary.total}</p></Card>
        <Card><p className="text-sm text-slate-400">Urgent site issues</p><p className="mt-2 text-3xl font-black text-rose-300">{summary.urgent}</p></Card>
        <Card><p className="text-sm text-slate-400">Materials required</p><p className="mt-2 text-3xl font-black text-amber-300">{summary.materials}</p></Card>
      </div>

      <Card className="space-y-3">
        {summary.items.slice(0, 8).map((item: SiteDiaryAttentionItem) => {
          const Icon = kindIcon[item.kind as keyof typeof kindIcon] ?? ClipboardList;
          const tone = priorityTone[item.priority] ?? priorityTone.Normal;
          return (
            <Link key={item.id} href={item.href} className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition hover:border-cyan-400/30 ${tone}`}>
              <Icon className="mt-0.5 size-5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">{item.title}</strong>
                  <span className="text-xs uppercase tracking-wide opacity-70">{item.priority}</span>
                </span>
                <span className="mt-1 block text-sm opacity-80">{item.detail}</span>
                <span className="mt-1 block text-xs opacity-60">{item.dueDate || "No date recorded"}</span>
              </span>
            </Link>
          );
        })}
        {!summary.items.length ? <p className="text-sm text-emerald-300">No site diary actions need attention.</p> : null}
      </Card>
    </section>
  );
}
