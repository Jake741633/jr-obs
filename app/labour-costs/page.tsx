"use client";

import { FormEvent, useMemo, useState } from "react";
import { Banknote, BriefcaseBusiness, Calculator, Plus, Save, Trash2, TrendingUp, Users } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { BusinessOverhead, LabourCostSettings, LabourRate, LabourRateUnit, OverheadCategory, OverheadFrequency } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const categories: OverheadCategory[] = ["Vehicle", "Insurance", "Software", "Registration", "Accountancy", "Phone", "Tools", "Training", "Premises", "Marketing", "Other"];
const frequencies: OverheadFrequency[] = ["Weekly", "Monthly", "Annual"];
const rateUnits: LabourRateUnit[] = ["Hour", "Day"];
const defaultSettings: LabourCostSettings = {
  id: "labour-cost-settings",
  workingDaysPerYear: 220,
  billableHoursPerDay: 7.5,
  targetNetMargin: 25,
  contingencyPercent: 10,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};
const blankRate = { name: "", description: "", costRate: "0", chargeRate: "0", unit: "Day" as LabourRateUnit };
const blankOverhead = { name: "", category: "Software" as OverheadCategory, amount: "0", frequency: "Monthly" as OverheadFrequency, notes: "" };

function annualAmount(overhead: BusinessOverhead) {
  if (!overhead.active) return 0;
  if (overhead.frequency === "Weekly") return overhead.amount * 52;
  if (overhead.frequency === "Monthly") return overhead.amount * 12;
  return overhead.amount;
}

function margin(cost: number, charge: number) {
  return charge > 0 ? ((charge - cost) / charge) * 100 : 0;
}

