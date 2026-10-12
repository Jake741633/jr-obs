"use client";

import Image from "next/image";
import { useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button } from "../ui/Button";
import { TextareaField } from "../ui/FormField";
import { clipFileError, clipNotes, prepareQuoteClip, type ClipFrame, type PreparedClip, type ReviewedClip } from "../../lib/quoteClip";
import { captureSupabaseSessionOwnership, readSupabaseSession, readSupabaseSessionOwnershipEpoch } from "../../lib/supabase/client";
import { sameSupabaseSessionOwnership, supabaseSessionUserId } from "../../lib/supabase/sessionOwnership-core.mjs";

type Ownership = ReturnType<typeof captureSupabaseSessionOwnership>;
type Prepared = { scope: object; value: PreparedClip; ownership: Ownership };
type Transcript = { scope: object; text: string; reviewed: boolean; ownership: Ownership };
type Props = { context: object; enabled: boolean; notes: string; organisationId: string; userId: string; canUse?: () => boolean; onUse: (clip: ReviewedClip) => void };

export function ClipFrames({ frames }: { frames: ClipFrame[] }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{frames.map(frame => <figure key={frame.seconds} className="min-w-0 rounded-xl border border-slate-700 p-2">
    <Image src={frame.dataUrl} alt={"Sampled site frame at " + frame.seconds.toFixed(1) + " seconds"} width={960} height={540} unoptimized className="max-h-40 w-full rounded-lg object-contain" />
    <figcaption className="mt-1 text-xs text-slate-400">Sample at {frame.seconds.toFixed(1)}s</figcaption>
  </figure>)}</div>;
}

