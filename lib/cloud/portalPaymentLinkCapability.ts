"use client";

import type { Invoice } from "../models";
import { captureSupabaseSessionOwnership, readSupabaseSession, readSupabaseSessionOwnershipEpoch } from "../supabase/client";
import { sameSupabaseSessionOwnership } from "../supabase/sessionOwnership-core.mjs";
import { cloudSelectFresh } from "./client";
import { livePortalPaymentLinkQuery, livePortalPaymentUrlFromRows, type LivePortalPaymentLinkEnvelope } from "./portalPaymentLinkCapability-core.mjs";
import { activeSyncAuthorizationMatches, revalidateSyncAuthorization, type SyncAuthorizationContext } from "./repository";

export interface LiveCustomerPaymentLinkRequest {
  authorization: SyncAuthorizationContext;
  invoice: Pick<Invoice, "id" | "customerId" | "jobId">;
  sourceId: string;
}

export async function loadLiveCustomerPaymentUrl({ authorization, invoice, sourceId }: LiveCustomerPaymentLinkRequest) {
  const customerId = authorization.customerSourceId;
  if (authorization.role !== "customer"
    || !customerId
    || invoice.customerId !== customerId
    || !sourceId
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
    jobId: invoice.jobId,
    invoiceId: invoice.id,
    sourceId,
  };
  const rows = await cloudSelectFresh<LivePortalPaymentLinkEnvelope>(
    "customer_portal_payment_links",
    livePortalPaymentLinkQuery(expected),
  );
  if (!activeSyncAuthorizationMatches(authorization) || !ownershipIsCurrent()) return undefined;
  return livePortalPaymentUrlFromRows(rows, expected);
}

export async function openLiveCustomerPaymentUrl(
  request: LiveCustomerPaymentLinkRequest,
  operationIsCurrent: () => boolean,
  navigate: (paymentUrl: string) => void,
) {
  const startingOwnership = captureSupabaseSessionOwnership();
  const paymentUrl = await loadLiveCustomerPaymentUrl(request);
  if (!paymentUrl || !operationIsCurrent()) return false;
  if (!sameSupabaseSessionOwnership(
    readSupabaseSession(),
    readSupabaseSessionOwnershipEpoch(),
    startingOwnership.session,
    startingOwnership.epoch,
  )) return false;
  navigate(paymentUrl);
  return true;
}
