"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { Button } from "../ui/Button";
import { TextareaField } from "../ui/FormField";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { captureSupabaseSessionOwnership, readSupabaseSession, readSupabaseSessionOwnershipEpoch } from "../../lib/supabase/client";
import { sameSupabaseSessionOwnership, supabaseSessionUserId } from "../../lib/supabase/sessionOwnership-core.mjs";
import { prepareJobPhoto } from "../../lib/jobMediaCapture";
import { prepareQuotePhoto, quotePhotoSelectionError } from "../../lib/quotePhotos";
import { useQuoteMediaIdentity, type QuoteMediaOwner } from "../../lib/useQuoteMediaIdentity";
import { parseQuoteScope, quoteScopeNotes } from "../../lib/connectedQuoteScope.mjs";
import { clipNotes, type ReviewedClip } from "../../lib/quoteClip";
import { QuoteClipInput, ClipFrames } from "./QuoteClipInput";
import { AiConnectionHelp, AiRecoveryNotice, aiRecoveryCode, type AiRecoveryCode } from "./AiConnectionHelp";
import { JobDocumentBrowser, JobPhotoPreview } from "../jobs/JobDocumentBrowser";
import { savedIdentityIndex } from "../../lib/assistantIdentity";
import { photoPreviewSource, readSavedJobPhoto, sameSavedJobEvidence, savedJobEvidenceNotes, type SavedJobDocument } from "../../lib/jobPhotoEvidence";

type Ownership = ReturnType<typeof captureSupabaseSessionOwnership>;
type Review = { scope: object; text: string; reviewed: boolean; ownership: Ownership };
type SavedSelection = { record: SavedJobDocument; photo: boolean };
type PreparedPhotos = { evidence: object; images: Array<{ dataUrl: string; fileName: string; mimeType: string }>; ownership: Ownership };
const noPhotos: File[] = [];
type Props = { notes: string; contextKey: string; ready: boolean; jobEvidence?: { jobId: string; title: string; documents: SavedJobDocument[]; ready: boolean }; onApply: (sourceNotes: string, reviewedNotes: string) => void; onBuildDraft?: (sourceNotes: string, reviewedNotes: string) => void };

