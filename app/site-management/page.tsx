"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { Camera, CheckCircle2, ClipboardList, Clock3, Eye, FileWarning, History, Mic, Plus, ReceiptText, Send, ShieldAlert, Trash2, UsersRound, WalletCards, XCircle } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useInvoicesCollection, useJobDocumentsCollection, useJobsCollection, useJobTimelineCollection, useJobVariationsCollection, useSiteDiariesCollection, useTeamCollection } from "../../lib/cloud/coreBusinessCollections";
import { applyVariationContractValue, isAcceptedVariationStatus, isJobInactiveStatus, nextJobVariationNumber, normaliseSiteDiaryEntry, normaliseVariationStatus, siteDiaryDurationHours, siteDiaryTimelineEntry, transitionVariation, variationFinancials, variationInvoiceLine, variationTimelineEntry } from "../../lib/jobManagement-core.mjs";
import { makeId } from "../../lib/storage";
import type { CanonicalVariationStatus, JobDocument, JobVariation, SiteDiaryEntry } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const blankDiary = { jobId: "", workDate: "", startedAt: "", finishedAt: "", breakMinutes: "0", completedBy: "Jake", staffPresent: [] as string[], otherStaffPresent: "", workCompleted: "", delays: "", builderInstructions: "", customerInstructions: "", materialsUsed: "", materialsRequired: "", voiceNoteTranscript: "", weather: "", issuesAndRisks: "", followUpActions: "" };
const blankVariation = { jobId: "", title: "", description: "", pricingMode: "Fixed price" as "Fixed price" | "Itemised", labourHours: "0", labourRate: "0", labourCostRate: "0", materialCost: "0", materialCharge: "0", otherCost: "0", otherCharge: "0", fixedPrice: "", approvalMethod: "Not approved" as JobVariation["approvalMethod"], approvalReference: "", requestedBy: "", customerNotes: "", internalNotes: "" };

