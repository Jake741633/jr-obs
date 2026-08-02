"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Calculator, Cable, CircleAlert, Gauge, Route, Scale, Zap } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { InputField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { cableSizingSummary } from "../../lib/cableSizingCalculator-core.mjs";
import { electricalLoadSummary } from "../../lib/electricalCalculators-core.mjs";
import { voltageDropSummary } from "../../lib/voltageDropCalculator-core.mjs";

type Phase = "Single phase" | "Three phase";
type CableOption = {
  sizeMm2: number;
  tabulatedCurrentAmps: number;
};

const number = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

export default function ElectricalCalculatorsPage() {
  const [phase, setPhase] = useState<Phase>("Single phase");
  const [powerKw, setPowerKw] = useState("3");
  const [voltage, setVoltage] = useState("230");
  const [powerFactor, setPowerFactor] = useState("1");
  const [efficiency, setEfficiency] = useState("1");
  const [routeLength, setRouteLength] = useState("20");
  const [millivoltsPerAmpMetre, setMillivoltsPerAmpMetre] = useState("18");
  const [maximumPercent, setMaximumPercent] = useState("3");
  const [ambientTemperatureFactor, setAmbientTemperatureFactor] = useState("1");
  const [groupingFactor, setGroupingFactor] = useState("1");
  const [insulationFactor, setInsulationFactor] = useState("1");
  const [otherFactor, setOtherFactor] = useState("1");
  const [cableSizeMm2, setCableSizeMm2] = useState("2.5");
  const [tabulatedCurrentAmps, setTabulatedCurrentAmps] = useState("27");

  const result = useMemo(() => electricalLoadSummary({
    phase,
    powerWatts: Number(powerKw) * 1000,
    voltage: Number(voltage),
    powerFactor: Number(powerFactor),
    efficiency: Number(efficiency),
  }), [efficiency, phase, powerFactor, powerKw, voltage]);

  const voltageDrop = useMemo(() => voltageDropSummary({
    phase,
    nominalVoltage: Number(voltage),
    designCurrentAmps: result.currentAmps,
    routeLengthMetres: Number(routeLength),
    millivoltsPerAmpMetre: Number(millivoltsPerAmpMetre),
    maximumPercent: Number(maximumPercent),
  }), [maximumPercent, millivoltsPerAmpMetre, phase, result.currentAmps, routeLength, voltage]);

  const cableOptions = useMemo<CableOption[]>(() => [{
    sizeMm2: Number(cableSizeMm2),
    tabulatedCurrentAmps: Number(tabulatedCurrentAmps),
  }], [cableSizeMm2, tabulatedCurrentAmps]);

  const cableSizing = useMemo(() => cableSizingSummary({
    designCurrentAmps: result.currentAmps,
    ambientTemperatureFactor: Number(ambientTemperatureFactor),
    groupingFactor: Number(groupingFactor),
    insulationFactor: Number(insulationFactor),
    otherFactor: Number(otherFactor),
    cableOptions,
  }), [ambientTemperatureFactor, cableOptions, groupingFactor, insulationFactor, otherFactor, result.currentAmps]);

  function selectPhase(nextPhase: Phase) {
    setPhase(nextPhase);
    setVoltage(nextPhase === "Three phase" ? "400" : "230");
  }

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Electrical Calculators"
        title="Load, current, voltage drop and cable sizing"
        description="Calculate design current, assess voltage drop and check a verified cable option against correction factors."
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Link href="/electrical-calculators/cable-sizing" className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-400/15">
          <span className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cyan-300/15"><Cable className="size-5" /></span>
            <span>
              <span className="block font-bold">Open dedicated Cable Sizing</span>
              <span className="block text-sm text-cyan-100/70">Full mobile workflow with verified inputs and locally saved recent calculations.</span>
            </span>
          </span>
          <ArrowRight className="size-5 shrink-0" />
        </Link>

        <Link href="/electrical-calculators/maximum-demand" className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-violet-400/30 bg-violet-400/10 px-4 py-3 text-violet-100 transition hover:border-violet-300 hover:bg-violet-400/15">
          <span className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-300/15"><Scale className="size-5" /></span>
            <span>
              <span className="block font-bold">Open Maximum Demand</span>
              <span className="block text-sm text-violet-100/70">Build a diversified load schedule and review L1, L2, L3 and highest-phase demand.</span>
            </span>
          </span>
          <ArrowRight className="size-5 shrink-0" />
        </Link>
      </div>

      <Card className="border-amber-400/20 bg-amber-400/5">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-300" />
          <div>
            <h2 className="font-semibold text-amber-100">Design aid only</h2>
            <p className="mt-1 text-sm text-amber-100/70">These calculators do not confirm compliance. Cable ratings and correction factors must come from current BS 7671 tables or manufacturer data for the actual installation method.</p>
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
            <InputField label="Active power (kW)" type="number" inputMode="decimal" min="0" step="0.1" value={powerKw} onChange={(event) => setPowerKw(event.target.value)} />
            <InputField label="Voltage (V)" type="number" inputMode="decimal" min="0" step="1" value={voltage} onChange={(event) => setVoltage(event.target.value)} />
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
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-violet-400/10 text-violet-300"><Route className="size-5" /></span>
            <div><h2 className="font-semibold">Voltage drop</h2><p className="text-sm text-slate-500">Uses the calculated design current above.</p></div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <InputField label="Route length (m)" type="number" inputMode="decimal" min="0" step="0.1" value={routeLength} onChange={(event) => setRouteLength(event.target.value)} />
            <InputField label="Conductor value (mV/A/m)" type="number" inputMode="decimal" min="0" step="0.1" value={millivoltsPerAmpMetre} onChange={(event) => setMillivoltsPerAmpMetre(event.target.value)} />
            <InputField label="Selected maximum drop (%)" type="number" inputMode="decimal" min="0" step="0.1" value={maximumPercent} onChange={(event) => setMaximumPercent(event.target.value)} />
            <InputField label="Design current (A)" type="number" value={number.format(result.currentAmps)} readOnly />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className={voltageDrop.withinSelectedLimit ? "border-emerald-400/30" : "border-rose-400/30"}>
            <div className="flex items-center justify-between"><Route className="size-6 text-violet-300" /><span className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Calculated voltage drop</span></div>
            <p className="mt-5 text-5xl font-black">{number.format(voltageDrop.voltageDropVolts)} V</p>
            <p className="mt-2 text-sm text-slate-400">{number.format(voltageDrop.voltageDropPercent)}% of {number.format(voltageDrop.nominalVoltage)} V.</p>
            <p className={`mt-4 text-sm font-semibold ${voltageDrop.withinSelectedLimit ? "text-emerald-300" : "text-rose-300"}`}>
              {voltageDrop.withinSelectedLimit ? "Within selected limit" : "Exceeds selected limit"}
            </p>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card><p className="text-sm text-slate-400">Maximum permitted</p><p className="mt-1 text-2xl font-bold">{number.format(voltageDrop.maximumVoltageDropVolts)} V</p></Card>
            <Card><p className="text-sm text-slate-400">Remaining allowance</p><p className="mt-1 text-2xl font-bold">{number.format(voltageDrop.remainingVoltageDropVolts)} V</p></Card>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300"><Cable className="size-5" /></span>
            <div><h2 className="font-semibold">Cable sizing check</h2><p className="text-sm text-slate-500">Enter verified correction factors and one verified cable rating.</p></div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <InputField label="Ambient temperature factor" type="number" inputMode="decimal" min="0.01" max="1" step="0.01" value={ambientTemperatureFactor} onChange={(event) => setAmbientTemperatureFactor(event.target.value)} />
            <InputField label="Grouping factor" type="number" inputMode="decimal" min="0.01" max="1" step="0.01" value={groupingFactor} onChange={(event) => setGroupingFactor(event.target.value)} />
            <InputField label="Thermal insulation factor" type="number" inputMode="decimal" min="0.01" max="1" step="0.01" value={insulationFactor} onChange={(event) => setInsulationFactor(event.target.value)} />
            <InputField label="Other correction factor" type="number" inputMode="decimal" min="0.01" max="1" step="0.01" value={otherFactor} onChange={(event) => setOtherFactor(event.target.value)} />
            <InputField label="Verified cable size (mm²)" type="number" inputMode="decimal" min="0" step="0.5" value={cableSizeMm2} onChange={(event) => setCableSizeMm2(event.target.value)} />
            <InputField label="Verified tabulated rating (A)" type="number" inputMode="decimal" min="0" step="0.1" value={tabulatedCurrentAmps} onChange={(event) => setTabulatedCurrentAmps(event.target.value)} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className={cableSizing.selectedCable ? "border-emerald-400/30" : "border-rose-400/30"}>
            <div className="flex items-center justify-between"><Cable className="size-6 text-emerald-300" /><span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Cable rating check</span></div>
            <p className="mt-5 text-4xl font-black">{cableSizing.selectedCable ? `${number.format(cableSizing.selectedCable.sizeMm2)} mm²` : "Not suitable"}</p>
            <p className="mt-2 text-sm text-slate-400">Required tabulated capacity: {number.format(cableSizing.requiredTabulatedCurrentAmps)} A.</p>
            <p className={`mt-4 text-sm font-semibold ${cableSizing.selectedCable ? "text-emerald-300" : "text-rose-300"}`}>
              {cableSizing.selectedCable ? "Verified option meets current-capacity check" : "Verified option does not meet current-capacity check"}
            </p>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card><p className="text-sm text-slate-400">Combined correction factor</p><p className="mt-1 text-2xl font-bold">{number.format(cableSizing.combinedCorrectionFactor)}</p></Card>
            <Card><p className="text-sm text-slate-400">Entered tabulated rating</p><p className="mt-1 text-2xl font-bold">{number.format(Number(tabulatedCurrentAmps))} A</p></Card>
          </div>
        </div>
      </div>

      <Card>
        <h2 className="font-semibold">Assumptions used</h2>
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {[...result.assumptions, ...voltageDrop.assumptions, ...cableSizing.assumptions].map((assumption: string, index: number) => <p key={`${index}-${assumption}`} className="text-sm text-slate-400">• {assumption}</p>)}
        </div>
      </Card>
    </main>
  );
}