export function ConnectedQuoteAssistant({ notes, contextKey, ready, jobEvidence, onApply, onBuildDraft }: Props) {
  const identity = useCloudIdentity();
  const member = identity.identity;
  const allowed = Boolean(member && ["owner", "admin", "office"].includes(member.role));
  const canManageAi = identity.isReady && Boolean(member && ["owner", "admin"].includes(member.role));
  const mediaOwner = useQuoteMediaIdentity(identity, contextKey);
  const enabled = ready && identity.isReady && identity.mode !== "local" && allowed && Boolean(mediaOwner);
  const accountKey = JSON.stringify([identity.mode, member?.organisationId, member?.userId, member?.role, member?.customerSourceId, contextKey]);
  const base = useMemo(() => ({ accountKey, enabled }), [accountKey, enabled]);
  const [selection, setSelection] = useState<{ base: object; owner?: QuoteMediaOwner | null; files?: File[]; clip?: ReviewedClip; saved?: SavedSelection } | null>(null);
  const held = mediaOwner && selection?.owner === mediaOwner ? selection : null;
  const selected = selection?.saved ? (selection.base === base ? selection : null) : enabled ? held : null;
  const photos = selected?.files ?? noPhotos, clip = selected?.clip || null, saved = selected?.saved || null;
  const heldPhotos = held?.files ?? noPhotos;
  const photoContext = useMemo(() => ({ owner: mediaOwner, files: heldPhotos }), [mediaOwner, heldPhotos]);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const savedIndex = savedIdentityIndex(jobEvidence?.documents ?? []);
  const savedCurrent = !saved || Boolean(jobEvidence?.ready && saved.record.jobId === jobEvidence.jobId && sameSavedJobEvidence(saved.record, savedIndex.unique.get(saved.record.id), saved.photo, origin));
  const scope = useMemo(() => ({ base, notes, selected, savedCurrent }), [base, notes, selected, savedCurrent]);
  // Photo-count corrections do not change the recording's account/job/notes.
  const clipContext = useMemo(() => ({ base, notes, savedCurrent }), [base, notes, savedCurrent]);
  const [clipVersion, setClipVersion] = useState(0);
  const clipVersionRef = useRef(0);
  const [review, setReview] = useState<Review | null>(null);
  const [preparedPhotos, setPreparedPhotos] = useState<PreparedPhotos | null>(null);
  const [notice, setNotice] = useState<{ scope: object; text: string; error: boolean; recovery?: AiRecoveryCode } | null>(null);
  const [busyScope, setBusyScope] = useState<object | null>(null);
  const operation = useRef<{ controller: AbortController } | null>(null);
  const applied = useRef<Review | null>(null);
  const latest = useRef({ active: false, scope, enabled, review, jobEvidence, mediaOwner, held });
  const busy = busyScope === scope;
  const currentReview = review?.scope === scope ? review : null;
  const currentNotice = notice?.scope === scope ? notice : null;
  const currentPhotos = enabled && preparedPhotos?.evidence === photoContext ? preparedPhotos : null;

  useLayoutEffect(() => {
    latest.current = { active: true, scope, enabled, review, jobEvidence, mediaOwner, held };
    return () => { latest.current.active = false; };
  });
  useLayoutEffect(() => () => { operation.current?.controller.abort(); operation.current = null; }, [scope]);

  const active = () => latest.current.active && latest.current.scope === scope && latest.current.enabled;
  const ownsSession = (ownership: Ownership) => sameSupabaseSessionOwnership(readSupabaseSession(), readSupabaseSessionOwnershipEpoch(), ownership.session, ownership.epoch);
  const canSelectLocal = () => Boolean(latest.current.active && mediaOwner && latest.current.mediaOwner === mediaOwner && ownsSession(mediaOwner.ownership));

  const canUseClip = () => active() && !operation.current && clipVersionRef.current === clipVersion;
  function invalidateClipInput() { clipVersionRef.current += 1; setClipVersion(clipVersionRef.current); }
  function useClip(evidence: ReviewedClip) {
    if (!canUseClip()) return false;
    const error = quotePhotoSelectionError(photos, evidence.frames.length);
    if (error) { setNotice({ scope, text: error, error: true }); return false; }
    try { clipNotes(notes, evidence.transcript); } catch (error) { setNotice({ scope, text: (error as Error).message, error: true }); return false; }
    invalidateClipInput(); setSelection({ base, owner: mediaOwner, files: photos, clip: evidence }); setReview(null); setNotice(null); return true;
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []); event.target.value = "";
    if (!incoming.length || !canSelectLocal()) return;
    const currentHeld = latest.current.held;
    const next = [...(currentHeld?.files ?? noPhotos), ...incoming], currentClip = currentHeld?.clip;
    const error = quotePhotoSelectionError(next, currentClip?.frames.length ?? 0);
    if (error) { setNotice({ scope, text: error, error: true }); return; }
    operation.current?.controller.abort(); operation.current = null;
    setBusyScope(null); setPreparedPhotos(null);
    setSelection({ base, owner: mediaOwner, files: next, ...(currentClip ? { clip: currentClip } : {}) }); setReview(null); setNotice(null);
  }

  function removeEvidence(index?: number) {
    if (!active()) return;
    operation.current?.controller.abort(); operation.current = null;
    setBusyScope(null); setPreparedPhotos(null); setReview(null); setNotice(null);
    if (index === undefined) invalidateClipInput();
    setSelection({ base, owner: mediaOwner, files: index === undefined ? photos : photos.filter((_, i) => i !== index), ...(index !== undefined && clip ? { clip } : {}) });
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
    setBusyScope(null); setPreparedPhotos(null); setReview(null); setNotice(null); setSelection(null);
  }

  async function preparePhotos() {
    if (!active() || operation.current || !photos.length) return;
    const ownership = captureSupabaseSessionOwnership();
    if (!ownership.session?.access_token || ownership.session.is_password_recovery || supabaseSessionUserId(ownership.session) !== member?.userId) {
      setNotice({ scope, text: "Sign in again before preparing AI photos.", error: true }); return;
    }
    const task = { controller: new AbortController() }; operation.current = task;
    const isCurrent = () => active() && operation.current === task && ownsSession(ownership);
    setBusyScope(scope); setReview(null); setPreparedPhotos(null);
    try {
      const images: PreparedPhotos["images"] = [];
      for (const [index, file] of photos.entries()) {
        if (!isCurrent()) return;
        setNotice({ scope, text: `Preparing photo ${index + 1} of ${photos.length} on this phone…`, error: false });
        images.push(await prepareQuotePhoto(file, task.controller.signal));
      }
      if (!isCurrent()) return;
      setPreparedPhotos({ evidence: photoContext, images, ownership });
      setNotice({ scope, text: "Photos prepared on this phone. Check the previews, then Review with AI to send them.", error: false });
    } catch (error) { if (isCurrent()) setNotice({ scope, text: error instanceof Error ? error.message : "A photo could not be prepared. Remove it or try another copy.", error: true }); }
    finally { if (operation.current === task) { operation.current = null; if (active()) setBusyScope(null); } }
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
    if (kind === "draft" && (requestNotes.length > 12000 || (!requestNotes.trim() && !photos.length && !saved?.photo && !clip?.frames.length))) {
      setNotice({ scope, text: "Add job notes, photos or reviewed clip evidence. Keep the combined notes under 12,000 characters.", error: true }); return;
    }
    if (kind === "draft" && photos.length && (!currentPhotos || !ownsSession(currentPhotos.ownership))) {
      setNotice({ scope, text: "Prepare photos and check their previews before sending this selection to AI.", error: true }); return;
    }
    const task = { controller: new AbortController() }; operation.current = task;
    const isCurrent = () => active() && operation.current === task && ownsSession(ownership);
    setBusyScope(scope); setNotice(null); setReview(null);
    try {
      let selectedPhoto: File | null = null;
      if (kind === "draft" && saved?.photo) selectedPhoto = await readSavedJobPhoto(saved.record, origin, task.controller.signal);
      if (!isCurrent()) return;
      const prepared = kind === "draft" && selectedPhoto ? await prepareJobPhoto(selectedPhoto) : null;
      if (!isCurrent()) return;
      const response = await fetch("/api/ai/quote-scope", {
        method: "POST", cache: "no-store", redirect: "error", signal: task.controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownership.session.access_token}`, "X-JR-Organisation": member!.organisationId },
        body: JSON.stringify(kind === "status" ? { operation: "status" } : { operation: "draft", notes: requestNotes, consent: true, ...(prepared ? { photo: prepared.dataUrl } : {}), ...(photos.length && currentPhotos ? { photos: currentPhotos.images.map(image => image.dataUrl) } : {}), ...(clip?.frames.length ? { frames: clip.frames } : {}) }),
      });
      const payload = await response.json();
      if (!isCurrent()) return;
      if (!response.ok) {
        setNotice({ scope, text: typeof payload?.error === "string" ? payload.error : "AI is unavailable. Your notes are unchanged.", error: true, recovery: aiRecoveryCode(payload?.code) });
        return;
      }
      if (kind === "status") {
        if (payload?.configured !== true) { setNotice({ scope, text: "The AI connection has not been activated for this site.", error: true, recovery: "not_configured" }); return; }
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

  function apply(buildDraft = false) {
    if (!active() || busy || !currentReview || latest.current.review !== currentReview || applied.current === currentReview
      || !currentReview.reviewed || !currentReview.text.trim() || currentReview.text.length > 12000 || !ownsSession(currentReview.ownership) || (buildDraft && !onBuildDraft)) return;
    applied.current = currentReview;
    if (buildDraft) onBuildDraft!(notes, currentReview.text.trim()); else onApply(notes, currentReview.text.trim());
    setReview(null); setSelection(null); setPreparedPhotos(null); setNotice({ scope, text: "Reviewed scope added to the quote notes. Check quantities and prices in the priced draft.", error: false });
  }

  if (member && !allowed) return null;
  return <section aria-label="Quote from photos or video" className="mt-5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
    <h2 className="text-lg font-bold">Quote from photos or video</h2>
    <div className="mt-3 space-y-4">
      <p className="text-sm text-slate-300">Add site photos or a short video and describe the work you want. Check the AI scope, then build editable labour and materials using your saved packs and rates.</p>
      <p className="text-sm text-slate-400">Review with AI sends the visible job notes, any checked transcript and selected photos or sampled frames to OpenAI. Only include information you want to share.</p>
      {!enabled ? <p className="text-sm text-amber-200">{mediaOwner ? "Waiting for your account and job data. Local media is kept on this page while the same account is checked. AI actions will unlock when the checks finish." : "Sign in with an office account and wait for your job data to load before using connected AI."}</p> : null}
      <AiConnectionHelp canManage={canManageAi} />
      <fieldset disabled={!enabled} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">Take a photo<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={choosePhoto} className="min-h-12 min-w-0 max-w-full rounded-xl border border-slate-700 p-3 text-base" /></label>
          <label className="grid gap-2 text-sm font-semibold">Add photos from library<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={choosePhoto} className="min-h-12 min-w-0 max-w-full rounded-xl border border-slate-700 p-3 text-base" /></label>
        </div>
        <p className="text-xs text-slate-400">Up to six images together, counting sampled video frames. Photos: 25 MB each, 100 MB total. A smaller copy is sent. Save job evidence separately to keep it.</p>
      </fieldset>
      {photos.length ? <div className="space-y-3" aria-label="Selected quote photos">
        <p className="font-semibold">{photos.length} photo{photos.length === 1 ? "" : "s"} selected{clip?.frames.length ? ` + ${clip.frames.length} video frame${clip.frames.length === 1 ? "" : "s"}` : ""}</p>
        <div className="grid gap-3 sm:grid-cols-2">{photos.map((file, index) => <div key={index} className="min-w-0 rounded-xl border border-slate-700 p-3">
          {currentPhotos?.images[index] ? <Image src={currentPhotos.images[index].dataUrl} alt={`Photo ${index + 1}: ${file.name}`} width={1280} height={960} unoptimized className="mb-2 max-h-40 w-full rounded-lg object-contain" /> : null}
          <p className="break-all text-sm text-cyan-200">{index + 1}. {file.name}</p>
          <Button type="button" variant="secondary" className="mt-2" disabled={!enabled} onClick={() => removeEvidence(index)}>Remove photo {index + 1}</Button>
        </div>)}</div>
        <Button type="button" disabled={!enabled || busy || Boolean(currentPhotos)} onClick={preparePhotos}>Prepare photos for review</Button>
      </div> : null}
      <details className="rounded-xl border border-slate-700 p-3">
        <summary className="min-h-12 cursor-pointer py-3 font-semibold">Use saved job evidence</summary>
        {!enabled ? <p className="text-sm text-slate-400">Saved evidence is available after signing in with an office account and loading the job.</p> : !jobEvidence ? <p className="text-sm text-slate-400">Choose an existing job below to browse its saved photos and notes.</p> : !jobEvidence.ready ? <p role="status" className="text-sm text-slate-400">Loading saved evidence for this job…</p> : <div className="space-y-3">
          <p className="text-sm text-slate-300">Saved evidence for {jobEvidence.title}. Choose one record. This replaces the selected photos or recording; your typed notes stay unchanged.</p>
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
      <QuoteClipInput key={clipVersion} context={clipContext} mediaContext={mediaOwner} canSelectLocal={canSelectLocal} enabled={enabled} blocked={busy} notes={notes} organisationId={mediaOwner?.organisationId || ""} userId={mediaOwner?.userId || ""} canManageAi={canManageAi} canUse={canUseClip} onUse={useClip} />
      {clip ? <div className="space-y-3 rounded-xl border border-cyan-500/20 p-3">
        <p className="font-semibold">Reviewed recording evidence for this AI request</p>
        {clip.transcript ? <p className="whitespace-pre-wrap break-words text-sm text-slate-300">{clip.transcript}</p> : <p className="text-sm text-slate-400">Using sampled frames with the typed job notes.</p>}
        <ClipFrames frames={clip.frames} />
        <Button type="button" variant="secondary" disabled={!enabled} onClick={() => removeEvidence()}>Remove recording</Button>
      </div> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={!enabled || busy || !savedCurrent || (photos.length > 0 && !currentPhotos)} onClick={() => run("draft")}>Review with AI</Button>
        <Button type="button" disabled={!enabled || busy} onClick={() => run("status")}>Check connection</Button>
        <Button type="button" disabled={!enabled} onClick={clear}>Clear AI review</Button>
      </div>
      {currentNotice ? <p role={currentNotice.error ? "alert" : "status"} className={currentNotice.error ? "text-sm text-amber-200" : "text-sm text-cyan-200"}>{currentNotice.text}</p> : null}
      {currentNotice?.recovery ? <AiRecoveryNotice code={currentNotice.recovery} canManage={canManageAi} /> : null}
      {currentReview ? <div className="space-y-4">
        <p className="text-sm text-amber-200">AI scope suggestion — check it against the site. A photo cannot confirm hidden wiring, supply capacity or compliance. Heating-controls wiring remains excluded.</p>
        <TextareaField label="Review and edit the AI scope" value={currentReview.text} maxLength={12000} className="min-h-80" onChange={event => editReview({ text: event.target.value, reviewed: false })} />
        {currentReview.text.length > 12000 ? <p role="alert" className="text-sm text-amber-200">Shorten the reviewed scope to 12,000 characters before using it.</p> : null}
        <label className="flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" checked={currentReview.reviewed} onChange={event => editReview({ reviewed: event.target.checked })} />I have checked the scope, quantities and exclusions.</label>
        {onBuildDraft ? <Button type="button" className="w-full" disabled={!enabled || busy || !currentReview.reviewed || !currentReview.text.trim() || currentReview.text.length > 12000} onClick={() => apply(true)}>Build labour &amp; materials draft</Button> : null}
        <Button type="button" variant="secondary" disabled={!enabled || busy || !currentReview.reviewed || !currentReview.text.trim() || currentReview.text.length > 12000} onClick={() => apply()}>Use reviewed scope in quote notes</Button>
        <p className="text-xs text-slate-400">Both actions replace the notes above. The draft uses saved labour rates and material allowances; check every quantity and price. No quote is saved or sent by this step.</p>
      </div> : null}
    </div>
  </section>;
}
