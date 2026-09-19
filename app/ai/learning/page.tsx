"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  BriefcaseBusiness,
  CheckCircle2,
  Database,
  FileCheck2,
  PackageCheck,
  ReceiptText,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { AiConfidenceScore } from "../../../components/ai/AiConfidenceScore";
import { AiToolNav } from "../../../components/ai/AiToolNav";
import { WhyRecommendation } from "../../../components/ai/WhyRecommendation";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { buildAiMentor } from "../../../lib/aiLearning";
import { canAccessPath } from "../../../lib/cloud/permissions";
import { useCloudIdentity } from "../../../lib/cloud/useCloudIdentity";
import { defaultQuotePricingSettings } from "../../../lib/quoteEngine";
import { useLocalStorageCollection } from "../../../lib/storage";
import { useAiLearningMemory } from "../../../lib/useAiLearningMemory";
import type {
  Builder,
  Customer,
  CustomerInteraction,
  CustomerProfile,
  Invoice,
  Job,
  LabourCostSettings,
  Material,
  PricingDocument,
  QuotePricingSettings,
} from "../../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const defaultLabourSettings: LabourCostSettings = {
  id: "labour-cost-settings",
  workingDaysPerYear: 220,
  billableHoursPerDay: 7.5,
  targetNetMargin: 25,
  contingencyPercent: 10,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const mentorTone = {
  High: "border-red-500/25 bg-red-500/5 text-red-300",
  Medium: "border-amber-500/25 bg-amber-500/5 text-amber-300",
  Opportunity: "border-emerald-500/25 bg-emerald-500/5 text-emerald-300",
} as const;

