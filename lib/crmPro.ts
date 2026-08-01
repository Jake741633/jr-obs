import type {
  AiReminder,
  Builder,
  CrmFollowUpSettings,
  Customer,
  CustomerInteraction,
  CustomerProfile,
  Invoice,
  Job,
  JobDocument,
  JobVariation,
  LeadActivity,
  LeadPriority,
  PlannerEntry,
  PricingDocument,
  SalesLead,
} from "./models";
import type { ComplianceCertificate } from "./complianceCertificates";
import { paymentEffect, type PaymentRecord } from "./payments";
import {
  ageInDays,
  followUpPriority,
  normaliseLeadStage,
  repeatCustomerScore,
} from "./crmPro-core.mjs";

export { crmLeadStages, moveLeadStage, normaliseLeadStage } from "./crmPro-core.mjs";

export const crmStorageKeys = {
  customerProfiles: "jr-os-customer-profiles",
  customerInteractions: "jr-os-customer-interactions",
  salesLeads: "jr-os-leads",
  leadActivities: "jr-os-lead-activities",
  jobVariations: "jr-os-job-variations",
  jobTimeline: "jr-os-job-timeline",
  aiReminders: "jr-os-ai-reminders",
  followUpSettings: "jr-os-crm-follow-up-settings",
} as const;

export const defaultCrmFollowUpSettings: CrmFollowUpSettings = {
  id: "crm-follow-up-settings",
  quoteAgeDays: 3,
  noResponseDays: 2,
  lostOpportunityDays: 60,
  highValueThreshold: 1_000,
  updatedAt: "",
};

export type CustomerTimelineKind =
  | "Customer"
  | "Enquiry"
  | "Quote"
  | "Estimate"
  | "Job"
  | "Variation"
  | "Invoice"
  | "Payment"
  | "Certificate"
  | "Photo"
  | "Note"
  | "Email"
  | "Phone call"
  | "AI activity";

export interface CustomerTimelineItem {
  id: string;
  kind: CustomerTimelineKind;
  title: string;
  detail: string;
  occurredAt: string;
  href?: string;
  status?: string;
  value?: number;
}

interface CustomerTimelineInput {
  customer: Customer;
  leads: SalesLead[];
  documents: PricingDocument[];
  jobs: Job[];
  variations: JobVariation[];
  invoices: Invoice[];
  payments: PaymentRecord[];
  certificates: ComplianceCertificate[];
  jobDocuments: JobDocument[];
  interactions: CustomerInteraction[];
  reminders: AiReminder[];
}

function recordDate(value: string) {
  if (!value) return new Date(0).toISOString();
  return value.length === 10 ? `${value}T12:00:00.000Z` : value;
}

function normaliseContact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function leadMatchesCustomer(lead: SalesLead, customer: Customer) {
  if (lead.customerId === customer.id) return true;
  const customerEmail = normaliseContact(customer.email);
  const customerPhone = normaliseContact(customer.phone);
  return Boolean(
    (customerEmail && customerEmail === normaliseContact(lead.email))
    || (customerPhone && customerPhone === normaliseContact(lead.phone)),
  );
}

function documentTotal(document: PricingDocument | Invoice) {
  const net = document.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return document.vatEnabled ? net * (1 + document.vatRate / 100) : net;
}

function allocatedPayment(invoiceId: string, payments: PaymentRecord[]) {
  return payments
    .filter((payment) => payment.invoiceId === invoiceId)
    .reduce((sum, payment) => sum + paymentEffect(payment), 0);
}

function paidAgainstInvoice(invoice: Invoice, payments: PaymentRecord[]) {
  return Math.max(0, Math.max(invoice.amountPaid, allocatedPayment(invoice.id, payments)));
}

function paymentDays(issueDate: string, paidAt: string) {
  const issue = new Date(`${issueDate.slice(0, 10)}T12:00:00`).getTime();
  const paid = new Date(`${paidAt.slice(0, 10)}T12:00:00`).getTime();
  if (!Number.isFinite(issue) || !Number.isFinite(paid)) return null;
  return Math.max(0, Math.round((paid - issue) / 86_400_000));
}

