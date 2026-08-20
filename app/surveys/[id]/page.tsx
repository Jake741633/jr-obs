"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { useCustomersCollection, useJobsCollection, usePricingDocumentsCollection, useSurveysCollection } from "../../../lib/cloud/coreBusinessCollections";
import { useCloudIdentity } from "../../../lib/cloud/useCloudIdentity";
import { makeId } from "../../../lib/storage";
import type { PricingDocument, SiteSurvey, SurveyCircuit } from "../../../lib/models";

const steps = ["Customer", "Property", "Consumer unit", "Circuits", "Defects & risks", "Recommendations", "Review"];
const defects = ["No SPD", "No RCD protection", "No RCBOs", "Missing main bonding", "Undersized bonding", "Signs of overheating", "Damaged accessories", "Rubber or VIR cable", "Incorrect polarity", "High Zs", "Failed RCD", "No labelling", "Fire risk", "Overloaded consumer unit"];
const risks = ["Asbestos suspected", "Working at height", "Live working required", "Loft access", "Confined space", "Fragile ceiling", "Occupied property", "Vulnerable occupants"];
const recommendationMap: Record<string, string> = {
  "No SPD": "Install surge protection",
  "No RCD protection": "Provide 30 mA RCD protection",
  "No RCBOs": "Consider RCBO consumer unit upgrade",
  "Missing main bonding": "Install main protective bonding",
  "Undersized bonding": "Upgrade main protective bonding",
  "Signs of overheating": "Investigate and repair overheated connections",
  "Damaged accessories": "Replace damaged accessories",
  "Rubber or VIR cable": "Assess for partial or full rewire",
  "Incorrect polarity": "Trace and correct polarity fault",
  "High Zs": "Investigate earth fault loop impedance",
  "Failed RCD": "Replace failed RCD protection",
  "No labelling": "Provide circuit identification and notices",
  "Fire risk": "Complete urgent remedial works",
  "Overloaded consumer unit": "Upgrade or extend consumer unit",
};
const fieldClass = "min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-cyan-400";

