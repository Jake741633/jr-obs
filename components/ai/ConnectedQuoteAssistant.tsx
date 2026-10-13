"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button } from "../ui/Button";
import { TextareaField } from "../ui/FormField";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { captureSupabaseSessionOwnership, readSupabaseSession, readSupabaseSessionOwnershipEpoch } from "../../lib/supabase/client";
import { sameSupabaseSessionOwnership, supabaseSessionUserId } from "../../lib/supabase/sessionOwnership-core.mjs";
import { photoFileError, prepareJobPhoto } from "../../lib/jobMediaCapture";
import { parseQuoteScope, quoteScopeNotes } from "../../lib/connectedQuoteScope.mjs";
import { clipNotes, type ReviewedClip } from "../../lib/quoteClip";
import { QuoteClipInput, ClipFrames } from "./QuoteClipInput";
import { JobDocumentBrowser, JobPhotoPreview } from "../jobs/JobDocumentBrowser";
import { savedIdentityIndex } from "../../lib/assistantIdentity";
import { photoPreviewSource, readSavedJobPhoto, sameSavedJobEvidence, savedJobEvidenceNotes, type SavedJobDocument } from "../../lib/jobPhotoEvidence";

type Ownership = ReturnType<typeof captureSupabaseSessionOwnership>;
type Review = { scope: object; text: string; reviewed: boolean; ownership: Ownership };
type SavedSelection = { record: SavedJobDocument; photo: boolean };
type Props = { notes: string; contextKey: string; ready: boolean; jobEvidence?: { jobId: string; title: string; documents: SavedJobDocument[]; ready: boolean }; onApply: (sourceNotes: string, reviewedNotes: string) => void };

