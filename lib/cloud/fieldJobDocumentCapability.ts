"use client";

import type { JobDocument } from "../models";
import { captureSupabaseSessionOwnership, readSupabaseSession, readSupabaseSessionOwnershipEpoch } from "../supabase/client";
import { sameSupabaseSessionOwnership } from "../supabase/sessionOwnership-core.mjs";
import { cloudSelectFresh } from "./client";
import { liveFieldJobDocumentQuery, liveFieldJobDocumentUrlFromRows, type LiveFieldJobDocumentEnvelope } from "./fieldJobDocumentCapability-core.mjs";
import { activeSyncAuthorizationMatches, revalidateSyncAuthorization, type SyncAuthorizationContext } from "./repository";

export interface LiveFieldJobDocumentRequest {
  authorization: SyncAuthorizationContext;
  document: Pick<JobDocument, "id" | "jobId">;
}

export async function loadLiveFieldJobDocumentUrl({ authorization, document }: LiveFieldJobDocumentRequest) {
  if (authorization.role !== "electrician"
    || !document.id
    || !document.jobId
    || typeof navigator === "undefined"
    || !navigator.onLine
    || !activeSyncAuthorizationMatches(authorization)) return undefined;

  const startingOwnership = captureSupabaseSessionOwnership();
  const ownershipIsCurrent = () => sameSupabaseSessionOwnership(
    readSupabaseSession(),
    readSupabaseSessionOwnershipEpoch(),
    startingOwnership.session,
    startingOwnership.epoch,
  );
  if (!startingOwnership.session || !ownershipIsCurrent()) return undefined;
  if (!(await revalidateSyncAuthorization(authorization))
    || !activeSyncAuthorizationMatches(authorization)
    || !ownershipIsCurrent()) return undefined;

  const expected = {
    organisationId: authorization.organisationId,
    jobId: document.jobId,
    sourceId: document.id,
  };
  const rows = await cloudSelectFresh<LiveFieldJobDocumentEnvelope>(
    "job_documents",
    liveFieldJobDocumentQuery(expected),
  );
  if (!activeSyncAuthorizationMatches(authorization) || !ownershipIsCurrent()) return undefined;
  return liveFieldJobDocumentUrlFromRows(rows, expected);
}

export async function openLiveFieldJobDocumentUrl(
  request: LiveFieldJobDocumentRequest,
  operationIsCurrent: () => boolean,
  navigate: (documentUrl: string) => void,
) {
  const startingOwnership = captureSupabaseSessionOwnership();
  const documentUrl = await loadLiveFieldJobDocumentUrl(request);
  if (!documentUrl || !operationIsCurrent()) return false;
  if (!sameSupabaseSessionOwnership(
    readSupabaseSession(),
    readSupabaseSessionOwnershipEpoch(),
    startingOwnership.session,
    startingOwnership.epoch,
  )) return false;
  navigate(documentUrl);
  return true;
}
