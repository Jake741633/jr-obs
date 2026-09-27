"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Plus, ShieldCheck, Trash2, Wrench } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { makeId, useLocalStorageCollection } from "../../lib/storage";

type EquipmentStatus = "In service" | "Due soon" | "Out of service" | "In calibration" | "Retired";
type CheckResult = "Pass" | "Fail";

interface TestInstrument {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  assetTag: string;
  status: EquipmentStatus;
  assignedTo: string;
  calibrationDue: string;
  lastCalibrationDate: string;
  calibrationCertificateUrl: string;
  warrantyUntil: string;
  replacementCost: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface EquipmentCheck {
  id: string;
  instrumentId: string;
  checkDate: string;
  checkedBy: string;
  result: CheckResult;
  visualCondition: string;
  leadsCondition: string;
  batteryCondition: string;
  functionalCheck: string;
  defectDetails: string;
  createdAt: string;
}

const statuses: EquipmentStatus[] = ["In service", "Due soon", "Out of service", "In calibration", "Retired"];
const blankInstrument = { name: "", category: "Multifunction tester", manufacturer: "Megger", model: "", serialNumber: "", assetTag: "", status: "In service" as EquipmentStatus, assignedTo: "Jake Rinaldi", calibrationDue: "", lastCalibrationDate: "", calibrationCertificateUrl: "", warrantyUntil: "", replacementCost: "", notes: "" };
const blankCheck = { instrumentId: "", checkDate: "", checkedBy: "Jake Rinaldi", result: "Pass" as CheckResult, visualCondition: "Good", leadsCondition: "Good", batteryCondition: "Good", functionalCheck: "Passed", defectDetails: "" };

function daysUntil(date: string) {
  if (!date) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(`${date}T00:00:00`).getTime() - today.getTime()) / 86400000);
}

