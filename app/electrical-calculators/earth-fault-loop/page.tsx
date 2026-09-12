"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, CircleAlert, Gauge, ShieldCheck, Zap } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { InputField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { earthFaultLoopSummary } from "../../../lib/earthFaultLoopCalculator-core.mjs";

const number = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 3 });

export default function EarthFaultLoopCalculatorPage() {
  const [nominalVoltage, setNominalVoltage] = useState("230");
  const [ze, setZe] = useState("0.35");
  const [r1, setR1] = useState("0.18");
  const [r2, setR2] = useState("0.30");
  const [tabulatedMaximumZs, setTabulatedMaximumZs] = useState("1.37");
  const [permittedPercentage, setPermittedPercentage] = useState("80");

  const result = useMemo(() => earthFaultLoopSummary({
    nominalVoltage: Number(nominalVoltage),
    externalEarthFaultLoopOhms: Number(ze),
    lineConductorResistanceOhms: Number(r1),
    cpcResistanceOhms: Number(r2),
    tabulatedMaximumZsOhms: Number(tabulatedMaximumZs),
    permittedPercentage: Number(permittedPercentage),
  }), [nominalVoltage, permittedPercentage, r1, r2, tabulatedMaximumZs, ze]);

  const statusLabel = !result.hasVerifiedLimit
    ? "Verified limit required"
    : result.withinSelectedLimit
      ? "Within selected limit"
      : "Exceeds selected limit";

  const statusClass = !result.hasVerifiedLimit
    ? "border-amber-400/30"
    : result.withinSelectedLimit
      ? "border-emerald-400/30"
      : "border-rose-400/30";

  const statusTextClass = !result.hasVerifiedLimit
    ? "text-amber-300"
    : result.withinSelectedLimit
      ? "text-emerald-300"
      : "text-rose-300";

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Electrical Calculators"
        title="Earth fault loop assessment"
        description="Calculate Zs from Ze + R1 + R2 and compare it with a verified designer-entered maximum."
      />

      <Link href="/electrical-calculators" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-300 transition hover:border-cyan-400 hover:text-cyan-100">
        <ArrowLeft className="size-4" />
        Back to calculators
      </Link>

      <Card className="border-amber-400/20 bg-amber-400/5">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-300" />
          <div>
            <h2 className="font-semibold text-amber-100">Verified device data required</h2>
            <p className="mt-1 text-sm text-amber-100/70">Enter the current tabulated maximum Zs for the actual protective device and required disconnection time. This calculator does not select or verify a device.</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><Gauge className="size-5" /></span>
            <div>
              <h2 className="font-semibold">Circuit values</h2>
              <p className="text-sm text-slate-500">Use verified design or measured resistance values.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <InputField label="Nominal voltage (V)" type="number" inputMode="decimal" min="0" step="1" value={nominalVoltage} onChange={(event) => setNominalVoltage(event.target.value)} />
            <InputField label="External earth fault loop Ze (Ω)" type="number" inputMode="decimal" min="0" step="0.01" value={ze} onChange={(event) => setZe(event.target.value)} />
            <InputField label="Line conductor resistance R1 (Ω)" type="number" inputMode="decimal" min="0" step="0.01" value={r1} onChange={(event) => setR1(event.target.value)} />
            <InputField label="CPC resistance R2 (Ω)" type="number" inputMode="decimal" min="0" step="0.01" value={r2} onChange={(event) => setR2(event.target.value)} />
            <InputField label="Verified tabulated maximum Zs (Ω)" type="number" inputMode="decimal" min="0" step="0.01" value={tabulatedMaximumZs} onChange={(event) => setTabulatedMaximumZs(event.target.value)} />
            <InputField label="Permitted percentage (%)" type="number" inputMode="decimal" min="0" max="100" step="1" value={permittedPercentage} onChange={(event) => setPermittedPercentage(event.target.value)} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className={statusClass}>
            <div className="flex items-center justify-between">
              <ShieldCheck className="size-6 text-cyan-300" />
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Calculated Zs</span>
            </div>
            <p className="mt-5 text-5xl font-black">{number.format(result.calculatedZsOhms)} Ω</p>
            <p className={`mt-4 text-sm font-semibold ${statusTextClass}`}>{statusLabel}</p>
            <p className="mt-2 text-sm text-slate-400">Selected maximum: {number.format(result.permittedMaximumZsOhms)} Ω</p>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <p className="text-sm text-slate-400">Margin</p>
              <p className="mt-1 text-2xl font-bold">{number.format(result.marginOhms)} Ω</p>
              <p className="mt-1 text-xs text-slate-500">Positive values remain below the selected limit.</p>
            </Card>
            <Card>
              <Zap className="size-5 text-amber-300" />
              <p className="mt-3 text-sm text-slate-400">Prospective earth fault current</p>
              <p className="mt-1 text-2xl font-bold">{number.format(result.prospectiveEarthFaultCurrentAmps)} A</p>
            </Card>
          </div>
        </div>
      </div>

      <Card>
        <h2 className="font-semibold">Calculation evidence</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Ze</p><p className="mt-1 text-xl font-bold">{number.format(result.externalEarthFaultLoopOhms)} Ω</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-wide text-slate-500">R1</p><p className="mt-1 text-xl font-bold">{number.format(result.lineConductorResistanceOhms)} Ω</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-wide text-slate-500">R2</p><p className="mt-1 text-xl font-bold">{number.format(result.cpcResistanceOhms)} Ω</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Applied limit</p><p className="mt-1 text-xl font-bold">{number.format(result.permittedPercentage)}%</p></div>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold">Assumptions and warnings</h2>
        <div className="mt-3 grid gap-2">
          {result.assumptions.map((assumption: string, index: number) => (
            <p key={`${index}-${assumption}`} className="text-sm text-slate-400">• {assumption}</p>
          ))}
        </div>
      </Card>
    </main>
  );
}
