"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, CircleAlert, ShieldCheck } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { InputField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { adiabaticSummary } from "../../../lib/adiabaticCalculator-core.mjs";
import { formatCalculatorNumber as format } from "../../../lib/electricalCalculatorNumbers-core.mjs";

const blankInputs = { faultCurrentAmps: "", disconnectionTimeSeconds: "", letThroughEnergyA2s: "", conductorSizeMm2: "", kFactor: "" };

export default function AdiabaticCalculatorPage() {
  const [method, setMethod] = useState<"current-time" | "energy">("current-time");
  const [inputs, setInputs] = useState(blankInputs);
  const result = useMemo(() => adiabaticSummary({ ...inputs, method }), [inputs, method]);
  function updateInput(field: keyof typeof blankInputs, value: string) {
    setInputs((previous) => ({ ...previous, [field]: value }));
  }
  const status = !result.hasCompleteInputs ? "Assessment unavailable" : result.conductorIsAdequate ? "Meets entered thermal check" : "Below required thermal size";
  const statusClass = !result.hasCompleteInputs ? "text-amber-300" : result.conductorIsAdequate ? "text-emerald-300" : "text-rose-300";

  return <main className="space-y-6">
    <PageHeader eyebrow="Electrical Calculators" title="Adiabatic CPC sizing" description="Compare a circuit protective conductor with the thermal stress from verified device and fault data." />
    <Link href="/electrical-calculators" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-300 hover:border-cyan-400 hover:text-cyan-100"><ArrowLeft className="size-4" />Back to calculators</Link>

    <Card className="border-amber-400/20 bg-amber-400/5">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-300" />
        <div><h2 className="font-semibold text-amber-100">Design aid only</h2><p className="mt-1 text-sm text-amber-100/70">This is a thermal check, not final cable selection or compliance approval. Verify current BS 7671, manufacturer data, mechanical minimum sizes, fault protection and actual installation conditions.</p></div>
      </div>
    </Card>

    <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
      <Card>
        <h2 className="font-semibold">Verified design inputs</h2>
        <div role="group" aria-label="Calculation method" className="mt-4 grid gap-2 sm:grid-cols-2">
          {([['current-time', 'Fault current and time'], ['energy', 'Manufacturer I²t']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={method === value} onClick={() => setMethod(value)} className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-semibold ${method === value ? "border-cyan-400 bg-cyan-400/10 text-cyan-100" : "border-slate-700 text-slate-300"}`}>{label}</button>)}
        </div>
        <p className="mt-3 text-sm text-slate-400">{method === "energy" ? "Enter total let-through energy for the actual device, voltage and fault-current range. Confirm its clearing time is no more than 5 seconds." : "Use matched RMS fault current and actual device clearing time from 0.1 to 5 seconds. For shorter times or current-limiting devices, choose Manufacturer I²t."}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {method === "current-time" ? <InputField label="Fault current (A)" type="number" inputMode="decimal" min="0" step="any" value={inputs.faultCurrentAmps} onChange={(event) => updateInput("faultCurrentAmps", event.target.value)} /> : <InputField label="Verified let-through I²t (A²s)" type="number" inputMode="decimal" min="0" step="any" value={inputs.letThroughEnergyA2s} onChange={(event) => updateInput("letThroughEnergyA2s", event.target.value)} />}
          <InputField label="Device disconnection time (s)" type="number" inputMode="decimal" min="0" max="5" step="any" value={inputs.disconnectionTimeSeconds} onChange={(event) => updateInput("disconnectionTimeSeconds", event.target.value)} />
          <InputField label="Verified k-factor (A√s/mm²)" type="number" inputMode="decimal" min="0" step="any" value={inputs.kFactor} onChange={(event) => updateInput("kFactor", event.target.value)} />
          <InputField label="Proposed CPC size (mm²)" type="number" inputMode="decimal" min="0" step="any" value={inputs.conductorSizeMm2} onChange={(event) => updateInput("conductorSizeMm2", event.target.value)} />
        </div>
        <p className="mt-3 text-xs text-slate-400">The k-factor must match the conductor material, insulation and initial/final temperatures. It is not selected automatically.</p>
        {result.errors.length > 0 ? <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-amber-200">{result.errors.map((error: string) => <li key={error}>{error}</li>)}</ul> : null}
        <button type="button" onClick={() => { setInputs(blankInputs); setMethod("current-time"); }} className="mt-5 min-h-11 rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-300">Clear inputs</button>
      </Card>

      <div className="space-y-4">
        <Card>
          <ShieldCheck className="size-6 text-cyan-300" />
          <h2 className="mt-4 text-sm font-semibold text-slate-300">Required thermal area</h2>
          <p className="mt-2 break-words text-4xl font-black">{format(result.requiredConductorSizeMm2)} mm²</p>
          <p role="status" aria-live="polite" className={`mt-4 text-sm font-semibold ${statusClass}`}>{status}</p>
          <p className="mt-2 text-sm text-slate-400">Proposed CPC: {format(result.conductorSizeMm2)} mm²</p>
          <p className="mt-2 text-xs text-slate-400">Displayed values are rounded. The assessment uses unrounded values and does not select a standard cable size.</p>
        </Card>
        <Card>
          <h2 className="font-semibold">Calculation evidence</h2>
          <p className="mt-2 text-sm text-slate-400">{method === "current-time" ? "I²t = I × I × t; S = √(I²t) ÷ k" : "S = √(manufacturer I²t) ÷ k"}</p>
          <dl className="mt-4 space-y-4">
            <div><dt className="text-sm text-slate-400">Fault energy I²t</dt><dd className="break-words text-xl font-bold">{format(result.faultEnergyA2s)} A²s</dd></div>
            <div><dt className="text-sm text-slate-400">Proposed CPC withstand k²S²</dt><dd className="break-words text-xl font-bold">{format(result.conductorWithstandA2s)} A²s</dd></div>
            <div><dt className="text-sm text-slate-400">Area margin</dt><dd className="break-words text-xl font-bold">{format(result.sizeMarginMm2)} mm²</dd></div>
            {method === "current-time" ? <div><dt className="text-sm text-slate-400">Thermal current limit at entered time</dt><dd className="break-words text-xl font-bold">{format(result.maximumFaultCurrentAmps)} A</dd></div> : null}
          </dl>
        </Card>
      </div>
    </div>

    <Card><h2 className="font-semibold">Assumptions and limits</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-400">{result.assumptions.map((assumption: string) => <li key={assumption}>{assumption}</li>)}</ul></Card>
  </main>;
}
