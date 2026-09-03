"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { BriefcaseBusiness, Calculator, Clock3, Download, ExternalLink, Eye, FileText, LayoutTemplate, PackagePlus, Paperclip, Pencil, Plus, Save, Search, Sparkles, TrendingUp, Trash2 } from "lucide-react";
import { MobileActionDock, MobileDockAction } from "../../components/mobile/MobileActionDock";
import { FixedPriceWorkflowCard } from "../../components/quotes/FixedPriceWorkflowCard";
import { MobilePricingLineCard } from "../../components/quotes/MobilePricingLineCard";
import { QuotePreview } from "../../components/quotes/QuotePreview";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { EntityEmptyState } from "../../components/crm/EntityEmptyState";
import {
  businessStorageKeys,
  defaultBusinessProfile,
  defaultDocumentBranding,
  defaultPaymentTermsTemplates,
  defaultVatSettings,
  paymentTermsFromTemplate,
} from "../../lib/businessSettings";
import { usePricingDocumentsCollection } from "../../lib/cloud/coreBusinessCollections";
import { strictHttpsJobDocumentUrl } from "../../lib/cloud/fieldJobDocumentCapability-core.mjs";
import { makeId, useCloudLocalCollection } from "../../lib/storage";
import { calculateQuoteProfitability, defaultQuotePricingSettings } from "../../lib/quoteEngine";
import { defaultBusinessTermsTemplates, quoteTemplates } from "../../lib/quoteTemplates";
import { createJobFromAcceptedQuote, nextPricingDocumentNumber, pricingDocumentTotal } from "../../lib/workflow";
import type { Builder, BusinessOverhead, BusinessProfile, BusinessTermsTemplate, Customer, DocumentBrandingSettings, FixedPriceWorkflow, Job, JobDocument, JobPack, JobTimelineEntry, LabourCostSettings, LabourRate, Material, PaymentTermsTemplate, PaymentTermsType, PricingDocument, PricingDocumentStatus, PricingDocumentType, PricingLineItem, QuoteLabourMode, QuotePaymentTerms, QuotePricingSettings, QuoteRevision, QuoteTemplateType, RecordAttachment, VatSettings } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const defaultTerms = "This document is based on the described scope. Variations, unforeseen work and making good are excluded unless stated otherwise.";
const blankItem = { description: "", category: "Labour" as PricingLineItem["category"], quantity: "1", unitPrice: "", unitCost: "" };
const blankForm = { type: "Quote" as PricingDocumentType, title: "", customerId: "", builderId: "", jobId: "", siteAddress: "", validUntil: "", vatEnabled: false, vatRate: "20", notes: "", exclusions: "", internalNotes: "", terms: defaultTerms, termsTemplateId: "", templateType: undefined as QuoteTemplateType | undefined };
const statuses: PricingDocumentStatus[] = ["Draft", "Sent", "Accepted", "Declined", "Expired"];
const defaultLabourSettings: LabourCostSettings = { id: "labour-cost-settings", workingDaysPerYear: 220, billableHoursPerDay: 7.5, targetNetMargin: 25, contingencyPercent: 10, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() };
const blankLabour = { rateId: "", mode: "Hours" as QuoteLabourMode, quantity: "1", fixedCost: "", fixedPrice: "", fixedHours: "" };
const blankFixedPriceWorkflow: FixedPriceWorkflow = { type: "Direct fixed price", initialVisitCompleted: false, faultFindingCompleted: false, recommendation: "" };

