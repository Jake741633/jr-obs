"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, CircleAlert, RotateCcw, ShieldCheck } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { InputField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { SaveCalculation } from "../../../components/calculators/CalculationRecords";
import { protectiveDeviceSummary } from "../../../lib/protectiveDeviceCalculator-core.mjs";
import { formatCalculatorNumber as format } from "../../../lib/electricalCalculatorNumbers-core.mjs";

const emptyInputs = {
  deviceReference: "", evidenceReference: "", designCurrentAmps: "", deviceRatingAmps: "",
  cableCapacityAmps: "", overloadOperatingCurrentAmps: "", breakingCapacityKa: "", prospectiveFaultCurrentKa: "",
};
const numericFields = [
  ["designCurrentAmps", "Design current Ib (A)"],
  ["deviceRatingAmps", "Device rating or overload setting In/Ir (A)"],
  ["cableCapacityAmps", "Verified corrected cable capacity Iz (A)"],
  ["overloadOperatingCurrentAmps", "Conventional overload operating current I2 (A)"],
  ["breakingCapacityKa", "Verified device breaking capacity (kA)"],
  ["prospectiveFaultCurrentKa", "Maximum prospective fault current (kA)"],
] as const;

export default function ProtectiveDevicePage() {
  const [inputs, setInputs] = useState(emptyInputs);
  const result = useMemo(() => protectiveDeviceSummary(inputs), [inputs]);
  const status = !result.hasCompleteInputs ? "Assessment unavailable" : result.meetsEnteredChecks ? "Meets entered checks" : "Review required";
  const checks = [
    { title: "Load and device", equation: "Ib ≤ In/Ir", pass: result.loadWithinRating, values: `${format(result.designCurrentAmps)} A ≤ ${format(result.deviceRatingAmps)} A`, failure: "The device rating or overload setting is below design current." },
    { title: "Device and cable", equation: "In/Ir ≤ Iz", pass: result.ratingWithinCable, values: `${format(result.deviceRatingAmps)} A ≤ ${format(result.cableCapacityAmps)} A`, failure: "The device rating or overload setting exceeds corrected cable capacity." },
    { title: "Conventional overload", equation: "I2 ≤ 1.45 × Iz", pass: result.overloadWithinLimit, values: `${format(result.overloadOperatingCurrentAmps)} A ≤ ${format(result.maximumOverloadOperatingCurrentAmps)} A`, failure: "The overload operating current exceeds the entered conductor limit." },
    { title: "Breaking capacity", equation: "Device capacity ≥ maximum PFC", pass: result.breakingCapacityAdequate, values: `${format(result.breakingCapacityKa)} kA ≥ ${format(result.prospectiveFaultCurrentKa)} kA`, failure: "The entered stand-alone breaking capacity is below maximum prospective fault current." },
  ];

  function update(key: keyof typeof emptyInputs, value: string) {
    setInputs((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className="space-y-6">
      <Link href="/electrical-calculators" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-cyan-300"><ArrowLeft className="size-4" />Back to Electrical Calculators</Link>
      <PageHeader eyebrow="Electrical Design Suite" title="Protective Device Checks" description="Compare a proposed device with verified load, cable, overload and fault-current evidence." />
      <Card className="border-amber-400/20 bg-amber-400/5">
        <div className="flex items-start gap-3"><CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-300" /><div><h2 className="font-semibold text-amber-100">Design aid only</h2><p className="mt-1 text-sm text-amber-100/80">These checks do not confirm compliance or select a protective device. Use current BS 7671 and manufacturer data for the actual installation. Coordination, selectivity, disconnection time and thermal withstand require separate verification.</p></div></div>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-cyan-300" />Verified design inputs</h2><button type="button" onClick={() => setInputs({ ...emptyInputs })} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-3 text-sm font-semibold"><RotateCcw className="size-4" />Clear inputs</button></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><InputField label="Device identification and standard" value={inputs.deviceReference} onChange={(event) => update("deviceReference", event.target.value)} placeholder="Manufacturer, model, standard, rating or setting" /></div>
            <div className="sm:col-span-2"><InputField label="Manufacturer and circuit evidence references" value={inputs.evidenceReference} onChange={(event) => update("evidenceReference", event.target.value)} placeholder="Data sheet/revision, design voltage, cable and maximum PFC evidence" /></div>
            {numericFields.map(([key, label]) => <InputField key={key} label={label} type="number" inputMode="decimal" min="0" step="any" value={inputs[key]} onChange={(event) => update(key, event.target.value)} />)}
          </div>
          <div className="mt-5 space-y-2 text-sm text-slate-400">
            <p>Iz is the verified capacity after all applicable corrections, not the tabulated rating. In/Ir is the rating or actual overload setting, not an adjustable breaker’s frame rating.</p>
            <p>I2 is the conventional overload operating current. Enter it from verified device data; no B/C/D curve multiplier is assumed.</p>
            <p>Breaking capacity and maximum PFC use kA. Verify the capacity category and voltage against the applicable device standard. No upstream backup rating is assumed.</p>
          </div>
        </Card>
        <div className="space-y-4">
          <Card className={!result.hasCompleteInputs ? "border-slate-700" : result.meetsEnteredChecks ? "border-emerald-400/30" : "border-rose-400/30"}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Entered device assessment</p>
            <p role="status" className="mt-3 text-3xl font-bold">{status}</p>
            <p className="mt-3 text-sm text-slate-400">All four comparisons must be satisfied. A positive result applies only to these entered checks.</p>
            {result.errors.length > 0 ? <ul className="mt-3 space-y-1 text-sm text-amber-200">{result.errors.map((error: string) => <li key={error}>{error}</li>)}</ul> : null}
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            {checks.map((check) => <Card key={check.title}>
              <h2 className="font-semibold">{check.title}</h2>
              <p className="mt-1 text-xs text-slate-500">{check.equation}</p>
              <p className="mt-3 break-words text-lg font-bold">{result.hasCompleteInputs ? check.values : "—"}</p>
              <p className={`mt-2 text-sm font-semibold ${!result.hasCompleteInputs ? "text-slate-400" : check.pass ? "text-emerald-300" : "text-rose-300"}`}>{!result.hasCompleteInputs ? "Not assessed" : check.pass ? "Meets entered check" : "Review required"}</p>
              {result.hasCompleteInputs && !check.pass ? <p className="mt-2 text-sm text-rose-200">{check.failure}</p> : null}
            </Card>)}
          </div>
          <Card><h2 className="font-semibold">Margins against entered limits</h2><p className="mt-2 text-sm text-slate-400">Overload: {format(result.overloadMarginAmps)} A</p><p className="mt-1 text-sm text-slate-400">Breaking capacity: {format(result.breakingCapacityMarginKa)} kA</p><p className="mt-2 text-xs text-slate-500">A negative margin identifies an exceeded limit. Comparisons use unrounded values.</p></Card>
        </div>
      </div>
      <Card><h2 className="font-semibold">Assumptions and remaining checks</h2><div className="mt-3 space-y-2">{result.assumptions.map((assumption: string) => <p key={assumption} className="text-sm text-slate-400">{assumption}</p>)}</div><div className="mt-4 flex flex-wrap gap-3"><Link href="/electrical-calculators/earth-fault-loop" className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-3 text-sm text-cyan-200">Earth Fault Loop</Link><Link href="/electrical-calculators/adiabatic" className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-3 text-sm text-cyan-200">Adiabatic CPC Sizing</Link></div></Card>
      <SaveCalculation kind="protective-device" label="Protective device checks" input={inputs} />
    </main>
  );
}
