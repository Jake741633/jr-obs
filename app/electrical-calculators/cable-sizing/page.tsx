"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Cable, CircleAlert, RotateCcw, Save } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { InputField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { cableSizingSummary } from "../../../lib/cableSizingCalculator-core.mjs";
import { voltageDropSummary } from "../../../lib/voltageDropCalculator-core.mjs";

type Phase = "Single phase" | "Three phase";
type RecentCalculation = {
  id: string;
  savedAt: string;
  phase: Phase;
  designCurrentAmps: number;
  cableSizeMm2: number;
  requiredTabulatedCurrentAmps: number;
  voltageDropVolts: number;
};

type CableOption = {
  sizeMm2: number;
  tabulatedCurrentAmps: number;
};

const STORAGE_KEY = "jr-os:electrical-calculators:cable-sizing:recent:v1";
const number = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

function readRecentCalculations(): RecentCalculation[] {
  if (typeof window === "undefined") return [];

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-300">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-white outline-none focus:border-cyan-400">
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

export default function CableSizingPage() {
  const [phase, setPhase] = useState<Phase>("Single phase");
  const [designCurrentAmps, setDesignCurrentAmps] = useState("20");
  const [installationMethod, setInstallationMethod] = useState("Reference method C");
  const [cableMaterial, setCableMaterial] = useState("Copper");
  const [insulationType, setInsulationType] = useState("PVC 70°C");
  const [loadedConductors, setLoadedConductors] = useState("2");
  const [ambientTemperature, setAmbientTemperature] = useState("30");
  const [ambientFactor, setAmbientFactor] = useState("1");
  const [groupingFactor, setGroupingFactor] = useState("1");
  const [cableLength, setCableLength] = useState("20");
  const [voltage, setVoltage] = useState("230");
  const [millivoltsPerAmpMetre, setMillivoltsPerAmpMetre] = useState("18");
  const [cableSizeMm2, setCableSizeMm2] = useState("2.5");
  const [tabulatedCurrentAmps, setTabulatedCurrentAmps] = useState("27");
  const [protectiveDeviceAmps, setProtectiveDeviceAmps] = useState("20");
  const [recent, setRecent] = useState<RecentCalculation[]>(readRecentCalculations);

  const cableOptions = useMemo<CableOption[]>(() => [{
    sizeMm2: Number(cableSizeMm2),
    tabulatedCurrentAmps: Number(tabulatedCurrentAmps),
  }], [cableSizeMm2, tabulatedCurrentAmps]);

  const cableSizing = useMemo(() => cableSizingSummary({
    designCurrentAmps: Number(designCurrentAmps),
    ambientTemperatureFactor: Number(ambientFactor),
    groupingFactor: Number(groupingFactor),
    cableOptions,
  }), [ambientFactor, cableOptions, designCurrentAmps, groupingFactor]);

  const voltageDrop = useMemo(() => voltageDropSummary({
    phase,
    nominalVoltage: Number(voltage),
    designCurrentAmps: Number(designCurrentAmps),
    routeLengthMetres: Number(cableLength),
    millivoltsPerAmpMetre: Number(millivoltsPerAmpMetre),
    maximumPercent: 3,
  }), [cableLength, designCurrentAmps, millivoltsPerAmpMetre, phase, voltage]);

  const protectiveCompatible = Number(protectiveDeviceAmps) >= Number(designCurrentAmps)
    && Number(protectiveDeviceAmps) <= Number(tabulatedCurrentAmps) * cableSizing.combinedCorrectionFactor;

  function selectPhase(next: Phase) {
    setPhase(next);
    setVoltage(next === "Three phase" ? "400" : "230");
    setLoadedConductors(next === "Three phase" ? "3" : "2");
  }

  function saveCalculation() {
    const next: RecentCalculation = {
      id: `${Date.now()}`,
      savedAt: new Date().toISOString(),
      phase,
      designCurrentAmps: Number(designCurrentAmps),
      cableSizeMm2: Number(cableSizeMm2),
      requiredTabulatedCurrentAmps: cableSizing.requiredTabulatedCurrentAmps,
      voltageDropVolts: voltageDrop.voltageDropVolts,
    };
    const updated = [next, ...recent].slice(0, 5);
    setRecent(updated);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  function loadCalculation(item: RecentCalculation) {
    setPhase(item.phase);
    setVoltage(item.phase === "Three phase" ? "400" : "230");
    setLoadedConductors(item.phase === "Three phase" ? "3" : "2");
    setDesignCurrentAmps(String(item.designCurrentAmps));
    setCableSizeMm2(String(item.cableSizeMm2));
  }

  return (
    <main className="space-y-6">
      <Link href="/electrical-calculators" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-300"><ArrowLeft className="size-4" />Electrical Calculators</Link>
      <PageHeader eyebrow="Electrical Calculators" title="Cable Sizing" description="Deterministic design aid using verified current ratings and correction factors." />

      <Card className="border-amber-400/20 bg-amber-400/5">
        <div className="flex items-start gap-3"><CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-300" /><p className="text-sm text-amber-100/80">Final cable selection must comply with BS 7671 and current manufacturer data. Verify installation method, current-carrying capacity, voltage drop, protective-device requirements, earth fault loop impedance and adiabatic conditions.</p></div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <div className="flex items-center gap-3"><Cable className="size-6 text-cyan-300" /><div><h2 className="font-semibold">User-entered design data</h2><p className="text-sm text-slate-500">Use values verified for the actual installation.</p></div></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-300 sm:col-span-2"><span>Supply phase</span><span className="grid grid-cols-2 gap-2">{(["Single phase", "Three phase"] as const).map((option) => <button key={option} type="button" onClick={() => selectPhase(option)} className={`min-h-12 rounded-xl border px-3 font-semibold ${phase === option ? "border-cyan-400 bg-cyan-400/10 text-cyan-100" : "border-slate-700 bg-slate-950 text-slate-300"}`}>{option}</button>)}</span></label>
            <InputField label="Design current Ib (A)" type="number" inputMode="decimal" min="0" step="0.1" value={designCurrentAmps} onChange={(event) => setDesignCurrentAmps(event.target.value)} />
            <InputField label="Voltage (V)" type="number" inputMode="decimal" min="0" step="1" value={voltage} onChange={(event) => setVoltage(event.target.value)} />
            <SelectField label="Installation method" value={installationMethod} onChange={setInstallationMethod} options={["Reference method C", "Reference method B", "Clipped direct", "In conduit", "In trunking", "Buried"]} />
            <SelectField label="Cable material" value={cableMaterial} onChange={setCableMaterial} options={["Copper", "Aluminium"]} />
            <SelectField label="Insulation type" value={insulationType} onChange={setInsulationType} options={["PVC 70°C", "XLPE 90°C", "Mineral insulated"]} />
            <InputField label="Loaded conductors" type="number" inputMode="numeric" min="1" step="1" value={loadedConductors} onChange={(event) => setLoadedConductors(event.target.value)} />
            <InputField label="Ambient temperature (°C)" type="number" inputMode="decimal" step="1" value={ambientTemperature} onChange={(event) => setAmbientTemperature(event.target.value)} />
            <InputField label="Verified ambient factor" type="number" inputMode="decimal" min="0.01" max="1" step="0.01" value={ambientFactor} onChange={(event) => setAmbientFactor(event.target.value)} />
            <InputField label="Verified grouping factor" type="number" inputMode="decimal" min="0.01" max="1" step="0.01" value={groupingFactor} onChange={(event) => setGroupingFactor(event.target.value)} />
            <InputField label="Cable length (m)" type="number" inputMode="decimal" min="0" step="0.1" value={cableLength} onChange={(event) => setCableLength(event.target.value)} />
            <InputField label="Verified cable size (mm²)" type="number" inputMode="decimal" min="0" step="0.5" value={cableSizeMm2} onChange={(event) => setCableSizeMm2(event.target.value)} />
            <InputField label="Verified tabulated rating (A)" type="number" inputMode="decimal" min="0" step="0.1" value={tabulatedCurrentAmps} onChange={(event) => setTabulatedCurrentAmps(event.target.value)} />
            <InputField label="Verified mV/A/m" type="number" inputMode="decimal" min="0" step="0.1" value={millivoltsPerAmpMetre} onChange={(event) => setMillivoltsPerAmpMetre(event.target.value)} />
            <InputField label="Protective device rating (A)" type="number" inputMode="decimal" min="0" step="1" value={protectiveDeviceAmps} onChange={(event) => setProtectiveDeviceAmps(event.target.value)} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className={cableSizing.selectedCable ? "border-emerald-400/30" : "border-rose-400/30"}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Calculated result</p>
            <p className="mt-4 text-4xl font-black">{cableSizing.selectedCable ? `${number.format(cableSizing.selectedCable.sizeMm2)} mm²` : "No suitable option"}</p>
            <p className="mt-2 text-sm text-slate-400">Recommended minimum from the verified option supplied.</p>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card><p className="text-sm text-slate-400">Design current</p><p className="mt-1 text-2xl font-bold">{number.format(Number(designCurrentAmps))} A</p><p className="text-xs text-slate-500">User-entered</p></Card>
            <Card><p className="text-sm text-slate-400">Corrected current</p><p className="mt-1 text-2xl font-bold">{number.format(cableSizing.requiredTabulatedCurrentAmps)} A</p><p className="text-xs text-slate-500">Calculated</p></Card>
            <Card><p className="text-sm text-slate-400">Voltage drop</p><p className="mt-1 text-2xl font-bold">{number.format(voltageDrop.voltageDropVolts)} V</p><p className="text-xs text-slate-500">{number.format(voltageDrop.voltageDropPercent)}% calculated</p></Card>
            <Card><p className="text-sm text-slate-400">Protective device</p><p className={`mt-1 text-lg font-bold ${protectiveCompatible ? "text-emerald-300" : "text-rose-300"}`}>{protectiveCompatible ? "Compatible by entered ratings" : "Review required"}</p><p className="text-xs text-slate-500">Guidance only</p></Card>
          </div>
          <Card>
            <h2 className="font-semibold">Earth fault loop impedance guidance</h2>
            <p className="mt-2 text-sm text-slate-400">No maximum Zs is invented by this calculator. Confirm the protective device type and rating against current BS 7671 or manufacturer data, then verify measured Zs and disconnection time on site.</p>
          </Card>
          <button type="button" onClick={saveCalculation} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 font-bold text-slate-950"><Save className="size-5" />Save recent calculation</button>
        </div>
      </div>

      <Card>
        <h2 className="font-semibold">Recent calculations</h2>
        {recent.length === 0 ? <p className="mt-2 text-sm text-slate-500">No locally saved calculations yet.</p> : <div className="mt-3 grid gap-3">{recent.map((item) => <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{item.phase} · {number.format(item.designCurrentAmps)} A</span><span className="text-slate-500">{new Date(item.savedAt).toLocaleString("en-GB")}</span></div><p className="mt-1 text-slate-400">{number.format(item.cableSizeMm2)} mm² · corrected {number.format(item.requiredTabulatedCurrentAmps)} A · drop {number.format(item.voltageDropVolts)} V</p><button type="button" onClick={() => loadCalculation(item)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-3 font-semibold text-slate-200"><RotateCcw className="size-4" />Load into calculator</button></div>)}</div>}
      </Card>
    </main>
  );
}
