"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Brain,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileText,
  Percent,
  PoundSterling,
  ReceiptText,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { AiActionCentre } from "../../components/ai/AiActionCentre";
import { AiToolNav } from "../../components/ai/AiToolNav";
import { SiteDiaryAttentionPanel } from "../../components/ai/SiteDiaryAttentionPanel";
import { SmartRecommendations } from "../../components/ai/SmartRecommendations";
import { TodaysAssistant } from "../../components/ai/TodaysAssistant";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import {
  buildBusinessCoach,
  buildSmartRecommendations,
  buildTodayAssistant,
} from "../../lib/aiCommandCentre";
import {
  businessStorageKeys,
  defaultBankDetails,
  defaultPaymentTermsTemplates,
} from "../../lib/businessSettings";
import { useJobVariationsCollection } from "../../lib/cloud/coreBusinessCollections";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { isAcceptedVariationStatus, transitionVariation, variationTimelineEntry } from "../../lib/jobManagement-core.mjs";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import {
  createInvoiceFromCompletedJob,
  createJobFromAcceptedQuote,
  createPurchaseListFromPricingDocument,
  pricingDocumentTotal,
} from "../../lib/workflow";
import { useAiLearningMemory } from "../../lib/useAiLearningMemory";
import { materialOrderLists, operationalHealthScore, outstandingCertificateJobs } from "../../lib/dashboardIntelligence";
import type {
  AiReminder,
  AiReminderPriority,
  Builder,
  BusinessBankDetails,
  Customer,
  CustomerInteraction,
  CustomerProfile,
  ElectricalCertificate,
  Invoice,
  Job,
  JobDocument,
  JobTimelineEntry,
  LabourCostSettings,
  Material,
  PaymentTermsTemplate,
  PlannerEntry,
  PricingDocument,
  PurchaseList,
  SiteSurvey,
} from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const defaultLabourSettings: LabourCostSettings = {
  id: "labour-cost-settings",
  workingDaysPerYear: 220,
  billableHoursPerDay: 7.5,
  targetNetMargin: 25,
  contingencyPercent: 10,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

export default function AiPage() {
  const { identity } = useCloudIdentity();
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const builders = useLocalStorageCollection<Builder>("jr-os-builders");
  const pricing = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");
  const planner = useLocalStorageCollection<PlannerEntry>("jr-os-planner");
  const profiles = useLocalStorageCollection<CustomerProfile>("jr-os-customer-profiles");
  const interactions = useLocalStorageCollection<CustomerInteraction>("jr-os-customer-interactions");
  const reminders = useLocalStorageCollection<AiReminder>("jr-os-ai-reminders");
  const certificates = useLocalStorageCollection<ElectricalCertificate>("jr-os-certificates");
  const surveys = useLocalStorageCollection<SiteSurvey>("jr-os-surveys");
  const timeline = useLocalStorageCollection<JobTimelineEntry>("jr-os-job-timeline");
  const jobDocuments = useLocalStorageCollection<JobDocument>("jr-os-job-documents");
  const materials = useLocalStorageCollection<Material>("jr-os-materials");
  const purchaseLists = useLocalStorageCollection<PurchaseList>("jr-os-purchase-lists");
  const variations = useJobVariationsCollection();
  const labourSettingsStore = useLocalStorageCollection<LabourCostSettings>("jr-os-labour-cost-settings", [defaultLabourSettings]);
  const bankStore = useLocalStorageCollection<BusinessBankDetails>(businessStorageKeys.bank, [defaultBankDetails]);
  const paymentTermsStore = useLocalStorageCollection<PaymentTermsTemplate>(businessStorageKeys.paymentTerms, defaultPaymentTermsTemplates);
  const [message, setMessage] = useState("");

  const labourSettings = labourSettingsStore.items[0] ?? defaultLabourSettings;
  const learning = useAiLearningMemory({
    jobs: jobs.items,
    documents: pricing.items,
    invoices: invoices.items,
    customers: customers.items,
    builders: builders.items,
    profiles: profiles.items,
    interactions: interactions.items,
    materials: materials.items,
  }, labourSettings);
  const ready = [
    jobs, customers, builders, pricing, invoices, planner, profiles, interactions, reminders, certificates,
    surveys, timeline, jobDocuments, materials, purchaseLists, variations, labourSettingsStore, bankStore, paymentTermsStore,
  ].every((store) => store.isReady) && learning.isReady;

  const recommendations = useMemo(
    () => buildSmartRecommendations({
      jobs: jobs.items,
      documents: pricing.items,
      invoices: invoices.items,
      certificates: certificates.items,
      reminders: reminders.items,
      labourSettings,
    }),
    [certificates.items, invoices.items, jobs.items, labourSettings, pricing.items, reminders.items],
  );

  const today = useMemo(
    () => buildTodayAssistant({
      jobs: jobs.items,
      planner: planner.items,
      documents: pricing.items,
      invoices: invoices.items,
      profiles: profiles.items,
      reminders: reminders.items,
      recommendations,
    }),
    [invoices.items, jobs.items, planner.items, pricing.items, profiles.items, recommendations, reminders.items],
  );

  const coach = useMemo(
    () => buildBusinessCoach({
      documents: pricing.items,
      invoices: invoices.items,
      jobs: jobs.items,
      certificates: certificates.items,
      reminders: reminders.items,
      labourSettings,
    }),
    [certificates.items, invoices.items, jobs.items, labourSettings, pricing.items, reminders.items],
  );

  const operations = useMemo(() => {
    const activeJobs = jobs.items.filter((job) => !["Complete", "On hold"].includes(job.status));
    const openQuotes = pricing.items.filter((document) => document.type === "Quote" && ["Draft", "Sent"].includes(document.status));
    const quotePipeline = openQuotes.reduce((sum, document) => sum + pricingDocumentTotal(document), 0);
    const overdueValue = today.overdueInvoices.reduce((sum, invoice) => {
      const net = invoice.items.reduce((lineSum, item) => lineSum + item.quantity * item.unitPrice, 0);
      const total = net + (invoice.vatEnabled ? net * invoice.vatRate / 100 : 0);
      return sum + Math.max(0, total - invoice.amountPaid);
    }, 0);
    const incompleteSurveys = surveys.items.filter((survey) => survey.status !== "Complete");
    const draftCertificates = certificates.items.filter((certificate) => ["Draft", "In progress"].includes(certificate.status));
    const warnings = recommendations.filter((item) => item.severity === "Urgent").length * 10
      + recommendations.filter((item) => item.severity === "Warning").length * 5
      + incompleteSurveys.length * 2
      + draftCertificates.length * 2;
    return {
      activeJobs,
      openQuotes,
      quotePipeline,
      overdueValue,
      incompleteSurveys,
      readinessScore: Math.max(0, Math.min(100, 100 - warnings)),
    };
  }, [certificates.items, jobs.items, pricing.items, recommendations, surveys.items, today.overdueInvoices]);

  const acceptedQuotes = pricing.items.filter((document) => document.type === "Quote" && document.status === "Accepted" && !document.jobId);
  const completedJobs = jobs.items.filter((job) =>
    job.status === "Complete" && !invoices.items.some((invoice) => invoice.jobId === job.id && invoice.status !== "Cancelled"),
  );
  const orderDocuments = pricing.items.filter((document) =>
    (document.status === "Accepted" || Boolean(document.jobId))
    && document.items.some((item) => item.category === "Materials")
    && !purchaseLists.items.some((list) => list.pricingDocumentId === document.id),
  );
  const outstandingCertificates = outstandingCertificateJobs(jobs.items, certificates.items);
  const pendingMaterialLists = materialOrderLists(purchaseLists.items);
  const operationalHealth = operationalHealthScore({
    overdueInvoices: today.overdueInvoices.length,
    quoteFollowUps: today.quoteFollowUps.length,
    outstandingCertificates: outstandingCertificates.length,
    materialItemsNeeded: pendingMaterialLists.reduce((sum, list) => sum + list.items.filter((item) => item.status === "Needed").length, 0),
    urgentRecommendations: recommendations.filter((item) => item.severity === "Urgent" || item.severity === "Warning").length,
  });
  const todaySnapshot = {
    ...today,
    todaysSurveys: today.todaysPlanner.filter((entry) => entry.type === "Survey"),
    materialsToOrder: pendingMaterialLists,
    certificatesOutstanding: outstandingCertificates,
    businessHealthScore: operationalHealth.score,
    businessHealthLabel: operationalHealth.label,
  };

  function addReminder(input: {
    title: string;
    dueDate: string;
    dueTime: string;
    priority: AiReminderPriority;
    customerId?: string;
    notes: string;
  }) {
    const now = new Date().toISOString();
    reminders.setItems((current) => [{
      id: makeId("ai-reminder"),
      ...input,
      completed: false,
      createdAt: now,
      updatedAt: now,
    }, ...current]);
    setMessage(`Reminder saved for ${new Date(`${input.dueDate}T12:00:00`).toLocaleDateString("en-GB")}.`);
  }

  function toggleReminder(id: string) {
    reminders.setItems((current) => current.map((reminder) =>
      reminder.id === id ? { ...reminder, completed: !reminder.completed, updatedAt: new Date().toISOString() } : reminder,
    ));
    setMessage("Reminder updated.");
  }

  function convertQuote(quoteId: string) {
    const document = pricing.items.find((item) => item.id === quoteId);
    if (!document || document.status !== "Accepted" || document.jobId) {
      setMessage("That quote is no longer ready to convert.");
      return;
    }
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
    pricing.setItems((current) => current.map((item) => item.id === document.id ? { ...item, jobId, updatedAt: now } : item));
    setMessage(`${document.number} converted to ${converted.job.title}. Customer, address, scope, attachments and pricing remain linked.`);
  }

  function generateInvoice(jobId: string) {
    const job = jobs.items.find((item) => item.id === jobId);
    if (!job || job.status !== "Complete" || invoices.items.some((invoice) => invoice.jobId === jobId && invoice.status !== "Cancelled")) {
      setMessage("That job is no longer ready for a new final invoice.");
      return;
    }
    const quote = pricing.items.find((document) => document.id === job.sourceQuoteId)
      ?? pricing.items.find((document) => document.jobId === job.id);
    const defaultPaymentTerms = paymentTermsStore.items.find((template) => template.active && template.isDefault)
      ?? paymentTermsStore.items.find((template) => template.active);
    const now = new Date().toISOString();
    const linkedVariations = variations.items.filter((variation) => variation.jobId === job.id);
    const generated = createInvoiceFromCompletedJob({
      job,
      quote,
      variations: linkedVariations,
      invoices: invoices.items,
      invoiceId: makeId("invoice"),
      now,
      createId: makeId,
      bankDetails: bankStore.items[0] ?? defaultBankDetails,
      defaultPaymentTerms,
    });
    invoices.setItems((current) => [generated.invoice, ...current]);
    const includedVariationIds = new Set(generated.invoice.variationIds ?? []);
    const includedVariations = linkedVariations.filter((variation) => includedVariationIds.has(variation.id) && isAcceptedVariationStatus(variation.status));
    variations.setItems((current) => current.map((variation) => includedVariationIds.has(variation.id)
      ? transitionVariation({ variation, nextStatus: "Invoiced", now, auditId: makeId("variation-audit"), completedBy: "JR OS", invoiceId: generated.invoice.id, detail: `${variation.number} included on ${generated.invoice.number}.` })
      : variation));
    timeline.setItems((current) => [
      generated.timelineEntry,
      ...includedVariations.map((variation) => variationTimelineEntry({ variation, fromStatus: variation.status, toStatus: "Invoiced", timelineId: makeId("timeline"), completedBy: "JR OS", now })),
      ...current,
    ]);
    setMessage(`${generated.invoice.number} created as a linked draft invoice for ${job.title}.`);
  }

  function orderMaterials(documentId: string) {
    const document = pricing.items.find((item) => item.id === documentId);
    if (!document || purchaseLists.items.some((list) => list.pricingDocumentId === document.id)) {
      setMessage("A purchase list already exists or the source document is unavailable.");
      return;
    }
    const now = new Date().toISOString();
    const list = createPurchaseListFromPricingDocument({
      document,
      materials: materials.items,
      purchaseLists: purchaseLists.items,
      purchaseListId: makeId("purchase"),
      now,
      createId: makeId,
    });
    if (!list) {
      setMessage("No priced material lines were found on that record.");
      return;
    }
    purchaseLists.setItems((current) => [list, ...current]);
    if (list.jobId) {
      timeline.setItems((current) => [{
        id: makeId("timeline"),
        jobId: list.jobId!,
        milestone: "Materials ordered",
        note: `${list.number} prepared in the AI Action Centre. Supplier orders still require confirmation.`,
        completedBy: "JR OS",
        completedAt: now,
        createdAt: now,
      }, ...current]);
    }
    setMessage(`${list.number} created with ${list.items.length} material line${list.items.length === 1 ? "" : "s"}. Check live prices before ordering.`);
  }

  function contactCustomer(customerId: string) {
    const customer = customers.items.find((item) => item.id === customerId);
    if (!customer) return;
    const preferredContact = profiles.items.find((profile) => profile.customerId === customerId)?.preferredContact ?? "Phone";
    const interactionType: CustomerInteraction["type"] = preferredContact === "Phone" ? "Call" : preferredContact;
    const now = new Date().toISOString();
    interactions.setItems((current) => [{
      id: makeId("interaction"),
      customerId,
      type: interactionType,
      summary: `Contact action opened for ${customer.name} from the AI Action Centre.`,
      outcome: "Outcome not yet recorded",
      completedBy: identity?.email ?? "JR OS user",
      interactionAt: now,
      createdAt: now,
    }, ...current]);
    setMessage(`${preferredContact} opened for ${customer.name}; the contact action was added to CRM.`);
  }

  if (!ready) return <Card>Preparing the AI Command Centre…</Card>;

  const scoreTone = operations.readinessScore >= 80
    ? "text-emerald-300"
    : operations.readinessScore >= 60
      ? "text-amber-300"
      : "text-red-300";

  return <main className="space-y-8">
    <PageHeader eyebrow="JR AI" title="AI Command Centre" description="Today’s jobs, overdue invoices, quote follow-ups, smart recommendations and safe operational actions." />
    {message ? <Card className="border-cyan-500/30 bg-cyan-500/5 text-sm text-cyan-100">{message}</Card> : null}
    <AiToolNav />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card><BriefcaseBusiness className="size-6 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Active jobs</p><p className="mt-1 text-3xl font-black">{operations.activeJobs.length}</p></Card>
      <Card><FileText className="size-6 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Open quote pipeline</p><p className="mt-1 text-3xl font-black">{money.format(operations.quotePipeline)}</p></Card>
      <Card><PoundSterling className="size-6 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Overdue cash</p><p className="mt-1 text-3xl font-black">{money.format(operations.overdueValue)}</p></Card>
      <Card><CheckCircle2 className={`size-6 ${scoreTone}`} /><p className="mt-3 text-sm text-slate-400">Operational readiness</p><p className={`mt-1 text-3xl font-black ${scoreTone}`}>{operations.readinessScore}%</p></Card>
    </div>
    <TodaysAssistant snapshot={todaySnapshot} customers={customers.items} onAddReminder={addReminder} onToggleReminder={toggleReminder} />
    <SiteDiaryAttentionPanel />
    <AiActionCentre
      acceptedQuotes={acceptedQuotes}
      completedJobs={completedJobs}
      orderDocuments={orderDocuments}
      customers={customers.items}
      profiles={profiles.items}
      onConvertQuote={convertQuote}
      onGenerateInvoice={generateInvoice}
      onOrderMaterials={orderMaterials}
      onContactCustomer={contactCustomer}
    />
    <SmartRecommendations recommendations={recommendations} />
    <div className="grid gap-4 lg:grid-cols-3">
      <Card><Brain className="size-6 text-fuchsia-300" /><h2 className="mt-3 text-xl font-bold">AI learning memory</h2><p className="mt-2 text-sm text-slate-400">{learning.memory.completedJobs} completed jobs, {learning.memory.acceptedQuotes} accepted quotes and {learning.memory.paidInvoices} paid invoices currently influence recommendations.</p><Link href="/ai/learning" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300">Review memory <ArrowRight className="size-4" /></Link></Card>
      <Card><TrendingUp className="size-6 text-emerald-300" /><h2 className="mt-3 text-xl font-bold">Business coach</h2><p className="mt-2 text-sm text-slate-400">{coach[0]?.detail ?? "More completed work will improve coaching recommendations."}</p><Link href="/ai/business-coach" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300">Open coach <ArrowRight className="size-4" /></Link></Card>
      <Card><Database className="size-6 text-cyan-300" /><h2 className="mt-3 text-xl font-bold">Evidence and confidence</h2><p className="mt-2 text-sm text-slate-400">Recommendations are linked to actual records and scored against labour, material and pricing evidence.</p><Link href="/ai/learning" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300">Inspect evidence <ArrowRight className="size-4" /></Link></Card>
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <Link href="/ai/quote-builder"><Card className="h-full"><Sparkles className="size-6 text-cyan-300" /><h2 className="mt-3 text-xl font-bold">Build quote from notes</h2><p className="mt-2 text-sm text-slate-400">Turn a typed or voice transcript into an editable pricing draft.</p></Card></Link>
      <Link href="/ai/quote-review"><Card className="h-full"><Percent className="size-6 text-amber-300" /><h2 className="mt-3 text-xl font-bold">Review quote margin</h2><p className="mt-2 text-sm text-slate-400">Check risk, exclusions and expected profit before sending.</p></Card></Link>
      <Link href="/ai/job-review"><Card className="h-full"><ClipboardCheck className="size-6 text-emerald-300" /><h2 className="mt-3 text-xl font-bold">Review live job</h2><p className="mt-2 text-sm text-slate-400">Check progress, variations, materials and completion risks.</p></Card></Link>
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <Card><ReceiptText className="size-6 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Quotes ready to become jobs</p><p className="mt-1 text-3xl font-black">{acceptedQuotes.length}</p></Card>
      <Card><CheckCircle2 className="size-6 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Completed jobs awaiting invoice</p><p className="mt-1 text-3xl font-black">{completedJobs.length}</p></Card>
      <Card><Database className="size-6 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Material orders ready</p><p className="mt-1 text-3xl font-black">{orderDocuments.length}</p></Card>
    </div>
  </main>;
}