export default function AiLearningPage() {
  const { identity, mode } = useCloudIdentity();
  const unrestricted = mode === "local" || (mode === "migration" && !identity);
  const canOpenSettings = unrestricted || canAccessPath(identity?.role, "/settings", identity?.email);
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const documents = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const builders = useLocalStorageCollection<Builder>("jr-os-builders");
  const profiles = useLocalStorageCollection<CustomerProfile>("jr-os-customer-profiles");
  const interactions = useLocalStorageCollection<CustomerInteraction>("jr-os-customer-interactions");
  const materials = useLocalStorageCollection<Material>("jr-os-materials");
  const labourSettingsStore = useLocalStorageCollection<LabourCostSettings>("jr-os-labour-cost-settings", [defaultLabourSettings]);
  const quoteSettingsStore = useLocalStorageCollection<QuotePricingSettings>("jr-os-quote-engine-settings", [defaultQuotePricingSettings]);
  const labourSettings = labourSettingsStore.items[0] ?? defaultLabourSettings;
  const quoteSettings = quoteSettingsStore.items[0] ?? defaultQuotePricingSettings;
  const learning = useAiLearningMemory({
    jobs: jobs.items,
    documents: documents.items,
    invoices: invoices.items,
    customers: customers.items,
    builders: builders.items,
    profiles: profiles.items,
    interactions: interactions.items,
    materials: materials.items,
  }, labourSettings);
  const mentor = useMemo(
    () => buildAiMentor({
      memory: learning.memory,
      documents: documents.items,
      jobs: jobs.items,
      invoices: invoices.items,
      labourSettings,
      quoteSettings,
    }),
    [documents.items, invoices.items, jobs.items, labourSettings, learning.memory, quoteSettings],
  );
  const ready = [
    jobs,
    documents,
    invoices,
    customers,
    builders,
    profiles,
    interactions,
    materials,
    labourSettingsStore,
    quoteSettingsStore,
  ].every((store) => store.isReady) && learning.isReady;

  if (!ready) return <Card>Preparing AI Learning Engine…</Card>;

  const memory = learning.memory;
  const activePatterns = memory.jobPatterns.filter((pattern) => pattern.successfulRecords || pattern.decidedQuotes);

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="JR AI"
        title="AI Learning Engine"
        description="See what JR OS has learned from accepted quotes, completed jobs, paid invoices, material usage and customer history—and inspect the evidence behind every recommendation."
        action={<Link href="/ai" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold hover:bg-slate-800"><ArrowLeft className="size-4" />Command Centre</Link>}
      />
      <AiToolNav />

      <Card className="border-cyan-400/30">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300"><Database className="size-6" /></span>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold">AI Memory is current</h2><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">Learning active</span></div>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">The memory refreshes when source records change. It stores learned summaries and source links under the same JR OS local-storage and backup pattern; original business records remain the source of truth.</p>
              <p className="mt-2 text-xs text-slate-500">Last refreshed {new Date(memory.learnedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · memory schema v{memory.schemaVersion}</p>
            </div>
          </div>
          {canOpenSettings ? <Link href="/settings" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 text-sm font-semibold hover:bg-slate-800">AI settings <ArrowRight className="size-4" /></Link> : null}
        </div>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Card><BriefcaseBusiness className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Completed jobs</p><p className="mt-2 text-3xl font-bold">{memory.completedJobs}</p></Card>
        <Card><FileCheck2 className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Accepted quotes</p><p className="mt-2 text-3xl font-bold">{memory.acceptedQuotes}</p></Card>
        <Card><ReceiptText className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Paid invoices</p><p className="mt-2 text-3xl font-bold">{memory.paidInvoices}</p></Card>
        <Card><PackageCheck className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Material signals</p><p className="mt-2 text-3xl font-bold">{memory.materialSignals}</p></Card>
        <Card><Users className="size-5 text-blue-300" /><p className="mt-3 text-sm text-slate-400">Customer histories</p><p className="mt-2 text-3xl font-bold">{memory.customerHistories}</p></Card>
        <Card><TrendingUp className="size-5 text-fuchsia-300" /><p className="mt-3 text-sm text-slate-400">Builder histories</p><p className="mt-2 text-3xl font-bold">{memory.builderHistories}</p></Card>
      </section>

      <AiConfidenceScore confidence={memory.confidence} />

      <Card>
        <div className="flex items-center gap-3"><TrendingUp className="size-6 text-cyan-300" /><div><h2 className="text-xl font-bold">Quote learning by job type</h2><p className="text-sm text-slate-500">Successful prices and labour are averages from saved outcomes, not fixed future prices.</p></div></div>
        {!activePatterns.length ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-700 p-8 text-center"><p className="font-semibold">No decided quote history yet</p><p className="mt-2 text-sm text-slate-500">Accept, decline and complete linked records to build job-type pricing evidence.</p></div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="border-b border-slate-800 px-3 py-3">Job type</th><th className="border-b border-slate-800 px-3 py-3">Successful records</th><th className="border-b border-slate-800 px-3 py-3">Average price</th><th className="border-b border-slate-800 px-3 py-3">Labour</th><th className="border-b border-slate-800 px-3 py-3">Net margin</th><th className="border-b border-slate-800 px-3 py-3">Conversion</th></tr></thead>
              <tbody>
                {activePatterns.map((pattern) => (
                  <tr key={pattern.jobType} className="border-b border-slate-800/70 last:border-0">
                    <td className="px-3 py-4 font-semibold">{pattern.jobType}</td>
                    <td className="px-3 py-4 text-slate-400">{pattern.successfulRecords} · {pattern.completedJobs} completed</td>
                    <td className="px-3 py-4 font-semibold">{pattern.averageSellingPrice ? money.format(pattern.averageSellingPrice) : "Not enough data"}</td>
                    <td className="px-3 py-4 text-slate-400">{pattern.averageLabourHours ? `${pattern.averageLabourHours.toFixed(1)} hrs` : "Not recorded"}</td>
                    <td className={`px-3 py-4 font-semibold ${pattern.averageNetMargin >= labourSettings.targetNetMargin ? "text-emerald-300" : pattern.averageNetMargin > 0 ? "text-amber-300" : "text-slate-500"}`}>{pattern.averageNetMargin ? `${pattern.averageNetMargin.toFixed(1)}%` : "Not recorded"}</td>
                    <td className="px-3 py-4 text-slate-400">{pattern.decidedQuotes ? `${pattern.conversionRate.toFixed(0)}% (${pattern.acceptedQuotes}/${pattern.decidedQuotes})` : "No decisions"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="flex items-center gap-3"><PackageCheck className="size-6 text-violet-300" /><div><h2 className="text-xl font-bold">Frequently used materials</h2><p className="text-sm text-slate-500">Products rise automatically when they appear in successful JR OS work.</p></div></div>
          {!memory.frequentMaterials.length ? (
            <p className="mt-5 rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No successful material usage has been recorded yet.</p>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {memory.frequentMaterials.slice(0, 8).map((material) => (
                <div key={material.key} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-bold">{material.description}</p><p className="mt-1 text-xs text-slate-500">{material.uses} successful use{material.uses === 1 ? "" : "s"} · {material.completedJobUses} completed</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${material.confidenceScore >= 75 ? "bg-emerald-500/10 text-emerald-300" : material.confidenceScore >= 45 ? "bg-amber-500/10 text-amber-300" : "bg-slate-800 text-slate-400"}`}>{material.confidenceScore}%</span></div>
                  <div className="mt-3 flex justify-between text-sm"><span className="text-slate-500">Average quantity</span><strong>{material.averageQuantity || "Not recorded"}</strong></div>
                  <div className="mt-1 flex justify-between text-sm"><span className="text-slate-500">Average trade cost</span><strong>{material.averageUnitCost ? money.format(material.averageUnitCost) : "Not recorded"}</strong></div>
                  <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-violet-300">Why recommended?</summary><div className="mt-3"><WhyRecommendation evidence={material.evidence.slice(0, 3)} showHeading={false} /></div></details>
                </div>
              ))}
            </div>
          )}
          <Link href="/ai/materials" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 text-sm font-semibold hover:bg-slate-800">Open Materials Assistant <ArrowRight className="size-4" /></Link>
        </Card>

        <Card>
          <WhyRecommendation
            evidence={memory.influentialRecords.slice(0, 7)}
            title="Most influential JR OS records"
            emptyMessage="Complete and link jobs, quotes and invoices to create traceable evidence."
          />
        </Card>
      </section>

      <Card className="border-fuchsia-400/20">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-fuchsia-500/10 text-fuchsia-300"><BrainCircuit className="size-6" /></span><div><p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300">AI Mentor</p><h2 className="mt-1 text-xl font-bold">Improve conversion and profitability</h2></div></div>
        {!mentor.length ? (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><CheckCircle2 className="size-5 text-emerald-300" /><p className="text-sm text-emerald-100">No material conversion or profitability issue is visible in the saved evidence. Keep recording outcomes and true costs.</p></div>
        ) : (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {mentor.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex items-start justify-between gap-3"><h3 className="font-bold">{item.title}</h3><span className={`shrink-0 rounded-full border px-2 py-1 text-xs font-semibold ${mentorTone[item.priority]}`}>{item.priority}</span></div>
                <p className="mt-3 text-sm text-slate-400">{item.detail}</p>
                <div className="mt-3 rounded-lg bg-slate-950 p-3 text-sm text-slate-300"><Sparkles className="mr-2 inline size-4 text-fuchsia-300" />{item.action}</div>
                <div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">{item.evidenceCount} supporting record{item.evidenceCount === 1 ? "" : "s"}</span><Link href={item.href} className="inline-flex items-center gap-1 text-sm font-semibold text-cyan-300">Take action <ArrowRight className="size-4" /></Link></div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-bold">Confidence increases with good records</h2><p className="mt-1 text-sm text-slate-500">Keep quote outcomes, actual labour, material costs, completion status and invoice payments current. JR OS stays cautious when evidence is missing.</p></div>
          <div className="flex flex-wrap gap-2"><Link href="/quotes" className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-4 text-sm font-semibold hover:bg-slate-800">Update quotes</Link><Link href="/jobs" className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-4 text-sm font-semibold hover:bg-slate-800">Update jobs</Link></div>
        </div>
      </Card>
    </main>
  );
}