export default function TestEquipmentPage() {
  const instruments = useLocalStorageCollection<TestInstrument>("jr-os-test-instruments");
  const checks = useLocalStorageCollection<EquipmentCheck>("jr-os-equipment-checks");
  const [instrumentForm, setInstrumentForm] = useState(blankInstrument);
  const [checkForm, setCheckForm] = useState(blankCheck);
  const [showInstrumentForm, setShowInstrumentForm] = useState(false);
  const [showCheckForm, setShowCheckForm] = useState(false);
  const [search, setSearch] = useState("");

  const overdue = instruments.items.filter((item) => daysUntil(item.calibrationDue) < 0 && item.status !== "Retired").length;
  const dueSoon = instruments.items.filter((item) => daysUntil(item.calibrationDue) >= 0 && daysUntil(item.calibrationDue) <= 30 && item.status !== "Retired").length;
  const outOfService = instruments.items.filter((item) => item.status === "Out of service").length;
  const failedChecks = checks.items.filter((item) => item.result === "Fail").length;
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return instruments.items.filter((item) => !query || [item.name, item.manufacturer, item.model, item.serialNumber, item.assetTag, item.assignedTo].some((value) => value.toLowerCase().includes(query)));
  }, [instruments.items, search]);

  function saveInstrument(event: FormEvent) {
    event.preventDefault();
    const now = new Date().toISOString();
    instruments.setItems((current) => [...current, { ...instrumentForm, id: makeId("instrument"), replacementCost: Number(instrumentForm.replacementCost) || 0, createdAt: now, updatedAt: now }]);
    setInstrumentForm(blankInstrument);
    setShowInstrumentForm(false);
  }

  function saveCheck(event: FormEvent) {
    event.preventDefault();
    if (!checkForm.instrumentId) return;
    const now = new Date().toISOString();
    checks.setItems((current) => [...current, { ...checkForm, id: makeId("equipment-check"), createdAt: now }]);
    if (checkForm.result === "Fail") {
      instruments.setItems((current) => current.map((item) => item.id === checkForm.instrumentId ? { ...item, status: "Out of service", notes: [item.notes, `Failed pre-use check: ${checkForm.defectDetails || "See check record"}`].filter(Boolean).join("\n"), updatedAt: now } : item));
    }
    setCheckForm(blankCheck);
    setShowCheckForm(false);
  }

  return <main className="space-y-6">
    <PageHeader title="Test Equipment & Compliance" description="Manage instruments, calibration dates, pre-use checks, defects and replacement planning." action={<div className="flex gap-2"><Button variant="secondary" onClick={() => setShowCheckForm((value) => !value)}><ShieldCheck className="h-4 w-4" />Record check</Button><Button onClick={() => setShowInstrumentForm((value) => !value)}><Plus className="h-4 w-4" />Add instrument</Button></div>} />

    <section className="grid gap-4 md:grid-cols-4">
      <Card><Wrench className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{instruments.items.length}</p><p className="text-sm text-slate-400">Registered instruments</p></Card>
      <Card><AlertTriangle className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{overdue}</p><p className="text-sm text-slate-400">Calibration overdue</p></Card>
      <Card><CalendarClock className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{dueSoon}</p><p className="text-sm text-slate-400">Due within 30 days</p></Card>
      <Card><CheckCircle2 className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{outOfService + failedChecks}</p><p className="text-sm text-slate-400">Compliance warnings</p></Card>
    </section>

    {showInstrumentForm && <Card><form onSubmit={saveInstrument} className="space-y-4"><h2 className="text-xl font-semibold">Add test instrument</h2><div className="grid gap-4 md:grid-cols-2">
      <InputField label="Instrument name" value={instrumentForm.name} onChange={(event) => setInstrumentForm({ ...instrumentForm, name: event.target.value })} required />
      <InputField label="Category" value={instrumentForm.category} onChange={(event) => setInstrumentForm({ ...instrumentForm, category: event.target.value })} />
      <InputField label="Manufacturer" value={instrumentForm.manufacturer} onChange={(event) => setInstrumentForm({ ...instrumentForm, manufacturer: event.target.value })} />
      <InputField label="Model" value={instrumentForm.model} onChange={(event) => setInstrumentForm({ ...instrumentForm, model: event.target.value })} />
      <InputField label="Serial number" value={instrumentForm.serialNumber} onChange={(event) => setInstrumentForm({ ...instrumentForm, serialNumber: event.target.value })} required />
      <InputField label="Asset tag" value={instrumentForm.assetTag} onChange={(event) => setInstrumentForm({ ...instrumentForm, assetTag: event.target.value })} />
      <label className="space-y-1 text-sm"><span>Status</span><select className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" value={instrumentForm.status} onChange={(event) => setInstrumentForm({ ...instrumentForm, status: event.target.value as EquipmentStatus })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <InputField label="Assigned to" value={instrumentForm.assignedTo} onChange={(event) => setInstrumentForm({ ...instrumentForm, assignedTo: event.target.value })} />
      <InputField label="Last calibration" type="date" value={instrumentForm.lastCalibrationDate} onChange={(event) => setInstrumentForm({ ...instrumentForm, lastCalibrationDate: event.target.value })} />
      <InputField label="Calibration due" type="date" value={instrumentForm.calibrationDue} onChange={(event) => setInstrumentForm({ ...instrumentForm, calibrationDue: event.target.value })} />
      <InputField label="Certificate link" value={instrumentForm.calibrationCertificateUrl} onChange={(event) => setInstrumentForm({ ...instrumentForm, calibrationCertificateUrl: event.target.value })} />
      <InputField label="Warranty until" type="date" value={instrumentForm.warrantyUntil} onChange={(event) => setInstrumentForm({ ...instrumentForm, warrantyUntil: event.target.value })} />
      <InputField label="Replacement cost (£)" type="number" min="0" step="0.01" value={instrumentForm.replacementCost} onChange={(event) => setInstrumentForm({ ...instrumentForm, replacementCost: event.target.value })} />
    </div><TextareaField label="Notes" value={instrumentForm.notes} onChange={(event) => setInstrumentForm({ ...instrumentForm, notes: event.target.value })} /><Button type="submit">Save instrument</Button></form></Card>}

    {showCheckForm && <Card><form onSubmit={saveCheck} className="space-y-4"><h2 className="text-xl font-semibold">Pre-use equipment check</h2><div className="grid gap-4 md:grid-cols-2">
      <label className="space-y-1 text-sm"><span>Instrument</span><select required className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" value={checkForm.instrumentId} onChange={(event) => setCheckForm({ ...checkForm, instrumentId: event.target.value })}><option value="">Select instrument</option>{instruments.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.serialNumber}</option>)}</select></label>
      <InputField label="Check date" type="date" value={checkForm.checkDate} onChange={(event) => setCheckForm({ ...checkForm, checkDate: event.target.value })} required />
      <InputField label="Checked by" value={checkForm.checkedBy} onChange={(event) => setCheckForm({ ...checkForm, checkedBy: event.target.value })} required />
      <label className="space-y-1 text-sm"><span>Result</span><select className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" value={checkForm.result} onChange={(event) => setCheckForm({ ...checkForm, result: event.target.value as CheckResult })}><option>Pass</option><option>Fail</option></select></label>
      <InputField label="Visual condition" value={checkForm.visualCondition} onChange={(event) => setCheckForm({ ...checkForm, visualCondition: event.target.value })} />
      <InputField label="Lead and probe condition" value={checkForm.leadsCondition} onChange={(event) => setCheckForm({ ...checkForm, leadsCondition: event.target.value })} />
      <InputField label="Battery condition" value={checkForm.batteryCondition} onChange={(event) => setCheckForm({ ...checkForm, batteryCondition: event.target.value })} />
      <InputField label="Functional check" value={checkForm.functionalCheck} onChange={(event) => setCheckForm({ ...checkForm, functionalCheck: event.target.value })} />
    </div><TextareaField label="Defect details" value={checkForm.defectDetails} onChange={(event) => setCheckForm({ ...checkForm, defectDetails: event.target.value })} /><Button type="submit">Save check</Button></form></Card>}

    <Card><InputField label="Search equipment" placeholder="Name, model, serial, asset tag or engineer" value={search} onChange={(event) => setSearch(event.target.value)} /></Card>

    <section className="space-y-4">{filtered.map((item) => {
      const calibrationDays = daysUntil(item.calibrationDue);
      const instrumentChecks = checks.items.filter((check) => check.instrumentId === item.id).sort((a, b) => b.checkDate.localeCompare(a.checkDate));
      return <Card key={item.id}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-slate-400">{item.assetTag || "No asset tag"}</p><h2 className="text-xl font-semibold">{item.name}</h2><p className="text-sm text-slate-400">{item.manufacturer} {item.model} · S/N {item.serialNumber}</p></div><select className="rounded-lg border border-slate-700 bg-slate-950 p-2" value={item.status} onChange={(event) => instruments.setItems((current) => current.map((instrument) => instrument.id === item.id ? { ...instrument, status: event.target.value as EquipmentStatus, updatedAt: new Date().toISOString() } : instrument))}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></div>
      <div className="mt-4 grid gap-3 md:grid-cols-4"><div className="rounded-lg bg-slate-950 p-3"><p className="text-xs uppercase text-slate-500">Assigned to</p><p className="mt-1 text-sm">{item.assignedTo || "Unassigned"}</p></div><div className="rounded-lg bg-slate-950 p-3"><p className="text-xs uppercase text-slate-500">Calibration</p><p className="mt-1 text-sm">{item.calibrationDue || "Not set"}{Number.isFinite(calibrationDays) ? ` · ${calibrationDays < 0 ? `${Math.abs(calibrationDays)} days overdue` : `${calibrationDays} days`}` : ""}</p></div><div className="rounded-lg bg-slate-950 p-3"><p className="text-xs uppercase text-slate-500">Latest check</p><p className="mt-1 text-sm">{instrumentChecks[0] ? `${instrumentChecks[0].checkDate} · ${instrumentChecks[0].result}` : "No checks"}</p></div><div className="rounded-lg bg-slate-950 p-3"><p className="text-xs uppercase text-slate-500">Replacement cost</p><p className="mt-1 text-sm">£{item.replacementCost.toFixed(2)}</p></div></div>
      <div className="mt-4 flex justify-end"><Button variant="secondary" onClick={() => { instruments.remove((instrument) => instrument.id === item.id); checks.setItems((current) => current.filter((check) => check.instrumentId !== item.id)); }}><Trash2 className="h-4 w-4" />Delete</Button></div></Card>;
    })}{filtered.length === 0 && <Card><p className="text-slate-400">No test equipment matches this search.</p></Card>}</section>
  </main>;
}
