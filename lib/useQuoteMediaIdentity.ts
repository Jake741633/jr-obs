"use client";

import { useState } from "react";
import type { useCloudIdentity } from "./cloud/useCloudIdentity";
import { captureSupabaseSessionOwnership } from "./supabase/client";
import { sameSupabaseSessionOwnership, supabaseSessionUserId } from "./supabase/sessionOwnership-core.mjs";

export type QuoteMediaOwner = {
  readonly target: string;
  readonly accountKey: string;
  readonly mode: ReturnType<typeof useCloudIdentity>["mode"];
  readonly organisationId: string;
  readonly userId: string;
  readonly ownership: ReturnType<typeof captureSupabaseSessionOwnership>;
};

/** Local file continuity only. This never authorises an AI request or record read. */
export function useQuoteMediaIdentity(identity: Pick<ReturnType<typeof useCloudIdentity>, "identity" | "isReady" | "mode">, target: string, track = true): QuoteMediaOwner | null {
  const [previous, setPrevious] = useState<QuoteMediaOwner | null>(null);
  if (!track) { if (previous) setPrevious(null); return null; }
  const ownership = captureSupabaseSessionOwnership(), member = identity.identity;
  const accountKey = JSON.stringify([identity.mode, member?.organisationId, member?.userId, member?.role, member?.customerSourceId, member?.email?.trim().toLowerCase() ?? ""]);
  const sameSession = previous && sameSupabaseSessionOwnership(ownership.session, ownership.epoch, previous.ownership.session, previous.ownership.epoch);
  const sameTarget = previous?.target === target;
  const verified = identity.isReady && identity.mode !== "local" && member && ["owner", "admin", "office"].includes(member.role)
    && ownership.session?.access_token && !ownership.session.is_password_recovery && supabaseSessionUserId(ownership.session) === member.userId;
  if (verified && sameSession && sameTarget && previous.accountKey === accountKey) return previous;
  if (!identity.isReady && identity.mode !== "local" && sameSession && sameTarget && previous.mode === identity.mode && (!member || previous.accountKey === accountKey)) return previous;

  const next: QuoteMediaOwner | null = verified ? {
    target, accountKey, mode: identity.mode, organisationId: member!.organisationId, userId: member!.userId,
    ownership: { epoch: ownership.epoch, session: { access_token: ownership.session!.access_token, is_password_recovery: false, user: { id: member!.userId } } },
  } : null;
  // A changed verified account/target or failed verification retires the token.
  // Conditional state adjustment ensures returning to an earlier account gets a
  // fresh identity instead of reviving its old local files.
  if (previous !== next) setPrevious(next);
  return next;
}
