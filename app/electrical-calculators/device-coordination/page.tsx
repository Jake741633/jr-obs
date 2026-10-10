"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { InputField, TextareaField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { SaveCalculation } from "../../../components/calculators/CalculationRecords";
import { deviceCoordinationSummary } from "../../../lib/deviceCoordinationCalculator-core.mjs";
import { formatCalculatorNumber as format } from "../../../lib/electricalCalculatorNumbers-core.mjs";

const emptyInputs = {
  upstreamDeviceReference: "", downstreamDeviceReference: "", supplyConditions: "", circuitEvidenceReference: "", supplyVoltageVolts: "",
  upstreamBreakingCapacityKa: "", upstreamFaultCurrentKa: "", downstreamBreakingCapacityKa: "", downstreamFaultCurrentKa: "",
  backupMode: "none", backupLimitKa: "", backupEvidenceReference: "",
  selectivityMode: "unassessed", selectivityLimitKa: "", selectivityEvidenceReference: "", evidenceConfirmed: false,
};
const selectClass = "min-h-12 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-white";

export default function DeviceCoordinationPage() {
  const [inputs, setInputs] = useState(emptyInputs);
  const result = useMemo(() => deviceCoordinationSummary(inputs), [inputs]);
  function update(key: Exclude<keyof typeof emptyInputs, "evidenceConfirmed">, value: string) {
    // A previous confirmation must never survive an edited device, limit or source.
    setInputs((current) => ({ ...current, [key]: value, evidenceConfirmed: false }));
  }
  function numeric(key: Exclude<keyof typeof emptyInputs, "evidenceConfirmed">, label: string) {
    return <InputField key={key} label={label} type="number" inputMode="decimal" min="0" step="any" value={inputs[key]} onChange={(event) => update(key, event.target.value)} />;
  }
  const status = !result.hasCompleteInputs ? "Assessment unavailable" : result.meetsEnteredChecks ? "Meets entered checks" : "Review required";
  const checks = [
    { title: "Upstream breaking capacity", pass: result.upstreamCapacityAdequate, comparison: `${format(result.upstreamBreakingCapacityKa)} ≥ ${format(result.upstreamFaultCurrentKa)} kA`, margin: result.upstreamMarginKa, detail: "Stand-alone upstream capacity must cover PFC at its own location. Backup evidence gives this device no additional capacity." },
    { title: "Downstream breaking capacity", pass: result.downstreamCapacityAdequate, comparison: `${format(result.effectiveDownstreamCapacityKa)} ≥ ${format(result.downstreamFaultCurrentKa)} kA`, margin: result.downstreamMarginKa, detail: inputs.backupMode === "manufacturer" ? "Uses the entered manufacturer-tested combination limit. The stand-alone rating is retained separately." : "Uses only the downstream stand-alone rating; no backup credit is applied." },
    { title: "Documented selectivity limit", pass: result.selectivityCovered, comparison: `${format(result.downstreamFaultCurrentKa)} < ${format(result.selectivityLimitKa)} kA`, margin: result.selectivityMarginKa, detail: inputs.selectivityMode === "documented" ? "PFC must be strictly below the entered limit. Equality needs boundary review. This does not establish overload or RCD selectivity." : "Selectivity has not been assessed. Adequate breaking capacity does not establish selectivity." },
  ];
  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <Link href="/electrical-calculators" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-cyan-300"><ArrowLeft className="size-4" />Back to Electrical Calculators</Link>
      <PageHeader eyebrow="Electrical Design Suite" title="Device Coordination" description="Compare one device pair with manufacturer backup and selectivity evidence for a specific supply and fault case." />
      <Card className="border-amber-400/30 bg-amber-400/5"><h2 className="font-semibold text-amber-100">Design aid only</h2><p className="mt-2 text-sm text-amber-100/80">Use current BS 7671 and the exact manufacturer table conditions. This tool compares values you verify; it cannot approve a device combination or check the source documents.</p></Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">1. Device pair and supply</h2><button type="button" onClick={() => setInputs({ ...emptyInputs })} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-3 text-sm font-semibold"><RotateCcw className="size-4" />Clear inputs</button></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <InputField label="Upstream device identification" maxLength={2000} value={inputs.upstreamDeviceReference} onChange={(event) => update("upstreamDeviceReference", event.target.value)} placeholder="Manufacturer, model, standard, rating and trip settings" />
          <InputField label="Downstream device identification" maxLength={2000} value={inputs.downstreamDeviceReference} onChange={(event) => update("downstreamDeviceReference", event.target.value)} placeholder="Manufacturer, model, standard, rating and trip settings" />
          {numeric("supplyVoltageVolts", "Applicable supply voltage (V)")}
          <InputField label="Supply and fault-case conditions" maxLength={2000} value={inputs.supplyConditions} onChange={(event) => update("supplyConditions", event.target.value)} placeholder="AC/DC, frequency, poles, source, voltage basis and fault type" />
        </div>
      </Card>
      <Card>
        <h2 className="font-semibold">2. Device ratings and site fault levels</h2>
        <p className="mt-2 text-sm text-slate-400">Enter maximum prospective RMS fault current at each location in kA, before current limitation. Verify the applicable breaking-capacity category, standard and voltage.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {numeric("upstreamBreakingCapacityKa", "Upstream stand-alone breaking capacity (kA)")}
          {numeric("upstreamFaultCurrentKa", "Maximum PFC at upstream device (kA)")}
          {numeric("downstreamBreakingCapacityKa", "Downstream stand-alone breaking capacity (kA)")}
          {numeric("downstreamFaultCurrentKa", "Maximum PFC at downstream device (kA)")}
          <div className="sm:col-span-2"><TextareaField label="Device-rating and site fault-current evidence" maxLength={2000} value={inputs.circuitEvidenceReference} onChange={(event) => update("circuitEvidenceReference", event.target.value)} placeholder="Documents/revisions, capacity categories, site readings or design study, date and operating case" /></div>
        </div>
      </Card>
      <Card>
        <h2 className="font-semibold">3. Manufacturer coordination limits</h2>
        <div className="mt-4 space-y-4">
          <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Backup protection basis</span><select className={selectClass} value={inputs.backupMode} onChange={(event) => update("backupMode", event.target.value)}><option value="none">No backup credit — stand-alone rating only</option><option value="manufacturer">Manufacturer-tested combination</option></select></label>
          {inputs.backupMode === "manufacturer" ? <div className="grid gap-4 rounded-xl border border-slate-700 p-4">
            {numeric("backupLimitKa", "Documented backup combination limit (kA)")}
            <TextareaField label="Backup document, revision, table and conditions" maxLength={2000} value={inputs.backupEvidenceReference} onChange={(event) => update("backupEvidenceReference", event.target.value)} />
          </div> : null}
          <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Selectivity evidence</span><select className={selectClass} value={inputs.selectivityMode} onChange={(event) => update("selectivityMode", event.target.value)}><option value="unassessed">Not assessed</option><option value="documented">Documented numeric limit</option></select></label>
          {inputs.selectivityMode === "documented" ? <div className="grid gap-4 rounded-xl border border-slate-700 p-4">
            {numeric("selectivityLimitKa", "Documented selectivity limit (kA)")}
            <p className="text-sm text-slate-400">If the table says “T”, check its definition and enter the applicable numeric limit. Enter 0 only where the evidence confirms no selectivity. Backup capacity is not a selectivity limit.</p>
            <TextareaField label="Selectivity document, revision, table and conditions" maxLength={2000} value={inputs.selectivityEvidenceReference} onChange={(event) => update("selectivityEvidenceReference", event.target.value)} />
          </div> : null}
          <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-cyan-400/30 p-4 text-sm"><input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-cyan-400" checked={inputs.evidenceConfirmed} onChange={(event) => setInputs((current) => ({ ...current, evidenceConfirmed: event.target.checked }))} /><span>I have checked that the evidence matches this device pair, order, ratings/settings, voltage, poles, supply/fault case and all manufacturer conditions. Editing any input clears this confirmation.</span></label>
        </div>
      </Card>
      <Card><p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Entered evidence assessment</p><p role="status" className="mt-3 text-2xl font-bold">{status}</p><p className="mt-2 text-sm text-slate-400">All three comparisons must meet the entered checks for a positive summary. Unassessed selectivity remains a review item.</p>{result.errors.length > 0 ? <ul className="mt-3 space-y-1 text-sm text-amber-200">{result.errors.map((error: string) => <li key={error}>{error}</li>)}</ul> : null}</Card>
      <div className="grid gap-4 md:grid-cols-3">{checks.map((check) => <Card key={check.title}>
        <h2 className="font-semibold">{check.title}</h2>
        <p className="mt-3 text-lg font-bold">{result.hasCompleteInputs && check.pass !== null ? check.comparison : "—"}</p>
        <p className={`mt-2 text-sm font-semibold ${check.pass === null ? "text-slate-400" : check.pass ? "text-emerald-300" : "text-rose-300"}`}>{check.pass === null ? "Not assessed" : check.pass ? "Meets entered check" : "Review required"}</p>
        <p className="mt-2 text-sm text-slate-400">Margin: {format(check.margin)} kA</p><p className="mt-3 text-sm text-slate-400">{check.detail}</p>
      </Card>)}</div>
      {result.hasCompleteInputs && inputs.backupMode === "manufacturer" ? <Card><h2 className="font-semibold">Downstream stand-alone check</h2><p className="mt-2 text-sm text-slate-300">{format(result.downstreamBreakingCapacityKa)} kA capacity against {format(result.downstreamFaultCurrentKa)} kA PFC: {result.downstreamStandaloneAdequate ? "meets the stand-alone comparison." : "stand-alone capacity is insufficient; review the combination limit above."}</p></Card> : null}
      <SaveCalculation kind="device-coordination" label="Device coordination" input={inputs} />
      <Card><h2 className="font-semibold">Assumptions and remaining checks</h2><div className="mt-3 space-y-3">{result.assumptions.map((assumption: string) => <p key={assumption} className="text-sm text-slate-400">{assumption}</p>)}</div><Link href="/electrical-calculators/protective-device" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-cyan-300">Open load and overload device checks</Link></Card>
    </main>
  );
}
