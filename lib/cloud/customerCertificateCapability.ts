"use client";

import type { ElectricalCertificate } from "../models";
import { captureSupabaseSessionOwnership, readSupabaseSession, readSupabaseSessionOwnershipEpoch } from "../supabase/client";
import { sameSupabaseSessionOwnership } from "../supabase/sessionOwnership-core.mjs";
import { cloudSelectFresh } from "./client";
import { liveCustomerCertificateQuery, liveCustomerCertificateUrlFromRows, type LiveCustomerCertificateEnvelope } from "./customerCertificateCapability-core.mjs";
import { activeSyncAuthorizationMatches, revalidateSyncAuthorization, type SyncAuthorizationContext } from "./repository";

export interface LiveCustomerCertificateRequest {
  authorization: SyncAuthorizationContext;
  certificate: Pick<ElectricalCertificate, "id" | "customerId" | "jobId" | "status">;
}

export async function loadLiveCustomerCertificateUrl({ authorization, certificate }: LiveCustomerCertificateRequest) {
  const customerId = authorization.customerSourceId;
  if (authorization.role !== "customer"
    || !customerId
    || certificate.customerId !== customerId
    || certificate.status !== "Issued"
    || !certificate.id
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
    customerId,
    jobId: certificate.jobId,
    sourceId: certificate.id,
  };
  const rows = await cloudSelectFresh<LiveCustomerCertificateEnvelope>(
    "customer_certificates",
    liveCustomerCertificateQuery(expected),
  );
  if (!activeSyncAuthorizationMatches(authorization) || !ownershipIsCurrent()) return undefined;
  return liveCustomerCertificateUrlFromRows(rows, expected);
}

export async function openLiveCustomerCertificateUrl(
  request: LiveCustomerCertificateRequest,
  operationIsCurrent: () => boolean,
  navigate: (certificateUrl: string) => void,
) {
  const startingOwnership = captureSupabaseSessionOwnership();
  const certificateUrl = await loadLiveCustomerCertificateUrl(request);
  if (!certificateUrl || !operationIsCurrent()) return false;
  if (!sameSupabaseSessionOwnership(
    readSupabaseSession(),
    readSupabaseSessionOwnershipEpoch(),
    startingOwnership.session,
    startingOwnership.epoch,
  )) return false;
  navigate(certificateUrl);
  return true;
}
