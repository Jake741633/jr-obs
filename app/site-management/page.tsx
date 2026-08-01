"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { Camera, ClipboardList, Clock3, FileWarning, Mic, Plus, ShieldAlert, Trash2, UsersRound, WalletCards } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useJobDocumentsCollection, useJobsCollection, useJobTimelineCollection, useJobVariationsCollection, useSiteDiariesCollection, useTeamCollection } from "../../lib/cloud/coreBusinessCollections";
import { isJobInactiveStatus, normaliseSiteDiaryEntry, siteDiaryDurationHours, siteDiaryTimelineEntry } from "../../lib/jobManagement-core.mjs";
import { makeId } from "../../lib/storage";
import type { JobDocument, JobVariation, SiteDiaryEntry, VariationStatus } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const variationStatuses: VariationStatus[] = ["Draft", "Awaiting approval", "Approved", "Declined", "Invoiced"];
const blankDiary = { jobId: "", workDate: "", startedAt: "", finishedAt: "", breakMinutes: "0", completedBy: "Jake", staffPresent: [] as string[], otherStaffPresent: "", workCompleted: "", delays: "", builderInstructions: "", customerInstructions: "", materialsUsed: "", materialsRequired: "", voiceNoteTranscript: "", weather: "", issuesAndRisks: "", followUpActions: "" };
const blankVariation = { jobId: "", title: "", description: "", labourHours: "0", labourRate: "0", materialCost: "0", materialCharge: "0", otherCharge: "0", status: "Draft" as VariationStatus, approvalMethod: "Not approved" as JobVariation["approvalMethod"], approvalReference: "", requestedBy: "" };

