export function portalRequestTargetMatchesJob(appointments, plannerEntryId, jobId) {
  if (!plannerEntryId) return true;
  if (!jobId) return false;
  const appointment = appointments.find((entry) => entry.id === plannerEntryId);
  return Boolean(appointment && appointment.jobId === jobId);
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
