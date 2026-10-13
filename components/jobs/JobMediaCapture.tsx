"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "../ui/Button";
import { InputField, TextareaField } from "../ui/FormField";
import { dataUrlByteSize, privateObjectPath, queuePrivateFileUpload } from "../../lib/cloud/privateFiles";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { canEditFinance } from "../../lib/cloud/permissions";
import { collectionCloudMutationRoute } from "../../lib/cloud/fieldMutationPolicy-core.mjs";
import { strictHttpsJobDocumentUrl } from "../../lib/cloud/fieldJobDocumentCapability-core.mjs";
import { savedIdentityIndex } from "../../lib/assistantIdentity";
import { photoFileError, prepareJobPhoto } from "../../lib/jobMediaCapture";
import { makeId } from "../../lib/storage";
import type { Job, JobDocument } from "../../lib/models";

const blank = { kind: "photo", title: "", link: "", notes: "" };
const MAX_PHOTOS = 8, MAX_BATCH_BYTES = 100 * 1024 * 1024;
type PhotoState = "pending" | "record" | "saved";
type Entry = { file: File | null; number: number; prepared?: Awaited<ReturnType<typeof prepareJobPhoto>>; id: string; createdAt: string; saved: boolean; record?: JobDocument };
type Draft = { form: typeof blank; files: File[]; entries: Entry[]; numbered: boolean; saved: boolean };

