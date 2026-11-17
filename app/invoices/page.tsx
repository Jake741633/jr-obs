"use client";

import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FileText, Plus, Search, Trash2 } from "lucide-react";
import { InvoicePreview } from "../../components/invoices/InvoicePreview";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { EntityEmptyState } from "../../components/crm/EntityEmptyState";
import {
  bankDetailsText,
  businessStorageKeys,
  defaultBankDetails,
  defaultBusinessProfile,
  defaultDocumentBranding,
  defaultPaymentTermsTemplates,
  defaultVatSettings,
  paymentTermsText,
} from "../../lib/businessSettings";
import { useInvoicesCollection } from "../../lib/cloud/coreBusinessCollections";
import { makeId, useCloudLocalCollection } from "../../lib/storage";
import { finalInvoiceItems, invoiceItemsFromQuote, linkedBillingInvoices, nextInvoiceNumber } from "../../lib/workflow";
import { calculatedInvoiceState, effectiveInvoicePaid, invoiceBalance, type PaymentRecord } from "../../lib/payments";
import { roundedPence } from "../../lib/depositBilling-core.mjs";
import { invoiceFromLink } from "../../lib/invoiceLink";
import type { Builder, BusinessBankDetails, BusinessProfile, Customer, DocumentBrandingSettings, Invoice, InvoiceStatus, Job, JobTimelineEntry, PaymentTermsTemplate, PricingDocument, PricingLineItem, VatSettings } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const statuses: InvoiceStatus[] = ["Draft", "Sent", "Part paid", "Paid", "Overdue", "Cancelled"];
const blankLine = { description: "", category: "Labour" as PricingLineItem["category"], quantity: "1", unitPrice: "" };
const blankForm = { title: "", customerId: "", builderId: "", jobId: "", quoteId: "", paymentTermsTemplateId: "", paymentTermsText: "", issueDate: new Date().toISOString().slice(0, 10), dueDate: "", vatEnabled: false, vatRate: "20", amountPaid: "0", notes: "", paymentDetails: "" };

