import type {
  Customer,
  CustomerInteraction,
  Invoice,
  Job,
  PricingDocument,
} from "./models";

export type CustomerActivityKind = "Customer" | "Estimate" | "Quote" | "Job" | "Invoice" | "Interaction";

export interface CustomerActivityItem {
  id: string;
  kind: CustomerActivityKind;
  title: string;
  detail: string;
  occurredAt: string;
  href?: string;
}

interface BuildCustomerActivityInput {
  customer: Customer;
  documents: PricingDocument[];
  jobs: Job[];
  invoices: Invoice[];
  interactions: CustomerInteraction[];
}

function changedAfterCreation(createdAt: string, updatedAt: string) {
  return updatedAt && updatedAt !== createdAt;
}

export function buildCustomerActivity({
  customer,
  documents,
  jobs,
  invoices,
  interactions,
}: BuildCustomerActivityInput) {
  const activity: CustomerActivityItem[] = [{
    id: `customer-created-${customer.id}`,
    kind: "Customer",
    title: "Customer record created",
    detail: customer.name,
    occurredAt: customer.createdAt,
  }];

  for (const document of documents) {
    activity.push({
      id: `document-created-${document.id}`,
      kind: document.type,
      title: `${document.type} ${document.number} created`,
      detail: document.title,
      occurredAt: document.createdAt,
      href: `/quotes/${document.id}`,
    });
    if (changedAfterCreation(document.createdAt, document.updatedAt)) activity.push({
      id: `document-updated-${document.id}`,
      kind: document.type,
      title: `${document.type} ${document.number} · ${document.status}`,
      detail: document.title,
      occurredAt: document.updatedAt,
      href: `/quotes/${document.id}`,
    });
  }

  for (const job of jobs) {
    activity.push({
      id: `job-created-${job.id}`,
      kind: "Job",
      title: "Job created",
      detail: job.title,
      occurredAt: job.createdAt,
      href: `/jobs/${job.id}`,
    });
    if (changedAfterCreation(job.createdAt, job.updatedAt)) activity.push({
      id: `job-updated-${job.id}`,
      kind: "Job",
      title: `Job · ${job.status}`,
      detail: job.title,
      occurredAt: job.updatedAt,
      href: `/jobs/${job.id}`,
    });
  }

  for (const invoice of invoices) {
    activity.push({
      id: `invoice-created-${invoice.id}`,
      kind: "Invoice",
      title: `${invoice.number} created`,
      detail: invoice.title,
      occurredAt: invoice.createdAt,
      href: "/invoices",
    });
    if (changedAfterCreation(invoice.createdAt, invoice.updatedAt)) activity.push({
      id: `invoice-updated-${invoice.id}`,
      kind: "Invoice",
      title: `${invoice.number} · ${invoice.status}`,
      detail: invoice.title,
      occurredAt: invoice.updatedAt,
      href: "/invoices",
    });
  }

  for (const interaction of interactions) {
    activity.push({
      id: `interaction-${interaction.id}`,
      kind: "Interaction",
      title: interaction.type,
      detail: [interaction.summary, interaction.outcome].filter(Boolean).join(" · "),
      occurredAt: interaction.interactionAt,
      href: "/crm",
    });
  }

  return activity.toSorted((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
