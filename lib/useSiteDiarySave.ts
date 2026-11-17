"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CloudMode } from "./cloud/config";
import { activeSyncAuthorizationMatches, type SyncAuthorizationContext } from "./cloud/repository";
import type { Job, JobTimelineEntry, SiteDiaryEntry } from "./models";
import { fieldJobAssignedToOperator } from "./siteDiaryIdentity-core.mjs";
import { readSupabaseSession } from "./supabase/client";

type DiarySave = { entry: SiteDiaryEntry; timelineEntry: JobTimelineEntry };
type DiaryAttempt = DiarySave & { confirmed: boolean };
type DiarySaveSources = {
  scopeKey: string;
  mode: CloudMode;
  authorization: SyncAuthorizationContext | null;
  ready: boolean;
  form: object;
  jobs: readonly Job[];
  operatorMemberId: string;
  diaries: { canonicalItems: readonly SiteDiaryEntry[]; createItem: (entry: SiteDiaryEntry) => SiteDiaryEntry };
  timeline: { items: readonly JobTimelineEntry[]; createItem: (entry: JobTimelineEntry) => JobTimelineEntry };
  setMessage: (message: string) => void;
};

function confirmCreation<T extends { id: string }>(
  item: T, records: readonly T[], create: (record: T) => T, retry: boolean,
) {
  const matches = records.filter(record => record.id === item.id);
  if (!matches.length) {
    create(item);
  } else if (!retry || matches.length !== 1 || JSON.stringify(matches[0]) !== JSON.stringify(item)) {
    throw new Error("Review the existing record before retrying this save.");
  }
}

export function useSiteDiarySave(sources: DiarySaveSources) {
  const { mode, scopeKey, ready, authorization, form, jobs, operatorMemberId, diaries, timeline, setMessage } = sources;
  const owner = useMemo(() => ({ mode, scopeKey }), [mode, scopeKey]);
  const active = useRef<DiarySaveSources | null>(null);
  const writes = useRef<{
    owner: typeof owner;
    drafts: WeakMap<object, DiaryAttempt>;
    notes: Map<string, DiarySave>;
  } | null>(null);
  const [pending, setPending] = useState<{ owner: typeof owner; notes: JobTimelineEntry[] } | null>(null);

  useLayoutEffect(() => {
    if (writes.current?.owner !== owner) writes.current = { owner, drafts: new WeakMap(), notes: new Map() };
    active.current = sources;
    return () => { active.current = null; };
  }, [owner, sources]);

  function canSave() {
    if (!ready || active.current !== sources) return false;
    if (mode === "local") return true;
    const session = readSupabaseSession();
    if (!authorization) return mode === "migration" && !session;
    return session?.user?.id === authorization.userId && activeSyncAuthorizationMatches(authorization);
  }

  function showPending(notes: Map<string, DiarySave>) {
    setPending({ owner, notes: [...notes.values()].map(({ timelineEntry }) => timelineEntry) });
  }

  function saveDraft(build: () => DiarySave) {
    const state = writes.current;
    if (!canSave() || !state) return null;
    const prior = state.drafts.get(form);
    if (prior?.confirmed) return null;
    const attempt = prior ?? { ...build(), confirmed: false };
    state.drafts.set(form, attempt);
    const { entry, timelineEntry } = attempt;

    try {
      confirmCreation(entry, diaries.canonicalItems, diaries.createItem, Boolean(prior));
    } catch {
      setMessage("Diary save could not be confirmed. Your work is still in the form. Try saving again.");
      return null;
    }
    attempt.confirmed = true;
    if (!canSave()) return null;

    try {
      confirmCreation(timelineEntry, timeline.items, timeline.createItem, false);
      return { entry, timelineEntry, timelineSaved: true };
    } catch {
      state.notes.set(timelineEntry.id, attempt);
      showPending(state.notes);
      return { entry, timelineEntry, timelineSaved: false };
    }
  }

  function retryNote(id: string) {
    const state = writes.current;
    if (!canSave() || !state) return;
    const pendingNote = state.notes.get(id);
    if (!pendingNote) return;

    const { entry, timelineEntry } = pendingNote;
    const saved = diaries.canonicalItems.filter(record => record.id === entry.id);
    const linkedJobs = jobs.filter(job => job.id === entry.jobId);
    if (saved.length !== 1 || saved[0].jobId !== entry.jobId || saved[0].workDate !== entry.workDate || linkedJobs.length !== 1) {
      setMessage("The original diary or job could not be verified. Review the saved records before retrying its timeline note.");
      return;
    }
    if (mode !== "local" && authorization?.role === "electrician" && !fieldJobAssignedToOperator({ job: linkedJobs[0], operatorMemberId })) {
      setMessage("The original job is no longer assigned to your active team identity. Refresh before retrying its timeline note.");
      return;
    }

    try {
      confirmCreation(timelineEntry, timeline.items, timeline.createItem, true);
    } catch {
      setMessage("Timeline note save could not be confirmed. The saved diary is still on this device.");
      return;
    }
    state.notes.delete(id);
    showPending(state.notes);
    setMessage(mode === "local" ? "Timeline note saved on this device." : "Timeline note saved on this device. Check sync status before switching devices.");
  }

  return { canSave, saveDraft, retryNote, pendingNotes: pending?.owner === owner ? pending.notes : [] };
}
