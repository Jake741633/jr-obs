"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Cable, CircleAlert, RotateCcw, Save, Trash2 } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { InputField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { cableSizingSummary } from "../../../lib/cableSizingCalculator-core.mjs";
import { accountStorageKey } from "../../../lib/cloud/adapter";
import { useCloudIdentity } from "../../../lib/cloud/useCloudIdentity";
import { voltageDropSummary } from "../../../lib/voltageDropCalculator-core.mjs";

import { finiteCalculatorNumber, positiveCalculatorNumber, formatCalculatorNumber } from "../../../lib/electricalCalculatorNumbers-core.mjs";

type Phase = "Single phase" | "Three phase";
type RecentCalculation = {
  id: string;
  savedAt: string;
  phase: Phase;
  designCurrentAmps: number;
  installationMethod?: string;
  cableMaterial?: string;
  insulationType?: string;
  loadedConductors?: number;
  ambientTemperature?: number;
  ambientFactor?: number;
  groupingFactor?: number;
  insulationFactor?: number;
  otherFactor?: number;
  cableLength?: number;
  voltage?: number;
  millivoltsPerAmpMetre?: number;
  cableSizeMm2: number;
  tabulatedCurrentAmps?: number;
  protectiveDeviceAmps?: number;
  requiredTabulatedCurrentAmps: number;
  voltageDropVolts: number;
};

type CableOption = {
  sizeMm2: string;
  tabulatedCurrentAmps: string;
};

const STORAGE_KEY = "jr-os:electrical-calculators:cable-sizing:recent:v1";
const number = { format: formatCalculatorNumber };
const methods = ["Reference method C", "Reference method B", "Clipped direct", "In conduit", "In trunking", "Buried"];
const materials = ["Copper", "Aluminium"];
const insulations = ["PVC 70°C", "XLPE 90°C", "Mineral insulated"];

function isRecentCalculation(value: unknown): value is RecentCalculation {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.savedAt !== "string" || !Number.isFinite(Date.parse(item.savedAt)) || !["Single phase", "Three phase"].includes(String(item.phase))) return false;
  if (!["designCurrentAmps", "cableSizeMm2", "requiredTabulatedCurrentAmps", "voltageDropVolts"].every((key) => typeof item[key] === "number" && positiveCalculatorNumber(item[key]) !== null)) return false;
  if (!["loadedConductors", "ambientTemperature", "ambientFactor", "groupingFactor", "insulationFactor", "otherFactor", "cableLength", "voltage", "millivoltsPerAmpMetre", "tabulatedCurrentAmps", "protectiveDeviceAmps"].every((key) => item[key] === undefined || (typeof item[key] === "number" && Number.isFinite(item[key])))) return false;
  return ["installationMethod", "cableMaterial", "insulationType"].every((key) => item[key] === undefined || typeof item[key] === "string");
}