export default function SurveyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const surveys = useSurveysCollection();
  const customers = useCustomersCollection();
  const jobs = useJobsCollection();
  const quotes = usePricingDocumentsCollection();
  const { identity } = useCloudIdentity();
  const fieldMode = identity?.role === "electrician";
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("");
  const survey = surveys.items.find((item) => item.id === id);

  if (!surveys.isReady || !customers.isReady || !jobs.isReady || !quotes.isReady) return <Card>Loading survey…</Card>;
  if (!survey) return <Card>Survey not found.</Card>;

  const activeSurvey: SiteSurvey = survey;

  function update(patch: Partial<SiteSurvey>) {
    if (fieldMode && ("customerId" in patch || "jobId" in patch)) return;
    surveys.setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item));
  }

  function toggle(list: string[], value: string, key: "defects" | "risks") {
    const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
    const patch: Partial<SiteSurvey> = { [key]: next };
    if (key === "defects") {
      patch.healthScore = Math.max(10, 100 - next.reduce((total, item) => total + (["Fire risk", "Rubber or VIR cable", "Signs of overheating"].includes(item) ? 12 : 6), 0));
      patch.recommendations = Array.from(new Set([...activeSurvey.recommendations, ...next.map((item) => recommendationMap[item]).filter(Boolean)]));
    }
    update(patch);
  }

  function addCircuit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const circuit: SurveyCircuit = {
      id: makeId("circuit"),
      name: String(data.get("name") || "New circuit"),
      protectiveDevice: String(data.get("device") || ""),
      cableSize: String(data.get("cable") || ""),
      estimatedLength: Number(data.get("length") || 0),
      observations: "",
      recommendation: "",
    };
    update({ circuits: [...activeSurvey.circuits, circuit] });
    event.currentTarget.reset();
  }

  function createQuote() {
    if (fieldMode) {
      setMessage("Field survey recommendations are ready for office review. Quote creation is restricted to office roles.");
      return;
    }
    const now = new Date();
    const lines = activeSurvey.recommendations.map((recommendation) => ({ id: makeId("line"), description: recommendation, category: "Labour" as const, quantity: 1, unitPrice: 0 }));
    if (activeSurvey.labourHours > 0) lines.unshift({ id: makeId("line"), description: "Electrical labour from site survey", category: "Labour", quantity: activeSurvey.labourHours, unitPrice: activeSurvey.labourRate });
    const quote: PricingDocument = {
      id: makeId("quote"),
      number: `Q-${String(quotes.items.length + 1).padStart(4, "0")}`,
      type: "Quote",
      status: "Draft",
      customerId: activeSurvey.customerId,
      jobId: activeSurvey.jobId,
      title: `Works recommended from ${activeSurvey.number}`,
      validUntil: new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10),
      vatEnabled: false,
      vatRate: 20,
      items: lines,
      notes: `Generated from survey ${activeSurvey.number}.\n\n${activeSurvey.surveyNotes}`,
      terms: "Quotation subject to final testing, access and confirmation of scope.",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    quotes.setItems((current) => [quote, ...current]);
    update({ status: "Complete" });
    setMessage(`Draft quote ${quote.number} created.`);
  }

  return <div className="space-y-6">
    <Link href="/surveys" className="inline-flex items-center gap-2 text-sm text-cyan-300"><ArrowLeft className="size-4" />Back to surveys</Link>
    <Card className="border-cyan-400/30"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{activeSurvey.number}</p><h1 className="mt-2 text-3xl font-bold">Smart site survey</h1><p className="mt-2 text-sm text-slate-400">Saved automatically on this device.</p></div><select className={fieldClass} style={{ width: 160 }} value={activeSurvey.status} onChange={(event) => update({ status: event.target.value as SiteSurvey["status"] })}><option>Draft</option><option>In progress</option><option>Complete</option></select></div></Card>

    <div className="grid grid-cols-2 gap-2 md:grid-cols-7">{steps.map((label, index) => <button key={label} onClick={() => setStep(index)} className={`rounded-xl border p-3 text-xs font-semibold ${index === step ? "border-cyan-400 bg-cyan-400 text-slate-950" : "border-slate-800 bg-slate-900 text-slate-400"}`}><span className="block">{index + 1}</span>{label}</button>)}</div>

    {step === 0 && <Card><h2 className="text-xl font-bold">Link customer and job</h2><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm">Customer<select className={fieldClass} value={activeSurvey.customerId || ""} disabled={fieldMode} onChange={(e) => update({ customerId: e.target.value || undefined })}><option value="">Select customer</option>{customers.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-2 text-sm">Job<select className={fieldClass} value={activeSurvey.jobId || ""} disabled={fieldMode} onChange={(e) => update({ jobId: e.target.value || undefined })}><option value="">Select job</option>{jobs.items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div>{fieldMode ? <p className="mt-4 text-sm text-amber-200">Field survey customer and job links are fixed to the assigned job. Ask the office to correct the assignment.</p> : null}</Card>}

    {step === 1 && <Card><h2 className="text-xl font-bold">Property and supply</h2><div className="mt-5 grid gap-4 md:grid-cols-3">{[["Property type","propertyType"],["Occupancy","occupancy"],["Construction","constructionType"],["Loft access","loftAccess"],["Installation age","installationAge"],["Earthing arrangement","earthingArrangement"],["Supply type","supplyType"],["Fuse rating","fuseRating"],["Meter position","meterPosition"]].map(([label,key]) => <label key={key} className="grid gap-2 text-sm">{label}<input className={fieldClass} value={String(activeSurvey[key as keyof SiteSurvey] ?? "")} onChange={(e) => update({ [key]: e.target.value })} /></label>)}<label className="grid gap-2 text-sm">Floors<input type="number" min="0" className={fieldClass} value={activeSurvey.floors} onChange={(e) => update({ floors: Number(e.target.value) })} /></label><label className="grid gap-2 text-sm">Bedrooms<input type="number" min="0" className={fieldClass} value={activeSurvey.bedrooms} onChange={(e) => update({ bedrooms: Number(e.target.value) })} /></label></div></Card>}

    {step === 2 && <Card><h2 className="text-xl font-bold">Consumer unit</h2><div className="mt-5 grid gap-4 md:grid-cols-3">{[["Manufacturer","consumerUnitManufacturer"],["Number of ways","consumerUnitWays"],["RCD type","rcdType"],["Spare ways","spareWays"],["Condition","consumerUnitCondition"],["CU position","consumerUnitPosition"],["Main bonding","mainBonding"],["Earthing conductor","earthingConductorSize"]].map(([label,key]) => <label key={key} className="grid gap-2 text-sm">{label}<input className={fieldClass} value={String(activeSurvey[key as keyof SiteSurvey] ?? "")} onChange={(e) => update({ [key]: e.target.value })} /></label>)}</div><div className="mt-5 flex flex-wrap gap-4">{[["SPD fitted","spdFitted"],["RCBOs fitted","rcbosFitted"]].map(([label,key]) => <label key={key} className="flex items-center gap-3 rounded-xl border border-slate-700 p-4"><input type="checkbox" checked={Boolean(activeSurvey[key as keyof SiteSurvey])} onChange={(e) => update({ [key]: e.target.checked })} />{label}</label>)}</div></Card>}

    {step === 3 && <div className="space-y-4"><Card><h2 className="text-xl font-bold">Add circuit</h2><form onSubmit={addCircuit} className="mt-5 grid gap-3 md:grid-cols-5"><input required name="name" className={fieldClass} placeholder="Circuit name" /><input name="device" className={fieldClass} placeholder="Protective device" /><input name="cable" className={fieldClass} placeholder="Cable size" /><input name="length" type="number" min="0" className={fieldClass} placeholder="Est. metres" /><Button type="submit"><Plus className="mr-2 size-4" />Add</Button></form></Card>{activeSurvey.circuits.map((circuit) => <Card key={circuit.id}><div className="flex items-start gap-3"><div className="grid flex-1 gap-3 md:grid-cols-4"><input className={fieldClass} value={circuit.name} onChange={(e) => update({ circuits: activeSurvey.circuits.map((item) => item.id === circuit.id ? { ...item, name: e.target.value } : item) })} /><input className={fieldClass} value={circuit.protectiveDevice} onChange={(e) => update({ circuits: activeSurvey.circuits.map((item) => item.id === circuit.id ? { ...item, protectiveDevice: e.target.value } : item) })} /><input className={fieldClass} value={circuit.cableSize} onChange={(e) => update({ circuits: activeSurvey.circuits.map((item) => item.id === circuit.id ? { ...item, cableSize: e.target.value } : item) })} /><input className={fieldClass} placeholder="Observations" value={circuit.observations} onChange={(e) => update({ circuits: activeSurvey.circuits.map((item) => item.id === circuit.id ? { ...item, observations: e.target.value } : item) })} /></div><button type="button" onClick={() => update({ circuits: activeSurvey.circuits.filter((item) => item.id !== circuit.id) })} className="p-3 text-red-300"><Trash2 className="size-4" /></button></div></Card>)}</div>}

    {step === 4 && <div className="grid gap-4 lg:grid-cols-2"><Card><h2 className="text-xl font-bold">Defect library</h2><div className="mt-4 grid gap-2">{defects.map((item) => <label key={item} className="flex items-center gap-3 rounded-xl border border-slate-800 p-3"><input type="checkbox" checked={activeSurvey.defects.includes(item)} onChange={() => toggle(activeSurvey.defects, item, "defects")} />{item}</label>)}</div></Card><Card><h2 className="text-xl font-bold">Site risks</h2><div className="mt-4 grid gap-2">{risks.map((item) => <label key={item} className="flex items-center gap-3 rounded-xl border border-slate-800 p-3"><input type="checkbox" checked={activeSurvey.risks.includes(item)} onChange={() => toggle(activeSurvey.risks, item, "risks")} />{item}</label>)}</div></Card></div>}

    {step === 5 && <Card><div className="flex items-center gap-3"><Sparkles className="size-6 text-cyan-400" /><div><h2 className="text-xl font-bold">Recommended works</h2><p className="text-sm text-slate-400">Generated from selected defects and editable before quoting.</p></div></div><div className="mt-5 space-y-2">{activeSurvey.recommendations.map((item, index) => <div key={`${item}-${index}`} className="flex gap-2"><input className={fieldClass} value={item} onChange={(e) => update({ recommendations: activeSurvey.recommendations.map((current, i) => i === index ? e.target.value : current) })} /><button type="button" onClick={() => update({ recommendations: activeSurvey.recommendations.filter((_, i) => i !== index) })} className="p-3 text-red-300"><Trash2 className="size-4" /></button></div>)}<Button variant="secondary" onClick={() => update({ recommendations: [...activeSurvey.recommendations, ""] })}><Plus className="mr-2 size-4" />Add recommendation</Button></div><div className="mt-6 grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm">Labour hours<input type="number" min="0" step="0.5" className={fieldClass} value={activeSurvey.labourHours} onChange={(e) => update({ labourHours: Number(e.target.value) })} /></label><label className="grid gap-2 text-sm">Hourly rate (£)<input type="number" min="0" step="0.01" className={fieldClass} value={activeSurvey.labourRate} onChange={(e) => update({ labourRate: Number(e.target.value) })} /></label></div></Card>}

    {step === 6 && <div className="space-y-4"><div className="grid gap-4 md:grid-cols-4"><Card><p className="text-sm text-slate-400">Health score</p><p className="mt-2 text-3xl font-bold">{activeSurvey.healthScore}%</p></Card><Card><p className="text-sm text-slate-400">Circuits</p><p className="mt-2 text-3xl font-bold">{activeSurvey.circuits.length}</p></Card><Card><p className="text-sm text-slate-400">Defects</p><p className="mt-2 text-3xl font-bold">{activeSurvey.defects.length}</p></Card><Card><p className="text-sm text-slate-400">Labour value</p><p className="mt-2 text-3xl font-bold">£{(activeSurvey.labourHours * activeSurvey.labourRate).toFixed(2)}</p></Card></div><Card><h2 className="text-xl font-bold">Voice/transcript notes</h2><textarea className={`${fieldClass} mt-4 min-h-32 py-3`} placeholder="Paste or type your spoken walkthrough here…" value={activeSurvey.voiceNotes} onChange={(e) => update({ voiceNotes: e.target.value })} /><h2 className="mt-6 text-xl font-bold">Survey notes</h2><textarea className={`${fieldClass} mt-4 min-h-32 py-3`} value={activeSurvey.surveyNotes} onChange={(e) => update({ surveyNotes: e.target.value })} /><div className="mt-6 flex flex-wrap items-center gap-3">{fieldMode ? <p className="text-sm text-amber-200">Survey recommendations are ready for office review. Quote creation is restricted to office roles.</p> : <Button onClick={createQuote}><Sparkles className="mr-2 size-4" />Generate draft quote</Button>}{message && <p className="flex items-center gap-2 text-sm text-emerald-300"><Check className="size-4" />{message}</p>}</div></Card></div>}

    <div className="flex justify-between"><Button variant="secondary" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}><ChevronLeft className="mr-2 size-4" />Previous</Button><Button disabled={step === steps.length - 1} onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}>Next<ChevronRight className="ml-2 size-4" /></Button></div>
  </div>;
}
