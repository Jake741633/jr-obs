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
      completedBy: "Jake",
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

  return (
    <main className="space-y-8">
      <PageHeader
        eyebrow="JR AI"
        title="AI Command Centre"
        description="Turn the records already saved in JR OS into today’s priorities, draft quotes, material suggestions, safer pricing decisions and one-click workflow actions."
        action={<Link href="/business" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800">Business Management <ArrowRight className="size-4" /></Link>}
      />

      {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

      <AiToolNav />

      <Link href="/ai/learning">
        <Card className="border-cyan-400/20 transition hover:border-cyan-400/40">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><Database className="size-5" /></span>
              <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">AI Learning Engine</p><h2 className="mt-1 text-lg font-bold">Memory confidence {learning.memory.confidence.overall}% · {learning.memory.confidence.level}</h2><p className="mt-1 text-sm text-slate-500">{learning.memory.completedJobs} completed jobs, {learning.memory.acceptedQuotes} accepted quotes, {learning.memory.paidInvoices} paid invoices and {learning.memory.materialSignals} material signals learned.</p></div>
            </div>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300">Open learning evidence <ArrowRight className="size-4" /></span>
          </div>
        </Card>
      </Link>

      <section className="grid gap-4 lg:grid-cols-[0.8fr_3.2fr]">
        <Card className="border-cyan-400/30">
          <div className="flex items-center justify-between"><Brain className="size-9 text-cyan-300" /><Sparkles className="size-5 text-cyan-400" /></div>
          <p className="mt-5 text-sm text-slate-400">Operational readiness</p>
          <p className={`mt-2 text-5xl font-black ${scoreTone}`}>{operations.readinessScore}</p>
          <p className="mt-1 text-sm text-slate-500">out of 100</p>
          <p className="mt-4 text-sm text-slate-400">A workflow guide based on overdue debt, incomplete records and open actions—not financial or technical approval.</p>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card><BriefcaseBusiness className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Live workload</p><p className="mt-2 text-2xl font-bold">{operations.activeJobs.length}</p><p className="mt-1 text-xs text-slate-500">{today.todaysJobs.length} starting today</p></Card>
          <Card><FileText className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Quote pipeline</p><p className="mt-2 text-2xl font-bold">{money.format(operations.quotePipeline)}</p><p className="mt-1 text-xs text-slate-500">{operations.openQuotes.length} open quotes</p></Card>
          <Card><ReceiptText className="size-5 text-red-300" /><p className="mt-3 text-sm text-slate-400">Overdue</p><p className="mt-2 text-2xl font-bold">{money.format(operations.overdueValue)}</p><p className="mt-1 text-xs text-slate-500">{today.overdueInvoices.length} invoices</p></Card>
          <Card><ClipboardCheck className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Survey queue</p><p className="mt-2 text-2xl font-bold">{operations.incompleteSurveys.length}</p><p className="mt-1 text-xs text-slate-500">draft or in progress</p></Card>
        </div>
      </section>

      <TodaysAssistant snapshot={todaySnapshot} customers={customers.items} onAddReminder={addReminder} onToggleReminder={toggleReminder} />

      <SiteDiaryAttentionPanel />

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <SmartRecommendations recommendations={recommendations} />
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300">Business Coach</p><h2 className="mt-1 text-xl font-bold">Current business signals</h2></div>
            <Link href="/ai/business-coach" className="text-cyan-300"><ArrowRight className="size-5" /></Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-950 p-4"><TrendingUp className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Monthly revenue</p><p className="mt-1 text-xl font-bold">{money.format(coach.monthlyRevenue)}</p></div>
            <div className="rounded-xl bg-slate-950 p-4"><Percent className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Quote conversion</p><p className="mt-1 text-xl font-bold">{coach.quoteConversion.toFixed(1)}%</p></div>
            <div className="rounded-xl bg-slate-950 p-4"><PoundSterling className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Unpaid value</p><p className="mt-1 text-xl font-bold">{money.format(coach.unpaidInvoiceValue)}</p></div>
            <div className="rounded-xl bg-slate-950 p-4"><Brain className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Average net margin</p><p className={`mt-1 text-xl font-bold ${coach.averageNetMargin >= labourSettings.targetNetMargin ? "text-emerald-300" : "text-amber-300"}`}>{coach.averageNetMargin.toFixed(1)}%</p></div>
          </div>
        </Card>
      </section>

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

      <Card>
        <div className="grid gap-4 md:grid-cols-3">
          <div><CheckCircle2 className="size-5 text-emerald-300" /><h2 className="mt-3 font-semibold">Local-first intelligence</h2><p className="mt-1 text-sm text-slate-500">Recommendations update when JR OS records change and use the existing backup-compatible storage pattern.</p></div>
          <div><CheckCircle2 className="size-5 text-emerald-300" /><h2 className="mt-3 font-semibold">Human approval stays required</h2><p className="mt-1 text-sm text-slate-500">Draft pricing, quantities, certification and supplier orders must be reviewed before use.</p></div>
          <div><CheckCircle2 className="size-5 text-emerald-300" /><h2 className="mt-3 font-semibold">Existing AI tools preserved</h2><div className="mt-2 flex flex-wrap gap-2 text-sm"><Link className="text-cyan-300" href="/ai/daily-briefing">Daily briefing</Link><Link className="text-cyan-300" href="/ai/quote-review">Quote review</Link><Link className="text-cyan-300" href="/ai/job-review">Job review</Link></div></div>
        </div>
      </Card>
    </main>
  );
}
