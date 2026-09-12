export function portalRequestTargetMatchesJob(appointments, plannerEntryId, jobId) {
  if (!plannerEntryId) return true;
  if (!jobId) return false;
  const appointment = appointments.find((entry) => entry.id === plannerEntryId);
  return Boolean(appointment && appointment.jobId === jobId);
}

export function portalApprovalForCurrentDocument(approvals, document) {
  if (!document?.id) return undefined;
  let latest;
  let latestDecisionAt = Number.NEGATIVE_INFINITY;

  for (const approval of approvals) {
    if (approval?.documentId !== document.id) continue;
    if (!Number.isInteger(document.documentVersion) || !Number.isInteger(approval.documentVersion)) continue;
    if (approval.documentVersion !== document.documentVersion) continue;
    const decisionAt = Date.parse(approval.decidedAt || "");
    if (!Number.isFinite(decisionAt)) continue;
    if (decisionAt >= latestDecisionAt) {
      latest = approval;
      latestDecisionAt = decisionAt;
    }
  }

  return latest;
}

export function effectivePortalPricingStatus(document, approvals) {
  return portalApprovalForCurrentDocument(approvals, document)?.decision ?? document.status;
}

export function portalApprovalQueueState(queue, approvalId) {
  const queued = queue.find((item) => item?.table === "portal_approvals"
    && item.operation === "upsert"
    && item.sourceId === approvalId);
  return queued?.state ?? "Synced";
}

export function portalApprovalQueueBlocksDocument(queue, document) {
  if (!document?.id || !Number.isInteger(document.documentVersion)) return false;
  return queue.some((item) => item?.table === "portal_approvals"
    && item.operation === "upsert"
    && (item.state === "Failed" || item.state === "Conflict")
    && item.payload?.documentId === document.id
    && item.payload?.documentVersion === document.documentVersion);
}

export function portalPaymentLinkForInvoice(paymentLinks, invoice, customerId) {
  if (!invoice || !customerId || invoice.customerId !== customerId) return undefined;

  const invoiceJobId = invoice.jobId ?? null;
  const exactLink = paymentLinks.find((link) => (
    link.invoiceId === invoice.id
    && link.customerId === customerId
    && (link.jobId ?? null) === invoiceJobId
  ));
  if (exactLink) return safePaymentLink(exactLink) ? exactLink : undefined;

  // Older local/offline records contain only invoiceId. Resolve only the
  // wholly-unbound legacy shape through an invoice that has already passed the
  // active customer's invoice filter; partially conflicting records fail shut.
  const legacyLink = paymentLinks.find((link) => (
    link.invoiceId === invoice.id
    && link.customerId == null
    && link.jobId == null
  ));
  if (!legacyLink || !safePaymentLink(legacyLink)) return undefined;

  return {
    ...legacyLink,
    customerId,
    ...(invoice.jobId ? { jobId: invoice.jobId } : { jobId: undefined }),
  };
}

function safePaymentLink(link) {
  if (link.providerConfigured !== true || typeof link.paymentUrl !== "string") return false;
  try {
    return new URL(link.paymentUrl).protocol === "https:";
  } catch {
    return false;
  }
}
