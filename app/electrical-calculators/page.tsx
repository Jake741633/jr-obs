"use client";

import { useMemo, useState } from "react";
import { Calculator, CircleAlert, Gauge, Zap } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { InputField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { electricalLoadSummary } from "../../lib/electricalCalculators-core.mjs";

type Phase = "Single phase" | "Three phase";

const number = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

export default function ElectricalCalculatorsPage() {
  const [phase, setPhase] = useState<Phase>("Single phase");
  const [powerKw, setPowerKw] = useState("3");
  const [voltage, setVoltage] = useState("230");
  const [powerFactor, setPowerFactor] = useState("1");
  const [efficiency, setEfficiency] = useState("1");

  const result = useMemo(() => electricalLoadSummary({
    phase,
    powerWatts: Number(powerKw) * 1000,
    voltage: Number(voltage),
    powerFactor: Number(powerFactor),
    efficiency: Number(efficiency),
  }), [efficiency, phase, powerFactor, powerKw, voltage]);

  function selectPhase(nextPhase: Phase) {
    setPhase(nextPhase);
    setVoltage(nextPhase === "Three phase" ? "400" : "230");
  }

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Electrical Calculators"
        title="Load and current"
        description="Calculate design current for single-phase and three-phase loads with visible assumptions."
      />

      <Card className="border-amber-400/20 bg-amber-400/5">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-300" />
          <div>
            <h2 className="font-semibold text-amber-100">Design aid only</h2>
            <p className="mt-1 text-sm text-amber-100/70">This calculator does not select a cable, protective device or confirm compliance. Verify all results against the current BS 7671 tables, manufacturer data and actual installation conditions.</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><Calculator className="size-5" /></span>
            <div><h2 className="font-semibold">Load details</h2><p className="text-sm text-slate-500">Enter the known electrical load values.</p></div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-300 sm:col-span-2">
              <span>Supply phase</span>
              <span className="grid grid-cols-2 gap-2">
                {(["Single phase", "Three phase"] as const).map((option) => (
                  <button key={option} type="button" onClick={() => selectPhase(option)} className={`min-h-12 rounded-xl border px-4 text-sm font-semibold ${phase === option ? "border-cyan-400 bg-cyan-400/10 text-cyan-100" : "border-slate-700 bg-slate-950 text-slate-300"}`}>
                    {option}
                  </button>
                ))}
              </span>
            </label>
            <InputField label="Active power" type="number" inputMode="decimal" min="0" step="0.1" value={powerKw} onChange={(event) => setPowerKw(event.target.value)} suffix="kW" />
            <InputField label="Voltage" type="number" inputMode="decimal" min="0" step="1" value={voltage} onChange={(event) => setVoltage(event.target.value)} suffix="V" />
            <InputField label="Power factor" type="number" inputMode="decimal" min="0.01" max="1" step="0.01" value={powerFactor} onChange={(event) => setPowerFactor(event.target.value)} />
            <InputField label="Efficiency" type="number" inputMode="decimal" min="0.01" max="1" step="0.01" value={efficiency} onChange={(event) => setEfficiency(event.target.value)} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="border-cyan-400/30">
            <div className="flex items-center justify-between"><Gauge className="size-6 text-cyan-300" /><span className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">Calculated current</span></div>
            <p className="mt-5 text-5xl font-black text-cyan-100">{number.format(result.currentAmps)} A</p>
            <p className="mt-2 text-sm text-slate-500">Based on {result.phase.toLowerCase()} supply at {number.format(result.voltage)} V.</p>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card><Zap className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Active power</p><p className="mt-1 text-2xl font-bold">{number.format(result.powerWatts / 1000)} kW</p></Card>
            <Card><Zap className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Apparent power</p><p className="mt-1 text-2xl font-bold">{number.format(result.apparentPowerVa / 1000)} kVA</p></Card>
          </div>

          <Card>
            <h2 className="font-semibold">Assumptions used</h2>
            <div className="mt-3 space-y-2">
              {result.assumptions.map((assumption: string) => <p key={assumption} className="rounded-lg bg-slate-950 px-3 py-2 text-sm text-slate-400">{assumption}</p>)}
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