export function QuoteClipInput({ context, enabled, notes, organisationId, userId, canUse, onUse }: Props) {
  const base = useMemo(() => ({ context, enabled, notes, organisationId, userId }), [context, enabled, notes, organisationId, userId]);
  const [selection, setSelection] = useState<{ base: object; file: File } | null>(null);
  const file = selection?.base === base ? selection.file : null;
  const scope = useMemo(() => ({ base, file }), [base, file]);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [notice, setNotice] = useState<{ scope: object; text: string; error: boolean } | null>(null);
  const [busyScope, setBusyScope] = useState<object | null>(null);
  const operation = useRef<{ controller: AbortController } | null>(null);
  const used = useRef<Prepared | null>(null);
  const latest = useRef({ active: false, scope, prepared, transcript });
  const currentPrepared = prepared?.scope === scope ? prepared : null;
  const currentTranscript = transcript?.scope === scope ? transcript : null;
  const currentNotice = notice?.scope === scope ? notice : null;
  const busy = busyScope === scope;
  useLayoutEffect(() => { latest.current = { active: true, scope, prepared, transcript }; return () => { latest.current.active = false; }; });
  useLayoutEffect(() => () => { operation.current?.controller.abort(); operation.current = null; }, [scope]);
  const active = () => latest.current.active && latest.current.scope === scope && enabled && (!canUse || canUse());
  const owns = (owner: Ownership) => sameSupabaseSessionOwnership(readSupabaseSession(), readSupabaseSessionOwnershipEpoch(), owner.session, owner.epoch);
  const message = (text: string, error = false) => setNotice({ scope, text, error });
  function ownership() {
    const owner = captureSupabaseSessionOwnership();
    if (!owner.session?.access_token || owner.session.is_password_recovery || supabaseSessionUserId(owner.session) !== userId) { message("Sign in again before preparing or transcribing a recording.", true); return null; }
    return owner;
  }
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]; event.target.value = "";
    if (!selected || !active() || operation.current) return;
    const error = clipFileError(selected); if (error) { message(error, true); return; }
    setSelection({ base, file: selected }); setPrepared(null); setTranscript(null); setNotice(null);
  }
  function clear() {
    if (!active()) return;
    operation.current?.controller.abort(); operation.current = null; used.current = prepared;
    setBusyScope(null); setSelection(null); setPrepared(null); setTranscript(null); setNotice(null);
  }
  async function prepare(speech: boolean) {
    if (!active() || operation.current || !file) return;
    const owner = ownership(); if (!owner) return;
    const task = { controller: new AbortController() }; operation.current = task;
    const current = () => active() && operation.current === task && owns(owner);
    setBusyScope(scope); setPrepared(null); setTranscript(null); setNotice(null);
    try {
      const value = await prepareQuoteClip(file, { speech, signal: task.controller.signal, onProgress: text => { if (current()) message(text); } });
      if (!current()) return;
      setPrepared({ scope, value, ownership: owner }); message("Prepared on this phone. Nothing has been sent to AI yet.");
    } catch (error) { if (current()) message(error instanceof Error ? error.message : "This recording could not be prepared.", true); }
    finally { if (operation.current === task) { operation.current = null; if (active()) setBusyScope(null); } }
  }
  async function transcribe() {
    if (!active() || operation.current || !currentPrepared?.value.audio || latest.current.prepared !== currentPrepared || used.current === currentPrepared) return;
    const owner = ownership(); if (!owner) return;
    if (!owns(currentPrepared.ownership)) { message("Your sign-in changed. Prepare this recording again.", true); return; }
    const task = { controller: new AbortController() }; operation.current = task;
    const current = () => active() && operation.current === task && owns(owner);
    setBusyScope(scope); setTranscript(null); message("Transcribing speech…");
    try {
      const response = await fetch("/api/ai/quote-scope", {
        method: "POST", cache: "no-store", redirect: "error", signal: task.controller.signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + owner.session!.access_token, "X-JR-Organisation": organisationId },
        body: JSON.stringify({ operation: "transcribe", consent: true, audio: currentPrepared.value.audio }),
      });
      const payload = await response.json(); if (!current()) return;
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Speech transcription is unavailable. Your notes are unchanged.");
      if (typeof payload?.transcript !== "string" || !payload.transcript.trim() || payload.transcript.length > 12000) throw new Error("AI returned no usable transcript. Check the sound or enter the spoken details yourself.");
      setTranscript({ scope, text: payload.transcript.trim(), reviewed: false, ownership: owner }); message("Check names, quantities and anything unclear before using the transcript.");
    } catch (error) { if (current()) message(error instanceof Error ? error.message : "Speech transcription is unavailable.", true); }
    finally { if (operation.current === task) { operation.current = null; if (active()) setBusyScope(null); } }
  }
  function edit(patch: Partial<Pick<Transcript, "text" | "reviewed">>) {
    if (!active() || operation.current || !currentTranscript || latest.current.transcript !== currentTranscript || !owns(currentTranscript.ownership) || used.current === currentPrepared) return;
    setTranscript({ ...currentTranscript, ...patch });
  }
  function use(framesOnly: boolean) {
    if (!active() || operation.current || !currentPrepared || latest.current.prepared !== currentPrepared || used.current === currentPrepared || !owns(currentPrepared.ownership)) return;
    if (framesOnly && !currentPrepared.value.frames.length) return;
    if (!framesOnly && (!currentTranscript || latest.current.transcript !== currentTranscript || !currentTranscript.reviewed || !currentTranscript.text.trim() || !owns(currentTranscript.ownership))) return;
    const text = framesOnly ? "" : currentTranscript!.text.trim();
    try { clipNotes(notes, text); } catch (error) { message((error as Error).message, true); return; }
    used.current = currentPrepared;
    onUse({ transcript: text, frames: currentPrepared.value.frames.map(frame => ({ ...frame })), duration: currentPrepared.value.duration });
  }
  return <details className="rounded-xl border border-slate-700 p-3">
    <summary className="min-h-12 cursor-pointer py-3 font-semibold">Use a short video or voice recording</summary>
    <div className="mt-3 space-y-4">
      <p className="text-sm text-slate-300">Choose up to 60 seconds of site video or spoken notes, under 100 MB. Preparation happens on this phone and can take the length of the recording. Keep JR OS open while it runs.</p>
      <fieldset disabled={!enabled || busy} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">Choose a recording<input type="file" accept="video/mp4,video/quicktime,video/webm,audio/mp4,audio/x-m4a,audio/mpeg,audio/wav,audio/x-wav,audio/webm,.mov,.m4a" onChange={choose} className="min-h-12 min-w-0 max-w-full rounded-xl border border-slate-700 p-3 text-base" /></label>
        <label className="grid gap-2 text-sm font-semibold">Record a site video<input type="file" accept="video/*" capture="environment" onChange={choose} className="min-h-12 min-w-0 max-w-full rounded-xl border border-slate-700 p-3 text-base" /></label>
      </fieldset>
      {file ? <p className="break-all text-sm text-cyan-200">Selected: {file.name}</p> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={!enabled || busy || !file} onClick={() => prepare(true)}>Prepare sound and frames</Button>
        <Button type="button" disabled={!enabled || busy || !file} onClick={() => prepare(false)}>Prepare video frames only</Button>
        <Button type="button" disabled={!enabled} onClick={clear}>Clear recording / cancel</Button>
      </div>
      {currentNotice ? <p role={currentNotice.error ? "alert" : "status"} className={currentNotice.error ? "text-sm text-amber-200" : "text-sm text-cyan-200"}>{currentNotice.text}</p> : null}
      {currentPrepared ? <div className="space-y-4">
        <ClipFrames frames={currentPrepared.value.frames} />
        <p className="text-xs text-slate-400">These are sampled stills, not every moment of the video. The original recording stays on your phone and is not saved to the job by this step.</p>
        {currentPrepared.value.audio ? <><p className="text-sm text-slate-300">Transcribe speech sends the prepared sound to OpenAI. Only include recordings you want to share.</p><Button type="button" disabled={!enabled || busy} onClick={transcribe}>Transcribe speech</Button></> : null}
        {currentPrepared.value.frames.length ? <Button type="button" disabled={!enabled || busy} onClick={() => use(true)}>Use video frames without speech</Button> : null}
      </div> : null}
      {currentTranscript ? <div className="space-y-3">
        <TextareaField label="Review and edit the transcript" value={currentTranscript.text} maxLength={12000} className="min-h-48" onChange={event => edit({ text: event.target.value, reviewed: false })} />
        <label className="flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" checked={currentTranscript.reviewed} onChange={event => edit({ reviewed: event.target.checked })} />I have checked the transcript against the recording.</label>
        <Button type="button" disabled={!enabled || busy || !currentTranscript.reviewed || !currentTranscript.text.trim()} onClick={() => use(false)}>Use checked transcript and frames</Button>
      </div> : null}
      <p className="text-xs text-slate-400">Using this evidence adds it to the AI review below. It does not save or send a quote. You can keep typing the job notes if this phone cannot prepare the recording.</p>
    </div>
  </details>;
}