export default function QuotesPage() {
  const documents = usePricingDocumentsCollection();
  const customers = useCloudLocalCollection<Customer>("jr-os-customers");
  const builders = useCloudLocalCollection<Builder>("jr-os-builders");
  const jobs = useCloudLocalCollection<Job>("jr-os-jobs");
  const jobPacks = useCloudLocalCollection<JobPack>("jr-os-job-packs");
  const materials = useCloudLocalCollection<Material>("jr-os-materials");
  const labourRates = useCloudLocalCollection<LabourRate>("jr-os-labour-rates");
  const overheads = useCloudLocalCollection<BusinessOverhead>("jr-os-business-overheads");
  const labourSettingsStore = useCloudLocalCollection<LabourCostSettings>("jr-os-labour-cost-settings", [defaultLabourSettings]);
  const quoteSettingsStore = useCloudLocalCollection<QuotePricingSettings>("jr-os-quote-engine-settings", [defaultQuotePricingSettings]);
  const termsTemplates = useCloudLocalCollection<BusinessTermsTemplate>("jr-os-business-terms-templates", defaultBusinessTermsTemplates);
  const paymentTermsTemplates = useCloudLocalCollection<PaymentTermsTemplate>(businessStorageKeys.paymentTerms, defaultPaymentTermsTemplates);
  const profileStore = useCloudLocalCollection<BusinessProfile>(businessStorageKeys.profile, [defaultBusinessProfile]);
  const vatStore = useCloudLocalCollection<VatSettings>(businessStorageKeys.vat, [defaultVatSettings]);
  const brandingStore = useCloudLocalCollection<DocumentBrandingSettings>(businessStorageKeys.branding, [defaultDocumentBranding]);
  const timeline = useCloudLocalCollection<JobTimelineEntry>("jr-os-job-timeline");
  const jobDocuments = useCloudLocalCollection<JobDocument>("jr-os-job-documents");
  const deepLinkHandled = useRef(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedJobPackId, setSelectedJobPackId] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialQuantity, setMaterialQuantity] = useState("1");
  const [savePackName, setSavePackName] = useState("");
  const [savePackCategory, setSavePackCategory] = useState("Custom");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pageMessage, setPageMessage] = useState("");
  const [form, setForm] = useState(blankForm);
  const [items, setItems] = useState<PricingLineItem[]>([]);
  const [line, setLine] = useState(blankItem);
  const [labour, setLabour] = useState(blankLabour);
  const [pricing, setPricing] = useState<QuotePricingSettings>(defaultQuotePricingSettings);
  const [paymentTerms, setPaymentTerms] = useState<QuotePaymentTerms>({ type: "Due on completion" });
  const [fixedPriceWorkflow, setFixedPriceWorkflow] = useState<FixedPriceWorkflow>(blankFixedPriceWorkflow);
  const [attachments, setAttachments] = useState<RecordAttachment[]>([]);
  const [attachmentLink, setAttachmentLink] = useState({ name: "", url: "" });
  const [attachmentError, setAttachmentError] = useState("");
  const businessProfile = profileStore.items[0] ?? defaultBusinessProfile;
  const vatSettings = vatStore.items[0] ?? defaultVatSettings;
  const branding = brandingStore.items[0] ?? defaultDocumentBranding;

  useEffect(() => {
    if (deepLinkHandled.current || !customers.isReady || !builders.isReady || !quoteSettingsStore.isReady || !paymentTermsTemplates.isReady || !vatStore.isReady) return;
    const frame = window.requestAnimationFrame(() => {
      const parameters = new URLSearchParams(window.location.search);
      const customerId = parameters.get("customerId") || "";
      const builderId = parameters.get("builderId") || "";
      if (parameters.get("action") === "create" && (customerId || builderId)) {
        const customer = customers.items.find((item) => item.id === customerId);
        const builder = builders.items.find((item) => item.id === builderId);
        if (customer || builder) {
          const savedPricing = quoteSettingsStore.items[0] ?? defaultQuotePricingSettings;
          const savedVat = vatStore.items[0] ?? defaultVatSettings;
          const defaultPayment = paymentTermsTemplates.items.find((item) => item.active && item.isDefault)
            ?? paymentTermsTemplates.items.find((item) => item.active);
          setForm({ ...blankForm, customerId: customer?.id || "", builderId: builder?.id || "", siteAddress: customer?.address || builder?.address || "", vatEnabled: savedVat.registrationStatus === "VAT registered", vatRate: String(savedVat.defaultRate) });
          setItems([]);
          setPricing(savedPricing);
          setLabour({ ...blankLabour, rateId: savedPricing.defaultLabourRateId ?? "" });
          setPaymentTerms(defaultPayment ? paymentTermsFromTemplate(defaultPayment) : { type: "Due on completion" });
          setFixedPriceWorkflow(blankFixedPriceWorkflow);
          setAttachments([]);
          setEditingId(null);
          setError("");
          setSuccess(`New quote prepared for ${customer?.name || builder?.companyName}.`);
          setShowForm(true);
        }
      }
      deepLinkHandled.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [builders.isReady, builders.items, customers.isReady, customers.items, paymentTermsTemplates.isReady, paymentTermsTemplates.items, quoteSettingsStore.isReady, quoteSettingsStore.items, vatStore.isReady, vatStore.items]);

  const names = useMemo(() => new Map([
    ...customers.items.map((item) => [item.id, item.name] as const),
    ...builders.items.map((item) => [item.id, item.companyName] as const),
  ]), [customers.items, builders.items]);

  const filtered = useMemo(() => documents.items.filter((doc) => `${doc.number} ${doc.title} ${doc.status} ${names.get(doc.customerId ?? "")} ${names.get(doc.builderId ?? "")}`.toLowerCase().includes(search.toLowerCase())), [documents.items, names, search]);

  const materialOptions = useMemo(() => {
    const query = materialSearch.trim().toLowerCase();
    return materials.items
      .filter((item) => !query || `${item.name} ${item.manufacturer} ${item.supplier} ${item.stockCode}`.toLowerCase().includes(query))
      .toSorted((a, b) => Number(b.favourite) - Number(a.favourite) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 30);
  }, [materialSearch, materials.items]);

  const labourSettings = labourSettingsStore.items[0] ?? defaultLabourSettings;
  const profitability = useMemo(
    () => calculateQuoteProfitability(items, pricing, overheads.items, labourSettings),
    [items, labourSettings, overheads.items, pricing],
  );
  const vat = form.vatEnabled ? profitability.sellingPrice * (Number(form.vatRate || 0) / 100) : 0;
  const dashboard = useMemo(() => {
    const quoteDocs = documents.items.filter((document) => document.type === "Quote");
    return {
      pipelineValue: quoteDocs.filter((document) => ["Draft", "Sent"].includes(document.status)).reduce((sum, document) => sum + (document.profitability?.sellingPrice ?? document.items.reduce((lineSum, item) => lineSum + item.quantity * item.unitPrice, 0)), 0),
      expectedProfit: quoteDocs.filter((document) => ["Draft", "Sent", "Accepted"].includes(document.status)).reduce((sum, document) => sum + (document.profitability?.expectedProfit ?? 0), 0),
      accepted: quoteDocs.filter((document) => document.status === "Accepted").length,
      drafts: quoteDocs.filter((document) => document.status === "Draft").length,
    };
  }, [documents.items]);

  function reset() {
    setForm(blankForm);
    setItems([]);
    setLine(blankItem);
    setEditingId(null);
    setSelectedJobPackId("");
    setSelectedMaterialId("");
    setMaterialSearch("");
    setMaterialQuantity("1");
    setSavePackName("");
    setSavePackCategory("Custom");
    setLabour(blankLabour);
    setPricing(quoteSettingsStore.items[0] ?? defaultQuotePricingSettings);
    setPaymentTerms({ type: "Due on completion" });
    setFixedPriceWorkflow(blankFixedPriceWorkflow);
    setAttachments([]);
    setAttachmentLink({ name: "", url: "" });
    setAttachmentError("");
    setError("");
    setSuccess("");
    setShowForm(false);
  }

  function startNewDocument() {
    const savedPricing = quoteSettingsStore.items[0] ?? defaultQuotePricingSettings;
    const defaultPayment = paymentTermsTemplates.items.find((item) => item.active && item.isDefault)
      ?? paymentTermsTemplates.items.find((item) => item.active);
    setForm({
      ...blankForm,
      vatEnabled: vatSettings.registrationStatus === "VAT registered",
      vatRate: String(vatSettings.defaultRate),
    });
    setItems([]);
    setPricing(savedPricing);
    setLabour({ ...blankLabour, rateId: savedPricing.defaultLabourRateId ?? "" });
    setPaymentTerms(defaultPayment ? paymentTermsFromTemplate(defaultPayment) : { type: "Due on completion" });
    setFixedPriceWorkflow(blankFixedPriceWorkflow);
    setAttachments([]);
    setEditingId(null);
    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function startEdit(document: PricingDocument) {
    setForm({ type: document.type, title: document.title, customerId: document.customerId ?? "", builderId: document.builderId ?? "", jobId: document.jobId ?? "", siteAddress: document.siteAddress ?? "", validUntil: document.validUntil, vatEnabled: document.vatEnabled, vatRate: String(document.vatRate), notes: document.notes, exclusions: document.exclusions ?? "", internalNotes: document.internalNotes ?? "", terms: document.terms, termsTemplateId: document.termsTemplateId ?? "", templateType: document.templateType });
    setItems(document.items);
    setPricing(document.pricingSettings ?? quoteSettingsStore.items[0] ?? defaultQuotePricingSettings);
    setPaymentTerms(document.paymentTerms ?? { type: "Due on completion" });
    setFixedPriceWorkflow(document.fixedPriceWorkflow ?? blankFixedPriceWorkflow);
    setAttachments(document.attachments ?? []);
    setEditingId(document.id);
    setSavePackName(document.title);
    setError("");
    setSuccess("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function applyTemplate(templateType: QuoteTemplateType) {
    const template = quoteTemplates.find((item) => item.type === templateType);
    if (!template) return;
    const termsTemplate = termsTemplates.items.find((item) => item.id === template.termsTemplateId);
    setForm((current) => ({
      ...current,
      title: current.title || template.title,
      notes: current.notes || template.notes,
      terms: termsTemplate?.content ?? current.terms,
      termsTemplateId: termsTemplate?.id ?? "",
      templateType,
    }));
    setItems((current) => current.length ? current : template.sections.map((section) => ({
      id: makeId("line"),
      description: section.description,
      category: section.category,
      quantity: 1,
      unitCost: 0,
      unitPrice: 0,
    })));
    const savedPaymentTemplate = paymentTermsTemplates.items.find((item) => item.active && item.type === template.paymentType);
    setPaymentTerms(savedPaymentTemplate ? paymentTermsFromTemplate(savedPaymentTemplate) : { type: template.paymentType, depositPercent: template.paymentType === "Deposit" ? 25 : undefined, stages: template.paymentType === "Staged payments" ? "30% deposit · 40% after first fix · 30% on completion" : undefined });
    setSuccess(`${template.type} quote template applied. Review every section before sending.`);
  }

  function selectTermsTemplate(id: string) {
    const template = termsTemplates.items.find((item) => item.id === id);
    setForm((current) => ({ ...current, termsTemplateId: id, terms: template?.content ?? current.terms }));
  }

  function selectCustomer(customerId: string) {
    const customer = customers.items.find((item) => item.id === customerId);
    setForm((current) => ({ ...current, customerId, builderId: "", siteAddress: customer?.address ?? current.siteAddress }));
  }

  function selectBuilder(builderId: string) {
    const builder = builders.items.find((item) => item.id === builderId);
    setForm((current) => ({ ...current, builderId, customerId: "", siteAddress: builder?.address ?? current.siteAddress }));
  }

  function selectJob(jobId: string) {
    const job = jobs.items.find((item) => item.id === jobId);
    setForm((current) => ({
      ...current,
      jobId,
      customerId: job?.customerId ?? current.customerId,
      builderId: job?.builderId ?? current.builderId,
      siteAddress: job?.siteAddress ?? current.siteAddress,
    }));
  }

  async function addAttachmentFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    const oversized = files.find((file) => file.size > 2_000_000);
    if (oversized) { setAttachmentError(`${oversized.name} is over the 2 MB local-storage limit.`); return; }
    const added = await Promise.all(files.map(async (file): Promise<RecordAttachment | null> => {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Unable to read file"));
        reader.readAsDataURL(file);
      }).catch(() => "");
      if (!dataUrl) return null;
      const now = new Date().toISOString();
      return { id: makeId("attachment"), name: file.name.replace(/\.[^/.]+$/, ""), fileName: file.name, mimeType: file.type, dataUrl, notes: "", createdAt: now };
    }));
    setAttachments((current) => [...current, ...added.filter((item): item is RecordAttachment => Boolean(item))]);
    setAttachmentError(added.some((item) => !item) ? "One or more files could not be read." : "");
  }

  function addAttachmentLink() {
    const name = attachmentLink.name.trim();
    const externalUrl = attachmentLink.url.trim();
    if (!name || !externalUrl) { setAttachmentError("Enter a name and URL for the attachment."); return; }
    const safeExternalUrl = strictHttpsJobDocumentUrl(externalUrl);
    if (!safeExternalUrl) { setAttachmentError("Enter a valid HTTPS URL without embedded credentials."); return; }
    const now = new Date().toISOString();
    setAttachments((current) => [...current, { id: makeId("attachment"), name, fileName: "", mimeType: "", externalUrl: safeExternalUrl, notes: "", createdAt: now }]);
    setAttachmentLink({ name: "", url: "" });
    setAttachmentError("");
  }

  function updatePricing(patch: Partial<QuotePricingSettings>) {
    const next = { ...pricing, ...patch };
    setPricing(next);
    quoteSettingsStore.setItems([next]);
    if (patch.materialMarkupPercent !== undefined) {
      setItems((current) => current.map((item) => item.category === "Materials"
        ? { ...item, unitPrice: (item.unitCost ?? item.unitPrice) * (1 + patch.materialMarkupPercent! / 100) }
        : item));
    }
  }

  function addSavedLabour() {
    const rate = labourRates.items.find((item) => item.id === labour.rateId && item.active);
    if (!rate) { setError("Choose an active saved labour rate."); return; }
    const quantity = Number(labour.quantity);
    const fixedCost = Number(labour.fixedCost);
    const fixedPrice = Number(labour.fixedPrice);
    const fixedHours = Number(labour.fixedHours);
    if (!Number.isFinite(quantity) || quantity <= 0) { setError("Enter a valid labour quantity."); return; }
    if (labour.mode === "Fixed" && (!Number.isFinite(fixedCost) || fixedCost < 0 || !Number.isFinite(fixedPrice) || fixedPrice < 0 || !Number.isFinite(fixedHours) || fixedHours < 0)) {
      setError("Enter valid fixed labour cost, selling price and expected hours.");
      return;
    }
    const lineQuantity = labour.mode === "Fixed" ? 1 : quantity;
    const labourHours = labour.mode === "Hours" ? quantity : labour.mode === "Days" ? quantity * labourSettings.billableHoursPerDay : fixedHours;
    setItems((current) => [...current, {
      id: makeId("line"),
      description: `${rate.name} · ${labour.mode.toLowerCase()}`,
      category: "Labour",
      quantity: lineQuantity,
      unitCost: labour.mode === "Fixed" ? fixedCost : rate.costRate,
      unitPrice: labour.mode === "Fixed" ? fixedPrice : rate.chargeRate,
      labourRateId: rate.id,
      labourMode: labour.mode,
      labourHours,
    }]);
    setLabour(blankLabour);
    setError("");
    setSuccess(`${rate.name} added using the saved Labour & Costs rate.`);
  }

  function addLine() {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const unitCost = line.unitCost === "" ? unitPrice : Number(line.unitCost);
    if (!line.description.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      setError("Add a description, positive quantity and valid cost and selling prices.");
      return;
    }
    setItems((current) => [...current, { id: makeId("line"), description: line.description.trim(), category: line.category, quantity, unitPrice, unitCost }]);
    setLine(blankItem);
    setError("");
    setSuccess("");
  }

  function addMaterial() {
    const material = materials.items.find((item) => item.id === selectedMaterialId);
    const quantity = Number(materialQuantity);
    if (!material) { setError("Choose a material first."); return; }
    if (!Number.isFinite(quantity) || quantity <= 0) { setError("Enter a valid material quantity."); return; }
    const description = [material.name, material.manufacturer, material.stockCode ? `(${material.stockCode})` : ""].filter(Boolean).join(" ");
    setItems((current) => [...current, {
      id: makeId("line"),
      description,
      category: "Materials",
      quantity,
      unitPrice: material.tradeCost * (1 + pricing.materialMarkupPercent / 100),
      unitCost: material.tradeCost,
      materialId: material.id,
      supplier: material.supplier,
      stockCode: material.stockCode,
    }]);
    setSelectedMaterialId("");
    setMaterialQuantity("1");
    setError("");
    setSuccess(`${material.name} added from the Materials Library.`);
  }

  function addJobPack() {
    const pack = jobPacks.items.find((item) => item.id === selectedJobPackId);
    if (!pack) { setError("Choose a job pack first."); return; }
    const imported: PricingLineItem[] = [];
    if (pack.labourHours > 0) imported.push({ id: makeId("line"), description: pack.labourDescription || `${pack.name} labour`, category: "Labour", quantity: pack.labourHours, unitPrice: pack.labourRate, unitCost: pack.labourRate });
    pack.materials.forEach((packMaterial) => {
      const source = packMaterial.materialId ? materials.items.find((item) => item.id === packMaterial.materialId) : undefined;
      imported.push({
        id: makeId("line"),
        description: source?.name || packMaterial.description,
        category: "Materials",
        quantity: packMaterial.quantity,
        unitPrice: source?.sellPrice ?? packMaterial.unitPrice,
        unitCost: source?.tradeCost ?? packMaterial.unitPrice,
        materialId: source?.id,
        supplier: source?.supplier,
        stockCode: source?.stockCode,
      });
    });
    setItems((current) => [...current, ...imported]);
    setForm((current) => ({
      ...current,
      title: current.title || pack.name,
      notes: [current.notes, pack.description, pack.testingRequirements ? `Testing: ${pack.testingRequirements}` : "", pack.certificatesRequired ? `Certificates: ${pack.certificatesRequired}` : "", pack.notes].filter(Boolean).join("\n\n"),
    }));
    setSavePackName((current) => current || pack.name);
    setSelectedJobPackId("");
    setError("");
    setSuccess(`${pack.name} added. Linked materials use the latest library price where available.`);
  }

  function saveAsJobPack() {
    const name = savePackName.trim() || form.title.trim();
    if (!name) { setError("Enter a name for the new job pack."); return; }
    if (items.length === 0) { setError("Add pricing lines before saving a job pack."); return; }
    const labourLines = items.filter((item) => item.category === "Labour");
    const materialLines = items.filter((item) => item.category === "Materials");
    const otherLines = items.filter((item) => item.category === "Other");
    const labourTotal = labourLines.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const singleLabour = labourLines.length === 1 ? labourLines[0] : undefined;
    const now = new Date().toISOString();
    const pack: JobPack = {
      id: makeId("pack"), name, category: savePackCategory.trim() || "Custom", description: form.title.trim(),
      labourDescription: singleLabour?.description || labourLines.map((item) => item.description).filter(Boolean).join(" + ") || `${name} labour`,
      labourHours: singleLabour?.quantity ?? (labourTotal > 0 ? 1 : 0), labourRate: singleLabour?.unitPrice ?? labourTotal,
      materials: materialLines.map((item) => ({ id: makeId("pack-material"), materialId: item.materialId, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice })),
      testingRequirements: "", certificatesRequired: "",
      notes: [form.notes, otherLines.length ? `Other allowances from original quote:\n${otherLines.map((item) => `- ${item.description}: ${item.quantity} × ${money.format(item.unitPrice)}`).join("\n")}` : ""].filter(Boolean).join("\n\n"),
      createdAt: now, updatedAt: now,
    };
    jobPacks.setItems((current) => [pack, ...current]);
    setError("");
    setSuccess(`${name} saved as a reusable job pack.`);
  }

  function convertToJob(document: PricingDocument) {
    if (document.jobId) { setPageMessage(`${document.number} is already linked to a job.`); return; }
    if (document.status !== "Accepted") { setPageMessage("Mark the quote as Accepted before creating a live job."); return; }
    const customer = customers.items.find((item) => item.id === document.customerId);
    const builder = builders.items.find((item) => item.id === document.builderId);
    const now = new Date().toISOString();
    const jobId = makeId("job");
    const converted = createJobFromAcceptedQuote({
      document,
      customerAddress: customer?.address,
      builderAddress: builder?.address,
      jobId,
      now,
      createId: makeId,
    });
    jobs.setItems((current) => [converted.job, ...current]);
    timeline.setItems((current) => [...converted.timelineEntries, ...current]);
    if (converted.jobDocuments.length) jobDocuments.setItems((current) => [...converted.jobDocuments, ...current]);
    documents.setItems((current) => current.map((item) => item.id === document.id ? { ...item, jobId, updatedAt: now } : item));
    setPageMessage(`${document.number} converted into a live scheduled job with ${document.items.length} pricing lines and ${converted.jobDocuments.length} attachment${converted.jobDocuments.length === 1 ? "" : "s"}.`);
  }

  function updateLine(id: string, changes: Partial<PricingLineItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
    setSuccess("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) { setError("Document title is required."); return; }
    if (!form.customerId && !form.builderId) { setError("Select a customer or builder."); return; }
    if (items.length === 0) { setError("Add at least one labour, material or other line item."); return; }
    const now = new Date().toISOString();
    const existing = documents.items.find((item) => item.id === editingId);
    const nextNumber = existing?.number ?? nextPricingDocumentNumber(documents.items, form.type);
    const payload = {
      type: form.type, customerId: form.customerId || undefined, builderId: form.builderId || undefined, jobId: form.jobId || undefined,
      title: form.title.trim(), siteAddress: form.siteAddress.trim() || undefined, validUntil: form.validUntil, vatEnabled: form.vatEnabled, vatRate: Number(form.vatRate || 0), items,
      pricingSettings: pricing,
      profitability: { directCost: profitability.directCost, overheadCost: profitability.overheadCost, costPrice: profitability.costPrice, sellingPrice: profitability.sellingPrice, grossProfit: profitability.grossProfit, expectedProfit: profitability.expectedProfit, grossMargin: profitability.grossMargin, netMargin: profitability.netMargin, calculatedAt: now },
      attachments, notes: form.notes, exclusions: form.exclusions, internalNotes: form.internalNotes, fixedPriceWorkflow, terms: form.terms, termsTemplateId: form.termsTemplateId || undefined, paymentTerms, templateType: form.templateType, updatedAt: now,
    };
    documents.setItems((current) => editingId ? current.map((document) => {
      if (document.id !== editingId) return document;
      const revision: QuoteRevision = {
        id: makeId("revision"), revisionNumber: (document.revisions?.length ?? 0) + 1, savedAt: now,
        title: document.title, siteAddress: document.siteAddress, validUntil: document.validUntil, vatEnabled: document.vatEnabled, vatRate: document.vatRate,
        items: document.items, pricingSettings: document.pricingSettings, profitability: document.profitability,
        attachments: document.attachments, notes: document.notes, exclusions: document.exclusions, internalNotes: document.internalNotes, fixedPriceWorkflow: document.fixedPriceWorkflow, terms: document.terms, termsTemplateId: document.termsTemplateId,
        paymentTerms: document.paymentTerms, templateType: document.templateType,
      };
      return { ...document, ...payload, revisions: [...(document.revisions ?? []), revision] };
    }) : [{ id: makeId("doc"), number: nextNumber, status: "Draft", ...payload, revisions: [], createdAt: now }, ...current]);
    reset();
  }

  function updateStatus(id: string, status: PricingDocumentStatus) { documents.setItems((current) => current.map((document) => document.id === id ? { ...document, status, updatedAt: new Date().toISOString() } : document)); setPageMessage(""); }
  function deleteDocument(document: PricingDocument) { if (window.confirm(`Delete ${document.number} - ${document.title}? This cannot be undone.`)) documents.remove((item) => item.id === document.id); }
  function total(document: PricingDocument) { return pricingDocumentTotal(document); }

  const editingDocument = documents.items.find((document) => document.id === editingId);

  function scrollToBuilderSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function convertEditingDocument() {
    if (!editingDocument) return;
    convertToJob(editingDocument);
  }

  return <div className={`space-y-6 ${showForm ? "pb-36 lg:pb-0" : ""}`}>
    <PageHeader eyebrow="Sales" title="Quotes & Estimates" description="Build professional pricing documents with live material costs, margins and reusable job packs." action={<Button onClick={() => showForm ? reset() : startNewDocument()}><Plus className="mr-2 size-4" />{showForm ? "Close builder" : "New document"}</Button>} />
    {pageMessage ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">{pageMessage}</div> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><FileText className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Open quote pipeline</p><p className="mt-2 text-2xl font-bold">{money.format(dashboard.pipelineValue)}</p></Card>
      <Card><TrendingUp className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Expected quote profit</p><p className="mt-2 text-2xl font-bold text-emerald-300">{money.format(dashboard.expectedProfit)}</p></Card>
      <Card><BriefcaseBusiness className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Accepted quotes</p><p className="mt-2 text-2xl font-bold">{dashboard.accepted}</p></Card>
      <Card><Clock3 className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Drafts to finish</p><p className="mt-2 text-2xl font-bold">{dashboard.drafts}</p></Card>
    </section>

    {showForm ? <Card><form id="quote-builder-form" onSubmit={submit} className="space-y-6">
      <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold">{editingId ? "Edit pricing document" : "Create pricing document"}</h2><p className="text-sm text-slate-500">Use current library prices, then tailor every line to the actual job.</p></div>{editingId ? <Button type="button" variant="secondary" onClick={reset}>Cancel edit</Button> : null}</div>
      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <div className="flex items-start gap-3"><LayoutTemplate className="mt-0.5 size-5 text-cyan-300" /><div><h2 className="font-semibold">Quote templates</h2><p className="mt-1 text-sm text-slate-400">Start with the right sections, wording and payment structure, then edit everything for the actual job.</p></div></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{quoteTemplates.map((template) => <button key={template.type} type="button" onClick={() => applyTemplate(template.type)} className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition ${form.templateType === template.type ? "border-cyan-400 bg-cyan-400/15 text-cyan-200" : "border-slate-700 bg-slate-950 text-slate-300 hover:border-cyan-500/50"}`}>{template.type}</button>)}</div>
      </div>
      <FixedPriceWorkflowCard value={fixedPriceWorkflow} onChange={setFixedPriceWorkflow} quoteSaved={Boolean(editingDocument)} convertedToJob={Boolean(editingDocument?.jobId)} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Document type</span><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as PricingDocumentType })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>Quote</option><option>Estimate</option></select></label>
        <InputField required label="Title / scope" value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); if (!savePackName) setSavePackName(e.target.value); }} />
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Customer</span><select value={form.customerId} onChange={(e) => selectCustomer(e.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">None</option>{customers.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Builder</span><select value={form.builderId} onChange={(e) => selectBuilder(e.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">None</option>{builders.items.map((item) => <option key={item.id} value={item.id}>{item.companyName}</option>)}</select></label>
        <InputField label="Site address" value={form.siteAddress} onChange={(e) => setForm({ ...form, siteAddress: e.target.value })} />
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Linked job</span><select value={form.jobId} onChange={(e) => selectJob(e.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">No linked job</option>{jobs.items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <InputField label="Valid until" type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
        <label className="flex items-center gap-3 pt-8 text-sm text-slate-300"><input type="checkbox" checked={form.vatEnabled} onChange={(e) => setForm({ ...form, vatEnabled: e.target.checked })} /> Add VAT</label>
        {form.vatEnabled ? <InputField label="VAT rate (%)" type="number" min="0" value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: e.target.value })} /> : null}
      </div>

      <div id="quote-line-composer" className="scroll-mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="flex items-start gap-3"><Paperclip className="mt-0.5 size-5 text-cyan-300" /><div><h2 className="font-semibold">Quote attachments</h2><p className="mt-1 text-sm text-slate-400">Drawings, photos and linked documents will be copied into the job folder when this quote is accepted.</p></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Upload files</span><input type="file" multiple onChange={addAttachmentFiles} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1 file:text-slate-200" /><span className="text-xs font-normal text-slate-500">Maximum 2 MB per local file.</span></label>
          <div className="grid grid-cols-2 gap-2"><InputField label="Link name" value={attachmentLink.name} onChange={(event) => setAttachmentLink({ ...attachmentLink, name: event.target.value })} /><InputField label="External URL" type="url" placeholder="https://..." value={attachmentLink.url} onChange={(event) => setAttachmentLink({ ...attachmentLink, url: event.target.value })} /></div>
          <Button type="button" className="self-end" onClick={addAttachmentLink}>Add link</Button>
        </div>
        {attachmentError ? <p className="mt-3 text-sm text-red-300">{attachmentError}</p> : null}
        {attachments.length ? <div className="mt-4 grid gap-2 md:grid-cols-2">{attachments.map((attachment) => <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{attachment.name}</p><p className="mt-1 truncate text-xs text-slate-500">{attachment.fileName || attachment.externalUrl}</p></div><div className="flex shrink-0 items-center gap-1">{attachment.dataUrl ? <a href={attachment.dataUrl} download={attachment.fileName || attachment.name} aria-label={`Download ${attachment.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Download className="size-4" /></a> : null}{attachment.externalUrl ? <a href={attachment.externalUrl} target="_blank" rel="noreferrer" aria-label={`Open ${attachment.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><ExternalLink className="size-4" /></a> : null}<button type="button" onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))} aria-label={`Remove ${attachment.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div></div>)}</div> : <p className="mt-4 text-sm text-slate-500">No attachments added.</p>}
      </div>

      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <h2 className="font-semibold">Start from a job pack</h2><p className="mt-1 text-sm text-slate-400">Linked materials automatically use the latest saved trade and selling prices.</p>
        <div className="mt-4 flex flex-col gap-3 md:flex-row"><select value={selectedJobPackId} onChange={(e) => setSelectedJobPackId(e.target.value)} className="min-h-11 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose a job pack</option>{jobPacks.items.map((pack) => <option key={pack.id} value={pack.id}>{pack.name} · {pack.category}</option>)}</select><Button type="button" onClick={addJobPack}>Add pack to quote</Button></div>
      </div>

      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
        <div className="flex items-start gap-3"><Calculator className="mt-0.5 size-5 text-violet-300" /><div><h2 className="font-semibold">Saved labour rates</h2><p className="mt-1 text-sm text-slate-400">Add labour using the true cost and charge rates saved in the Labour & Costs Centre.</p></div></div>
        {labourRates.items.filter((rate) => rate.active).length === 0 ? <p className="mt-4 text-sm text-amber-300">No active labour rates are saved yet. Add them in Labour & Costs first.</p> : <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_120px_110px_1fr_auto]">
          <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Labour rate</span><select value={labour.rateId} onChange={(event) => setLabour({ ...labour, rateId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose saved rate</option>{labourRates.items.filter((rate) => rate.active).map((rate) => <option key={rate.id} value={rate.id}>{rate.name} · {money.format(rate.chargeRate)}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Method</span><select value={labour.mode} onChange={(event) => setLabour({ ...labour, mode: event.target.value as QuoteLabourMode })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>Hours</option><option>Days</option><option>Fixed</option></select></label>
          <InputField label={labour.mode === "Fixed" ? "Qty" : labour.mode} type="number" min="0.01" step="0.25" value={labour.quantity} onChange={(event) => setLabour({ ...labour, quantity: event.target.value })} />
          {labour.mode === "Fixed" ? <div className="grid grid-cols-3 gap-2"><InputField label="Cost £" type="number" min="0" step="0.01" value={labour.fixedCost} onChange={(event) => setLabour({ ...labour, fixedCost: event.target.value })} /><InputField label="Sell £" type="number" min="0" step="0.01" value={labour.fixedPrice} onChange={(event) => setLabour({ ...labour, fixedPrice: event.target.value })} /><InputField label="Hours" type="number" min="0" step="0.25" value={labour.fixedHours} onChange={(event) => setLabour({ ...labour, fixedHours: event.target.value })} /></div> : <div className="self-end pb-3 text-sm text-slate-400">{labour.mode === "Days" ? `${labourSettings.billableHoursPerDay} hours per day` : "Uses saved hourly cost and charge"}</div>}
          <Button type="button" className="self-end" onClick={addSavedLabour}>Add labour</Button>
        </div>}
      </div>

      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <div className="flex items-start gap-3"><PackagePlus className="mt-0.5 size-5 text-emerald-300" /><div><h2 className="font-semibold">Smart material selector</h2><p className="mt-1 text-sm text-slate-400">Search by product, supplier, manufacturer or stock code. Favourites and recently updated items appear first.</p></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1.4fr_110px_auto]"><InputField label="Search materials" value={materialSearch} onChange={(e) => setMaterialSearch(e.target.value)} /><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Material</span><select value={selectedMaterialId} onChange={(e) => setSelectedMaterialId(e.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose material</option>{materialOptions.map((material) => <option key={material.id} value={material.id}>{material.favourite ? "★ " : ""}{material.name} · {material.supplier || "No supplier"} · {money.format(material.sellPrice)}</option>)}</select></label><InputField label="Qty" type="number" min="0.01" step="0.01" value={materialQuantity} onChange={(e) => setMaterialQuantity(e.target.value)} /><Button type="button" className="self-end" onClick={addMaterial}>Add material</Button></div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <h2 className="font-semibold">Pricing lines</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_130px_90px_130px_130px_auto]"><InputField label="Description" value={line.description} onChange={(e) => setLine({ ...line, description: e.target.value })} /><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Section</span><select value={line.category} onChange={(e) => setLine({ ...line, category: e.target.value as PricingLineItem["category"] })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{["Labour", "Materials", "Travel", "Parking", "Plant Hire", "Contingency", "Other"].map((category) => <option key={category}>{category}</option>)}</select></label><InputField label="Qty" type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => setLine({ ...line, quantity: e.target.value })} /><InputField label="Unit cost (£)" type="number" min="0" step="0.01" value={line.unitCost} onChange={(e) => setLine({ ...line, unitCost: e.target.value })} /><InputField label="Sell price (£)" type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => setLine({ ...line, unitPrice: e.target.value })} /><Button type="button" className="self-end" onClick={addLine}>Add</Button></div>
        <div className="mt-4 space-y-3">{items.map((item) => <div key={item.id}>
          <MobilePricingLineCard item={item} formattedTotal={money.format(item.quantity * item.unitPrice)} onChange={(changes) => updateLine(item.id, changes)} onRemove={() => setItems((current) => current.filter((lineItem) => lineItem.id !== item.id))} />
          <div className="hidden gap-3 rounded-xl bg-slate-900 p-3 md:grid md:grid-cols-[1fr_120px_90px_120px_120px_auto] md:items-end"><InputField label="Description" value={item.description} onChange={(e) => updateLine(item.id, { description: e.target.value })} /><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Section</span><select value={item.category} onChange={(e) => updateLine(item.id, { category: e.target.value as PricingLineItem["category"] })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{["Labour", "Materials", "Travel", "Parking", "Plant Hire", "Contingency", "Other"].map((category) => <option key={category}>{category}</option>)}</select></label><InputField label="Qty" type="number" min="0.01" step="0.01" value={String(item.quantity)} onChange={(e) => updateLine(item.id, { quantity: Number(e.target.value) })} /><InputField label="Unit cost (£)" type="number" min="0" step="0.01" value={String(item.unitCost ?? item.unitPrice)} onChange={(e) => updateLine(item.id, { unitCost: Number(e.target.value) })} /><InputField label="Sell price (£)" type="number" min="0" step="0.01" value={String(item.unitPrice)} onChange={(e) => updateLine(item.id, { unitPrice: Number(e.target.value) })} /><div className="flex items-center justify-between gap-3 md:block"><strong className="whitespace-nowrap">{money.format(item.quantity * item.unitPrice)}</strong><button type="button" onClick={() => setItems((current) => current.filter((lineItem) => lineItem.id !== item.id))} aria-label={`Remove ${item.description || "pricing line"}`} className="ml-3 rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div></div>
        </div>)}</div>
      </div>

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
        <h2 className="font-semibold">Quote allowances</h2><p className="mt-1 text-sm text-slate-400">Saved as your defaults and included in every live profit calculation.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InputField label="Contingency (%)" type="number" min="0" step="0.5" value={pricing.contingencyPercent} onChange={(event) => updatePricing({ contingencyPercent: Number(event.target.value || 0) })} />
          <InputField label="Material markup (%)" type="number" min="0" step="0.5" value={pricing.materialMarkupPercent} onChange={(event) => updatePricing({ materialMarkupPercent: Number(event.target.value || 0) })} />
          <div className="grid grid-cols-2 gap-2"><InputField label="Travel cost £" type="number" min="0" step="0.01" value={pricing.travelCost} onChange={(event) => updatePricing({ travelCost: Number(event.target.value || 0) })} /><InputField label="Travel sell £" type="number" min="0" step="0.01" value={pricing.travelPrice} onChange={(event) => updatePricing({ travelPrice: Number(event.target.value || 0) })} /></div>
          <div className="grid grid-cols-2 gap-2"><InputField label="Parking cost £" type="number" min="0" step="0.01" value={pricing.parkingCost} onChange={(event) => updatePricing({ parkingCost: Number(event.target.value || 0) })} /><InputField label="Parking sell £" type="number" min="0" step="0.01" value={pricing.parkingPrice} onChange={(event) => updatePricing({ parkingPrice: Number(event.target.value || 0) })} /></div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><p className="text-sm text-slate-400">Cost price</p><p className="mt-2 text-2xl font-bold">{money.format(profitability.costPrice)}</p><p className="mt-2 text-xs text-slate-500">Includes {money.format(profitability.overheadCost)} overhead allocation.</p></Card>
        <Card><p className="text-sm text-slate-400">Selling price</p><p className="mt-2 text-2xl font-bold">{money.format(profitability.sellingPrice)}</p><p className="mt-2 text-xs text-slate-500">Before VAT.</p></Card>
        <Card><p className="text-sm text-slate-400">Expected profit</p><p className={`mt-2 text-2xl font-bold ${profitability.expectedProfit >= 0 ? "text-emerald-300" : "text-red-300"}`}>{money.format(profitability.expectedProfit)}</p><p className="mt-2 text-xs text-slate-500">{profitability.labourHours.toFixed(1)} labour hours costed.</p></Card>
        <Card><p className="text-sm text-slate-400">Gross / net margin</p><p className="mt-2 text-2xl font-bold"><span className="text-cyan-300">{profitability.grossMargin.toFixed(1)}%</span> / <span className={profitability.netMargin >= labourSettings.targetNetMargin ? "text-emerald-300" : "text-amber-300"}>{profitability.netMargin.toFixed(1)}%</span></p><p className="mt-2 text-xs text-slate-500">Target net margin {labourSettings.targetNetMargin}%.</p></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4"><TextareaField label="Scope shown to customer" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /><TextareaField label="Optional exclusions shown to customer" value={form.exclusions} onChange={(e) => setForm({ ...form, exclusions: e.target.value })} /><TextareaField label="Internal notes (never shown to customer)" value={form.internalNotes} onChange={(e) => setForm({ ...form, internalNotes: e.target.value })} /></div>
        <div className="space-y-3"><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Saved terms & conditions template</span><select value={form.termsTemplateId} onChange={(event) => selectTermsTemplate(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Custom terms</option>{termsTemplates.items.filter((template) => template.active).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><TextareaField label="Terms & conditions" value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value, termsTemplateId: "" })} /></div>
      </div>
      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
        <h2 className="font-semibold">Payment terms</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Saved payment terms</span><select value={paymentTerms.templateId ?? ""} onChange={(event) => { const template = paymentTermsTemplates.items.find((item) => item.id === event.target.value); if (template) setPaymentTerms(paymentTermsFromTemplate(template)); }} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Custom payment terms</option>{paymentTermsTemplates.items.filter((item) => item.active).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Payment structure</span><select value={paymentTerms.type} onChange={(event) => setPaymentTerms({ type: event.target.value as PaymentTermsType })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>Deposit</option><option>Staged payments</option><option>Due on completion</option></select></label>
          {paymentTerms.type === "Deposit" ? <InputField label="Deposit (%)" type="number" min="0" max="100" value={paymentTerms.depositPercent ?? 25} onChange={(event) => setPaymentTerms({ ...paymentTerms, depositPercent: Number(event.target.value || 0) })} /> : null}
          {paymentTerms.type === "Staged payments" ? <div className="md:col-span-2"><TextareaField label="Payment stages" value={paymentTerms.stages ?? ""} onChange={(event) => setPaymentTerms({ ...paymentTerms, stages: event.target.value })} /></div> : null}
          <div className="md:col-span-3"><TextareaField label="Payment wording" value={paymentTerms.description ?? ""} onChange={(event) => setPaymentTerms({ ...paymentTerms, description: event.target.value })} /></div>
        </div>
      </div>
      <div id="quote-preview" className="scroll-mt-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-bold">Full quote preview</h2><p className="text-sm text-slate-500">This customer-facing layout matches the saved document and final PDF structure.</p></div><Eye className="size-5 text-cyan-300" /></div><QuotePreview number={editingId ? documents.items.find((item) => item.id === editingId)?.number ?? "DRAFT" : "DRAFT"} documentType={form.type} title={form.title} customer={customers.items.find((item) => item.id === form.customerId)} builder={builders.items.find((item) => item.id === form.builderId)} siteAddress={form.siteAddress} validUntil={form.validUntil} items={items} notes={form.notes} exclusions={form.exclusions} terms={form.terms} paymentTerms={paymentTerms} vatEnabled={form.vatEnabled} vatRate={Number(form.vatRate || 0)} subtotal={profitability.sellingPrice} businessProfile={businessProfile} vatSettings={vatSettings} branding={branding} /></div>
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"><h2 className="font-semibold">Save this version as a new job pack</h2><p className="mt-1 text-sm text-slate-400">Material links are retained so future quotes can use current library prices.</p><div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto]"><InputField label="New pack name" value={savePackName} onChange={(e) => setSavePackName(e.target.value)} /><InputField label="Category" value={savePackCategory} onChange={(e) => setSavePackCategory(e.target.value)} /><Button type="button" className="self-end" onClick={saveAsJobPack}><Save className="mr-2 size-4" />Save as job pack</Button></div></div>
      <div className="flex flex-col gap-3 border-t border-slate-800 pt-5 md:flex-row md:items-end md:justify-between"><div>{error ? <p className="text-sm text-red-300">{error}</p> : null}{success ? <p className="text-sm text-emerald-300">{success}</p> : null}</div><div className="text-right"><p className="text-sm text-slate-400">Selling price {money.format(profitability.sellingPrice)}</p>{form.vatEnabled ? <p className="text-sm text-slate-400">VAT {money.format(vat)}</p> : null}<p className="text-xl font-bold">Customer total {money.format(profitability.sellingPrice + vat)}</p><Button type="submit" className="mt-3">{editingId ? "Update document" : "Save draft"}</Button></div></div>
    </form></Card> : null}

    {showForm ? <>
      <button type="button" onClick={() => scrollToBuilderSection("quote-line-composer")} aria-label="Add pricing line" className="fixed right-4 bottom-[calc(10.5rem+env(safe-area-inset-bottom))] z-30 grid size-14 place-items-center rounded-full bg-cyan-400 text-slate-950 shadow-xl shadow-cyan-950/50 active:scale-95 lg:hidden"><Plus className="size-6" /></button>
      <MobileActionDock summary={<div><p className="truncate text-[11px] text-slate-400">Customer total</p><p className="truncate text-sm font-bold text-white">{money.format(profitability.sellingPrice + vat)}</p></div>}>
        <MobileDockAction icon={<Save className="size-5" />} label={editingId ? "Update" : "Save"} form="quote-builder-form" type="submit" />
        <MobileDockAction icon={<Eye className="size-5" />} label="Preview" onClick={() => scrollToBuilderSection("quote-preview")} />
        <MobileDockAction icon={<Sparkles className="size-5" />} label="AI" onClick={() => window.location.assign("/ai/quote-builder")} />
        <MobileDockAction icon={<BriefcaseBusiness className="size-5" />} label="Convert" disabled={!editingDocument || editingDocument.status !== "Accepted" || Boolean(editingDocument.jobId)} onClick={convertEditingDocument} />
      </MobileActionDock>
    </> : null}

    <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents" className="min-h-11 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-sm outline-none focus:border-cyan-400" /></div>
    {!documents.isReady ? <Card>Loading documents…</Card> : filtered.length === 0 ? <EntityEmptyState icon={<FileText className="size-6" />} title={documents.items.length ? "No matching documents" : "No quotes or estimates yet"} description={documents.items.length ? "Try a different search." : "Create your first pricing document and link it to a customer, builder or job."} /> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((doc) => <Card key={doc.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{doc.type} · {doc.number}</p><h2 className="mt-1 text-lg font-bold">{doc.title}</h2><p className="text-sm text-slate-500">{names.get(doc.customerId ?? "") || names.get(doc.builderId ?? "") || "Unassigned"}</p></div><div className="flex items-center"><Link href={`/quotes/${doc.id}`} aria-label={`View ${doc.number}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Eye className="size-4" /></Link><button onClick={() => startEdit(doc)} aria-label={`Edit ${doc.number}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Pencil className="size-4" /></button><button onClick={() => deleteDocument(doc)} aria-label={`Delete ${doc.number}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div></div><div className="mt-5 grid gap-3 border-t border-slate-800 pt-4"><label className="grid gap-2 text-xs text-slate-500"><span>Document status</span><select value={doc.status} onChange={(e) => updateStatus(doc.id, e.target.value as PricingDocumentStatus)} className="min-h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200">{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>{doc.jobId ? <Link href={`/jobs/${doc.jobId}`} className="flex min-h-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"><BriefcaseBusiness className="mr-2 size-4" />View linked job</Link> : doc.status === "Accepted" ? <Button type="button" onClick={() => convertToJob(doc)}><BriefcaseBusiness className="mr-2 size-4" />Create live job</Button> : null}<div className="flex items-end justify-between"><div className="text-xs text-slate-500">{doc.items.length} line{doc.items.length === 1 ? "" : "s"}</div><strong className="text-lg">{money.format(total(doc))}</strong></div></div></Card>)}</section>}
  </div>;
}
