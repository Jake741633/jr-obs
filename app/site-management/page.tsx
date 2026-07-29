"use client";

import { FormEvent, useMemo, useState } from "react";
import { ClipboardList, Clock3, FileWarning, Plus, Trash2, WalletCards } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { Job, JobVariation, SiteDiaryEntry, VariationStatus } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const variationStatuses: VariationStatus[] = ["Draft", "Awaiting approval", "Approved", "Declined", "Invoiced"];
const blankDiary = { jobId: "", workDate: "", startedAt: "", finishedAt: "", breakMinutes: "0", completedBy: "Jake", workCompleted: "", delays: "", customerRequests: "", materialsUsed: "", voiceNotes: "" };
const blankVariation = { jobId: "", title: "", description: "", labourHours: "0", labourRate: "0", materialCost: "0", materialCharge: "0", otherCharge: "0", status: "Draft" as VariationStatus, approvalMethod: "Not approved" as JobVariation["approvalMethod"], approvalReference: "", requestedBy: "" };

export default function SiteManagementPage() {
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const diaries = useLocalStorageCollection<SiteDiaryEntry>("jr-os-site-diaries");
  const variations = useLocalStorageCollection<JobVariation>("jr-os-job-variations");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [showDiaryForm, setShowDiaryForm] = useState(false);
  const [showVariationForm, setShowVariationForm] = useState(false);
  const [diaryForm, setDiaryForm] = useState(blankDiary);
  const [variationForm, setVariationForm] = useState(blankVariation);
  const [message, setMessage] = useState("");

  const activeJobs = useMemo(() => jobs.items.filter((job) => job.status !== "Complete"), [jobs.items]);
  const visibleDiaries = useMemo(() => diaries.items.filter((entry) => !selectedJobId || entry.jobId === selectedJobId).toSorted((a, b) => new Date(b.workDate).getTime() - new Date(a.workDate).getTime()), [diaries.items, selectedJobId]);
  const visibleVariations = useMemo(() => variations.items.filter((entry) => !selectedJobId || entry.jobId === selectedJobId).toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [variations.items, selectedJobId]);
  const approvedVariationValue = visibleVariations.filter((variation) => variation.status === "Approved" || variation.status === "Invoiced").reduce((sum, variation) => sum + variation.labourHours * variation.labourRate + variation.materialCharge + variation.otherCharge, 0);
  const totalHours = visibleDiaries.reduce((sum, entry) => {
    if (!entry.startedAt || !entry.finishedAt) return sum;
    const start = new Date(`${entry.workDate}T${entry.startedAt}`).getTime();
    const finish = new Date(`${entry.workDate}T${entry.finishedAt}`).getTime();
    return sum + Math.max(0, (finish - start) / 3_600_000 - entry.breakMinutes / 60);
  }, 0);

  function jobName(jobId: string) { return jobs.items.find((job) => job.id === jobId)?.title || "Unknown job"; }

  function addDiary(event: FormEvent) {
    event.preventDefault();
    if (!diaryForm.jobId || !diaryForm.workDate || !diaryForm.workCompleted.trim()) { setMessage("Choose a job, date and enter the work completed."); return; }
    const now = new Date().toISOString();
    const entry: SiteDiaryEntry = { id: makeId("diary"), jobId: diaryForm.jobId, workDate: diaryForm.workDate, startedAt: diaryForm.startedAt, finishedAt: diaryForm.finishedAt, breakMinutes: Number(diaryForm.breakMinutes || 0), completedBy: diaryForm.completedBy.trim() || "Jake", workCompleted: diaryForm.workCompleted.trim(), delays: diaryForm.delays.trim(), customerRequests: diaryForm.customerRequests.trim(), materialsUsed: diaryForm.materialsUsed.trim(), voiceNotes: diaryForm.voiceNotes.trim(), createdAt: now, updatedAt: now };
    diaries.setItems((current) => [entry, ...current]);
    setDiaryForm({ ...blankDiary, jobId: selectedJobId || diaryForm.jobId });
    setShowDiaryForm(false);
    setMessage("Site diary entry saved.");
  }

  function addVariation(event: FormEvent) {
    event.preventDefault();
    if (!variationForm.jobId || !variationForm.title.trim()) { setMessage("Choose a job and enter a variation title."); return; }
    const now = new Date().toISOString();
    const number = `VAR-${String(variations.items.filter((item) => item.jobId === variationForm.jobId).length + 1).padStart(3, "0")}`;
    const variation: JobVariation = { id: makeId("variation"), jobId: variationForm.jobId, number, title: variationForm.title.trim(), description: variationForm.description.trim(), labourHours: Number(variationForm.labourHours || 0), labourRate: Number(variationForm.labourRate || 0), materialCost: Number(variationForm.materialCost || 0), materialCharge: Number(variationForm.materialCharge || 0), otherCharge: Number(variationForm.otherCharge || 0), status: variationForm.status, approvalMethod: variationForm.approvalMethod, approvalReference: variationForm.approvalReference.trim(), requestedBy: variationForm.requestedBy.trim(), createdAt: now, updatedAt: now };
    variations.setItems((current) => [variation, ...current]);
    setVariationForm({ ...blankVariation, jobId: selectedJobId || variationForm.jobId });
    setShowVariationForm(false);
    setMessage(`${number} saved.`);
  }

  function updateVariation(id: string, status: VariationStatus) {
    variations.setItems((current) => current.map((variation) => variation.id === id ? { ...variation, status, updatedAt: new Date().toISOString() } : variation));
  }

  const ready = jobs.isReady && diaries.isReady && variations.isReady;
  if (!ready) return <Card>Loading site management…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Operations" title="Site Management" description="Record daily work, labour time, delays, customer requests and chargeable variations across live jobs." />

    <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
      <select value={selectedJobId} onChange={(event) => { setSelectedJobId(event.target.value); setDiaryForm((current) => ({ ...current, jobId: event.target.value })); setVariationForm((current) => ({ ...current, jobId: event.target.value })); }} className="min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-4 text-sm"><option value="">All jobs</option>{activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select>
      <Button onClick={() => setShowDiaryForm((current) => !current)}><Clock3 className="mr-2 size-4" />New diary</Button>
      <Button variant="secondary" onClick={() => setShowVariationForm((current) => !current)}><Plus className="mr-2 size-4" />New variation</Button>
    </div>

    {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><ClipboardList className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Diary entries</p><p className="mt-2 text-3xl font-bold">{visibleDiaries.length}</p></Card>
      <Card><Clock3 className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Logged labour</p><p className="mt-2 text-3xl font-bold">{totalHours.toFixed(1)}h</p></Card>
      <Card><FileWarning className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Open variations</p><p className="mt-2 text-3xl font-bold">{visibleVariations.filter((item) => item.status === "Draft" || item.status === "Awaiting approval").length}</p></Card>
      <Card><WalletCards className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Approved extras</p><p className="mt-2 text-3xl font-bold">{money.format(approvedVariationValue)}</p></Card>
    </section>

    {showDiaryForm ? <Card><form onSubmit={addDiary} className="grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Job</span><select value={diaryForm.jobId} onChange={(event) => setDiaryForm({ ...diaryForm, jobId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose job</option>{jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label><InputField required label="Work date" type="date" value={diaryForm.workDate} onChange={(event) => setDiaryForm({ ...diaryForm, workDate: event.target.value })} /><InputField label="Started" type="time" value={diaryForm.startedAt} onChange={(event) => setDiaryForm({ ...diaryForm, startedAt: event.target.value })} /><InputField label="Finished" type="time" value={diaryForm.finishedAt} onChange={(event) => setDiaryForm({ ...diaryForm, finishedAt: event.target.value })} /><InputField label="Break minutes" type="number" min="0" value={diaryForm.breakMinutes} onChange={(event) => setDiaryForm({ ...diaryForm, breakMinutes: event.target.value })} /><InputField label="Completed by" value={diaryForm.completedBy} onChange={(event) => setDiaryForm({ ...diaryForm, completedBy: event.target.value })} /><div className="md:col-span-2"><TextareaField required label="Work completed" value={diaryForm.workCompleted} onChange={(event) => setDiaryForm({ ...diaryForm, workCompleted: event.target.value })} /></div><TextareaField label="Delays / problems" value={diaryForm.delays} onChange={(event) => setDiaryForm({ ...diaryForm, delays: event.target.value })} /><TextareaField label="Customer or builder requests" value={diaryForm.customerRequests} onChange={(event) => setDiaryForm({ ...diaryForm, customerRequests: event.target.value })} /><TextareaField label="Materials used" value={diaryForm.materialsUsed} onChange={(event) => setDiaryForm({ ...diaryForm, materialsUsed: event.target.value })} /><TextareaField label="Voice-note transcript" value={diaryForm.voiceNotes} onChange={(event) => setDiaryForm({ ...diaryForm, voiceNotes: event.target.value })} /><div className="md:col-span-2 flex justify-end"><Button type="submit">Save diary entry</Button></div></form></Card> : null}

    {showVariationForm ? <Card><form onSubmit={addVariation} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Job</span><select value={variationForm.jobId} onChange={(event) => setVariationForm({ ...variationForm, jobId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose job</option>{jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label><InputField required label="Variation title" value={variationForm.title} onChange={(event) => setVariationForm({ ...variationForm, title: event.target.value })} /><InputField label="Requested by" value={variationForm.requestedBy} onChange={(event) => setVariationForm({ ...variationForm, requestedBy: event.target.value })} /><div className="md:col-span-2 xl:col-span-3"><TextareaField label="Description and scope" value={variationForm.description} onChange={(event) => setVariationForm({ ...variationForm, description: event.target.value })} /></div><InputField label="Labour hours" type="number" min="0" step="0.25" value={variationForm.labourHours} onChange={(event) => setVariationForm({ ...variationForm, labourHours: event.target.value })} /><InputField label="Labour charge rate (£)" type="number" min="0" step="0.01" value={variationForm.labourRate} onChange={(event) => setVariationForm({ ...variationForm, labourRate: event.target.value })} /><InputField label="Material cost (£)" type="number" min="0" step="0.01" value={variationForm.materialCost} onChange={(event) => setVariationForm({ ...variationForm, materialCost: event.target.value })} /><InputField label="Material charge (£)" type="number" min="0" step="0.01" value={variationForm.materialCharge} onChange={(event) => setVariationForm({ ...variationForm, materialCharge: event.target.value })} /><InputField label="Other charge (£)" type="number" min="0" step="0.01" value={variationForm.otherCharge} onChange={(event) => setVariationForm({ ...variationForm, otherCharge: event.target.value })} /><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Status</span><select value={variationForm.status} onChange={(event) => setVariationForm({ ...variationForm, status: event.target.value as VariationStatus })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{variationStatuses.map((status) => <option key={status}>{status}</option>)}</select></label><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Approval method</span><select value={variationForm.approvalMethod} onChange={(event) => setVariationForm({ ...variationForm, approvalMethod: event.target.value as JobVariation["approvalMethod"] })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>Not approved</option><option>Signature</option><option>Email</option><option>WhatsApp</option><option>Verbal</option></select></label><InputField label="Approval reference / note" value={variationForm.approvalReference} onChange={(event) => setVariationForm({ ...variationForm, approvalReference: event.target.value })} /><div className="xl:col-span-3 flex justify-end"><Button type="submit">Save variation</Button></div></form></Card> : null}

    <section className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-3"><h2 className="text-xl font-bold">Daily site diary</h2>{visibleDiaries.length === 0 ? <Card><p className="text-sm text-slate-400">No diary entries for this selection.</p></Card> : visibleDiaries.map((entry) => <Card key={entry.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{jobName(entry.jobId)}</p><h3 className="mt-1 font-bold">{new Date(`${entry.workDate}T12:00:00`).toLocaleDateString("en-GB")}</h3><p className="text-sm text-slate-500">{entry.completedBy}{entry.startedAt ? ` · ${entry.startedAt}-${entry.finishedAt || "ongoing"}` : ""}</p></div><button onClick={() => diaries.remove((item) => item.id === entry.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300" aria-label="Delete diary entry"><Trash2 className="size-4" /></button></div><p className="mt-4 whitespace-pre-wrap text-sm text-slate-300">{entry.workCompleted}</p>{entry.delays ? <p className="mt-3 rounded-xl bg-amber-500/5 p-3 text-sm text-amber-200"><strong>Delay:</strong> {entry.delays}</p> : null}{entry.customerRequests ? <p className="mt-3 text-sm text-slate-400"><strong className="text-slate-200">Requests:</strong> {entry.customerRequests}</p> : null}</Card>)}</div>
      <div className="space-y-3"><h2 className="text-xl font-bold">Variations</h2>{visibleVariations.length === 0 ? <Card><p className="text-sm text-slate-400">No variations for this selection.</p></Card> : visibleVariations.map((variation) => { const sellValue = variation.labourHours * variation.labourRate + variation.materialCharge + variation.otherCharge; const cost = variation.materialCost; return <Card key={variation.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{variation.number} · {jobName(variation.jobId)}</p><h3 className="mt-1 font-bold">{variation.title}</h3><p className="text-sm text-slate-500">Requested by {variation.requestedBy || "not recorded"}</p></div><button onClick={() => variations.remove((item) => item.id === variation.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300" aria-label="Delete variation"><Trash2 className="size-4" /></button></div><p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{variation.description || "No description added."}</p><div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-slate-950 p-3 text-sm"><div><p className="text-slate-500">Charge</p><strong>{money.format(sellValue)}</strong></div><div><p className="text-slate-500">Known cost</p><strong>{money.format(cost)}</strong></div><div><p className="text-slate-500">Gross profit</p><strong>{money.format(sellValue - cost)}</strong></div></div><div className="mt-4 flex flex-wrap items-center gap-3"><select value={variation.status} onChange={(event) => updateVariation(variation.id, event.target.value as VariationStatus)} className="min-h-10 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm">{variationStatuses.map((status) => <option key={status}>{status}</option>)}</select><span className="text-xs text-slate-500">Approval: {variation.approvalMethod}</span></div></Card>; })}</div>
    </section>
  </div>;
}