export default function SiteManagementPage() {
  const jobs = useJobsCollection();
  const diaries = useSiteDiariesCollection();
  const variations = useJobVariationsCollection();
  const timeline = useJobTimelineCollection();
  const team = useTeamCollection();
  const documents = useJobDocumentsCollection();
  const [selectedJobId, setSelectedJobId] = useState("");
  const [showDiaryForm, setShowDiaryForm] = useState(false);
  const [showVariationForm, setShowVariationForm] = useState(false);
  const [diaryForm, setDiaryForm] = useState(blankDiary);
  const [variationForm, setVariationForm] = useState(blankVariation);
  const [diaryPhotos, setDiaryPhotos] = useState<File[]>([]);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [message, setMessage] = useState("");

  const activeJobs = useMemo(() => jobs.items.filter((job) => !isJobInactiveStatus(job.status)), [jobs.items]);
  const visibleDiaries = useMemo(() => diaries.items.filter((entry) => !selectedJobId || entry.jobId === selectedJobId).toSorted((a, b) => new Date(b.workDate).getTime() - new Date(a.workDate).getTime()), [diaries.items, selectedJobId]);
  const visibleVariations = useMemo(() => variations.items.filter((entry) => !selectedJobId || entry.jobId === selectedJobId).toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [variations.items, selectedJobId]);
  const approvedVariationValue = visibleVariations.filter((variation) => variation.status === "Approved" || variation.status === "Invoiced").reduce((sum, variation) => sum + variation.labourHours * variation.labourRate + variation.materialCharge + variation.otherCharge, 0);
  const totalHours = visibleDiaries.reduce((sum, entry) => sum + siteDiaryDurationHours(entry), 0);

  function jobName(jobId: string) { return jobs.items.find((job) => job.id === jobId)?.title || "Unknown job"; }

  function chooseDiaryPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    const oversized = files.find((file) => file.size > 2_000_000);
    if (oversized) { setDiaryPhotos([]); setMessage(`${oversized.name} is larger than 2 MB. Choose smaller site photos for reliable offline capture.`); return; }
    setDiaryPhotos(files);
  }

  async function addDiary(event: FormEvent) {
    event.preventDefault();
    if (!diaryForm.jobId || !diaryForm.workDate || !diaryForm.workCompleted.trim()) { setMessage("Choose a job, date and enter the work completed."); return; }
    const now = new Date().toISOString();
    const photoDocuments = await Promise.all(diaryPhotos.map(async (file): Promise<JobDocument | null> => {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => resolve("");
        reader.readAsDataURL(file);
      });
      if (!dataUrl) return null;
      return { id: makeId("document"), jobId: diaryForm.jobId, name: `Site diary photo · ${diaryForm.workDate}`, category: "Photo", fileName: file.name, mimeType: file.type, dataUrl, externalUrl: "", notes: diaryForm.workCompleted.trim(), uploadedBy: diaryForm.completedBy.trim() || "Jake", uploadedAt: now, createdAt: now };
    }));
    const savedPhotos = photoDocuments.filter((document): document is JobDocument => Boolean(document));
    const entry: SiteDiaryEntry = { id: makeId("diary"), jobId: diaryForm.jobId, workDate: diaryForm.workDate, startedAt: diaryForm.startedAt, finishedAt: diaryForm.finishedAt, breakMinutes: Math.max(0, Number(diaryForm.breakMinutes || 0)), completedBy: diaryForm.completedBy.trim() || "Jake", staffPresent: diaryForm.staffPresent, otherStaffPresent: diaryForm.otherStaffPresent.trim(), workCompleted: diaryForm.workCompleted.trim(), delays: diaryForm.delays.trim(), builderInstructions: diaryForm.builderInstructions.trim(), customerRequests: diaryForm.customerInstructions.trim(), customerInstructions: diaryForm.customerInstructions.trim(), materialsUsed: diaryForm.materialsUsed.trim(), materialsRequired: diaryForm.materialsRequired.trim(), photoDocumentIds: savedPhotos.map((document) => document.id), voiceNotes: diaryForm.voiceNoteTranscript.trim(), voiceNoteTranscript: diaryForm.voiceNoteTranscript.trim(), weather: diaryForm.weather.trim(), issuesAndRisks: diaryForm.issuesAndRisks.trim(), followUpActions: diaryForm.followUpActions.trim(), createdAt: now, updatedAt: now };
    diaries.setItems((current) => [entry, ...current]);
    if (savedPhotos.length) documents.setItems((current) => [...savedPhotos, ...current]);
    timeline.setItems((current) => [siteDiaryTimelineEntry({ entry, timelineId: makeId("timeline"), completedBy: entry.completedBy, now }), ...current]);
    setDiaryForm({ ...blankDiary, jobId: selectedJobId || diaryForm.jobId });
    setDiaryPhotos([]);
    setPhotoInputKey((current) => current + 1);
    setShowDiaryForm(false);
    setMessage(`Site diary entry saved${savedPhotos.length ? ` with ${savedPhotos.length} photo${savedPhotos.length === 1 ? "" : "s"}` : ""} and added to the job timeline.`);
  }

  function deleteDiary(entry: SiteDiaryEntry) {
    if (!window.confirm(`Delete the ${entry.workDate} site diary entry?`)) return;
    const photoIds = new Set(entry.photoDocumentIds ?? []);
    diaries.remove((item) => item.id === entry.id);
    if (photoIds.size) documents.remove((document) => photoIds.has(document.id));
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

  const ready = jobs.isReady && diaries.isReady && variations.isReady && timeline.isReady && team.isReady && documents.isReady;
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

    {showDiaryForm ? <Card><form onSubmit={addDiary} className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Job</span><select required value={diaryForm.jobId} onChange={(event) => setDiaryForm({ ...diaryForm, jobId: event.target.value })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose job</option>{activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
      <InputField required label="Diary date" type="date" value={diaryForm.workDate} onChange={(event) => setDiaryForm({ ...diaryForm, workDate: event.target.value })} />
      <InputField label="Arrival time" type="time" value={diaryForm.startedAt} onChange={(event) => setDiaryForm({ ...diaryForm, startedAt: event.target.value })} />
      <InputField label="Finish time" type="time" value={diaryForm.finishedAt} onChange={(event) => setDiaryForm({ ...diaryForm, finishedAt: event.target.value })} />
      <InputField label="Break minutes" type="number" min="0" value={diaryForm.breakMinutes} onChange={(event) => setDiaryForm({ ...diaryForm, breakMinutes: event.target.value })} />
      <InputField label="Diary completed by" value={diaryForm.completedBy} onChange={(event) => setDiaryForm({ ...diaryForm, completedBy: event.target.value })} />
      <fieldset className="grid gap-3 rounded-xl border border-slate-800 p-4 md:col-span-2"><legend className="px-2 text-sm font-semibold text-slate-300">Staff present</legend><div className="grid gap-2 sm:grid-cols-2">{team.items.filter((member) => member.status === "Active").map((member) => <label key={member.id} className="flex min-h-12 items-center gap-3 rounded-xl bg-slate-950 px-3 text-sm"><input type="checkbox" checked={diaryForm.staffPresent.includes(member.id)} onChange={(event) => setDiaryForm((current) => ({ ...current, staffPresent: event.target.checked ? [...current.staffPresent, member.id] : current.staffPresent.filter((id) => id !== member.id) }))} className="size-5 accent-cyan-400" /><span>{member.name} · {member.role}</span></label>)}</div><InputField label="Other staff / subcontractors" value={diaryForm.otherStaffPresent} onChange={(event) => setDiaryForm({ ...diaryForm, otherStaffPresent: event.target.value })} /></fieldset>
      <div className="md:col-span-2"><TextareaField required label="Work completed" value={diaryForm.workCompleted} onChange={(event) => setDiaryForm({ ...diaryForm, workCompleted: event.target.value })} /></div>
      <TextareaField label="Delays" value={diaryForm.delays} onChange={(event) => setDiaryForm({ ...diaryForm, delays: event.target.value })} />
      <TextareaField label="Builder instructions" value={diaryForm.builderInstructions} onChange={(event) => setDiaryForm({ ...diaryForm, builderInstructions: event.target.value })} />
      <TextareaField label="Customer instructions" value={diaryForm.customerInstructions} onChange={(event) => setDiaryForm({ ...diaryForm, customerInstructions: event.target.value })} />
      <InputField label="Weather (where relevant)" value={diaryForm.weather} onChange={(event) => setDiaryForm({ ...diaryForm, weather: event.target.value })} />
      <TextareaField label="Materials used" value={diaryForm.materialsUsed} onChange={(event) => setDiaryForm({ ...diaryForm, materialsUsed: event.target.value })} />
      <TextareaField label="Materials required" value={diaryForm.materialsRequired} onChange={(event) => setDiaryForm({ ...diaryForm, materialsRequired: event.target.value })} />
      <TextareaField label="Issues and risks" value={diaryForm.issuesAndRisks} onChange={(event) => setDiaryForm({ ...diaryForm, issuesAndRisks: event.target.value })} />
      <TextareaField label="Follow-up actions" value={diaryForm.followUpActions} onChange={(event) => setDiaryForm({ ...diaryForm, followUpActions: event.target.value })} />
      <div className="md:col-span-2"><label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-300"><Mic className="size-4 text-cyan-300" />Voice-note transcript</label><TextareaField label="" value={diaryForm.voiceNoteTranscript} onChange={(event) => setDiaryForm({ ...diaryForm, voiceNoteTranscript: event.target.value })} /></div>
      <label className="grid gap-2 text-sm font-medium text-slate-300 md:col-span-2"><span className="flex items-center gap-2"><Camera className="size-4 text-cyan-300" />Site photos</span><input key={photoInputKey} type="file" accept="image/*" capture="environment" multiple onChange={chooseDiaryPhotos} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1 file:text-slate-200" /><span className="text-xs font-normal text-slate-500">{diaryPhotos.length ? `${diaryPhotos.length} photo${diaryPhotos.length === 1 ? "" : "s"} ready` : "Photos are retained in the job folder and linked to this diary entry."}</span></label>
      <div className="md:col-span-2 flex justify-end"><Button type="submit">Save diary entry</Button></div>
    </form></Card> : null}

    {showVariationForm ? <Card><form onSubmit={addVariation} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Job</span><select value={variationForm.jobId} onChange={(event) => setVariationForm({ ...variationForm, jobId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose job</option>{jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label><InputField required label="Variation title" value={variationForm.title} onChange={(event) => setVariationForm({ ...variationForm, title: event.target.value })} /><InputField label="Requested by" value={variationForm.requestedBy} onChange={(event) => setVariationForm({ ...variationForm, requestedBy: event.target.value })} /><div className="md:col-span-2 xl:col-span-3"><TextareaField label="Description and scope" value={variationForm.description} onChange={(event) => setVariationForm({ ...variationForm, description: event.target.value })} /></div><InputField label="Labour hours" type="number" min="0" step="0.25" value={variationForm.labourHours} onChange={(event) => setVariationForm({ ...variationForm, labourHours: event.target.value })} /><InputField label="Labour charge rate (£)" type="number" min="0" step="0.01" value={variationForm.labourRate} onChange={(event) => setVariationForm({ ...variationForm, labourRate: event.target.value })} /><InputField label="Material cost (£)" type="number" min="0" step="0.01" value={variationForm.materialCost} onChange={(event) => setVariationForm({ ...variationForm, materialCost: event.target.value })} /><InputField label="Material charge (£)" type="number" min="0" step="0.01" value={variationForm.materialCharge} onChange={(event) => setVariationForm({ ...variationForm, materialCharge: event.target.value })} /><InputField label="Other charge (£)" type="number" min="0" step="0.01" value={variationForm.otherCharge} onChange={(event) => setVariationForm({ ...variationForm, otherCharge: event.target.value })} /><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Status</span><select value={variationForm.status} onChange={(event) => setVariationForm({ ...variationForm, status: event.target.value as VariationStatus })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{variationStatuses.map((status) => <option key={status}>{status}</option>)}</select></label><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Approval method</span><select value={variationForm.approvalMethod} onChange={(event) => setVariationForm({ ...variationForm, approvalMethod: event.target.value as JobVariation["approvalMethod"] })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>Not approved</option><option>Signature</option><option>Email</option><option>WhatsApp</option><option>Verbal</option></select></label><InputField label="Approval reference / note" value={variationForm.approvalReference} onChange={(event) => setVariationForm({ ...variationForm, approvalReference: event.target.value })} /><div className="xl:col-span-3 flex justify-end"><Button type="submit">Save variation</Button></div></form></Card> : null}

    <section className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-3"><h2 className="text-xl font-bold">Daily site diary</h2>{visibleDiaries.length === 0 ? <Card><p className="text-sm text-slate-400">No diary entries for this selection.</p></Card> : visibleDiaries.map((rawEntry) => { const entry = normaliseSiteDiaryEntry(rawEntry); const staffNames = entry.staffPresent.map((id) => team.items.find((member) => member.id === id)?.name || id); return <Card key={entry.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{jobName(entry.jobId)}</p><h3 className="mt-1 font-bold">{new Date(`${entry.workDate}T12:00:00`).toLocaleDateString("en-GB")}</h3><p className="text-sm text-slate-500">{entry.completedBy}{entry.startedAt ? ` · ${entry.startedAt}-${entry.finishedAt || "ongoing"}` : ""}{siteDiaryDurationHours(entry) ? ` · ${siteDiaryDurationHours(entry).toFixed(1)}h` : ""}</p></div><button type="button" onClick={() => deleteDiary(entry)} className="grid min-h-11 min-w-11 place-items-center rounded-xl text-slate-500 hover:bg-red-500/10 hover:text-red-300" aria-label="Delete diary entry"><Trash2 className="size-4" /></button></div>
        {(staffNames.length || entry.otherStaffPresent) ? <p className="mt-3 flex items-start gap-2 text-sm text-slate-400"><UsersRound className="mt-0.5 size-4 shrink-0 text-cyan-300" /><span><strong className="text-slate-200">Staff:</strong> {[...staffNames, entry.otherStaffPresent].filter(Boolean).join(", ")}</span></p> : null}
        {entry.weather ? <p className="mt-2 text-sm text-slate-500">Weather: {entry.weather}</p> : null}
        <p className="mt-4 whitespace-pre-wrap text-sm text-slate-300">{entry.workCompleted}</p>
        {entry.delays ? <p className="mt-3 rounded-xl bg-amber-500/5 p-3 text-sm text-amber-200"><strong>Delay:</strong> {entry.delays}</p> : null}
        {entry.issuesAndRisks ? <p className="mt-3 flex items-start gap-2 rounded-xl bg-rose-500/5 p-3 text-sm text-rose-200"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><span><strong>Issues / risks:</strong> {entry.issuesAndRisks}</span></p> : null}
        <div className="mt-3 grid gap-2 text-sm text-slate-400">{entry.builderInstructions ? <p><strong className="text-slate-200">Builder:</strong> {entry.builderInstructions}</p> : null}{entry.customerInstructions ? <p><strong className="text-slate-200">Customer:</strong> {entry.customerInstructions}</p> : null}{entry.materialsUsed ? <p><strong className="text-slate-200">Used:</strong> {entry.materialsUsed}</p> : null}{entry.materialsRequired ? <p><strong className="text-slate-200">Required:</strong> {entry.materialsRequired}</p> : null}{entry.followUpActions ? <p><strong className="text-slate-200">Follow-up:</strong> {entry.followUpActions}</p> : null}{entry.voiceNoteTranscript ? <p><strong className="text-slate-200">Voice transcript:</strong> {entry.voiceNoteTranscript}</p> : null}</div>
        {entry.photoDocumentIds.length ? <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-fuchsia-300"><Camera className="size-4" />{entry.photoDocumentIds.length} linked site photo{entry.photoDocumentIds.length === 1 ? "" : "s"}</p> : null}
      </Card>; })}</div>
      <div className="space-y-3"><h2 className="text-xl font-bold">Variations</h2>{visibleVariations.length === 0 ? <Card><p className="text-sm text-slate-400">No variations for this selection.</p></Card> : visibleVariations.map((variation) => { const sellValue = variation.labourHours * variation.labourRate + variation.materialCharge + variation.otherCharge; const cost = variation.materialCost; return <Card key={variation.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{variation.number} · {jobName(variation.jobId)}</p><h3 className="mt-1 font-bold">{variation.title}</h3><p className="text-sm text-slate-500">Requested by {variation.requestedBy || "not recorded"}</p></div><button onClick={() => variations.remove((item) => item.id === variation.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300" aria-label="Delete variation"><Trash2 className="size-4" /></button></div><p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{variation.description || "No description added."}</p><div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-slate-950 p-3 text-sm"><div><p className="text-slate-500">Charge</p><strong>{money.format(sellValue)}</strong></div><div><p className="text-slate-500">Known cost</p><strong>{money.format(cost)}</strong></div><div><p className="text-slate-500">Gross profit</p><strong>{money.format(sellValue - cost)}</strong></div></div><div className="mt-4 flex flex-wrap items-center gap-3"><select value={variation.status} onChange={(event) => updateVariation(variation.id, event.target.value as VariationStatus)} className="min-h-10 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm">{variationStatuses.map((status) => <option key={status}>{status}</option>)}</select><span className="text-xs text-slate-500">Approval: {variation.approvalMethod}</span></div></Card>; })}</div>
    </section>
  </div>;
}