export function ConnectedQuoteAssistant({ notes, contextKey, ready, jobEvidence, onApply }: Props) {
  const identity = useCloudIdentity();
  const member = identity.identity;
  const allowed = Boolean(member && ["owner", "admin", "office"].includes(member.role));
  const enabled = ready && identity.isReady && identity.mode !== "local" && allowed;
  const accountKey = JSON.stringify([identity.mode, member?.organisationId, member?.userId, member?.role, member?.customerSourceId, contextKey]);
  const base = useMemo(() => ({ accountKey, enabled }), [accountKey, enabled]);
  const [selection, setSelection] = useState<{ base: object; file?: File; clip?: ReviewedClip; saved?: SavedSelection } | null>(null);
  const selected = selection?.base === base ? selection : null;
  const photo = selected?.file || null, clip = selected?.clip || null, saved = selected?.saved || null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const savedIndex = savedIdentityIndex(jobEvidence?.documents ?? []);
  const savedCurrent = !saved || Boolean(jobEvidence?.ready && saved.record.jobId === jobEvidence.jobId && sameSavedJobEvidence(saved.record, savedIndex.unique.get(saved.record.id), saved.photo, origin));
  const scope = useMemo(() => ({ base, notes, selected, savedCurrent }), [base, notes, selected, savedCurrent]);
  const [clipVersion, setClipVersion] = useState(0);
  const clipVersionRef = useRef(0);
  const [review, setReview] = useState<Review | null>(null);
  const [notice, setNotice] = useState<{ scope: object; text: string; error: boolean } | null>(null);
  const [busyScope, setBusyScope] = useState<object | null>(null);
  const operation = useRef<{ controller: AbortController } | null>(null);
  const applied = useRef<Review | null>(null);
  const latest = useRef({ active: false, scope, enabled, review, jobEvidence });
  const busy = busyScope === scope;
  const currentReview = review?.scope === scope ? review : null;
  const currentNotice = notice?.scope === scope ? notice : null;

  useLayoutEffect(() => {
    latest.current = { active: true, scope, enabled, review, jobEvidence };
    return () => { latest.current.active = false; };
  });
  useLayoutEffect(() => () => { operation.current?.controller.abort(); operation.current = null; }, [scope]);

  const active = () => latest.current.active && latest.current.scope === scope && latest.current.enabled;
  const ownsSession = (ownership: Ownership) => sameSupabaseSessionOwnership(readSupabaseSession(), readSupabaseSessionOwnershipEpoch(), ownership.session, ownership.epoch);

  const canUseClip = () => active() && !operation.current && clipVersionRef.current === clipVersion;
  function invalidateClipInput() { clipVersionRef.current += 1; setClipVersion(clipVersionRef.current); }
  function useClip(evidence: ReviewedClip) {
    if (!canUseClip()) return;
    try { clipNotes(notes, evidence.transcript); } catch (error) { setNotice({ scope, text: (error as Error).message, error: true }); return; }
    invalidateClipInput(); setSelection({ base, clip: evidence }); setReview(null); setNotice(null);
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || !active() || operation.current) return;
    const error = photoFileError(file);
    if (error) { setNotice({ scope, text: error, error: true }); return; }
    invalidateClipInput(); setSelection({ base, file });
  }

  function chooseSaved(record: SavedJobDocument, withPhoto: boolean) {
    const evidence = latest.current.jobEvidence;
    if (!active() || operation.current || !evidence?.ready || record.jobId !== evidence.jobId) return;
    // Read the current collection again: a retained card callback is not authority.
    const current = savedIdentityIndex(evidence.documents).unique.get(record.id);
    if (!sameSavedJobEvidence(record, current, withPhoto, origin)) return;
    try { savedJobEvidenceNotes(notes, record, withPhoto); }
    catch (error) { setNotice({ scope, text: (error as Error).message, error: true }); return; }
    invalidateClipInput(); setSelection({ base, saved: { record: { ...record }, photo: withPhoto } }); setReview(null); setNotice(null);
  }

  function clear() {
    if (!active()) return;
    operation.current?.controller.abort(); operation.current = null;
    applied.current = review; invalidateClipInput();
    setBusyScope(null); setReview(null); setNotice(null); setSelection(null);
  }

  async function run(kind: "status" | "draft") {
    if (!active() || operation.current || (kind === "draft" && !savedCurrent)) return;
    const ownership = captureSupabaseSessionOwnership();
    if (!ownership.session?.access_token || ownership.session.is_password_recovery || supabaseSessionUserId(ownership.session) !== member?.userId) {
      setNotice({ scope, text: "Sign in again before using connected AI.", error: true }); return;
    }
    let requestNotes = notes;
    try {
      if (kind === "draft" && clip) requestNotes = clipNotes(notes, clip.transcript);
      if (kind === "draft" && saved) requestNotes = savedJobEvidenceNotes(notes, saved.record, saved.photo);
    }
    catch (error) { setNotice({ scope, text: (error as Error).message, error: true }); return; }
    if (kind === "draft" && (requestNotes.length > 12000 || (!requestNotes.trim() && !photo && !clip?.frames.length))) {
      setNotice({ scope, text: "Add job notes, a photo or reviewed clip evidence. Keep the combined notes under 12,000 characters.", error: true }); return;
    }
    const task = { controller: new AbortController() }; operation.current = task; invalidateClipInput();
    const isCurrent = () => active() && operation.current === task && ownsSession(ownership);
    setBusyScope(scope); setNotice(null); setReview(null);
    try {
      let selectedPhoto = photo;
      if (kind === "draft" && saved?.photo) selectedPhoto = await readSavedJobPhoto(saved.record, origin, task.controller.signal);
      if (!isCurrent()) return;
      const prepared = kind === "draft" && selectedPhoto ? await prepareJobPhoto(selectedPhoto) : null;
      if (!isCurrent()) return;
      const response = await fetch("/api/ai/quote-scope", {
        method: "POST", cache: "no-store", redirect: "error", signal: task.controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownership.session.access_token}`, "X-JR-Organisation": member!.organisationId },
        body: JSON.stringify(kind === "status" ? { operation: "status" } : { operation: "draft", notes: requestNotes, consent: true, ...(prepared ? { photo: prepared.dataUrl } : {}), ...(clip?.frames.length ? { frames: clip.frames } : {}) }),
      });
      const payload = await response.json();
      if (!isCurrent()) return;
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "AI is unavailable. Your notes are unchanged.");
      if (kind === "status") {
        if (payload?.configured !== true) throw new Error("The AI connection has not been activated for this site.");
        setNotice({ scope, text: "The server is configured. API credit and model access are checked when you request a review.", error: false });
      } else {
        const draft = parseQuoteScope(payload?.draft);
        if (!draft) throw new Error("AI returned an incomplete scope. Your notes are unchanged.");
        setReview({ scope, text: quoteScopeNotes(draft), reviewed: false, ownership });
      }
    } catch (error) {
      if (isCurrent()) setNotice({ scope, text: error instanceof Error ? error.message : "AI is unavailable. Your notes are unchanged.", error: true });
    } finally {
      if (operation.current === task) { operation.current = null; if (active()) setBusyScope(null); }
    }
  }

  function editReview(patch: Partial<Pick<Review, "text" | "reviewed">>) {
    if (!active() || !currentReview || latest.current.review !== currentReview || applied.current === currentReview || !ownsSession(currentReview.ownership)) return;
    setReview({ ...currentReview, ...patch });
  }

  function apply() {
    if (!active() || busy || !currentReview || latest.current.review !== currentReview || applied.current === currentReview
      || !currentReview.reviewed || !currentReview.text.trim() || currentReview.text.length > 12000 || !ownsSession(currentReview.ownership)) return;
    applied.current = currentReview;
    onApply(notes, currentReview.text.trim());
    setReview(null); setSelection(null); setNotice({ scope, text: "Reviewed scope added to the quote notes. Check quantities and prices in the priced draft.", error: false });
  }

  if (member && !allowed) return null;
  return <details className="mt-5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
    <summary className="min-h-12 cursor-pointer py-3 font-bold">Review notes, photos or a site recording with AI</summary>
    <div className="mt-3 space-y-4">
      <p className="text-sm text-slate-300">Use the job notes above, including any spoken details you have typed or pasted. AI suggests an unpriced scope and questions for you to check.</p>
      <p className="text-sm text-slate-400">Review with AI sends the job notes, any checked transcript and the selected photo or sampled frames to OpenAI. Only include information you want to share.</p>
      {!enabled ? <p className="text-sm text-amber-200">Sign in with an office account and wait for your job data to load before using connected AI.</p> : null}
      <fieldset disabled={!enabled || busy} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">Take a photo<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={choosePhoto} className="min-h-12 min-w-0 max-w-full rounded-xl border border-slate-700 p-3 text-base" /></label>
          <label className="grid gap-2 text-sm font-semibold">Choose a photo<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={choosePhoto} className="min-h-12 min-w-0 max-w-full rounded-xl border border-slate-700 p-3 text-base" /></label>
        </div>
        {photo ? <p className="break-all text-sm text-cyan-200">Selected: {photo.name}</p> : null}
        <p className="text-xs text-slate-400">One photo up to 25 MB; a smaller copy is sent. Save it to the job separately if you need to keep it as evidence.</p>
      </fieldset>
      <details className="rounded-xl border border-slate-700 p-3">
        <summary className="min-h-12 cursor-pointer py-3 font-semibold">Use saved job evidence</summary>
        {!enabled ? <p className="text-sm text-slate-400">Saved evidence is available after signing in with an office account and loading the job.</p> : !jobEvidence ? <p className="text-sm text-slate-400">Choose an existing job below to browse its saved photos and notes.</p> : !jobEvidence.ready ? <p role="status" className="text-sm text-slate-400">Loading saved evidence for this job…</p> : <div className="space-y-3">
          <p className="text-sm text-slate-300">Saved evidence for {jobEvidence.title}. Choose one record. This replaces the selected photo or recording; your typed notes stay unchanged.</p>
          <JobDocumentBrowser key={JSON.stringify([accountKey, jobEvidence.jobId])} jobId={jobEvidence.jobId} documents={jobEvidence.documents}>
            {records => <div className="space-y-3">{records.map(record => <div key={record.id} className="rounded-xl border border-slate-800 p-3">
              <p className="break-words font-semibold">{record.name}</p><p className="text-xs text-slate-400">{record.category}</p>
              <JobPhotoPreview document={record} identityState={identity} />
              {record.notes ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-300">{record.notes}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {record.category === "Photo" ? <Button type="button" disabled={!enabled || busy || !photoPreviewSource(record, origin)} onClick={() => chooseSaved(record, true)}>Use photo and notes</Button> : null}
                <Button type="button" variant="secondary" disabled={!enabled || busy || !record.notes?.trim()} onClick={() => chooseSaved(record, false)}>Use saved notes</Button>
              </div>
            </div>)}</div>}
          </JobDocumentBrowser>
        </div>}
      </details>
      {saved ? <div className="space-y-2 rounded-xl border border-cyan-500/20 p-3">
        <p className="font-semibold">Saved job evidence for this review: {saved.record.name}</p>
        {!savedCurrent ? <p role="alert" className="text-sm text-amber-200">Saved evidence changed or is unavailable. Clear the selection or choose the current record again before reviewing with AI.</p> : <>
          <p className="text-sm text-cyan-200">{saved.photo ? "The saved photo and notes below will be included." : "Only these saved notes will be included. The attachment is not analysed."}</p>
          {saved.photo ? <JobPhotoPreview document={saved.record} identityState={identity} /> : null}
          <p className="whitespace-pre-wrap break-words text-sm text-slate-300">{saved.record.notes || "No saved notes."}</p>
        </>}
      </div> : null}
      <QuoteClipInput key={clipVersion} context={scope} enabled={enabled && !busy} notes={notes} organisationId={member?.organisationId || ""} userId={member?.userId || ""} canUse={canUseClip} onUse={useClip} />
      {clip ? <div className="space-y-3 rounded-xl border border-cyan-500/20 p-3">
        <p className="font-semibold">Reviewed recording evidence for this AI request</p>
        {clip.transcript ? <p className="whitespace-pre-wrap break-words text-sm text-slate-300">{clip.transcript}</p> : <p className="text-sm text-slate-400">Using sampled frames with the typed job notes.</p>}
        <ClipFrames frames={clip.frames} />
      </div> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={!enabled || busy || !savedCurrent} onClick={() => run("draft")}>{busy ? "Checking AI…" : "Review with AI"}</Button>
        <Button type="button" disabled={!enabled || busy} onClick={() => run("status")}>Check connection</Button>
        <Button type="button" disabled={!enabled} onClick={clear}>Clear AI review</Button>
      </div>
      {currentNotice ? <p role={currentNotice.error ? "alert" : "status"} className={currentNotice.error ? "text-sm text-amber-200" : "text-sm text-cyan-200"}>{currentNotice.text}</p> : null}
      {currentReview ? <div className="space-y-4">
        <p className="text-sm text-amber-200">AI scope suggestion — check it against the site. A photo cannot confirm hidden wiring, supply capacity or compliance. Heating-controls wiring remains excluded.</p>
        <TextareaField label="Review and edit the AI scope" value={currentReview.text} maxLength={12000} className="min-h-80" onChange={event => editReview({ text: event.target.value, reviewed: false })} />
        {currentReview.text.length > 12000 ? <p role="alert" className="text-sm text-amber-200">Shorten the reviewed scope to 12,000 characters before using it.</p> : null}
        <label className="flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" checked={currentReview.reviewed} onChange={event => editReview({ reviewed: event.target.checked })} />I have checked the scope, quantities and exclusions.</label>
        <Button type="button" disabled={!enabled || busy || !currentReview.reviewed || !currentReview.text.trim() || currentReview.text.length > 12000} onClick={apply}>Use reviewed scope in quote notes</Button>
        <p className="text-xs text-slate-400">This replaces the notes above. Create and check the priced draft next. No quote is saved or sent by this step.</p>
      </div> : null}
    </div>
  </details>;
}
