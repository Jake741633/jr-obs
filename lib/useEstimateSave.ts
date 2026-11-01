"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCloudIdentity } from "./cloud/useCloudIdentity";
import { makeId } from "./storage";
import { captureSupabaseSessionOwnership, readSupabaseSession, readSupabaseSessionOwnershipEpoch } from "./supabase/client";
import { sameSupabaseSessionOwnership, supabaseSessionUserId } from "./supabase/sessionOwnership-core.mjs";

type SavedRecord = { id: string; number: string };
type DraftToken = { id: string; ownerKey: string };
type Attempt<T> = { token: DraftToken; candidate?: T; contextSnapshot?: string; busy: boolean; complete: boolean };

// Storage and cloud JSON roundtrips can reorder object properties. Array order
// and values remain significant, while omitted JSON fields stay omitted.
function saveSnapshot(value: object) {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}

/** One explicit generation creates at most one record during this page visit. */
export function useEstimateSave<T extends SavedRecord>(ready: boolean, context: object) {
  const identity = useCloudIdentity(), member = identity.identity, local = identity.mode === "local";
  const ownership = captureSupabaseSessionOwnership();
  const ownerKey = JSON.stringify([identity.mode, member?.organisationId, member?.userId, member?.role, member?.customerSourceId, ownership.epoch]);
  const enabled = ready && identity.isReady && (local || Boolean(member && ["owner", "admin", "office"].includes(member.role)));
  const [token, setToken] = useState<DraftToken | null>(null);
  const [result, setResult] = useState<(SavedRecord & { recovered: boolean }) | null>(null);
  const scope = useMemo(() => ({ ownerKey, enabled, context, token }), [ownerKey, enabled, context, token]);
  const current = useRef<{ active: boolean; scope: typeof scope; attempt: Attempt<T> | null }>({ active: false, scope, attempt: null });
  useLayoutEffect(() => {
    const state = current.current;
    state.active = true; state.scope = scope;
    return () => { state.active = false; };
  });

  function active() {
    return current.current.active && current.current.scope === scope && enabled
      && (local || Boolean(ownership.session?.access_token && !ownership.session.is_password_recovery
        && supabaseSessionUserId(ownership.session) === member?.userId
        && sameSupabaseSessionOwnership(readSupabaseSession(), readSupabaseSessionOwnershipEpoch(), ownership.session, ownership.epoch)));
  }

  function begin(prefix: string) {
    if (!active()) return false;
    const next = { id: makeId(prefix), ownerKey };
    // Invalidates retained callbacks immediately, even before React commits.
    current.current.attempt = { token: next, busy: false, complete: false }; setToken(next); setResult(null);
    return true;
  }

  function canSave() {
    const attempt = current.current.attempt;
    return active() && Boolean(token && token.ownerKey === ownerKey && attempt?.token === token && !attempt.busy && !attempt.complete);
  }

  function save(build: (id: string) => T, records: T[], create: (record: T) => T | void) {
    const attempt = current.current.attempt;
    if (!canSave() || !attempt) throw new Error("The draft or account changed. Review the current draft before saving.");
    attempt.busy = true;
    try {
      const matches = records.filter(record => record.id === attempt.token.id);
      let record: T;
      if (matches.length) {
        if (matches.length !== 1 || !attempt.candidate || saveSnapshot(matches[0]) !== saveSnapshot(attempt.candidate)) {
          throw new Error("This draft identity already belongs to a changed or duplicate record. Review saved records before continuing.");
        }
        // A previous durable write succeeded but its acknowledgement was lost.
        record = matches[0];
      } else {
        const contextSnapshot = saveSnapshot(context);
        if (!attempt.candidate || attempt.contextSnapshot !== contextSnapshot) {
          attempt.candidate = build(attempt.token.id); attempt.contextSnapshot = contextSnapshot;
        }
        record = attempt.candidate;
        create(record);
      }
      attempt.complete = true;
      setResult({ id: record.id, number: record.number, recovered: matches.length === 1 });
      return record;
    } finally { attempt.busy = false; }
  }

  const saved = enabled && token?.ownerKey === ownerKey ? result : null;
  return { begin, canSave, save, saved, enabled, hasDraft: Boolean(token && token.ownerKey === ownerKey) };
}