export default function LabourCostsPage() {
  const rates = useLocalStorageCollection<LabourRate>("jr-os-labour-rates");
  const overheads = useLocalStorageCollection<BusinessOverhead>("jr-os-business-overheads");
  const settingsStore = useLocalStorageCollection<LabourCostSettings>("jr-os-labour-cost-settings", [defaultSettings]);
  const [rateForm, setRateForm] = useState(blankRate);
  const [overheadForm, setOverheadForm] = useState(blankOverhead);
  const [showRateForm, setShowRateForm] = useState(false);
  const [showOverheadForm, setShowOverheadForm] = useState(false);
  const [message, setMessage] = useState("");

  const settings = settingsStore.items[0] ?? defaultSettings;
  const summary = useMemo(() => {
    const annualOverheads = overheads.items.reduce((sum, item) => sum + annualAmount(item), 0);
    const monthlyOverheads = annualOverheads / 12;
    const billableHours = settings.workingDaysPerYear * settings.billableHoursPerDay;
    const overheadPerHour = billableHours > 0 ? annualOverheads / billableHours : 0;
    const activeRates = rates.items.filter((item) => item.active);
    const averageMargin = activeRates.length ? activeRates.reduce((sum, item) => sum + margin(item.costRate, item.chargeRate), 0) / activeRates.length : 0;
    return { annualOverheads, monthlyOverheads, billableHours, overheadPerHour, activeRates, averageMargin };
  }, [overheads.items, rates.items, settings.billableHoursPerDay, settings.workingDaysPerYear]);

  function saveRate(event: FormEvent) {
    event.preventDefault();
    if (!rateForm.name.trim() || Number(rateForm.chargeRate) <= 0) {
      setMessage("Enter a rate name and a charge rate greater than £0.");
      return;
    }
    const now = new Date().toISOString();
    rates.setItems((current) => [{
      id: makeId("labour-rate"),
      name: rateForm.name.trim(),
      description: rateForm.description.trim(),
      costRate: Number(rateForm.costRate || 0),
      chargeRate: Number(rateForm.chargeRate || 0),
      unit: rateForm.unit,
      active: true,
      createdAt: now,
      updatedAt: now,
    }, ...current]);
    setRateForm(blankRate);
    setShowRateForm(false);
    setMessage("Labour rate saved.");
  }

  function saveOverhead(event: FormEvent) {
    event.preventDefault();
    if (!overheadForm.name.trim() || Number(overheadForm.amount) <= 0) {
      setMessage("Enter an overhead name and an amount greater than £0.");
      return;
    }
    const now = new Date().toISOString();
    overheads.setItems((current) => [{
      id: makeId("overhead"),
      name: overheadForm.name.trim(),
      category: overheadForm.category,
      amount: Number(overheadForm.amount || 0),
      frequency: overheadForm.frequency,
      notes: overheadForm.notes.trim(),
      active: true,
      createdAt: now,
      updatedAt: now,
    }, ...current]);
    setOverheadForm(blankOverhead);
    setShowOverheadForm(false);
    setMessage("Business overhead saved.");
  }

  function updateSettings(patch: Partial<LabourCostSettings>) {
    settingsStore.setItems([{ ...settings, ...patch, updatedAt: new Date().toISOString() }]);
  }

  function toggleRate(id: string) {
    rates.setItems((current) => current.map((item) => item.id === id ? { ...item, active: !item.active, updatedAt: new Date().toISOString() } : item));
  }

  function toggleOverhead(id: string) {
    overheads.setItems((current) => current.map((item) => item.id === id ? { ...item, active: !item.active, updatedAt: new Date().toISOString() } : item));
  }

  if (!rates.isReady || !overheads.isReady || !settingsStore.isReady) return <Card>Loading labour and costs…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance foundation" title="Labour & Costs Centre" description="Set the real cost of labour, fixed business overheads and pricing targets before building quotes and job profitability around them." />

    <div className="grid gap-3 sm:grid-cols-2">
      <Button onClick={() => setShowRateForm((current) => !current)}><Plus className="mr-2 size-4" />Add labour rate</Button>
      <Button variant="secondary" onClick={() => setShowOverheadForm((current) => !current)}><Plus className="mr-2 size-4" />Add overhead</Button>
    </div>

    {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><Banknote className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Monthly overheads</p><p className="mt-2 text-3xl font-bold">{money.format(summary.monthlyOverheads)}</p></Card>
      <Card><BriefcaseBusiness className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Annual overheads</p><p className="mt-2 text-3xl font-bold">{money.format(summary.annualOverheads)}</p></Card>
      <Card><Calculator className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Overhead per billable hour</p><p className="mt-2 text-3xl font-bold">{money.format(summary.overheadPerHour)}</p></Card>
      <Card><TrendingUp className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Average labour margin</p><p className="mt-2 text-3xl font-bold">{summary.averageMargin.toFixed(1)}%</p></Card>
    </section>

    {showRateForm ? <Card><form onSubmit={saveRate} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <InputField required label="Rate name" placeholder="Electrician, mate, subcontractor…" value={rateForm.name} onChange={(event) => setRateForm({ ...rateForm, name: event.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Rate unit</span><select value={rateForm.unit} onChange={(event) => setRateForm({ ...rateForm, unit: event.target.value as LabourRateUnit })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{rateUnits.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
      <div />
      <InputField label={`True cost per ${rateForm.unit.toLowerCase()} (£)`} type="number" min="0" step="0.01" value={rateForm.costRate} onChange={(event) => setRateForm({ ...rateForm, costRate: event.target.value })} />
      <InputField required label={`Customer charge per ${rateForm.unit.toLowerCase()} (£)`} type="number" min="0" step="0.01" value={rateForm.chargeRate} onChange={(event) => setRateForm({ ...rateForm, chargeRate: event.target.value })} />
      <div className="md:col-span-2 xl:col-span-3"><TextareaField label="Description" value={rateForm.description} onChange={(event) => setRateForm({ ...rateForm, description: event.target.value })} /></div>
      <div className="md:col-span-2 xl:col-span-3 flex justify-end"><Button type="submit">Save labour rate</Button></div>
    </form></Card> : null}

    {showOverheadForm ? <Card><form onSubmit={saveOverhead} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <InputField required label="Overhead name" placeholder="Van insurance, software, public liability…" value={overheadForm.name} onChange={(event) => setOverheadForm({ ...overheadForm, name: event.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Category</span><select value={overheadForm.category} onChange={(event) => setOverheadForm({ ...overheadForm, category: event.target.value as OverheadCategory })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Frequency</span><select value={overheadForm.frequency} onChange={(event) => setOverheadForm({ ...overheadForm, frequency: event.target.value as OverheadFrequency })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{frequencies.map((frequency) => <option key={frequency}>{frequency}</option>)}</select></label>
      <InputField required label="Amount (£)" type="number" min="0" step="0.01" value={overheadForm.amount} onChange={(event) => setOverheadForm({ ...overheadForm, amount: event.target.value })} />
      <div className="md:col-span-2"><TextareaField label="Notes" value={overheadForm.notes} onChange={(event) => setOverheadForm({ ...overheadForm, notes: event.target.value })} /></div>
      <div className="md:col-span-2 xl:col-span-3 flex justify-end"><Button type="submit">Save overhead</Button></div>
    </form></Card> : null}

    <section className="grid gap-6 xl:grid-cols-[1fr_1.5fr]">
      <Card>
        <div className="flex items-center gap-3"><Save className="size-5 text-cyan-300" /><div><h2 className="text-xl font-bold">Pricing assumptions</h2><p className="text-sm text-slate-500">Used to spread overheads across realistic working time.</p></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <InputField label="Working days per year" type="number" min="1" value={settings.workingDaysPerYear} onChange={(event) => updateSettings({ workingDaysPerYear: Number(event.target.value || 0) })} />
          <InputField label="Billable hours per day" type="number" min="0.5" step="0.5" value={settings.billableHoursPerDay} onChange={(event) => updateSettings({ billableHoursPerDay: Number(event.target.value || 0) })} />
          <InputField label="Target net margin (%)" type="number" min="0" max="100" step="1" value={settings.targetNetMargin} onChange={(event) => updateSettings({ targetNetMargin: Number(event.target.value || 0) })} />
          <InputField label="Contingency allowance (%)" type="number" min="0" max="100" step="1" value={settings.contingencyPercent} onChange={(event) => updateSettings({ contingencyPercent: Number(event.target.value || 0) })} />
        </div>
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400"><p><span className="font-semibold text-slate-200">{summary.billableHours.toFixed(0)} billable hours</span> per year based on these assumptions.</p><p className="mt-2">These are planning figures; Phase 2 can feed them directly into quotes and job cost forecasts.</p></div>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center gap-2"><Users className="size-5 text-cyan-300" /><h2 className="text-xl font-bold">Labour rate card</h2></div>
        {rates.items.length === 0 ? <Card><p className="text-sm text-slate-400">No labour rates yet. Add the rates you pay and charge for each role.</p></Card> : rates.items.map((rate) => <Card key={rate.id} className={rate.active ? "" : "opacity-60"}>
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{rate.unit} rate</p><h3 className="mt-1 text-lg font-bold">{rate.name}</h3><p className="mt-1 text-sm text-slate-500">{rate.description || "No description"}</p></div><button onClick={() => rates.remove((item) => item.id === rate.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300" aria-label={`Delete ${rate.name}`}><Trash2 className="size-4" /></button></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-slate-500">True cost</p><p className="font-semibold">{money.format(rate.costRate)}</p></div><div><p className="text-xs text-slate-500">Charge rate</p><p className="font-semibold">{money.format(rate.chargeRate)}</p></div><div><p className="text-xs text-slate-500">Gross margin</p><p className={`font-semibold ${margin(rate.costRate, rate.chargeRate) >= settings.targetNetMargin ? "text-emerald-300" : "text-amber-300"}`}>{margin(rate.costRate, rate.chargeRate).toFixed(1)}%</p></div></div>
          <button onClick={() => toggleRate(rate.id)} className="mt-4 text-sm font-semibold text-cyan-300">{rate.active ? "Set inactive" : "Set active"}</button>
        </Card>)}
      </div>
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-bold">Business overheads</h2>
      {overheads.items.length === 0 ? <Card><p className="text-sm text-slate-400">No overheads yet. Add recurring costs so JR OS can calculate the minimum cost of every working hour.</p></Card> : <div className="grid gap-4 lg:grid-cols-2">{overheads.items.map((overhead) => <Card key={overhead.id} className={overhead.active ? "" : "opacity-60"}>
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{overhead.category}</p><h3 className="mt-1 text-lg font-bold">{overhead.name}</h3><p className="mt-1 text-sm text-slate-500">{money.format(overhead.amount)} {overhead.frequency.toLowerCase()}</p></div><button onClick={() => overheads.remove((item) => item.id === overhead.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300" aria-label={`Delete ${overhead.name}`}><Trash2 className="size-4" /></button></div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-4"><p className="text-sm text-slate-400">Annual cost <span className="ml-1 font-semibold text-slate-100">{money.format(annualAmount({ ...overhead, active: true }))}</span></p><button onClick={() => toggleOverhead(overhead.id)} className="text-sm font-semibold text-cyan-300">{overhead.active ? "Set inactive" : "Set active"}</button></div>
      </Card>)}</div>}
    </section>
  </div>;
}