export function JobMediaCapture({ jobId, jobs, documents }: { jobId: string; jobs: { items: Job[]; isReady: boolean }; documents: { items: JobDocument[]; isReady: boolean; createItem: (record: JobDocument) => unknown } }) {
  const identity = useCloudIdentity();
  const [form, setForm] = useState(blank), [files, setFiles] = useState<File[]>([]), [error, setError] = useState(""), [message, setMessage] = useState(""), [working, setWorking] = useState(false), [states, setStates] = useState<PhotoState[]>([]);
  const locked = states.some(state => state !== "pending"), recordSaved = states.includes("record");
  const scopeKey = JSON.stringify([identity.mode, identity.identity?.organisationId, identity.identity?.userId, identity.identity?.role, identity.identity?.customerSourceId, jobId]);
  const scope = useMemo(() => ({ scopeKey }), [scopeKey]);
  const draft = useRef<Draft | null>(null), saving = useRef(false);
  const permitted = identity.mode === "local" || (canEditFinance(identity.identity?.role) && collectionCloudMutationRoute("job_documents", identity.identity?.role, "jr-os-job-documents").kind === "direct");
  const ready = identity.isReady && jobs.isReady && documents.isReady;
  const latest = useRef({ scope, ready: false, permitted: false, jobs: jobs.items, documents: documents.items, active: false });
  useLayoutEffect(() => { latest.current = { scope, ready, permitted, jobs: jobs.items, documents: documents.items, active: true }; return () => { latest.current.active = false; }; }, [scope, ready, permitted, jobs.items, documents.items]);
  // This component is keyed by account + job at its mounting point. Retained callbacks also check live scope.
  function requireAccess() {
    const current = latest.current;
    if (!current.active || current.scope !== scope || !current.ready || !current.permitted) throw new Error("Wait for the current account's job records before saving evidence.");
    if (!savedIdentityIndex(current.jobs).unique.has(jobId)) throw new Error("This job is unavailable or has an ambiguous saved identity. Reopen the correct job.");
  }
  function change(next: typeof blank, nextFiles = files) {
    if (saving.current || !latest.current.active || latest.current.scope !== scope) return;
    const current = draft.current;
    if (current && (current.form !== form || current.files !== files || current.entries.some(entry => entry.record))) return;
    const entries = (next.kind === "photo" ? nextFiles : [null]).map((file, index) => (current?.files === nextFiles ? current.entries[index] : undefined) ?? { file, number: index + 1, id: "", createdAt: "", saved: false });
    draft.current = { form: next, files: nextFiles, entries, numbered: nextFiles.length > 1, saved: false };
    setForm(next); setFiles(nextFiles); setStates(entries.map(() => "pending")); setError(""); setMessage("");
  }
  function choosePhotos(event: ChangeEvent<HTMLInputElement>, append: boolean) {
    const selected = Array.from(event.target.files ?? []); event.target.value = ""; if (!selected.length) return;
    if (saving.current || draft.current?.entries.some(entry => entry.record)) return;
    try { requireAccess(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Photos are unavailable."); return; }
    const nextFiles = append ? [...files, ...selected] : selected;
    if (nextFiles.length > MAX_PHOTOS) { setError("Choose up to 8 photos at a time. Your previous selection is still here."); return; }
    for (const file of nextFiles) { const problem = photoFileError(file); if (problem) { setError(`${file.name}: ${problem} Your previous selection is still here.`); return; } }
    if (nextFiles.reduce((size, file) => size + file.size, 0) > MAX_BATCH_BYTES) { setError("Choose photos totalling 100 MB or less. Your previous selection is still here."); return; }
    change({ ...form, kind: "photo", title: form.title || selected[0].name.replace(/\.[^.]+$/, "") }, nextFiles);
  }
  function removePhoto(index: number) {
    const current = draft.current;
    if (saving.current || !current || current.form !== form || current.files !== files || current.entries[index]?.record) return;
    try { requireAccess(); } catch { return; }
    current.files = files.filter((_, item) => item !== index); current.entries = current.entries.filter((_, item) => item !== index);
    setFiles(current.files); setStates(old => old.filter((_, item) => item !== index)); setError(""); setMessage("");
  }
  async function save(event: FormEvent) {
    event.preventDefault(); const active = draft.current;
    if (!active || active.form !== form || active.saved || saving.current) return;
    try { requireAccess(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Evidence is unavailable."); return; }
    const title = form.title.trim(), link = form.link.trim(), safeLink = strictHttpsJobDocumentUrl(link);
    if (!["photo", "video"].includes(form.kind)) { setError("Choose photo or video-link evidence."); return; }
    if (!title) { setError("Add a name for this evidence."); return; }
    if (title.length > 256 || form.notes.length > 10000) { setError("Keep the name under 256 characters and notes under 10,000 characters."); return; }
    if (form.kind === "photo" && !active.files.length) { setError("Take a photo or choose one from your library."); return; }
    if (form.kind === "video" && !safeLink) { setError("Add a valid HTTPS video link without embedded credentials."); return; }
    saving.current = true; setWorking(true); setError(""); setMessage("");
    try {
      for (const [index, entry] of active.entries.entries()) {
        if (entry.saved) continue;
        requireAccess();
        if (entry.file) {
          setMessage(`Preparing photo ${index + 1} of ${active.entries.length}: ${entry.file.name}`);
          if (!entry.prepared) entry.prepared = await prepareJobPhoto(entry.file);
        }
        requireAccess(); if (draft.current !== active) throw new Error("The evidence draft changed. Review it before saving.");
        entry.id ||= makeId("document"); entry.createdAt ||= new Date().toISOString();
        const suffix = active.numbered ? ` (${entry.number})` : "";
        const record: JobDocument = { id: entry.id, jobId, name: title.slice(0, 256 - suffix.length) + suffix, category: entry.file ? "Photo" : "Other", fileName: entry.prepared?.fileName ?? "", mimeType: entry.prepared?.mimeType ?? "", dataUrl: entry.prepared?.dataUrl ?? "", externalUrl: form.kind === "video" ? safeLink! : "", notes: [entry.file ? "Optimised site photo. Original remains on the capture device." : "Site video link.", form.notes.trim() ? `Site notes / spoken details (entered by user):\n${form.notes.trim()}` : ""].filter(Boolean).join("\n\n"), uploadedBy: "JR OS", uploadedAt: entry.createdAt, createdAt: entry.createdAt };
        if (!entry.record) { documents.createItem(record); entry.record = record; setStates(old => old.map((state, item) => item === index ? "record" : state)); }
        else {
          const saved = savedIdentityIndex(latest.current.documents).unique.get(entry.id);
          if (!saved || ["jobId", "name", "category", "fileName", "mimeType", "externalUrl", "notes", "createdAt"].some(key => saved[key as keyof JobDocument] !== entry.record![key as keyof JobDocument])) throw new Error("The saved evidence record changed. Reopen the job before attaching this photo.");
        }
        if (entry.file && identity.mode !== "local") {
          const owner = identity.identity;
          if (!owner) throw new Error("Sign in again to finish saving the photo.");
          requireAccess();
          queuePrivateFileUpload({ organisationId: owner.organisationId, userId: owner.userId, authorizationRole: owner.role, authorizationCustomerSourceId: owner.customerSourceId, sourceId: entry.id, storageKey: "jr-os-job-documents", jobSourceId: jobId, fileName: entry.prepared!.fileName, mimeType: entry.prepared!.mimeType, size: dataUrlByteSize(entry.prepared!.dataUrl), dataUrl: entry.prepared!.dataUrl, objectPath: privateObjectPath(owner.organisationId, jobId, entry.id, entry.prepared!.fileName) });
        }
        entry.saved = true; setStates(old => old.map((state, item) => item === index ? "saved" : state));
      }
      active.saved = true; setStates([]);
      draft.current = null; setForm({ ...blank }); setFiles([]); setMessage(`${active.entries.length > 1 ? `${active.entries.length} photos saved on this device.` : "Evidence saved on this device."} Check sync status before switching devices.`);
    } catch (reason) { if (latest.current.active && latest.current.scope === scope) {
      setMessage("");
      const count = active.entries.filter(entry => entry.saved).length;
      const pending = active.entries.find(entry => !entry.saved);
      setError(`${active.entries.length > 1 ? `${count} of ${active.entries.length} photos saved. ` : ""}${pending?.file ? `${pending.file.name}: ` : ""}${reason instanceof Error ? reason.message : "Evidence could not be saved."} Your draft is still here; keep this page open and retry.`);
    } }
    finally { saving.current = false; if (latest.current.active && latest.current.scope === scope) setWorking(false); }
  }
  if (!permitted) return null;
  return <details className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
    <summary className="min-h-12 cursor-pointer py-3 text-base font-bold">Add job photos or a video link</summary>
    <form aria-label="Add job media evidence" onSubmit={save} className="mt-3 space-y-4">
      <p className="text-sm text-slate-300">Keep site evidence and spoken job requirements together for preparing your quote.</p>
      <fieldset disabled={!ready || working || locked} className="space-y-4">
        <label className="grid gap-2 text-sm font-semibold"><span>Evidence type</span><select value={form.kind} onChange={event => change({ ...form, kind: event.target.value }, [])} className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="photo">Photo from camera or library</option><option value="video">Video link</option></select></label>
        {form.kind === "photo" ? <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-sm font-semibold"><span>Take a site photo</span><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={event => choosePhotos(event, true)} className="min-h-12 max-w-full rounded-xl border border-slate-700 p-3 text-base" /></label><label className="grid gap-2 text-sm font-semibold"><span>Choose saved photos</span><input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={event => choosePhotos(event, false)} className="min-h-12 max-w-full rounded-xl border border-slate-700 p-3 text-base" /></label></div><p className="text-xs text-slate-400">Choose up to 8 photos, up to 25 MB each and 100 MB altogether. Camera shots add to the selection; choosing library photos replaces it. JR OS saves a smaller photo copy, up to 1600 pixels, one at a time. Keep the originals for fine detail.</p></div> : <><InputField label="Video link" type="url" placeholder="https://…" value={form.link} onChange={event => change({ ...form, link: event.target.value })} /><p className="text-sm text-slate-400">Attach an existing video link you control. Video-file uploads and automatic speech or video analysis are not connected yet; add the important spoken details below.</p></>}
        <InputField label="Evidence name" required value={form.title} maxLength={256} onChange={event => change({ ...form, title: event.target.value })} />
        <TextareaField label="What was shown or said" value={form.notes} maxLength={10000} placeholder="For example: customer wants six kitchen downlights, two extra sockets and a new extractor supply. Confirm cable routes and access on site." onChange={event => change({ ...form, notes: event.target.value })} />
        <p className="text-xs text-slate-400">These are your saved notes, not an AI transcript or an approved price.</p>
      </fieldset>
      {files.length ? <div className="space-y-2" aria-label="Selected site photos">
        <p className="text-sm text-slate-300">{files.length} photo{files.length === 1 ? "" : "s"} selected. The evidence name and notes apply to every photo.</p>
        <ul className="space-y-2">{files.map((file, index) => <li key={index} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 p-3">
          <span className="min-w-0 break-all text-sm">{file.name}<span className="block text-xs text-slate-400">{states[index] === "saved" ? "Saved on this device" : states[index] === "record" ? "Record saved; photo needs retry" : "Waiting to save"}</span></span>
          <Button type="button" variant="secondary" aria-label={`Remove ${file.name}`} disabled={!ready || working || states[index] !== "pending"} onClick={() => removePhoto(index)}>Remove</Button>
        </li>)}</ul>
        {locked ? <p className="text-xs text-slate-400">The shared details are locked because saving has started. Retry to finish, or remove photos whose records have not been saved.</p> : null}
      </div> : null}
      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}{message ? <p role="status" className="text-sm text-cyan-200">{message}</p> : null}
      {recordSaved ? <p className="text-sm text-amber-200">The job record is saved, but the photo still needs to be saved on this device. Keep this page open and retry.</p> : null}
      <Button type="submit" disabled={!ready || working}>{working ? "Preparing evidence…" : "Save job evidence"}</Button>
      <p className="text-xs text-slate-400">Keep this page open until the evidence is saved. Leaving loses the unsaved draft.</p>
    </form>
  </details>;
}