export function buildCustomerTimeline(input: CustomerTimelineInput) {
  const { customer } = input;
  const linkedJobs = input.jobs.filter((job) => job.customerId === customer.id);
  const jobIds = new Set(linkedJobs.map((job) => job.id));
  const linkedInvoices = input.invoices.filter((invoice) => invoice.customerId === customer.id || Boolean(invoice.jobId && jobIds.has(invoice.jobId)));
  const invoiceIds = new Set(linkedInvoices.map((invoice) => invoice.id));
  const timeline: CustomerTimelineItem[] = [{
    id: `customer-${customer.id}`,
    kind: "Customer",
    title: "Customer record created",
    detail: customer.name,
    occurredAt: recordDate(customer.createdAt),
  }];

  input.leads.filter((lead) => leadMatchesCustomer(lead, customer)).forEach((lead) => timeline.push({
    id: `enquiry-${lead.id}`,
    kind: "Enquiry",
    title: lead.workRequired || "New electrical enquiry",
    detail: `${lead.source} · ${normaliseLeadStage(lead.stage)}`,
    occurredAt: recordDate(lead.updatedAt || lead.createdAt),
    href: `/leads?lead=${encodeURIComponent(lead.id)}`,
    status: normaliseLeadStage(lead.stage),
    value: lead.estimatedValue,
  }));

  input.documents
    .filter((document) => document.customerId === customer.id || Boolean(document.jobId && jobIds.has(document.jobId)))
    .forEach((document) => timeline.push({
      id: `pricing-${document.id}`,
      kind: document.type,
      title: `${document.number} · ${document.title}`,
      detail: document.siteAddress || customer.address,
      occurredAt: recordDate(document.updatedAt || document.createdAt),
      href: `/quotes/${document.id}`,
      status: document.status,
      value: documentTotal(document),
    }));

  linkedJobs.forEach((job) => timeline.push({
    id: `job-${job.id}`,
    kind: "Job",
    title: job.title,
    detail: job.siteAddress,
    occurredAt: recordDate(job.updatedAt || job.createdAt),
    href: `/jobs/${job.id}`,
    status: job.status,
    value: job.value,
  }));

  input.variations.filter((variation) => jobIds.has(variation.jobId)).forEach((variation) => timeline.push({
    id: `variation-${variation.id}`,
    kind: "Variation",
    title: `${variation.number} · ${variation.title}`,
    detail: variation.description,
    occurredAt: recordDate(variation.updatedAt || variation.createdAt),
    href: `/site-management?job=${encodeURIComponent(variation.jobId)}`,
    status: variation.status,
    value: variation.labourHours * variation.labourRate + variation.materialCharge + variation.otherCharge,
  }));

  linkedInvoices.forEach((invoice) => timeline.push({
    id: `invoice-${invoice.id}`,
    kind: "Invoice",
    title: `${invoice.number} · ${invoice.title}`,
    detail: invoice.dueDate ? `Due ${new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString("en-GB")}` : "No due date recorded",
    occurredAt: recordDate(invoice.updatedAt || invoice.createdAt),
    href: `/invoices?invoice=${encodeURIComponent(invoice.id)}`,
    status: invoice.status,
    value: documentTotal(invoice),
  }));

  input.payments
    .filter((payment) => payment.customerId === customer.id || Boolean(payment.invoiceId && invoiceIds.has(payment.invoiceId)))
    .forEach((payment) => timeline.push({
      id: `payment-${payment.id}`,
      kind: "Payment",
      title: `${payment.type} · ${payment.method}`,
      detail: [payment.reference, payment.notes].filter(Boolean).join(" · ") || "Payment recorded",
      occurredAt: recordDate(payment.paymentDate || payment.createdAt),
      href: "/payments",
      status: payment.reconciliationStatus,
      value: paymentEffect(payment),
    }));

  input.certificates
    .filter((certificate) => certificate.customerId === customer.id || Boolean(certificate.jobId && jobIds.has(certificate.jobId)))
    .forEach((certificate) => timeline.push({
      id: `certificate-${certificate.id}`,
      kind: "Certificate",
      title: `${certificate.number} · ${certificate.type}`,
      detail: certificate.description || certificate.installationAddress,
      occurredAt: recordDate(certificate.updatedAt || certificate.createdAt),
      href: `/certificates?certificate=${encodeURIComponent(certificate.id)}`,
      status: certificate.status,
    }));

  input.jobDocuments
    .filter((document) => document.category === "Photo" && jobIds.has(document.jobId))
    .forEach((document) => timeline.push({
      id: `photo-${document.id}`,
      kind: "Photo",
      title: document.name,
      detail: [document.notes, `Uploaded by ${document.uploadedBy}`].filter(Boolean).join(" · "),
      occurredAt: recordDate(document.uploadedAt || document.createdAt),
      href: `/jobs/${document.jobId}`,
    }));

  const interactionKinds: Record<CustomerInteraction["type"], CustomerTimelineKind> = {
    Call: "Phone call",
    Text: "Note",
    Email: "Email",
    WhatsApp: "Note",
    "Site visit": "Note",
    "Review request": "Note",
    Note: "Note",
  };
  input.interactions.filter((interaction) => interaction.customerId === customer.id).forEach((interaction) => timeline.push({
    id: `interaction-${interaction.id}`,
    kind: interactionKinds[interaction.type],
    title: interaction.type,
    detail: [interaction.summary, interaction.outcome].filter(Boolean).join(" · "),
    occurredAt: recordDate(interaction.interactionAt || interaction.createdAt),
    href: `/crm?customer=${encodeURIComponent(customer.id)}`,
  }));

  input.reminders.filter((reminder) => reminder.customerId === customer.id).forEach((reminder) => timeline.push({
    id: `ai-${reminder.id}`,
    kind: "AI activity",
    title: reminder.title,
    detail: [reminder.priority, reminder.notes, reminder.completed ? "Completed" : `Due ${reminder.dueDate}`].filter(Boolean).join(" · "),
    occurredAt: recordDate(reminder.updatedAt || reminder.createdAt),
    href: "/ai#today",
    status: reminder.completed ? "Complete" : reminder.priority,
  }));

  return timeline.toSorted((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

export interface CustomerIntelligence {
  totalSpend: number;
  outstandingBalance: number;
  lifetimeValue: number;
  averagePaymentDays: number | null;
  repeatCustomerScore: number;
  builderRelationship: string;
  referralSource: string;
  reviewStatus: CustomerProfile["reviewStatus"];
  lastJob?: Job;
  lastQuote?: PricingDocument;
  completedJobs: number;
  acceptedQuotes: number;
}

export function buildCustomerIntelligence({
  customer,
  profile,
  builders,
  leads,
  documents,
  jobs,
  invoices,
  payments,
  interactions,
}: {
  customer: Customer;
  profile?: CustomerProfile;
  builders: Builder[];
  leads: SalesLead[];
  documents: PricingDocument[];
  jobs: Job[];
  invoices: Invoice[];
  payments: PaymentRecord[];
  interactions: CustomerInteraction[];
}): CustomerIntelligence {
  const linkedJobs = jobs.filter((job) => job.customerId === customer.id);
  const jobIds = new Set(linkedJobs.map((job) => job.id));
  const linkedInvoices = invoices.filter((invoice) => invoice.customerId === customer.id || Boolean(invoice.jobId && jobIds.has(invoice.jobId)))
    .filter((invoice) => invoice.status !== "Cancelled");
  const invoiceIds = new Set(linkedInvoices.map((invoice) => invoice.id));
  const linkedPayments = payments.filter((payment) => payment.customerId === customer.id || Boolean(payment.invoiceId && invoiceIds.has(payment.invoiceId)));
  const unallocatedPayments = linkedPayments.filter((payment) => !payment.invoiceId).reduce((sum, payment) => sum + paymentEffect(payment), 0);
  const invoiceSpend = linkedInvoices.reduce((sum, invoice) => sum + Math.min(documentTotal(invoice), paidAgainstInvoice(invoice, linkedPayments)), 0);
  const totalSpend = Math.max(0, invoiceSpend + unallocatedPayments);
  const totalInvoiced = linkedInvoices.reduce((sum, invoice) => sum + documentTotal(invoice), 0);
  const outstandingBalance = linkedInvoices.reduce((sum, invoice) => sum + Math.max(0, documentTotal(invoice) - paidAgainstInvoice(invoice, linkedPayments)), 0);
  const linkedDocuments = documents.filter((document) => document.customerId === customer.id || Boolean(document.jobId && jobIds.has(document.jobId)));
  const quotes = linkedDocuments.filter((document) => document.type === "Quote");
  const invoicedQuoteIds = new Set(linkedInvoices.map((invoice) => invoice.quoteId).filter(Boolean));
  const wonNotInvoiced = quotes
    .filter((quote) => quote.status === "Accepted" && !invoicedQuoteIds.has(quote.id))
    .reduce((sum, quote) => sum + documentTotal(quote), 0);
  const paidDays = linkedInvoices.flatMap((invoice) => {
    const total = documentTotal(invoice);
    if (paidAgainstInvoice(invoice, linkedPayments) < total || total <= 0) return [];
    const paymentDate = linkedPayments
      .filter((payment) => payment.invoiceId === invoice.id)
      .toSorted((left, right) => right.paymentDate.localeCompare(left.paymentDate))[0]?.paymentDate
      || invoice.updatedAt;
    const days = paymentDays(invoice.issueDate, paymentDate);
    return days === null ? [] : [days];
  });
  const completedJobs = linkedJobs.filter((job) => job.status === "Complete");
  const acceptedQuotes = quotes.filter((quote) => quote.status === "Accepted");
  const paidInvoiceCount = linkedInvoices.filter((invoice) => paidAgainstInvoice(invoice, linkedPayments) >= documentTotal(invoice) && documentTotal(invoice) > 0).length;
  const latestLead = leads.filter((lead) => leadMatchesCustomer(lead, customer)).toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const linkedBuilders = [...new Set(linkedJobs.map((job) => job.builderId).filter(Boolean))]
    .map((id) => builders.find((builder) => builder.id === id)?.companyName)
    .filter(Boolean);

  return {
    totalSpend,
    outstandingBalance,
    lifetimeValue: totalInvoiced + wonNotInvoiced,
    averagePaymentDays: paidDays.length ? paidDays.reduce((sum, days) => sum + days, 0) / paidDays.length : null,
    repeatCustomerScore: repeatCustomerScore({
      completedJobs: completedJobs.length,
      acceptedQuotes: acceptedQuotes.length,
      paidInvoices: paidInvoiceCount,
      interactions: interactions.filter((interaction) => interaction.customerId === customer.id).length,
      reviewReceived: profile?.reviewStatus === "Received",
    }),
    builderRelationship: profile?.builderRelationship || (linkedBuilders.length ? `Introduced through ${linkedBuilders.join(", ")}` : profile?.tags.includes("Builder") ? "Builder / contractor contact" : "Direct customer"),
    referralSource: profile?.referralSource || latestLead?.source || "Not recorded",
    reviewStatus: profile?.reviewStatus ?? "Not requested",
    lastJob: linkedJobs.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0],
    lastQuote: quotes.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0],
    completedJobs: completedJobs.length,
    acceptedQuotes: acceptedQuotes.length,
  };
}

export interface BuilderCrmIntelligence {
  activeJobs: Job[];
  completedJobs: Job[];
  upcomingProjects: SalesLead[];
  referralOpportunities: SalesLead[];
  revenue: number;
  outstandingBalance: number;
  averageProjectValue: number;
  averagePaymentDays: number | null;
  conversionRate: number;
  repeatWork: boolean;
  paymentHistory: string;
}

export function buildBuilderCrmIntelligence({
  builderId,
  jobs,
  documents,
  invoices,
  payments,
  leads,
}: {
  builderId: string;
  jobs: Job[];
  documents: PricingDocument[];
  invoices: Invoice[];
  payments: PaymentRecord[];
  leads: SalesLead[];
}): BuilderCrmIntelligence {
  const linkedJobs = jobs.filter((job) => job.builderId === builderId);
  const jobIds = new Set(linkedJobs.map((job) => job.id));
  const linkedInvoices = invoices.filter((invoice) => invoice.builderId === builderId || Boolean(invoice.jobId && jobIds.has(invoice.jobId)))
    .filter((invoice) => invoice.status !== "Cancelled");
  const invoiceIds = new Set(linkedInvoices.map((invoice) => invoice.id));
  const linkedPayments = payments.filter((payment) => Boolean(payment.invoiceId && invoiceIds.has(payment.invoiceId)));
  const revenue = linkedInvoices.reduce((sum, invoice) => sum + Math.min(documentTotal(invoice), paidAgainstInvoice(invoice, linkedPayments)), 0);
  const outstandingBalance = linkedInvoices.reduce((sum, invoice) => sum + Math.max(0, documentTotal(invoice) - paidAgainstInvoice(invoice, linkedPayments)), 0);
  const projectValues = linkedJobs.map((job) => job.value).filter((value) => value > 0);
  const linkedQuotes = documents.filter((document) => document.builderId === builderId && document.type === "Quote");
  const decidedQuotes = linkedQuotes.filter((quote) => ["Accepted", "Declined", "Expired"].includes(quote.status));
  const acceptedQuotes = decidedQuotes.filter((quote) => quote.status === "Accepted");
  const paidDays = linkedInvoices.flatMap((invoice) => {
    if (paidAgainstInvoice(invoice, linkedPayments) < documentTotal(invoice) || documentTotal(invoice) <= 0) return [];
    const paidAt = linkedPayments.filter((payment) => payment.invoiceId === invoice.id).toSorted((left, right) => right.paymentDate.localeCompare(left.paymentDate))[0]?.paymentDate || invoice.updatedAt;
    const days = paymentDays(invoice.issueDate, paidAt);
    return days === null ? [] : [days];
  });
  const linkedLeads = leads.filter((lead) => lead.builderId === builderId);
  const terminal = new Set(["Lost", "Completed", "Cancelled"]);
  const upcomingProjects = linkedLeads.filter((lead) => !terminal.has(normaliseLeadStage(lead.stage))).toSorted((left, right) => (left.followUpDate || "9999").localeCompare(right.followUpDate || "9999"));
  const referralOpportunities = linkedLeads.filter((lead) => lead.source === "Builder" && !["Completed", "Cancelled"].includes(normaliseLeadStage(lead.stage)));
  const averagePaymentDays = paidDays.length ? paidDays.reduce((sum, days) => sum + days, 0) / paidDays.length : null;
  const overdueInvoices = linkedInvoices.filter((invoice) => invoice.dueDate && invoice.dueDate < new Date().toISOString().slice(0, 10) && paidAgainstInvoice(invoice, linkedPayments) < documentTotal(invoice));

  return {
    activeJobs: linkedJobs.filter((job) => !["Complete", "On hold"].includes(job.status)),
    completedJobs: linkedJobs.filter((job) => job.status === "Complete"),
    upcomingProjects,
    referralOpportunities,
    revenue,
    outstandingBalance,
    averageProjectValue: projectValues.length ? projectValues.reduce((sum, value) => sum + value, 0) / projectValues.length : 0,
    averagePaymentDays,
    conversionRate: decidedQuotes.length ? acceptedQuotes.length / decidedQuotes.length * 100 : 0,
    repeatWork: linkedJobs.length > 1 || acceptedQuotes.length > 1,
    paymentHistory: outstandingBalance > 0
      ? overdueInvoices.length
        ? `${overdueInvoices.length} overdue · £${outstandingBalance.toFixed(2)} outstanding`
        : `£${outstandingBalance.toFixed(2)} outstanding, not overdue`
      : averagePaymentDays === null ? "No paid invoice history" : `Pays in ${averagePaymentDays.toFixed(1)} days on average`,
  };
}

export type CrmFollowUpReason = "Quote ageing" | "No response" | "Survey not booked" | "Awaiting acceptance" | "Lost opportunity" | "Customer reminder";

export interface CrmFollowUpItem {
  id: string;
  reason: CrmFollowUpReason;
  title: string;
  detail: string;
  priorityScore: number;
  ageDays: number;
  estimatedValue: number;
  dueDate: string;
  customerId?: string;
  leadId?: string;
  quoteId?: string;
  phone: string;
  email: string;
  href: string;
}

function leadContact(lead: SalesLead, customers: Map<string, Customer>) {
  const customer = lead.customerId ? customers.get(lead.customerId) : undefined;
  return { phone: lead.phone || customer?.phone || "", email: lead.email || customer?.email || "", name: lead.name || customer?.name || lead.company || "Lead" };
}

function quoteContact(document: PricingDocument, customers: Map<string, Customer>) {
  const customer = document.customerId ? customers.get(document.customerId) : undefined;
  return { phone: customer?.phone || "", email: customer?.email || "", name: customer?.name || document.title };
}

export function buildFollowUpCentre({
  leads,
  leadActivities,
  documents,
  customers,
  profiles,
  settings = defaultCrmFollowUpSettings,
  now = new Date(),
}: {
  leads: SalesLead[];
  leadActivities: LeadActivity[];
  documents: PricingDocument[];
  customers: Customer[];
  profiles: CustomerProfile[];
  settings?: CrmFollowUpSettings;
  now?: Date;
}) {
  const items: CrmFollowUpItem[] = [];
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const today = now.toISOString().slice(0, 10);
  documents.filter((document) => document.type === "Quote" && document.status === "Sent").forEach((quote) => {
    if (quote.nextFollowUpDate && quote.nextFollowUpDate > today) return;
    const ageDays = ageInDays(quote.lastFollowUpAt || quote.updatedAt || quote.createdAt, now);
    if (ageDays < 1) return;
    const reason: CrmFollowUpReason = ageDays >= settings.quoteAgeDays ? "Quote ageing" : "Awaiting acceptance";
    const contact = quoteContact(quote, customerMap);
    const value = documentTotal(quote);
    items.push({
      id: `quote-follow-up-${quote.id}`,
      reason,
      title: contact.name,
      detail: `${quote.number} has been awaiting a decision for ${ageDays} day${ageDays === 1 ? "" : "s"}.`,
      priorityScore: followUpPriority({ ageDays, estimatedValue: value, highValueThreshold: settings.highValueThreshold, overdue: ageDays >= settings.quoteAgeDays, contactable: Boolean(contact.phone || contact.email) }),
      ageDays,
      estimatedValue: value,
      dueDate: today,
      customerId: quote.customerId,
      quoteId: quote.id,
      phone: contact.phone,
      email: contact.email,
      href: `/quotes/${quote.id}`,
    });
  });

  leads.forEach((lead) => {
    const stage = normaliseLeadStage(lead.stage);
    const contact = leadContact(lead, customerMap);
    const lastContact = lead.lastContactAt
      || leadActivities.filter((activity) => activity.leadId === lead.id && activity.type !== "Stage change")
        .toSorted((left, right) => right.completedAt.localeCompare(left.completedAt))[0]?.completedAt
      || lead.updatedAt
      || lead.createdAt;
    const ageDays = ageInDays(lastContact, now);
    let reason: CrmFollowUpReason | null = null;
    if (stage === "Lost" && !lead.lostFollowUpCompletedAt && (!lead.followUpDate || lead.followUpDate <= today) && ageInDays(lead.updatedAt, now) <= settings.lostOpportunityDays) reason = "Lost opportunity";
    else if (stage === "Quote Sent" && !lead.quoteId && ageDays >= settings.noResponseDays) reason = "Awaiting acceptance";
    else if (stage === "Follow-up Due" || (stage === "Contacted" && ageDays >= settings.noResponseDays)) reason = "No response";
    else if (stage === "New Lead" || (stage === "Contacted" && lead.followUpDate && lead.followUpDate <= today)) reason = "Survey not booked";
    if (!reason) return;
    const overdue = Boolean(lead.followUpDate && lead.followUpDate <= today) || ageDays >= settings.noResponseDays;
    items.push({
      id: `lead-follow-up-${lead.id}`,
      reason,
      title: contact.name,
      detail: reason === "Lost opportunity"
        ? `${lead.workRequired || "Opportunity"} was lost${lead.lostReason ? `: ${lead.lostReason}` : " without a recorded reason"}.`
        : `${lead.workRequired || "Electrical enquiry"} · next action: ${lead.nextAction || "Make contact"}.`,
      priorityScore: followUpPriority({ ageDays, estimatedValue: lead.estimatedValue, highValueThreshold: settings.highValueThreshold, priority: lead.priority as LeadPriority, overdue, contactable: Boolean(contact.phone || contact.email) }),
      ageDays,
      estimatedValue: lead.estimatedValue,
      dueDate: lead.followUpDate || today,
      customerId: lead.customerId,
      leadId: lead.id,
      quoteId: lead.quoteId,
      phone: contact.phone,
      email: contact.email,
      href: `/leads?lead=${encodeURIComponent(lead.id)}`,
    });
  });

  profiles.filter((profile) => profile.nextFollowUpDate && profile.nextFollowUpDate <= today).forEach((profile) => {
    const customer = customerMap.get(profile.customerId);
    if (!customer) return;
    const ageDays = ageInDays(profile.nextFollowUpDate, now);
    items.push({
      id: `customer-follow-up-${profile.id}`,
      reason: "Customer reminder",
      title: customer.name,
      detail: profile.followUpReason || "Customer follow-up is due.",
      priorityScore: followUpPriority({ ageDays, overdue: true, contactable: Boolean(customer.phone || customer.email) }),
      ageDays,
      estimatedValue: 0,
      dueDate: profile.nextFollowUpDate,
      customerId: customer.id,
      phone: customer.phone,
      email: customer.email,
      href: `/customers/${customer.id}`,
    });
  });

  return items.toSorted((left, right) => right.priorityScore - left.priorityScore || right.estimatedValue - left.estimatedValue || right.ageDays - left.ageDays);
}

export function customerForPlannerEntry(entry: PlannerEntry, jobs: Job[], customers: Customer[]) {
  const customerId = entry.customerId || jobs.find((job) => job.id === entry.jobId)?.customerId;
  return customers.find((customer) => customer.id === customerId);
}