export default function SiteManagementPage() {
  const jobs = useJobsCollection();
  const diaries = useSiteDiariesCollection();
  const variations = useJobVariationsCollection();
  const timeline = useJobTimelineCollection();
  const team = useTeamCollection();
  const documents = useJobDocumentsCollection();
  const invoices = useInvoicesCollection();
  const [selectedJobId, setSelectedJobId] = useState("");
  const [showDiaryForm, setShowDiaryForm] = useState(false);
  const [showVariationForm, setShowVariationForm] = useState(false);
  const [diaryForm, setDiaryForm] = useState(blankDiary);
  const [variationForm, setVariationForm] = useState(blankVariation);
  const [diaryPhotos, setDiaryPhotos] = useState<File[]>([]);
  const [variationPhotos, setVariationPhotos] = useState<File[]>([]);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [variationPhotoInputKey, setVariationPhotoInputKey] = useState(0);
  const [variationPreviewId, setVariationPreviewId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const activeJobs = useMemo(() => jobs.items.filter((job) => !isJobInactiveStatus(job.status)), [jobs.items]);
  const visibleDiaries = useMemo(() => diaries.items.filter((entry) => !selectedJobId || entry.jobId === selectedJobId).toSorted((a, b) => new Date(b.workDate).getTime() - new Date(a.workDate).getTime()), [diaries.items, selectedJobId]);
  const visibleVariations = useMemo(() => variations.items.filter((entry) => !selectedJobId || entry.jobId === selectedJobId).toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [variations.items, selectedJobId]);
  const approvedVariationValue = visibleVariations.filter((variation) => isAcceptedVariationStatus(variation.status)).reduce((sum, variation) => sum + variationFinancials(variation).sellingPrice, 0);
  const totalHours = visibleDiaries.reduce((sum, entry) => sum + siteDiaryDurationHours(entry), 0);
  const variationFormCost = Math.max(0, Number(variationForm.labourHours || 0)) * Math.max(0, Number(variationForm.labourCostRate || 0)) + Math.max(0, Number(variationForm.materialCost || 0)) + Math.max(0, Number(variationForm.otherCost || 0));
  const variationFormItemisedSell = Math.max(0, Number(variationForm.labourHours || 0)) * Math.max(0, Number(variationForm.labourRate || 0)) + Math.max(0, Number(variationForm.materialCharge || 0)) + Math.max(0, Number(variationForm.otherCharge || 0));
  const variationFormSell = variationForm.pricingMode === "Fixed price" ? Math.max(0, Number(variationForm.fixedPrice || 0)) : variationFormItemisedSell;

  function jobName(jobId: string) { return jobs.items.find((job) => job.id === jobId)?.title || "Unknown job"; }

  function chooseDiaryPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    const oversized = files.find((file) => file.size > 2_000_000);
    if (oversized) { setDiaryPhotos([]); setMessage(`${oversized.name} is larger than 2 MB. Choose smaller site photos for reliable offline capture.`); return; }
    setDiaryPhotos(files);
  }

  function chooseVariationPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    const oversized = files.find((file) => file.size > 2_000_000);
    if (oversized) { setVariationPhotos([]); setMessage(`${oversized.name} is larger than 2 MB. Choose smaller variation photos.`); return; }
    setVariationPhotos(files);
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

  async function addVariation(event: FormEvent) {
    event.preventDefault();
    if (!variationForm.jobId || !variationForm.title.trim() || !variationForm.description.trim()) { setMessage("Choose a job and record the requested change and scope."); return; }
    if (variationFormSell <= 0) { setMessage("Enter a positive fixed price or itemised selling value before saving the variation."); return; }
    const now = new Date().toISOString();
    const number = nextJobVariationNumber(variations.items, variationForm.jobId);
    const photoDocuments = await Promise.all(variationPhotos.map(async (file): Promise<JobDocument | null> => {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => resolve("");
        reader.readAsDataURL(file);
      });
      if (!dataUrl) return null;
      return { id: makeId("document"), jobId: variationForm.jobId, name: `${number} evidence · ${file.name.replace(/\.[^/.]+$/, "")}`, category: "Photo", fileName: file.name, mimeType: file.type, dataUrl, externalUrl: "", notes: variationForm.customerNotes.trim(), uploadedBy: "JR OS Site Management", uploadedAt: now, createdAt: now };
    }));
    const savedPhotos = photoDocuments.filter((photo): photo is JobDocument => Boolean(photo));
    const fixedPrice = variationForm.pricingMode === "Fixed price" ? Math.max(0, Number(variationForm.fixedPrice || 0)) : undefined;
    const variation: JobVariation = { id: makeId("variation"), jobId: variationForm.jobId, number, title: variationForm.title.trim(), description: variationForm.description.trim(), pricingMode: variationForm.pricingMode, labourHours: Math.max(0, Number(variationForm.labourHours || 0)), labourRate: Math.max(0, Number(variationForm.labourRate || 0)), labourCostRate: Math.max(0, Number(variationForm.labourCostRate || 0)), materialCost: Math.max(0, Number(variationForm.materialCost || 0)), materialCharge: Math.max(0, Number(variationForm.materialCharge || 0)), otherCost: Math.max(0, Number(variationForm.otherCost || 0)), otherCharge: Math.max(0, Number(variationForm.otherCharge || 0)), fixedPrice, status: "Draft", approvalMethod: variationForm.approvalMethod, approvalReference: variationForm.approvalReference.trim(), requestedBy: variationForm.requestedBy.trim(), photos: [], photoDocumentIds: savedPhotos.map((photo) => photo.id), customerNotes: variationForm.customerNotes.trim(), internalNotes: variationForm.internalNotes.trim(), presentation: { recipient: "Customer", showLabourBreakdown: false, showMaterialBreakdown: false, showInternalCosts: false, showProfit: false }, auditHistory: [{ id: makeId("variation-audit"), action: "Variation created", toStatus: "Draft", detail: `${number} recorded as a draft ${variationForm.pricingMode.toLowerCase()} change.`, completedBy: "JR OS Site Management", completedAt: now }], createdAt: now, updatedAt: now };
    variations.setItems((current) => [variation, ...current]);
    if (savedPhotos.length) documents.setItems((current) => [...savedPhotos, ...current]);
    timeline.setItems((current) => [{ id: makeId("timeline"), jobId: variation.jobId, milestone: "Custom update", eventType: "Variation", sourceId: variation.id, sourceType: "JobVariation", note: `${number} · ${variation.title} recorded as a draft variation.`, completedBy: "JR OS Site Management", completedAt: now, createdAt: now }, ...current]);
    setVariationForm({ ...blankVariation, jobId: selectedJobId || variationForm.jobId });
    setVariationPhotos([]);
    setVariationPhotoInputKey((current) => current + 1);
    setShowVariationForm(false);
    setMessage(`${number} saved as a draft and added to the job timeline.`);
  }

  function changeVariationStatus(variation: JobVariation, nextStatus: CanonicalVariationStatus, recipient?: "Customer" | "Builder") {
    if (nextStatus === "Accepted" && variation.approvalMethod === "Not approved") { setMessage(`Record how ${variation.number} was approved before accepting it.`); return; }
    const now = new Date().toISOString();
    let updated: JobVariation;
    try {
      updated = transitionVariation({ variation, nextStatus, now, auditId: makeId("variation-audit"), completedBy: "JR OS Site Management", recipient });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The variation status could not be changed.");
      return;
    }
    variations.setItems((current) => current.map((item) => item.id === variation.id ? updated : item));
    jobs.setItems((current) => current.map((job) => job.id === variation.jobId ? applyVariationContractValue({ job, variation, nextStatus, now }) : job));
    if (normaliseVariationStatus(variation.status) !== nextStatus) timeline.setItems((current) => [variationTimelineEntry({ variation: updated, fromStatus: variation.status, toStatus: nextStatus, timelineId: makeId("timeline"), completedBy: "JR OS Site Management", now }), ...current]);
    setMessage(`${variation.number} marked ${nextStatus.toLowerCase()}${recipient ? ` for ${recipient.toLowerCase()}` : ""}.`);
  }

  async function shareVariation(variation: JobVariation, recipient: "Customer" | "Builder") {
    const financials = variationFinancials(variation);
    const text = `${variation.number} · ${variation.title}\n\n${variation.description}\n\nFixed price: ${money.format(financials.sellingPrice)}${variation.customerNotes ? `\n\nNotes: ${variation.customerNotes}` : ""}`;
    try {
      if (navigator.share) await navigator.share({ title: `${variation.number} · ${variation.title}`, text });
      else if (navigator.clipboard) await navigator.clipboard.writeText(text);
      else { setMessage("Sharing is unavailable in this browser. Open the customer view and send it manually."); return; }
      changeVariationStatus(variation, "Sent", recipient);
    } catch { setMessage(`${variation.number} was not marked sent because sharing was cancelled.`); }
  }

  function updateVariationApproval(variationId: string, changes: Pick<JobVariation, "approvalMethod"> | Pick<JobVariation, "approvalReference">) {
    variations.setItems((current) => current.map((variation) => variation.id === variationId ? { ...variation, ...changes, updatedAt: new Date().toISOString() } : variation));
  }

  function addVariationToInvoice(variation: JobVariation) {
    if (!isAcceptedVariationStatus(variation.status)) { setMessage("Only an accepted variation can be added to an invoice."); return; }
    const invoice = invoices.items.find((item) => item.jobId === variation.jobId && item.status !== "Cancelled");
    if (!invoice) { setMessage("Create the final job invoice first. Accepted variations are also included automatically when it is generated."); return; }
    if (invoice.items.some((item) => item.variationId === variation.id)) { setMessage(`${variation.number} is already on ${invoice.number}.`); return; }
    const now = new Date().toISOString();
    invoices.setItems((current) => current.map((item) => item.id === invoice.id ? { ...item, variationIds: [...new Set([...(item.variationIds ?? []), variation.id])], items: [...item.items, variationInvoiceLine(variation, makeId("invoice-line"))], updatedAt: now } : item));
    const updated = transitionVariation({ variation, nextStatus: "Invoiced", now, auditId: makeId("variation-audit"), completedBy: "JR OS Site Management", invoiceId: invoice.id, detail: `${variation.number} added to ${invoice.number}.` });
    variations.setItems((current) => current.map((item) => item.id === variation.id ? updated : item));
    timeline.setItems((current) => [variationTimelineEntry({ variation: updated, fromStatus: variation.status, toStatus: "Invoiced", timelineId: makeId("timeline"), completedBy: "JR OS Site Management", now }), ...current]);
    setMessage(`${variation.number} added to ${invoice.number} once and marked invoiced.`);
  }

  function deleteVariation(variation: JobVariation) {
    if (isAcceptedVariationStatus(variation.status) || normaliseVariationStatus(variation.status) === "Sent") { setMessage("Sent, accepted and invoiced variations must be declined or retained for the audit history; they cannot be deleted."); return; }
    if (!window.confirm(`Delete draft ${variation.number}?`)) return;
    const photoIds = new Set(variation.photoDocumentIds ?? []);
    variations.remove((item) => item.id === variation.id);
    if (photoIds.size) documents.remove((document) => photoIds.has(document.id));
  }

  const ready = jobs.isReady && diaries.isReady && variations.isReady && timeline.isReady && team.isReady && documents.isReady && invoices.isReady;
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
      <Card><FileWarning className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Open variations</p><p className="mt-2 text-3xl font-bold">{visibleVariations.filter((item) => normaliseVariationStatus(item.status) === "Draft" || normaliseVariationStatus(item.status) === "Sent").length}</p></Card>
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

    {showVariationForm ? <Card><form onSubmit={addVariation} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Job</span><select required value={variationForm.jobId} onChange={(event) => setVariationForm({ ...variationForm, jobId: event.target.value })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose job</option>{activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
      <InputField required label="Requested change" value={variationForm.title} onChange={(event) => setVariationForm({ ...variationForm, title: event.target.value })} />
      <InputField label="Requested by" value={variationForm.requestedBy} onChange={(event) => setVariationForm({ ...variationForm, requestedBy: event.target.value })} />
      <div className="md:col-span-2 xl:col-span-3"><TextareaField required label="Description and scope" value={variationForm.description} onChange={(event) => setVariationForm({ ...variationForm, description: event.target.value })} /></div>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Pricing method</span><select value={variationForm.pricingMode} onChange={(event) => setVariationForm({ ...variationForm, pricingMode: event.target.value as "Fixed price" | "Itemised" })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>Fixed price</option><option>Itemised</option></select></label>
      <InputField label="Labour hours" type="number" min="0" step="0.25" value={variationForm.labourHours} onChange={(event) => setVariationForm({ ...variationForm, labourHours: event.target.value })} />
      <InputField label="Labour internal rate (£)" type="number" min="0" step="0.01" value={variationForm.labourCostRate} onChange={(event) => setVariationForm({ ...variationForm, labourCostRate: event.target.value })} />
      <InputField label="Labour selling rate (£)" type="number" min="0" step="0.01" value={variationForm.labourRate} onChange={(event) => setVariationForm({ ...variationForm, labourRate: event.target.value })} />
      <InputField label="Material cost (£)" type="number" min="0" step="0.01" value={variationForm.materialCost} onChange={(event) => setVariationForm({ ...variationForm, materialCost: event.target.value })} />
      <InputField label="Material selling price (£)" type="number" min="0" step="0.01" value={variationForm.materialCharge} onChange={(event) => setVariationForm({ ...variationForm, materialCharge: event.target.value })} />
      <InputField label="Other cost (£)" type="number" min="0" step="0.01" value={variationForm.otherCost} onChange={(event) => setVariationForm({ ...variationForm, otherCost: event.target.value })} />
      <InputField label="Other selling price (£)" type="number" min="0" step="0.01" value={variationForm.otherCharge} onChange={(event) => setVariationForm({ ...variationForm, otherCharge: event.target.value })} />
      {variationForm.pricingMode === "Fixed price" ? <InputField label="Customer fixed price (£)" type="number" min="0" step="0.01" value={variationForm.fixedPrice} onChange={(event) => setVariationForm({ ...variationForm, fixedPrice: event.target.value })} /> : null}
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm md:col-span-2 xl:col-span-3"><div><p className="text-slate-500">Cost</p><strong>{money.format(variationFormCost)}</strong></div><div><p className="text-slate-500">Selling</p><strong>{money.format(variationFormSell)}</strong></div><div><p className="text-slate-500">Profit</p><strong className={variationFormSell - variationFormCost < 0 ? "text-rose-300" : "text-emerald-300"}>{money.format(variationFormSell - variationFormCost)}</strong></div></div>
      <TextareaField label="Customer-facing notes" value={variationForm.customerNotes} onChange={(event) => setVariationForm({ ...variationForm, customerNotes: event.target.value })} />
      <TextareaField label="Internal notes (hidden)" value={variationForm.internalNotes} onChange={(event) => setVariationForm({ ...variationForm, internalNotes: event.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300 md:col-span-2 xl:col-span-3"><span className="flex items-center gap-2"><Camera className="size-4 text-cyan-300" />Variation photos</span><input key={variationPhotoInputKey} type="file" accept="image/*" capture="environment" multiple onChange={chooseVariationPhotos} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1 file:text-slate-200" /><span className="text-xs font-normal text-slate-500">{variationPhotos.length ? `${variationPhotos.length} photo${variationPhotos.length === 1 ? "" : "s"} ready` : "Attach evidence before sending the change."}</span></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Approval method</span><select value={variationForm.approvalMethod} onChange={(event) => setVariationForm({ ...variationForm, approvalMethod: event.target.value as JobVariation["approvalMethod"] })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>Not approved</option><option>Signature</option><option>Email</option><option>WhatsApp</option><option>Verbal</option></select></label>
      <InputField label="Approval reference / note" value={variationForm.approvalReference} onChange={(event) => setVariationForm({ ...variationForm, approvalReference: event.target.value })} />
      <div className="xl:col-span-3 flex justify-end"><Button type="submit">Save draft variation</Button></div>
    </form></Card> : null}

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
      <div className="space-y-3"><h2 className="text-xl font-bold">Variations</h2>{visibleVariations.length === 0 ? <Card><p className="text-sm text-slate-400">No variations for this selection.</p></Card> : visibleVariations.map((variation) => {
        const financials = variationFinancials(variation);
        const status = normaliseVariationStatus(variation.status);
        const showingPreview = variationPreviewId === variation.id;
        const photoCount = variation.photoDocumentIds?.length ?? variation.photos?.length ?? 0;
        return <Card key={variation.id} className={status === "Accepted" ? "border-emerald-500/25" : undefined}>
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{variation.number} · {jobName(variation.jobId)}</p><h3 className="mt-1 font-bold">{variation.title}</h3><p className="mt-1 text-sm text-slate-500">{status} · Requested by {variation.requestedBy || "not recorded"}</p></div><button type="button" onClick={() => deleteVariation(variation)} className="grid min-h-11 min-w-11 place-items-center rounded-xl text-slate-500 hover:bg-red-500/10 hover:text-red-300" aria-label={`Delete ${variation.number}`}><Trash2 className="size-4" /></button></div>
          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{variation.description || "No description added."}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-950 p-3 text-sm sm:grid-cols-4"><div><p className="text-slate-500">Fixed price</p><strong>{money.format(financials.sellingPrice)}</strong></div><div><p className="text-slate-500">Cost</p><strong>{money.format(financials.costPrice)}</strong></div><div><p className="text-slate-500">Gross profit</p><strong className={financials.grossProfit < 0 ? "text-rose-300" : "text-emerald-300"}>{money.format(financials.grossProfit)}</strong></div><div><p className="text-slate-500">Margin</p><strong>{financials.grossMargin.toFixed(1)}%</strong></div></div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500"><span>Approval: {variation.approvalMethod}</span>{variation.sentTo ? <span>Sent to: {variation.sentTo}</span> : null}{photoCount ? <span>{photoCount} photo{photoCount === 1 ? "" : "s"}</span> : null}{variation.invoiceId ? <span>Invoice linked</span> : null}</div>
          {status === "Sent" ? <div className="mt-4 grid gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Acceptance method</span><select value={variation.approvalMethod} onChange={(event) => updateVariationApproval(variation.id, { approvalMethod: event.target.value as JobVariation["approvalMethod"] })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>Not approved</option><option>Signature</option><option>Email</option><option>WhatsApp</option><option>Verbal</option></select></label><InputField label="Acceptance reference" value={variation.approvalReference} onChange={(event) => updateVariationApproval(variation.id, { approvalReference: event.target.value })} /></div> : null}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={() => setVariationPreviewId(showingPreview ? null : variation.id)}><Eye className="mr-2 size-4" />{showingPreview ? "Hide preview" : "Customer view"}</Button>
            {status === "Draft" ? <><Button type="button" onClick={() => void shareVariation(variation, "Customer")}><Send className="mr-2 size-4" />Send customer</Button><Button type="button" variant="secondary" onClick={() => void shareVariation(variation, "Builder")}><Send className="mr-2 size-4" />Send builder</Button></> : null}
            {status === "Sent" ? <><Button type="button" onClick={() => changeVariationStatus(variation, "Accepted")}><CheckCircle2 className="mr-2 size-4" />Accept</Button><Button type="button" variant="secondary" onClick={() => changeVariationStatus(variation, "Declined")}><XCircle className="mr-2 size-4" />Decline</Button></> : null}
            {status === "Accepted" ? <><Button type="button" onClick={() => addVariationToInvoice(variation)}><ReceiptText className="mr-2 size-4" />Add to invoice</Button><Button type="button" variant="secondary" onClick={() => changeVariationStatus(variation, "Declined")}><XCircle className="mr-2 size-4" />Reverse acceptance</Button></> : null}
            {status === "Declined" ? <Button type="button" onClick={() => changeVariationStatus(variation, "Draft")}><ClipboardList className="mr-2 size-4" />Return to draft</Button> : null}
          </div>
          {showingPreview ? <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-white p-5 text-slate-950"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">{variation.presentation?.recipient ?? variation.sentTo ?? "Customer"} variation</p><h4 className="mt-2 text-xl font-bold">{variation.number} · {variation.title}</h4><p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{variation.description}</p>{variation.customerNotes ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{variation.customerNotes}</p> : null}<div className="mt-5 border-t border-slate-200 pt-4"><p className="text-sm text-slate-500">Agreed fixed price</p><p className="text-3xl font-black">{money.format(financials.sellingPrice)}</p></div><p className="mt-3 text-xs text-slate-500">Internal labour, material cost, markup and profit are hidden.</p></div> : null}
          {(variation.auditHistory?.length ?? 0) > 0 ? <details className="mt-4 rounded-xl border border-slate-800 p-3"><summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold"><History className="size-4 text-cyan-300" />Audit history ({variation.auditHistory?.length})</summary><div className="mt-2 space-y-2">{variation.auditHistory?.map((entry) => <div key={entry.id} className="border-t border-slate-800 pt-2 text-xs text-slate-400"><p className="font-semibold text-slate-200">{entry.action}</p><p>{entry.detail}</p><p>{new Date(entry.completedAt).toLocaleString("en-GB")} · {entry.completedBy}</p></div>)}</div></details> : null}
        </Card>;
      })}</div>
    </section>
  </div>;
}