function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00`);
  result.setDate(result.getDate() + days);
  return result.toISOString().slice(0, 10);
}

export default function InvoicesPage() {
  const invoices = useInvoicesCollection();
  const payments = useCloudLocalCollection<PaymentRecord>("jr-os-payments");
  const customers = useCloudLocalCollection<Customer>("jr-os-customers");
  const builders = useCloudLocalCollection<Builder>("jr-os-builders");
  const jobs = useCloudLocalCollection<Job>("jr-os-jobs");
  const quotes = useCloudLocalCollection<PricingDocument>("jr-os-pricing-documents");
  const timeline = useCloudLocalCollection<JobTimelineEntry>("jr-os-job-timeline");
  const profileStore = useCloudLocalCollection<BusinessProfile>(businessStorageKeys.profile, [defaultBusinessProfile]);
  const vatStore = useCloudLocalCollection<VatSettings>(businessStorageKeys.vat, [defaultVatSettings]);
  const bankStore = useCloudLocalCollection<BusinessBankDetails>(businessStorageKeys.bank, [defaultBankDetails]);
  const brandingStore = useCloudLocalCollection<DocumentBrandingSettings>(businessStorageKeys.branding, [defaultDocumentBranding]);
  const paymentTermsStore = useCloudLocalCollection<PaymentTermsTemplate>(businessStorageKeys.paymentTerms, defaultPaymentTermsTemplates);
  const deepLinkHandled = useRef(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [items, setItems] = useState<PricingLineItem[]>([]);
  const [selectedManualJob, setSelectedManualJob] = useState<Job | null>(null);
  const [importedQuote, setImportedQuote] = useState<{
    quote: PricingDocument;
    billing: string;
    deductions: PricingLineItem[];
    appliedDepositInvoiceIds: string[];
  } | null>(null);
  const [line, setLine] = useState(blankLine);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [invoiceLimit, setInvoiceLimit] = useState(8);
  const [focusedInvoiceId, setFocusedInvoiceId] = useState("");
  const [invalidInvoiceLink, setInvalidInvoiceLink] = useState(false);
  const [linkReady, setLinkReady] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [pendingMilestone, setPendingMilestone] = useState<{ invoice: Invoice; milestone: JobTimelineEntry["milestone"]; note: string; now: string; owner: typeof timeline.createItem } | null>(null);
  const latestInvoices = useRef({ items: invoices.items, payments: payments.items, ready: false, createItem: invoices.createItem, updateItem: invoices.updateItem, timeline });
  const formOwner = useRef<typeof invoices.createItem | null>(null);
  const latestQuotes = useRef(quotes.items);
  const latestManualBilling = useRef({ jobs: jobs.items, customers: customers.items, builders: builders.items });
  const [error, setError] = useState("");
  const businessProfile = profileStore.items[0] ?? defaultBusinessProfile;
  const vatSettings = vatStore.items[0] ?? defaultVatSettings;
  const bankDetails = bankStore.items[0] ?? defaultBankDetails;
  const branding = brandingStore.items[0] ?? defaultDocumentBranding;
  const ready = invoices.isReady && payments.isReady && customers.isReady && builders.isReady && jobs.isReady && quotes.isReady && timeline.isReady
    && profileStore.isReady && vatStore.isReady && bankStore.isReady && brandingStore.isReady && paymentTermsStore.isReady;
  useLayoutEffect(() => {
    latestQuotes.current = quotes.items;
    latestManualBilling.current = { jobs: jobs.items, customers: customers.items, builders: builders.items };
    latestInvoices.current = { items: invoices.items, payments: payments.items, ready: ready && linkReady, createItem: invoices.createItem, updateItem: invoices.updateItem, timeline };
    return () => { latestInvoices.current = { ...latestInvoices.current, items: [], payments: [], ready: false }; };
  }, [invoices.items, invoices.createItem, invoices.updateItem, payments.items, quotes.items, jobs.items, customers.items, builders.items, timeline, ready, linkReady]);

  useEffect(() => {
    if (deepLinkHandled.current || !ready) return;
    const frame = window.requestAnimationFrame(() => {
      const parameters = new URLSearchParams(window.location.search);
      const requested = invoiceFromLink(window.location.search);
      const customerId = parameters.get("customerId") || "";
      if (requested) {
        setFocusedInvoiceId(requested.invoiceId || "");
        setInvalidInvoiceLink(requested.invoiceId === null);
      } else if (parameters.get("action") === "create" && customerId) {
        const customer = customers.items.find((item) => item.id === customerId);
        if (customer) {
          formOwner.current = invoices.createItem;
          const issueDate = new Date().toISOString().slice(0, 10);
          const template = paymentTermsStore.items.find((item) => item.active && item.isDefault)
            ?? paymentTermsStore.items.find((item) => item.active);
          setForm({
            ...blankForm,
            title: `Electrical works for ${customer.name}`,
            customerId: customer.id,
            issueDate,
            dueDate: addDays(issueDate, template?.dueDays ?? 0),
            vatEnabled: vatSettings.registrationStatus === "VAT registered",
            vatRate: String(vatSettings.defaultRate),
            paymentTermsTemplateId: template?.id ?? "",
            paymentTermsText: template ? paymentTermsText({ type: template.type, name: template.name, description: template.description, dueDays: template.dueDays, depositPercent: template.depositPercent, stages: template.stages }) : "Payment due on completion",
            paymentDetails: bankDetailsText(bankDetails),
          });
          setItems([]);
          setLine(blankLine);
          setError("");
          setShowForm(true);
        }
      }
      deepLinkHandled.current = true;
      setLinkReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [bankDetails, customers.items, invoices.items, invoices.createItem, paymentTermsStore.items, ready, vatSettings]);

  const names = useMemo(() => new Map([
    ...customers.items.map((item) => [item.id, item.name] as const),
    ...builders.items.map((item) => [item.id, item.companyName] as const),
  ]), [customers.items, builders.items]);

  const focused = Boolean(focusedInvoiceId || invalidInvoiceLink);
  const matches = invoices.items.filter((invoice) => invoice.id === focusedInvoiceId);
  const focusUnavailable = focused && (invalidInvoiceLink || matches.length !== 1);
  const identityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const invoice of invoices.items) if (typeof invoice.id === "string" && invoice.id.trim()) counts.set(invoice.id, (counts.get(invoice.id) || 0) + 1);
    return counts;
  }, [invoices.items]);
  const paymentIdCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const payment of payments.items) counts.set(payment.id, (counts.get(payment.id) ?? 0) + 1);
    return counts;
  }, [payments.items]);
  const filtered = useMemo(() => !ready || !linkReady || focusUnavailable ? [] : invoices.items.filter((invoice) => focusedInvoiceId ? invoice.id === focusedInvoiceId : (!statusFilter || invoice.status === statusFilter) && `${invoice.number} ${invoice.title} ${invoice.status} ${names.get(invoice.customerId ?? "") || ""} ${names.get(invoice.builderId ?? "") || ""}`.toLowerCase().includes(search.trim().toLowerCase())), [invoices.items, names, search, statusFilter, focusedInvoiceId, focusUnavailable, ready, linkReady]);
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const vat = form.vatEnabled ? subtotal * Number(form.vatRate || 0) / 100 : 0;
  const total = subtotal + vat;

  function reset() {
    setForm(blankForm); setItems([]); setImportedQuote(null); setSelectedManualJob(null); setLine(blankLine); setError(""); setShowForm(false);
  }

  function startNewInvoice() {
    setSelectedManualJob(null);
    formOwner.current = invoices.createItem;
    setImportedQuote(null);
    const issueDate = new Date().toISOString().slice(0, 10);
    const template = paymentTermsStore.items.find((item) => item.active && item.isDefault)
      ?? paymentTermsStore.items.find((item) => item.active);
    setForm({
      ...blankForm,
      issueDate,
      dueDate: addDays(issueDate, template?.dueDays ?? 0),
      vatEnabled: vatSettings.registrationStatus === "VAT registered",
      vatRate: String(vatSettings.defaultRate),
      paymentTermsTemplateId: template?.id ?? "",
      paymentTermsText: template ? paymentTermsText({ type: template.type, name: template.name, description: template.description, dueDays: template.dueDays, depositPercent: template.depositPercent, stages: template.stages }) : "Payment due on completion",
      paymentDetails: bankDetailsText(bankDetails),
    });
    setItems([]);
    setLine(blankLine);
    setError("");
    setShowForm(true);
  }

  function selectPaymentTerms(id: string) {
    const template = paymentTermsStore.items.find((item) => item.id === id);
    if (!template) {
      setForm((current) => ({ ...current, paymentTermsTemplateId: "" }));
      return;
    }
    setForm((current) => ({
      ...current,
      paymentTermsTemplateId: template.id,
      paymentTermsText: paymentTermsText({ type: template.type, name: template.name, description: template.description, dueDays: template.dueDays, depositPercent: template.depositPercent, stages: template.stages }),
      dueDate: addDays(current.issueDate, template.dueDays),
    }));
  }

  function selectJob(id: string) {
    const matches = latestManualBilling.current.jobs.filter((job) => job.id === id);
    setSelectedManualJob(matches.length === 1 ? matches[0] : null);
    setForm((current) => ({ ...current, jobId: id }));
  }

  function importQuote(id: string) {
    if (!id) {
      setForm((current) => ({ ...current, quoteId: "", jobId: "" }));
      setItems([]);
      setImportedQuote(null);
      setError("");
      return;
    }
    const quote = quotes.items.find((item) => item.id === id && item.status === "Accepted");
    if (!quote) return;
    let importedItems: PricingLineItem[];
    try {
      const baseItems = invoiceItemsFromQuote(quote, makeId);
      const billing = { quoteId: quote.id, jobId: quote.jobId, customerId: quote.customerId, builderId: quote.builderId };
      const final = finalInvoiceItems({ ...billing, items: baseItems, vatEnabled: quote.vatEnabled, vatRate: quote.vatRate, invoices: latestInvoices.current.items, createId: makeId });
      importedItems = final.items;
      const baseIds = new Set(baseItems.map((item) => item.id));
      setImportedQuote({ quote, billing: JSON.stringify(linkedBillingInvoices({ ...billing, invoices: latestInvoices.current.items })), deductions: final.items.filter((item) => !baseIds.has(item.id)), appliedDepositInvoiceIds: final.appliedDepositInvoiceIds });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Review the accepted quote price before creating an invoice.");
      return;
    }
    setForm((current) => {
      const dueDays = quote.paymentTerms?.dueDays ?? (quote.paymentTerms?.type === "Due on completion" ? 0 : 7);
      return { ...current, quoteId: quote.id, title: quote.title, customerId: quote.customerId ?? "", builderId: quote.builderId ?? "", jobId: quote.jobId ?? "", paymentTermsTemplateId: quote.paymentTerms?.templateId ?? current.paymentTermsTemplateId, paymentTermsText: paymentTermsText(quote.paymentTerms), dueDate: addDays(current.issueDate, dueDays), vatEnabled: quote.vatEnabled, vatRate: String(quote.vatRate), notes: quote.notes };
    });
    setItems(importedItems);
    setError("");
  }

  function addLine() {
    const quantity = Number(line.quantity); const unitPrice = Number(line.unitPrice);
    if (!line.description.trim() || quantity <= 0 || unitPrice < 0 || !Number.isFinite(quantity) || !Number.isFinite(unitPrice)) { setError("Enter a description, positive quantity and valid price."); return; }
    setItems((current) => [...current, { id: makeId("invoice-line"), description: line.description.trim(), category: line.category, quantity, unitPrice }]);
    setLine(blankLine); setError("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) { setError("Invoice title is required."); return; }
    if (!form.customerId && !form.builderId) { setError("Select a customer or builder."); return; }
    if (!form.issueDate || !form.dueDate) { setError("Issue and due dates are required."); return; }
    if (items.length === 0) { setError("Add at least one invoice line."); return; }
    if (!latestInvoices.current.ready) { setError("Invoice records are loading. Review the current records before saving."); return; }
    if (formOwner.current !== latestInvoices.current.createItem || invoices.createItem !== latestInvoices.current.createItem) {
      setError("The account or collection changed. Start a new invoice and review its current records."); return;
    }
    if (!importedQuote && form.quoteId) {
      setError("Import the accepted quote or use the job final invoice action to create a linked final balance."); return;
    }
    if (!importedQuote && form.jobId) {
      const current = latestManualBilling.current;
      const matches = current.jobs.filter((job) => job.id === form.jobId);
      const job = matches[0];
      if (matches.length !== 1 || !selectedManualJob || JSON.stringify(job) !== JSON.stringify(selectedManualJob)
        || (job.customerId ?? "") !== (form.customerId || "") || (job.builderId ?? "") !== (form.builderId || "")
        || (form.customerId && current.customers.filter((customer) => customer.id === form.customerId).length !== 1)
        || (form.builderId && current.builders.filter((builder) => builder.id === form.builderId).length !== 1)) {
        setError("The selected job or billing party changed or is ambiguous. Review the current job and select it again."); return;
      }
      if (job.sourceQuoteId || job.quoteSnapshot
        || latestQuotes.current.some((quote) => quote.jobId === job.id && quote.status === "Accepted")
        || latestInvoices.current.items.some((invoice) => invoice.jobId === job.id && invoice.status !== "Cancelled")) {
        setError("This job has a quote or previous billing. Review its records and use the quote or job final invoice action."); return;
      }
    }
    let appliedDepositInvoiceIds: string[] | undefined;
    if (importedQuote) {
      try {
        const quote = importedQuote.quote;
        const billing = { quoteId: quote.id, jobId: quote.jobId, customerId: quote.customerId, builderId: quote.builderId };
        const currentQuote = latestQuotes.current.filter((item) => item.id === quote.id);
        if (currentQuote.length !== 1 || JSON.stringify(currentQuote[0]) !== JSON.stringify(quote)
          || form.quoteId !== quote.id || form.jobId !== (quote.jobId ?? "")
          || form.customerId !== (quote.customerId ?? "") || form.builderId !== (quote.builderId ?? "")
          || form.vatEnabled !== quote.vatEnabled || Number(form.vatRate) !== quote.vatRate
          || JSON.stringify(linkedBillingInvoices({ ...billing, invoices: latestInvoices.current.items })) !== importedQuote.billing) {
          throw new Error("The quote, invoice links or billing history changed. Review the saved records and import the quote again.");
        }
        const deductionIds = new Set(importedQuote.deductions.map((item) => item.id));
        const deductions = items.filter((item) => deductionIds.has(item.id));
        if (JSON.stringify(deductions) !== JSON.stringify(importedQuote.deductions)) {
          throw new Error("The deposit deduction changed. Import the quote again to restore its final balance.");
        }
        const baseItems = items.filter((item) => !deductionIds.has(item.id));
        const final = finalInvoiceItems({ ...billing, items: baseItems, vatEnabled: form.vatEnabled, vatRate: Number(form.vatRate), invoices: latestInvoices.current.items, createId: makeId });
        const currentDeductions = final.items.slice(baseItems.length).map((item) => ({ ...item, id: "" }));
        const importedDeductions = importedQuote.deductions.map((item) => ({ ...item, id: "" }));
        if (JSON.stringify(currentDeductions) !== JSON.stringify(importedDeductions)) {
          throw new Error("The final balance rounding changed. Review the scope and import the quote again.");
        }
        if (JSON.stringify(final.appliedDepositInvoiceIds) !== JSON.stringify(importedQuote.appliedDepositInvoiceIds)) {
          throw new Error("The deposit invoices changed. Review the saved records and import the quote again.");
        }
        appliedDepositInvoiceIds = final.appliedDepositInvoiceIds;
      } catch (error) {
        setError(error instanceof Error ? error.message : "Review the saved deposit invoices and import the quote again.");
        return;
      }
    }
    const now = new Date().toISOString();
    const number = nextInvoiceNumber(latestInvoices.current.items);
    const invoice: Invoice = { id: makeId("invoice"), number, status: "Draft", ...(importedQuote ? { purpose: "Final" as const, appliedDepositInvoiceIds } : {}), customerId: form.customerId || undefined, builderId: form.builderId || undefined, jobId: form.jobId || undefined, quoteId: form.quoteId || undefined, paymentTermsTemplateId: form.paymentTermsTemplateId || undefined, paymentTermsText: form.paymentTermsText, title: form.title.trim(), issueDate: form.issueDate, dueDate: form.dueDate, vatEnabled: form.vatEnabled, vatRate: Number(form.vatRate || 0), items, amountPaid: Number(form.amountPaid || 0), notes: form.notes, paymentDetails: form.paymentDetails, createdAt: now, updatedAt: now };
    try {
      latestInvoices.current.createItem(invoice);
    } catch (error) {
      setError(error instanceof Error ? error.message : "The invoice could not be saved. Review the records and try again.");
      return;
    }
    latestInvoices.current = { ...latestInvoices.current, items: [invoice, ...latestInvoices.current.items] };
    if (invoice.jobId) addInvoiceMilestone(invoice, "Invoice created", `${invoice.number} created and linked to this job.`, now);
    reset();
  }

  function invoiceTotal(invoice: Invoice) { const net = invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0); return net + (invoice.vatEnabled ? net * invoice.vatRate / 100 : 0); }

  function addInvoiceMilestone(invoice: Invoice, milestone: JobTimelineEntry["milestone"], note: string, now: string) {
    if (!invoice.jobId) return;
    const current = latestInvoices.current;
    try {
      if (!current.ready || current.timeline.createItem !== timeline.createItem || !current.timeline.isReady) throw new Error("The job timeline changed or is loading.");
      if (!current.timeline.items.some(entry => entry.jobId === invoice.jobId && entry.milestone === milestone)) {
        const id = `invoice-milestone:${JSON.stringify([invoice.id, invoice.jobId, milestone])}`;
        if (current.timeline.items.some(entry => entry.id === id)) throw new Error("The milestone identity needs review.");
        const entry: JobTimelineEntry = { id, jobId: invoice.jobId, milestone, note, completedBy: "JR OS", completedAt: now, createdAt: now };
        current.timeline.createItem(entry);
        latestInvoices.current = { ...current, timeline: { ...current.timeline, items: [entry, ...current.timeline.items] } };
      }
      setPendingMilestone(pending => pending?.invoice.id === invoice.id && pending.milestone === milestone ? null : pending);
    } catch {
      setPendingMilestone({ invoice, milestone, note, now, owner: timeline.createItem });
      setReviewMessage(`${invoice.number} was saved, but its job milestone could not be saved. Review the job timeline and retry the milestone below.`);
    }
  }

  function retryInvoiceMilestone() {
    const current = latestInvoices.current, pending = pendingMilestone;
    if (!pending) return;
    const matches = current.items.filter(invoice => invoice.id === pending.invoice.id);
    if (!current.ready || current.timeline.createItem !== pending.owner || matches.length !== 1 || matches[0].jobId !== pending.invoice.jobId) {
      setReviewMessage("The invoice, account or job link changed. Review the current saved records before retrying the milestone."); return;
    }
    setReviewMessage("");
    addInvoiceMilestone(matches[0], pending.milestone, pending.note, pending.now);
  }

  function saveInvoiceChange(invoice: Invoice, status: InvoiceStatus, amountPaid: number, now: string) {
    const current = latestInvoices.current;
    try {
      const saved = current.updateItem(invoice.id, record => {
        if (JSON.stringify(record) !== JSON.stringify(invoice)) throw new Error("The saved invoice changed. Review its current record before updating.");
        return record.status === status && record.amountPaid === amountPaid ? record : { ...record, status, amountPaid, updatedAt: now };
      });
      latestInvoices.current = { ...current, items: current.items.map(record => record.id === invoice.id ? saved : record) };
      return saved;
    } catch {
      setReviewMessage("The invoice update could not be confirmed. Review its current saved record before retrying this action.");
      return null;
    }
  }

  function canUpdateInvoice(invoice: Invoice) {
    const current = latestInvoices.current;
    const matches = current.items.filter((item) => item.id === invoice.id);
    if (!current.ready || current.createItem !== invoices.createItem || current.updateItem !== invoices.updateItem
      || typeof invoice.id !== "string" || !invoice.id.trim() || matches.length !== 1 || JSON.stringify(matches[0]) !== JSON.stringify(invoice)) {
      setReviewMessage("This invoice is unavailable, has an ambiguous identity or has changed. Review its current saved record before updating it.");
      return false;
    }
    setReviewMessage(""); return true;
  }

  function updateStatus(invoice: Invoice, status: InvoiceStatus) {
    if (!statuses.includes(status) || !canUpdateInvoice(invoice)) return;
    const current = latestInvoices.current;
    const dropping = status === "Draft" || status === "Cancelled";
    if (dropping && current.items.some(other => other.status !== "Cancelled" && other.appliedDepositInvoiceIds?.includes(invoice.id))) {
      setReviewMessage("This deposit is already included on a final invoice. Review that invoice before changing the deposit.");
      return;
    }
    if (invoice.purpose && ((invoice.status === "Cancelled" && status !== "Cancelled")
      || (dropping && effectiveInvoicePaid(invoice, current.payments) > 0))) {
      setReviewMessage("Review this invoice and its payments before changing its billing status.");
      return;
    }
    if ((status === "Paid" || status === "Part paid") && current.payments.some(payment => payment.invoiceId === invoice.id)) {
      setReviewMessage("This invoice has payment records. Use Payments to update the amount received.");
      return;
    }
    const now = new Date().toISOString();
    const paidAmount = status === "Paid" ? roundedPence(invoiceTotal(invoice)) / 100 : invoice.amountPaid;
    if (!saveInvoiceChange(invoice, status, paidAmount, now)) return;
    if (status === "Sent") addInvoiceMilestone(invoice, "Invoice sent", `${invoice.number} sent to the customer.`, now);
    if (status === "Paid") addInvoiceMilestone(invoice, "Payment received", `${invoice.number} paid in full.`, now);
  }

  function recordPayment(invoice: Invoice) {
    if (!canUpdateInvoice(invoice)) return;
    if (latestInvoices.current.payments.some(payment => payment.invoiceId === invoice.id)) {
      setReviewMessage("Use Payments to update this invoice’s allocated receipts.");
      return;
    }
    const gross = roundedPence(invoiceTotal(invoice)) / 100;
    const response = window.prompt(`Amount received for ${invoice.number}`, String(invoice.amountPaid || gross));
    if (response === null || !canUpdateInvoice(invoice) || latestInvoices.current.payments.some(payment => payment.invoiceId === invoice.id)) return;
    const amountPaid = Number(response);
    if (!Number.isFinite(amountPaid) || amountPaid < 0 || amountPaid > gross) { window.alert(`Enter an amount between £0.00 and ${money.format(gross)}.`); return; }
    const now = new Date().toISOString();
    const status: InvoiceStatus = amountPaid >= gross ? "Paid" : amountPaid > 0 ? "Part paid" : invoice.status;
    if (!saveInvoiceChange(invoice, status, amountPaid, now)) return;
    if (status === "Paid") addInvoiceMilestone(invoice, "Payment received", `${invoice.number} paid in full.`, now);
  }

  function clearInvoiceFilters() { setSearch(""); setStatusFilter(""); setInvoiceLimit(8); }

  if (!ready || !linkReady) return <Card>Loading invoices…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance" title="Invoices" description="Create invoices from accepted quotes or build them manually, then track payment status." action={<Button className="min-h-12" onClick={() => showForm ? reset() : startNewInvoice()}><Plus className="mr-2 size-4" />{showForm ? "Close form" : "New invoice"}</Button>} />
    {focused ? <section aria-label="Invoice selection" className="space-y-3 rounded-xl border border-cyan-400/30 p-4"><p role="status" className="break-words text-sm text-cyan-100">{invalidInvoiceLink ? "This invoice link is invalid. Show all invoices to choose a saved record." : focusUnavailable ? "The selected invoice is unavailable or its identity is ambiguous. Other invoices have not been substituted." : `Showing ${filtered[0].number} · ${filtered[0].title}. This is the exact saved invoice, with its current status.`}</p><button type="button" onClick={() => { setFocusedInvoiceId(""); setInvalidInvoiceLink(false); clearInvoiceFilters(); setReviewMessage(""); }} className="min-h-12 rounded-xl border border-slate-700 px-3 text-sm font-semibold">Show all invoices</button></section> : null}
    {reviewMessage ? <p role="status" className="rounded-xl border border-amber-400/30 p-3 text-sm text-amber-200">{reviewMessage}</p> : null}
    {pendingMilestone ? <Button type="button" variant="secondary" onClick={retryInvoiceMilestone}>Retry job milestone</Button> : null}

    {showForm ? <Card><form onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InputField required label="Invoice title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Import accepted quote</span><select value={form.quoteId} onChange={(e) => importQuote(e.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Build manually</option>{quotes.items.filter((item) => item.status === "Accepted").map((item) => <option key={item.id} value={item.id}>{item.number} · {item.title}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Customer</span><select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value, builderId: "" })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">None</option>{customers.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Builder</span><select value={form.builderId} onChange={(e) => setForm({ ...form, builderId: e.target.value, customerId: "" })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">None</option>{builders.items.map((item) => <option key={item.id} value={item.id}>{item.companyName}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Linked job</span><select value={form.jobId} onChange={(e) => selectJob(e.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">No linked job</option>{jobs.items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <InputField required label="Issue date" type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
        <InputField required label="Due date" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Payment terms</span><select value={form.paymentTermsTemplateId} onChange={(event) => selectPaymentTerms(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Custom terms</option>{paymentTermsStore.items.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="flex items-center gap-3 pt-8 text-sm text-slate-300"><input type="checkbox" checked={form.vatEnabled} onChange={(e) => setForm({ ...form, vatEnabled: e.target.checked })} /> Add VAT</label>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <h2 className="font-semibold">Invoice lines</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_150px_110px_150px_auto]"><InputField label="Description" value={line.description} onChange={(e) => setLine({ ...line, description: e.target.value })} /><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Category</span><select value={line.category} onChange={(e) => setLine({ ...line, category: e.target.value as PricingLineItem["category"] })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>Labour</option><option>Materials</option><option>Other</option></select></label><InputField label="Qty" type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => setLine({ ...line, quantity: e.target.value })} /><InputField label="Unit price (£)" type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => setLine({ ...line, unitPrice: e.target.value })} /><Button type="button" className="self-end" onClick={addLine}>Add</Button></div>
        <div className="mt-4 space-y-2">{items.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl bg-slate-900 p-3"><div><p className="font-medium">{item.description}</p><p className="text-xs text-slate-500">{item.quantity} × {money.format(item.unitPrice)}</p></div><div className="flex items-center gap-3"><strong>{money.format(item.quantity * item.unitPrice)}</strong><button type="button" onClick={() => setItems((current) => current.filter((lineItem) => lineItem.id !== item.id))} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div></div>)}</div>
      </div>

      <div className="grid gap-4 md:grid-cols-3"><TextareaField label="Invoice notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /><TextareaField label="Payment terms wording" value={form.paymentTermsText} onChange={(e) => setForm({ ...form, paymentTermsText: e.target.value, paymentTermsTemplateId: "" })} /><TextareaField label="Payment details" value={form.paymentDetails} onChange={(e) => setForm({ ...form, paymentDetails: e.target.value })} /></div>
      <div><h2 className="mb-3 text-lg font-bold">Branded invoice preview</h2><InvoicePreview number="DRAFT" title={form.title} customer={customers.items.find((item) => item.id === form.customerId)} builder={builders.items.find((item) => item.id === form.builderId)} issueDate={form.issueDate} dueDate={form.dueDate} items={items} notes={form.notes} paymentTermsText={form.paymentTermsText} paymentDetails={form.paymentDetails} vatEnabled={form.vatEnabled} vatRate={Number(form.vatRate || 0)} businessProfile={businessProfile} vatSettings={vatSettings} branding={branding} /></div>
      <div className="flex items-end justify-between border-t border-slate-800 pt-5"><div>{error ? <p className="text-sm text-red-300">{error}</p> : null}</div><div className="text-right"><p className="text-sm text-slate-400">Subtotal {money.format(subtotal)}</p>{form.vatEnabled ? <p className="text-sm text-slate-400">VAT {money.format(vat)}</p> : null}<p className="text-xl font-bold">Total {money.format(total)}</p><Button type="submit" className="mt-3">Save invoice</Button></div></div>
    </form></Card> : null}

    {!focused ? <section aria-label="Find invoices" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm text-slate-400"><span>Find an invoice</span><span className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setInvoiceLimit(8); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} placeholder="Number, title or customer" autoCapitalize="none" spellCheck={false} className="min-h-12 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-base outline-none focus:border-cyan-400" /></span></label>
        <label className="grid gap-2 text-sm text-slate-400"><span>Invoice status filter</span><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setInvoiceLimit(8); }} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="">All saved statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      </div>
      {search || statusFilter ? <button type="button" onClick={clearInvoiceFilters} className="min-h-12 rounded-xl border border-slate-700 px-4 text-sm font-semibold">Clear invoice filters</button> : null}
    </section> : null}
    {filtered.length ? <p role="status" className="text-sm text-slate-400">Showing {Math.min(filtered.length, focused ? 1 : invoiceLimit)} of {filtered.length} {focused ? "selected" : "matching"} invoice{filtered.length === 1 ? "" : "s"}. Balances include recorded payments. The status filter uses the saved invoice status.</p> : null}
    {filtered.length === 0 ? <EntityEmptyState icon={<FileText className="size-6" />} title={focused ? "No invoice available for this link" : invoices.items.length ? "No matching invoices" : "No invoices yet"} description={focused ? "Review the selection above or explicitly show all invoices." : invoices.items.length ? "Try a different search or status filter." : "Create an invoice manually or import an accepted quote."} /> : <section aria-label="Invoice records" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.slice(0, focused ? 1 : invoiceLimit).map((invoice, index) => {
      const gross = invoiceTotal(invoice);
      const ambiguous = identityCounts.get(invoice.id) !== 1;
      const linkedPayments = payments.items.filter(payment => payment.invoiceId === invoice.id);
      const reviewPayments = linkedPayments.some(payment => typeof payment.id !== "string" || !payment.id.trim() || paymentIdCounts.get(payment.id) !== 1
        || (payment.customerId && payment.customerId !== invoice.customerId)
        || !["Allocated", "Reconciled"].includes(payment.reconciliationStatus)
        || !["Deposit", "Payment", "Stage payment", "Refund", "Credit note"].includes(payment.type)
        || !Number.isFinite(payment.amount) || payment.amount < 0);
      const outstanding = invoiceBalance(invoice, linkedPayments);
      const paymentState = invoice.status === "Cancelled" || invoice.status === "Draft" ? invoice.status
        : invoice.status === "Paid" && outstanding > 0 ? "Review recorded payment" : calculatedInvoiceState(invoice, linkedPayments);
      return <Card key={JSON.stringify([invoice.id, index])} className="min-w-0 break-words">
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{invoice.number}</p><h2 className="mt-1 text-lg font-bold">{invoice.title}</h2><p className="text-sm text-slate-500">{names.get(invoice.customerId ?? "") || names.get(invoice.builderId ?? "") || "Unassigned"}</p>
        {ambiguous ? <p className="mt-3 text-sm text-amber-200">Invoice identity missing or ambiguous. Updates are blocked until the saved copies are reviewed.</p> : null}
        <div className="mt-4 grid gap-3 border-t border-slate-800 pt-4">
          <label className="grid gap-2 text-xs text-slate-500"><span>Saved status</span><select disabled={ambiguous} value={invoice.status} onChange={(event) => updateStatus(invoice, event.target.value as InvoiceStatus)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-slate-200">{!statuses.includes(invoice.status) ? <option value={invoice.status}>{invoice.status || "Not recorded"} · review</option> : null}{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <div className="flex justify-between gap-3 text-sm"><span className="text-slate-500">Due {invoice.dueDate ? new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString("en-GB") : "—"}</span><strong>{money.format(gross)}</strong></div>
          <div className="flex justify-between gap-3 text-sm"><span className="text-slate-500">Payment status</span><span>{ambiguous ? "Review invoice" : reviewPayments ? "Review payment records" : paymentState}</span></div>
          <div className="flex justify-between gap-3 text-sm"><span className="text-slate-500">Balance remaining</span><span className={outstanding > 0 ? "font-semibold text-amber-300" : "font-semibold text-emerald-300"}>{ambiguous || reviewPayments || invoice.status === "Cancelled" ? "—" : money.format(outstanding)}</span></div>
          {invoice.status !== "Cancelled" && linkedPayments.length ? <a href="/payments" className="inline-flex min-h-12 items-center text-cyan-300">Review in Payments</a> : invoice.status !== "Cancelled" ? <Button type="button" variant="secondary" className="min-h-12" disabled={ambiguous} onClick={() => recordPayment(invoice)}>{invoice.status === "Paid" ? "Update payment" : "Record payment"}</Button> : null}
        </div>
      </Card>;
    })}</section>}
    {!focused && filtered.length > invoiceLimit ? <button type="button" onClick={() => setInvoiceLimit((value) => value + 8)} className="min-h-12 w-full rounded-xl border border-slate-700 px-4 text-sm font-semibold">Show more invoices ({filtered.length - invoiceLimit} remaining)</button> : null}
  </div>;
}