function readRecentCalculations(storageKey: string): RecentCalculation[] {
  if (typeof window === "undefined") return [];

  try {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter(isRecentCalculation).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-300">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-white outline-none focus:border-cyan-400">
        <option value="" disabled>Select a verified value</option>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

export default function CableSizingPage() {
  const { identity, isReady: identityReady } = useCloudIdentity();
  const activeHistoryKey = identity
    ? accountStorageKey(STORAGE_KEY, identity.organisationId, identity.userId, identity.role, identity.customerSourceId)
    : null;
  const [phase, setPhase] = useState<Phase>("Single phase");
  const [designCurrentAmps, setDesignCurrentAmps] = useState("");
  const [installationMethod, setInstallationMethod] = useState("Reference method C");
  const [cableMaterial, setCableMaterial] = useState("Copper");
  const [insulationType, setInsulationType] = useState("PVC 70°C");
  const [loadedConductors, setLoadedConductors] = useState("2");
  const [ambientTemperature, setAmbientTemperature] = useState("30");
  const [ambientFactor, setAmbientFactor] = useState("1");
  const [groupingFactor, setGroupingFactor] = useState("1");
  const [cableLength, setCableLength] = useState("");
  const [voltage, setVoltage] = useState("230");
  const [millivoltsPerAmpMetre, setMillivoltsPerAmpMetre] = useState("");
  const [cableSizeMm2, setCableSizeMm2] = useState("");
  const [tabulatedCurrentAmps, setTabulatedCurrentAmps] = useState("");
  const [protectiveDeviceAmps, setProtectiveDeviceAmps] = useState("");
  const [insulationFactor, setInsulationFactor] = useState("1");
  const [otherFactor, setOtherFactor] = useState("1");
  const [historyMessage, setHistoryMessage] = useState("");
  const [recent, setRecent] = useState<RecentCalculation[]>([]);
  const [loadedHistoryKey, setLoadedHistoryKey] = useState<string | null>(null);
  const historyReady = identityReady && activeHistoryKey !== null && loadedHistoryKey === activeHistoryKey;
  const visibleRecent = historyReady ? recent : [];

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (!identityReady || !activeHistoryKey) {
        setRecent([]);
        setLoadedHistoryKey(null);
        return;
      }
      setRecent(readRecentCalculations(activeHistoryKey));
      setLoadedHistoryKey(activeHistoryKey);
    });
    return () => {
      active = false;
    };
  }, [activeHistoryKey, identityReady]);

  const cableOptions = useMemo<CableOption[]>(() => [{ sizeMm2: cableSizeMm2, tabulatedCurrentAmps }], [cableSizeMm2, tabulatedCurrentAmps]);
  const cableSizing = useMemo(() => cableSizingSummary({
    designCurrentAmps, ambientTemperatureFactor: ambientFactor, groupingFactor, insulationFactor, otherFactor, cableOptions,
  }), [ambientFactor, cableOptions, designCurrentAmps, groupingFactor, insulationFactor, otherFactor]);
  const voltageDrop = useMemo(() => voltageDropSummary({
    phase, nominalVoltage: voltage, designCurrentAmps, routeLengthMetres: cableLength, millivoltsPerAmpMetre, maximumPercent: 3,
  }), [cableLength, designCurrentAmps, millivoltsPerAmpMetre, phase, voltage]);
  const deviceRating = positiveCalculatorNumber(protectiveDeviceAmps);
  const metadataComplete = methods.includes(installationMethod) && materials.includes(cableMaterial) && insulations.includes(insulationType)
    && Number.isSafeInteger(positiveCalculatorNumber(loadedConductors)) && finiteCalculatorNumber(ambientTemperature) !== null;
  const ratingCheckAvailable = cableSizing.hasCompleteInputs && deviceRating !== null;
  const protectiveCompatible = ratingCheckAvailable && deviceRating! >= cableSizing.designCurrentAmps!
    && deviceRating! <= positiveCalculatorNumber(tabulatedCurrentAmps)! * cableSizing.combinedCorrectionFactor!;
  const canSaveCalculation = metadataComplete && ratingCheckAvailable && voltageDrop.hasCompleteInputs;

  function selectPhase(next: Phase) {
    setPhase(next);
    setVoltage(next === "Three phase" ? "400" : "230");
    setLoadedConductors(next === "Three phase" ? "3" : "2");
  }

  function resetForm() {
    setPhase("Single phase");
    setDesignCurrentAmps("");
    setInstallationMethod("Reference method C");
    setCableMaterial("Copper");
    setInsulationType("PVC 70°C");
    setLoadedConductors("2");
    setAmbientTemperature("30");
    setAmbientFactor("1");
    setGroupingFactor("1");
    setInsulationFactor("1");
    setOtherFactor("1");
    setHistoryMessage("");
    setCableLength("");
    setVoltage("230");
    setMillivoltsPerAmpMetre("");
    setCableSizeMm2("");
    setTabulatedCurrentAmps("");
    setProtectiveDeviceAmps("");
  }

  function saveCalculation() {
    if (!historyReady || !activeHistoryKey) return;
    if (!canSaveCalculation || cableSizing.requiredTabulatedCurrentAmps === null || voltageDrop.voltageDropVolts === null) return;
    const next: RecentCalculation = {
      id: `${Date.now()}`,
      savedAt: new Date().toISOString(),
      phase,
      designCurrentAmps: Number(designCurrentAmps),
      installationMethod,
      cableMaterial,
      insulationType,
      loadedConductors: Number(loadedConductors),
      ambientTemperature: Number(ambientTemperature),
      ambientFactor: Number(ambientFactor),
      groupingFactor: Number(groupingFactor),
      insulationFactor: Number(insulationFactor),
      otherFactor: Number(otherFactor),
      cableLength: Number(cableLength),
      voltage: Number(voltage),
      millivoltsPerAmpMetre: Number(millivoltsPerAmpMetre),
      cableSizeMm2: Number(cableSizeMm2),
      tabulatedCurrentAmps: Number(tabulatedCurrentAmps),
      protectiveDeviceAmps: Number(protectiveDeviceAmps),
      requiredTabulatedCurrentAmps: cableSizing.requiredTabulatedCurrentAmps,
      voltageDropVolts: voltageDrop.voltageDropVolts,
    };
    const updated = [next, ...recent].slice(0, 5);
    try {
      window.localStorage.setItem(activeHistoryKey, JSON.stringify(updated));
      setRecent(updated);
      setHistoryMessage("Calculation saved on this device.");
    } catch {
      setHistoryMessage("Could not save this calculation. Check available browser storage and try again.");
    }
  }

  function clearHistory() {
    if (!historyReady || !activeHistoryKey) return;
    try {
      window.localStorage.removeItem(activeHistoryKey);
      setRecent([]);
      setHistoryMessage("Saved history cleared.");
    } catch {
      setHistoryMessage("Could not clear saved history. Try again.");
    }
  }

  function loadCalculation(item: RecentCalculation) {
    setHistoryMessage("Loaded saved inputs. Recheck the evidence; missing values in older records must be entered again.");
    setInsulationFactor(String(item.insulationFactor ?? ""));
    setOtherFactor(String(item.otherFactor ?? ""));
    setPhase(item.phase);
    setDesignCurrentAmps(String(item.designCurrentAmps));
    setInstallationMethod(item.installationMethod ?? "");
    setCableMaterial(item.cableMaterial ?? "");
    setInsulationType(item.insulationType ?? "");
    setLoadedConductors(String(item.loadedConductors ?? ""));
    setAmbientTemperature(String(item.ambientTemperature ?? ""));
    setAmbientFactor(String(item.ambientFactor ?? ""));
    setGroupingFactor(String(item.groupingFactor ?? ""));
    setCableLength(String(item.cableLength ?? ""));
    setVoltage(String(item.voltage ?? ""));
    setMillivoltsPerAmpMetre(String(item.millivoltsPerAmpMetre ?? ""));
    setCableSizeMm2(String(item.cableSizeMm2));
    setTabulatedCurrentAmps(String(item.tabulatedCurrentAmps ?? ""));
    setProtectiveDeviceAmps(String(item.protectiveDeviceAmps ?? ""));
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3"><Cable className="size-6 text-cyan-300" /><div><h2 className="font-semibold">User-entered design data</h2><p className="text-sm text-slate-500">Use values verified for the actual installation. Factor 1 means no correction applies; verify every factor.</p></div></div>
            <button type="button" onClick={resetForm} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-3 font-semibold text-slate-200"><RotateCcw className="size-4" />Reset defaults</button>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-300 sm:col-span-2"><span>Supply phase</span><span className="grid grid-cols-2 gap-2">{(["Single phase", "Three phase"] as const).map((option) => <button key={option} type="button" onClick={() => selectPhase(option)} className={`min-h-12 rounded-xl border px-3 font-semibold ${phase === option ? "border-cyan-400 bg-cyan-400/10 text-cyan-100" : "border-slate-700 bg-slate-950 text-slate-300"}`}>{option}</button>)}</span></label>
            <InputField label="Design current Ib (A)" type="number" inputMode="decimal" min="0" step="0.1" value={designCurrentAmps} onChange={(event) => setDesignCurrentAmps(event.target.value)} />
            <InputField label="Voltage (V)" type="number" inputMode="decimal" min="0" step="1" value={voltage} onChange={(event) => setVoltage(event.target.value)} />
            <SelectField label="Installation method" value={installationMethod} onChange={setInstallationMethod} options={methods} />
            <SelectField label="Cable material" value={cableMaterial} onChange={setCableMaterial} options={materials} />
            <SelectField label="Insulation type" value={insulationType} onChange={setInsulationType} options={insulations} />
            <InputField label="Loaded conductors" type="number" inputMode="numeric" min="1" step="1" value={loadedConductors} onChange={(event) => setLoadedConductors(event.target.value)} />
            <InputField label="Ambient temperature (°C)" type="number" inputMode="decimal" step="1" value={ambientTemperature} onChange={(event) => setAmbientTemperature(event.target.value)} />
            <InputField label="Verified ambient factor" type="number" inputMode="decimal" min="0.01" step="0.01" value={ambientFactor} onChange={(event) => setAmbientFactor(event.target.value)} />
            <InputField label="Verified grouping factor" type="number" inputMode="decimal" min="0.01" step="0.01" value={groupingFactor} onChange={(event) => setGroupingFactor(event.target.value)} />
            <InputField label="Verified insulation factor" type="number" inputMode="decimal" min="0.01" step="0.01" value={insulationFactor} onChange={(event) => setInsulationFactor(event.target.value)} />
            <InputField label="Verified other factor" type="number" inputMode="decimal" min="0.01" step="0.01" value={otherFactor} onChange={(event) => setOtherFactor(event.target.value)} />
            <InputField label="Cable length (m)" type="number" inputMode="decimal" min="0" step="0.1" value={cableLength} onChange={(event) => setCableLength(event.target.value)} />
            <InputField label="Verified cable size (mm²)" type="number" inputMode="decimal" min="0" step="0.5" value={cableSizeMm2} onChange={(event) => setCableSizeMm2(event.target.value)} />
            <InputField label="Verified tabulated rating (A)" type="number" inputMode="decimal" min="0" step="0.1" value={tabulatedCurrentAmps} onChange={(event) => setTabulatedCurrentAmps(event.target.value)} />
            <InputField label="Verified mV/A/m" type="number" inputMode="decimal" min="0" step="0.1" value={millivoltsPerAmpMetre} onChange={(event) => setMillivoltsPerAmpMetre(event.target.value)} />
            <InputField label="Protective device rating (A)" type="number" inputMode="decimal" min="0" step="1" value={protectiveDeviceAmps} onChange={(event) => setProtectiveDeviceAmps(event.target.value)} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className={!cableSizing.hasCompleteInputs ? "border-slate-700" : cableSizing.selectedCable ? "border-emerald-400/30" : "border-rose-400/30"}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Calculated result</p>
            <p role="status" className="mt-4 text-4xl font-black">{!cableSizing.hasCompleteInputs ? "Assessment unavailable" : cableSizing.selectedCable ? `${number.format(cableSizing.selectedCable.sizeMm2)} mm²` : "No suitable option"}</p>
            <p className="mt-2 text-sm text-slate-400">Current-capacity check against design current only. Protective-device overload conditions require a separate check.</p>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card><p className="text-sm text-slate-400">Design current</p><p className="mt-1 text-2xl font-bold">{number.format(positiveCalculatorNumber(designCurrentAmps))} A</p><p className="text-xs text-slate-500">User-entered</p></Card>
            <Card><p className="text-sm text-slate-400">Corrected current</p><p className="mt-1 text-2xl font-bold">{number.format(cableSizing.requiredTabulatedCurrentAmps)} A</p><p className="text-xs text-slate-500">Calculated</p></Card>
            <Card><p className="text-sm text-slate-400">Voltage drop</p><p className="mt-1 text-2xl font-bold">{number.format(voltageDrop.voltageDropVolts)} V</p><p className="text-xs text-slate-500">{number.format(voltageDrop.voltageDropPercent)}% calculated · selected limit 3%</p><p role="status" className="mt-1 text-sm">{!voltageDrop.hasCompleteInputs ? "Assessment unavailable" : voltageDrop.withinSelectedLimit ? "Within selected limit" : "Exceeds selected limit"}</p></Card>
            <Card><p className="text-sm text-slate-400">Protective device</p><p role="status" className={`mt-1 text-lg font-bold ${!ratingCheckAvailable ? "text-slate-300" : protectiveCompatible ? "text-emerald-300" : "text-rose-300"}`}>{!ratingCheckAvailable ? "Assessment unavailable" : protectiveCompatible ? "Meets basic rating check" : "Review required"}</p><p className="text-xs text-slate-500">Ib ≤ In ≤ Iz only; overload operation and breaking capacity are not assessed here.</p></Card>
          </div>
          <Link href="/electrical-calculators/protective-device" className="flex min-h-11 items-center justify-center rounded-xl border border-cyan-400/30 px-3 text-sm font-semibold text-cyan-200">Open Protective Device Checks</Link>
          <Card>
            <h2 className="font-semibold">Earth fault loop impedance guidance</h2>
            <p className="mt-2 text-sm text-slate-400">No maximum Zs is invented by this calculator. Confirm the protective device type and rating against current BS 7671 or manufacturer data, then verify measured Zs and disconnection time on site.</p>
          </Card>
          <div className="space-y-1 text-sm text-amber-200">{[...new Set([...cableSizing.errors, ...voltageDrop.errors, ...(deviceRating === null ? ["Enter a positive protective device rating."] : []), ...(!metadataComplete ? ["Complete the installation details, whole-number loaded conductors and ambient temperature."] : [])])].map((error) => <p key={error}>{error}</p>)}</div>
          <button type="button" onClick={saveCalculation} disabled={!historyReady || !canSaveCalculation} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"><Save className="size-5" />Save recent calculation</button>
        </div>
      </div>

      {historyMessage ? <p role="status" className="text-sm text-cyan-200">{historyMessage}</p> : null}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Recent calculations</h2>
          {visibleRecent.length > 0 ? <button type="button" onClick={clearHistory} disabled={!historyReady} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-400/30 px-3 font-semibold text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="size-4" />Clear history</button> : null}
        </div>
        {!historyReady ? <p className="mt-2 text-sm text-slate-500">{identityReady && !identity ? "Sign in to use account-scoped saved calculations." : "Loading saved calculations…"}</p> : visibleRecent.length === 0 ? <p className="mt-2 text-sm text-slate-500">No locally saved calculations yet.</p> : <div className="mt-3 grid gap-3">{visibleRecent.map((item) => <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{item.phase} · {number.format(item.designCurrentAmps)} A</span><span className="text-slate-500">{new Date(item.savedAt).toLocaleString("en-GB")}</span></div><p className="mt-1 text-slate-400">Saved snapshot — verify inputs before reuse. {number.format(item.cableSizeMm2)} mm² · corrected {number.format(item.requiredTabulatedCurrentAmps)} A · drop {number.format(item.voltageDropVolts)} V</p><button type="button" onClick={() => loadCalculation(item)} disabled={!historyReady} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-3 font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"><RotateCcw className="size-4" />Load into calculator</button></div>)}</div>}
      </Card>
    </main>
  );
}
