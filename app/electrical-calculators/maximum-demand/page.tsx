"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, CircleAlert, Plus, Trash2, Zap } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { InputField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { maximumDemandSummary } from "../../../lib/maximumDemandCalculator-core.mjs";

type LoadPhase = "L1" | "L2" | "L3" | "Three phase";
type LoadDraft = {
  id: string;
  description: string;
  quantity: string;
  connectedCurrentAmps: string;
  demandPercent: string;
  phase: LoadPhase;
};

const number = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

function newLoad(index: number): LoadDraft {
  return {
    id: `load-${Date.now()}-${index}`,
    description: `Load ${index}`,
    quantity: "1",
    connectedCurrentAmps: "0",
    demandPercent: "100",
    phase: "L1",
  };
}

export default function MaximumDemandPage() {
  const [loads, setLoads] = useState<LoadDraft[]>([
    { id: "load-1", description: "Lighting", quantity: "1", connectedCurrentAmps: "10", demandPercent: "66", phase: "L1" },
    { id: "load-2", description: "Socket outlets", quantity: "1", connectedCurrentAmps: "32", demandPercent: "40", phase: "L2" },
    { id: "load-3", description: "Three-phase equipment", quantity: "1", connectedCurrentAmps: "16", demandPercent: "100", phase: "Three phase" },
  ]);

  const result = useMemo(() => maximumDemandSummary({
    loads: loads.map((load) => ({
      id: load.id,
      description: load.description,
      quantity: Number(load.quantity),
      connectedCurrentAmps: Number(load.connectedCurrentAmps),
      demandFactor: Number(load.demandPercent) / 100,
      phase: load.phase,
    })),
  }), [loads]);

  function updateLoad(id: string, patch: Partial<LoadDraft>) {
    setLoads((current) => current.map((load) => load.id === id ? { ...load, ...patch } : load));
  }

  function addLoad() {
    setLoads((current) => [...current, newLoad(current.length + 1)]);
  }

  function removeLoad(id: string) {
    setLoads((current) => current.filter((load) => load.id !== id));
  }

  return (
    <main className="space-y-6">
      <Link href="/electrical-calculators" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200">
        <ArrowLeft className="size-4" /> Back to Electrical Calculators
      </Link>

      <PageHeader
        eyebrow="Electrical Design Suite"
        title="Maximum Demand"
        description="Build a diversified load schedule and compare connected current, per-phase demand and phase imbalance."
      />

      <Card className="border-amber-400/20 bg-amber-400/5">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-300" />
          <div>
            <h2 className="font-semibold text-amber-100">Designer-selected diversity</h2>
            <p className="mt-1 text-sm text-amber-100/70">Demand factors must be selected and justified for the actual installation. This calculator does not supply fixed BS 7671 diversity values.</p>
          </div>
        </div>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">Load schedule</h2>
            <p className="text-sm text-slate-500">Add each known load and assign it to L1, L2, L3 or all three phases.</p>
          </div>
          <button type="button" onClick={addLoad} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 font-bold text-slate-950 transition hover:bg-cyan-300">
            <Plus className="size-5" /> Add load
          </button>
        </div>

        <div className="space-y-4">
          {loads.map((load, index) => (
            <Card key={load.id}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">Load {index + 1}</p>
                  <h3 className="mt-1 font-semibold">{load.description || `Load ${index + 1}`}</h3>
                </div>
                <button type="button" aria-label={`Remove ${load.description || `load ${index + 1}`}`} onClick={() => removeLoad(load.id)} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-rose-400/30 text-rose-300 transition hover:bg-rose-400/10">
                  <Trash2 className="size-4" />
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <InputField label="Description" value={load.description} onChange={(event) => updateLoad(load.id, { description: event.target.value })} />
                <InputField label="Quantity" type="number" inputMode="numeric" min="1" step="1" value={load.quantity} onChange={(event) => updateLoad(load.id, { quantity: event.target.value })} />
                <InputField label="Connected current (A)" type="number" inputMode="decimal" min="0" step="0.1" value={load.connectedCurrentAmps} onChange={(event) => updateLoad(load.id, { connectedCurrentAmps: event.target.value })} />
                <InputField label="Demand factor (%)" type="number" inputMode="decimal" min="0" max="100" step="1" value={load.demandPercent} onChange={(event) => updateLoad(load.id, { demandPercent: event.target.value })} />
                <label className="grid min-w-0 gap-2 text-sm font-medium text-slate-300">
                  <span>Phase</span>
                  <select value={load.phase} onChange={(event) => updateLoad(load.id, { phase: event.target.value as LoadPhase })} className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-white outline-none transition focus:border-cyan-400 sm:min-h-11 sm:text-sm">
                    <option value="L1">L1</option>
                    <option value="L2">L2</option>
                    <option value="L3">L3</option>
                    <option value="Three phase">Three phase</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Connected total</p>
                  <p className="mt-1 text-lg font-bold">{number.format(result.loads[index]?.connectedTotalAmps ?? 0)} A</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Diversified current</p>
                  <p className="mt-1 text-lg font-bold text-cyan-200">{number.format(result.loads[index]?.diversifiedCurrentAmps ?? 0)} A</p>
                </div>
              </div>
            </Card>
          ))}

          {loads.length === 0 ? (
            <Card className="text-center">
              <Zap className="mx-auto size-8 text-slate-600" />
              <p className="mt-3 font-semibold">No loads added</p>
              <p className="mt-1 text-sm text-slate-500">Add a load to start the maximum-demand assessment.</p>
            </Card>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="border-cyan-400/30 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">Maximum phase demand</p>
          <p className="mt-4 text-5xl font-black text-cyan-100">{number.format(result.maximumPhaseDemandAmps)} A</p>
          <p className="mt-2 text-sm text-slate-500">Highest diversified current across L1, L2 and L3.</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Phase imbalance</p>
          <p className="mt-2 text-3xl font-bold">{number.format(result.phaseImbalanceAmps)} A</p>
          <p className="mt-2 text-sm text-slate-500">Difference between the highest and lowest phase.</p>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card><p className="text-sm text-slate-400">Connected current</p><p className="mt-2 text-2xl font-bold">{number.format(result.totalConnectedCurrentAmps)} A</p></Card>
        <Card><p className="text-sm text-slate-400">Diversified current</p><p className="mt-2 text-2xl font-bold">{number.format(result.totalDiversifiedCurrentAmps)} A</p></Card>
        <Card><p className="text-sm text-slate-400">Overall demand factor</p><p className="mt-2 text-2xl font-bold">{number.format(result.overallDemandFactor * 100)}%</p></Card>
        <Card><p className="text-sm text-slate-400">L1 demand</p><p className="mt-2 text-2xl font-bold">{number.format(result.phaseDemandAmps.L1)} A</p></Card>
        <Card><p className="text-sm text-slate-400">L2 / L3 demand</p><p className="mt-2 text-xl font-bold">{number.format(result.phaseDemandAmps.L2)} A / {number.format(result.phaseDemandAmps.L3)} A</p></Card>
      </section>

      <Card>
        <h2 className="font-semibold">Assumptions and limitations</h2>
        <div className="mt-3 grid gap-2">
          {result.assumptions.map((assumption: string) => <p key={assumption} className="text-sm text-slate-400">• {assumption}</p>)}
        </div>
      </Card>
    </main>
  );
}
