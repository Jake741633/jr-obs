import Link from "next/link";
import { ArrowRight, Settings } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { secondaryNavigation } from "../../components/navigation";

export default function MenuPage() {
  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="JR OS"
        title="All workspaces"
        description="Open quotes, surveys, invoices, AI tools and every other JR OS workspace from your phone."
      />

      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          {secondaryNavigation.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-12 items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm font-semibold text-slate-200 hover:border-slate-700 hover:bg-slate-900"
            >
              <span>{label}</span>
              <ArrowRight className="size-4 text-cyan-300" />
            </Link>
          ))}
        </div>
      </Card>

      <Link
        href="/settings"
        className="flex min-h-12 items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200"
      >
        <span className="flex items-center gap-2"><Settings className="size-4 text-cyan-300" />Settings</span>
        <ArrowRight className="size-4 text-cyan-300" />
      </Link>
    </main>
  );
}
