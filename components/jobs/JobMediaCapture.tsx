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
type Draft = { form: typeof blank; file: File | null; prepared?: Awaited<ReturnType<typeof prepareJobPhoto>>; id: string; createdAt: string; saved: boolean; record?: JobDocument };

export function JobMediaCapture({ jobId, jobs, documents }: { jobId: string; jobs: { items: Job[]; isReady: boolean }; documents: { items: JobDocument[]; isReady: boolean; createItem: (record: JobDocument) => unknown } }) {
  const identity = useCloudIdentity();
  const [form, setForm] = useState(blank), [file, setFile] = useState<File | null>(null), [error, setError] = useState(""), [message, setMessage] = useState(""), [working, setWorking] = useState(false), [recordSaved, setRecordSaved] = useState(false);
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
  function change(next: typeof blank, nextFile = file) {
    if (saving.current || !latest.current.active || latest.current.scope !== scope) return;
    const current = draft.current;
    if (current && (current.form !== form || current.record)) return;
    draft.current = { form: next, file: nextFile, prepared: current?.file === nextFile ? current.prepared : undefined, id: current?.id ?? "", createdAt: current?.createdAt ?? "", saved: false };
    setForm(next); setFile(nextFile); setError(""); setMessage("");
  }
  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]; event.target.value = ""; if (!selected) return;
    try { requireAccess(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Photos are unavailable."); return; }
    const problem = photoFileError(selected); if (problem) { setError(problem); return; }
    change({ ...form, kind: "photo", title: form.title || selected.name.replace(/\.[^.]+$/, "") }, selected);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); const active = draft.current;
    if (!active || active.form !== form || active.saved || saving.current) return;
    try { requireAccess(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Evidence is unavailable."); return; }
    const title = form.title.trim(), link = form.link.trim(), safeLink = strictHttpsJobDocumentUrl(link);
    if (!["photo", "video"].includes(form.kind)) { setError("Choose photo or video-link evidence."); return; }
    if (!title) { setError("Add a name for this evidence."); return; }
    if (title.length > 256 || form.notes.length > 10000) { setError("Keep the name under 256 characters and notes under 10,000 characters."); return; }
    if (form.kind === "photo" && !active.file) { setError("Take a photo or choose one from your library."); return; }
    if (form.kind === "video" && !safeLink) { setError("Add a valid HTTPS video link without embedded credentials."); return; }
    saving.current = true; setWorking(true); setError(""); setMessage("");
    try {
      if (form.kind === "photo" && !active.prepared) active.prepared = await prepareJobPhoto(active.file!);
      requireAccess(); if (draft.current !== active) throw new Error("The evidence draft changed. Review it before saving.");
      active.id ||= makeId("document"); active.createdAt ||= new Date().toISOString();
      const record: JobDocument = { id: active.id, jobId, name: title, category: form.kind === "photo" ? "Photo" : "Other", fileName: form.kind === "photo" ? active.prepared!.fileName : "", mimeType: form.kind === "photo" ? active.prepared!.mimeType : "", dataUrl: form.kind === "photo" ? active.prepared!.dataUrl : "", externalUrl: form.kind === "video" ? safeLink! : "", notes: [form.kind === "photo" ? "Optimised site photo. Original remains on the capture device." : "Site video link.", form.notes.trim() ? `Site notes / spoken details (entered by user):\n${form.notes.trim()}` : ""].filter(Boolean).join("\n\n"), uploadedBy: "JR OS", uploadedAt: active.createdAt, createdAt: active.createdAt };
      if (!active.record) { documents.createItem(record); active.record = record; setRecordSaved(true); }
      else {
        const saved = savedIdentityIndex(latest.current.documents).unique.get(active.id);
        if (!saved || ["jobId", "name", "fileName", "mimeType", "notes", "createdAt"].some(key => saved[key as keyof JobDocument] !== active.record![key as keyof JobDocument])) throw new Error("The saved evidence record changed. Reopen the job before attaching this photo.");
      }
      if (form.kind === "photo" && identity.mode !== "local") {
        const owner = identity.identity;
        if (!owner) throw new Error("Sign in again to finish saving the photo.");
        requireAccess();
        queuePrivateFileUpload({ organisationId: owner.organisationId, userId: owner.userId, authorizationRole: owner.role, authorizationCustomerSourceId: owner.customerSourceId, sourceId: active.id, storageKey: "jr-os-job-documents", jobSourceId: jobId, fileName: active.prepared!.fileName, mimeType: active.prepared!.mimeType, size: dataUrlByteSize(active.prepared!.dataUrl), dataUrl: active.prepared!.dataUrl, objectPath: privateObjectPath(owner.organisationId, jobId, active.id, active.prepared!.fileName) });
      }
      active.saved = true; setRecordSaved(false);
      draft.current = null; setForm({ ...blank }); setFile(null); setMessage("Evidence saved on this device. Check sync status before switching devices.");
    } catch (reason) { if (latest.current.active && latest.current.scope === scope) setError(`${reason instanceof Error ? reason.message : "Evidence could not be saved."} Your draft is still here; keep this page open and retry.`); }
    finally { saving.current = false; if (latest.current.active && latest.current.scope === scope) setWorking(false); }
  }
  if (!permitted) return null;
  return <details className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
    <summary className="min-h-12 cursor-pointer py-3 text-base font-bold">Add job photos or a video link</summary>
    <form aria-label="Add job media evidence" onSubmit={save} className="mt-3 space-y-4">
      <p className="text-sm text-slate-300">Keep site evidence and spoken job requirements together for preparing your quote.</p>
      <fieldset disabled={!ready || working || recordSaved} className="space-y-4">
        <label className="grid gap-2 text-sm font-semibold"><span>Evidence type</span><select value={form.kind} onChange={event => change({ ...form, kind: event.target.value }, null)} className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="photo">Photo from camera or library</option><option value="video">Video link</option></select></label>
        {form.kind === "photo" ? <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-sm font-semibold"><span>Take a site photo</span><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={choosePhoto} className="min-h-12 max-w-full rounded-xl border border-slate-700 p-3 text-base" /></label><label className="grid gap-2 text-sm font-semibold"><span>Choose a saved photo</span><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={choosePhoto} className="min-h-12 max-w-full rounded-xl border border-slate-700 p-3 text-base" /></label></div>{file ? <p className="break-all text-sm text-cyan-200">Selected: {file.name}</p> : null}<p className="text-xs text-slate-400">JR OS saves a smaller photo copy, up to 1600 pixels, to speed up phone use. Keep the original for fine detail. Photos up to 25 MB can be selected.</p></div> : <><InputField label="Video link" type="url" placeholder="https://…" value={form.link} onChange={event => change({ ...form, link: event.target.value })} /><p className="text-sm text-slate-400">Attach an existing video link you control. Video-file uploads and automatic speech or video analysis are not connected yet; add the important spoken details below.</p></>}
        <InputField label="Evidence name" required value={form.title} maxLength={256} onChange={event => change({ ...form, title: event.target.value })} />
        <TextareaField label="What was shown or said" value={form.notes} maxLength={10000} placeholder="For example: customer wants six kitchen downlights, two extra sockets and a new extractor supply. Confirm cable routes and access on site." onChange={event => change({ ...form, notes: event.target.value })} />
        <p className="text-xs text-slate-400">These are your saved notes, not an AI transcript or an approved price.</p>
      </fieldset>
      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}{message ? <p role="status" className="text-sm text-cyan-200">{message}</p> : null}
      {recordSaved ? <p className="text-sm text-amber-200">The job record is saved, but the photo still needs to be saved on this device. Keep this page open and retry.</p> : null}
      <Button type="submit" disabled={!ready || working}>{working ? "Preparing evidence…" : "Save job evidence"}</Button>
      <p className="text-xs text-slate-400">Keep this page open until the evidence is saved. Leaving loses the unsaved draft.</p>
    </form>
  </details>;
}
