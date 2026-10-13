import type { BusinessExpense, Customer, Builder, Invoice, Job, PlannerEntry, PricingDocument, SiteDiaryEntry, StockItem, StockMovement, TeamMember, TimesheetEntry } from "./models";
import type { DepositRequirement, PaymentRecord, ScheduledCashFlow } from "./payments";
import { invoiceBalance, invoiceGross } from "./payments";

export type FigureBasis = "Recorded" | "Calculated" | "Inferred";
export interface FinanceEvidence { id: string; label: string; detail: string; href: string; occurredAt?: string; basis: FigureBasis; }
export interface JobProfitability { jobId: string; title: string; customerId?: string; builderId?: string; category: string; revenue: number; estimatedRevenue: number; recordedRevenue: number; quotedLabourHours: number; actualLabourHours: number; quotedLabourCost: number; actualLabourCost: number; quotedMaterialCost: number; actualMaterialCost: number; actualExpenses: number; estimatedTotalCost: number; actualTotalCost: number; estimatedGrossProfit: number; actualGrossProfit: number; estimatedMargin: number; actualMargin: number; basis: FigureBasis; completeness: number; evidence: FinanceEvidence[]; }
export interface FinanceRecommendation { id: string; title: string; action: string; reason: string; confidence: number; confidenceLabel: "Low" | "Medium" | "High"; evidence: FinanceEvidence[]; severity: "Info" | "Warning" | "Urgent"; }
export interface WorkloadForecast { period: string; demandHours: number; capacityHours: number; utilisation: number; expectedRevenue: number; status: "Overbooked" | "Underbooked" | "Balanced"; }

const asDate = (value?: string) => value ? new Date(value) : new Date(0);
const hoursBetween = (date: string, start: string, finish: string, breakMinutes = 0) => {
  if (!date || !start || !finish) return 0;
  return Math.max(0, (new Date(`${date}T${finish}`).getTime() - new Date(`${date}T${start}`).getTime()) / 3_600_000 - breakMinutes / 60);
};
const total = (document: PricingDocument | Invoice) => {
  const net = document.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return net + (document.vatEnabled ? net * document.vatRate / 100 : 0);
};
const costOfItems = (items: PricingDocument["items"], category?: string) => items.filter((item) => !category || item.category === category).reduce((sum, item) => sum + item.quantity * (item.unitCost ?? item.unitPrice), 0);
const labourHoursOfItems = (items: PricingDocument["items"]) => items.filter((item) => item.category === "Labour").reduce((sum, item) => sum + (item.labourHours ?? item.quantity), 0);
const margin = (profit: number, revenue: number) => revenue > 0 ? profit / revenue * 100 : 0;
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export function buildJobProfitability(input: { jobs: Job[]; pricing: PricingDocument[]; invoices: Invoice[]; expenses: BusinessExpense[]; diaries: SiteDiaryEntry[]; timesheets: TimesheetEntry[]; team: TeamMember[]; stockItems: StockItem[]; stockMovements: StockMovement[]; }) {
  const { jobs, pricing, invoices, expenses, diaries, timesheets, team, stockItems, stockMovements } = input;
  return jobs.map<JobProfitability>((job) => {
    const quote = pricing.find((item) => item.id === job.sourceQuoteId) || pricing.find((item) => item.jobId === job.id && item.status === "Accepted") || pricing.find((item) => item.jobId === job.id);
    const jobInvoices = invoices.filter((item) => item.jobId === job.id && item.status !== "Cancelled");
    const jobExpenses = expenses.filter((item) => item.jobId === job.id);
    const jobDiaries = diaries.filter((item) => item.jobId === job.id);
    const jobTimesheets = timesheets.filter((item) => item.jobId === job.id);
    const movements = stockMovements.filter((item) => item.jobId === job.id && item.type === "Used");
    const estimatedRevenue = quote ? total(quote) : job.value;
    const recordedRevenue = jobInvoices.reduce((sum, item) => sum + invoiceGross(item), 0);
    const revenue = recordedRevenue || estimatedRevenue;
    const quotedLabourHours = quote ? labourHoursOfItems(quote.items) : 0;
    const diaryHours = jobDiaries.reduce((sum, item) => sum + hoursBetween(item.workDate, item.startedAt, item.finishedAt, item.breakMinutes), 0);
    const actualLabourHours = jobTimesheets.length ? jobTimesheets.reduce((sum, item) => sum + hoursBetween(item.workDate, item.startedAt, item.finishedAt, item.breakMinutes), 0) : diaryHours;
    const quotedLabourCost = quote ? costOfItems(quote.items, "Labour") : 0;
    const actualLabourCost = jobTimesheets.reduce((sum, item) => {
      const member = team.find((person) => person.id === item.teamMemberId);
      return sum + hoursBetween(item.workDate, item.startedAt, item.finishedAt, item.breakMinutes) * (member?.hourlyCost ?? 0);
    }, 0);
    const quotedMaterialCost = quote ? costOfItems(quote.items, "Materials") : 0;
    const stockMaterialCost = movements.reduce((sum, movement) => {
      const stock = stockItems.find((item) => item.id === movement.stockItemId);
      return sum + Math.abs(movement.quantity) * (stock?.unitCost ?? 0);
    }, 0);
    const expenseMaterialCost = jobExpenses.filter((item) => item.category === "Materials").reduce((sum, item) => sum + item.netAmount, 0);
    const actualMaterialCost = stockMaterialCost + expenseMaterialCost;
    const actualExpenses = jobExpenses.filter((item) => item.category !== "Materials").reduce((sum, item) => sum + item.netAmount, 0);
    const estimatedTotalCost = quotedLabourCost + quotedMaterialCost + (quote?.profitability?.overheadCost ?? 0);
    const actualTotalCost = actualLabourCost + actualMaterialCost + actualExpenses;
    const estimatedGrossProfit = estimatedRevenue - estimatedTotalCost;
    const actualGrossProfit = revenue - actualTotalCost;
    const completenessSignals = [recordedRevenue > 0, actualLabourHours > 0, actualLabourCost > 0, actualMaterialCost > 0 || jobExpenses.length > 0];
    const completeness = completenessSignals.filter(Boolean).length / completenessSignals.length * 100;
    const basis: FigureBasis = recordedRevenue > 0 && completeness >= 75 ? "Recorded" : actualTotalCost > 0 ? "Calculated" : "Inferred";
    const evidence: FinanceEvidence[] = [
      ...(quote ? [{ id: quote.id, label: `${quote.type} ${quote.number}`, detail: `${quote.status} pricing document`, href: quote.type === "Quote" ? "/quotes" : "/estimates", occurredAt: quote.updatedAt, basis: "Recorded" as FigureBasis }] : []),
      ...jobInvoices.map((invoice) => ({ id: invoice.id, label: `Invoice ${invoice.number}`, detail: `${invoice.status} · £${invoiceGross(invoice).toFixed(2)}`, href: "/invoices", occurredAt: invoice.issueDate, basis: "Recorded" as FigureBasis })),
      ...jobExpenses.slice(0, 5).map((expense) => ({ id: expense.id, label: expense.supplier || "Expense", detail: `${expense.category} · £${expense.netAmount.toFixed(2)}`, href: "/expenses", occurredAt: expense.expenseDate, basis: "Recorded" as FigureBasis })),
    ];
    return { jobId: job.id, title: job.title, customerId: job.customerId, builderId: job.builderId, category: quote?.templateType || "Uncategorised", revenue, estimatedRevenue, recordedRevenue, quotedLabourHours, actualLabourHours, quotedLabourCost, actualLabourCost, quotedMaterialCost, actualMaterialCost, actualExpenses, estimatedTotalCost, actualTotalCost, estimatedGrossProfit, actualGrossProfit, estimatedMargin: margin(estimatedGrossProfit, estimatedRevenue), actualMargin: margin(actualGrossProfit, revenue), basis, completeness, evidence };
  });
}

export function confidenceScore(records: JobProfitability[], now = new Date()) {
  if (!records.length) return 0;
  const volume = clamp(records.length / 8 * 100);
  const completeness = records.reduce((sum, item) => sum + item.completeness, 0) / records.length;
  const dates = records.flatMap((item) => item.evidence.map((evidence) => asDate(evidence.occurredAt).getTime())).filter((value) => value > 0);
  const newest = dates.length ? Math.max(...dates) : 0;
  const ageDays = newest ? (now.getTime() - newest) / 86_400_000 : 365;
  const recency = clamp(100 - ageDays / 365 * 100);
  const margins = records.map((item) => item.actualMargin);
  const mean = margins.reduce((sum, value) => sum + value, 0) / margins.length;
  const deviation = Math.sqrt(margins.reduce((sum, value) => sum + (value - mean) ** 2, 0) / margins.length);
  const consistency = clamp(100 - deviation * 2);
  return Math.round(volume * 0.3 + completeness * 0.3 + recency * 0.2 + consistency * 0.2);
}

export function buildRecommendations(input: { jobs: JobProfitability[]; pricing: PricingDocument[]; invoices: Invoice[]; deposits: DepositRequirement[]; payments: PaymentRecord[]; schedules: ScheduledCashFlow[]; customers: Customer[]; builders: Builder[]; targetMargin?: number; }) {
  const target = input.targetMargin ?? 25;
  const recommendations: FinanceRecommendation[] = [];
  const lowMargin = input.jobs.filter((job) => job.actualTotalCost > 0 && job.actualMargin < target);
  if (lowMargin.length) {
    const labourOverruns = lowMargin.filter((job) => job.actualLabourHours > job.quotedLabourHours * 1.1);
    const materialOverruns = lowMargin.filter((job) => job.actualMaterialCost > job.quotedMaterialCost * 1.1);
    const source = labourOverruns.length ? labourOverruns : materialOverruns.length ? materialOverruns : lowMargin;
    const title = labourOverruns.length ? "Raise labour allowance" : materialOverruns.length ? "Increase material markup" : "Avoid underpriced work patterns";
    const action = labourOverruns.length ? "Increase labour hours or labour rate on similar future quotes." : materialOverruns.length ? "Increase material allowance or markup on similar future quotes." : "Review pricing on similar work before sending the next quote.";
    const confidence = confidenceScore(source);
    recommendations.push({ id: "margin-pattern", title, action, reason: `${source.length} comparable job${source.length === 1 ? "" : "s"} finished below the ${target}% target margin.`, confidence, confidenceLabel: confidence >= 75 ? "High" : confidence >= 45 ? "Medium" : "Low", evidence: source.flatMap((job) => job.evidence).slice(0, 8), severity: source.some((job) => job.actualMargin < 0) ? "Urgent" : "Warning" });
  }
  const overdue = input.invoices.filter((invoice) => invoice.status !== "Paid" && invoice.status !== "Cancelled" && invoiceBalance(invoice, input.payments) > 0 && invoice.dueDate < new Date().toISOString().slice(0, 10));
  if (overdue.length) recommendations.push({ id: "overdue", title: "Follow up overdue invoices", action: "Contact customers with overdue balances and record the next action.", reason: `${overdue.length} invoice${overdue.length === 1 ? " is" : "s are"} past due.`, confidence: 95, confidenceLabel: "High", evidence: overdue.slice(0, 8).map((invoice) => ({ id: invoice.id, label: `Invoice ${invoice.number}`, detail: `£${invoiceBalance(invoice, input.payments).toFixed(2)} outstanding`, href: "/invoices", occurredAt: invoice.dueDate, basis: "Recorded" })), severity: "Urgent" });
  const highValueNoDeposit = input.pricing.filter((document) => document.status === "Accepted" && total(document) >= 2500 && !input.deposits.some((deposit) => deposit.pricingDocumentId === document.id));
  if (highValueNoDeposit.length) recommendations.push({ id: "deposit", title: "Request a larger deposit", action: "Add a deposit requirement before scheduling high-value work.", reason: `${highValueNoDeposit.length} accepted high-value document${highValueNoDeposit.length === 1 ? " has" : "s have"} no deposit requirement.`, confidence: 90, confidenceLabel: "High", evidence: highValueNoDeposit.slice(0, 8).map((document) => ({ id: document.id, label: `${document.type} ${document.number}`, detail: `Accepted value £${total(document).toFixed(2)}`, href: document.type === "Quote" ? "/quotes" : "/estimates", occurredAt: document.updatedAt, basis: "Recorded" })), severity: "Warning" });
  return recommendations;
}

export function cashForecast(days: number, invoices: Invoice[], payments: PaymentRecord[], schedules: ScheduledCashFlow[], expenses: BusinessExpense[], now = new Date()) {
  const end = new Date(now); end.setDate(end.getDate() + days);
  const within = (value: string) => { const date = new Date(value); return date >= now && date <= end; };
  const invoiceIn = invoices.filter((invoice) => invoice.status !== "Cancelled" && within(invoice.dueDate)).reduce((sum, invoice) => sum + invoiceBalance(invoice, payments), 0);
  const scheduledIn = schedules.filter((item) => item.direction === "In" && within(item.dueDate)).reduce((sum, item) => sum + item.amount, 0);
  const scheduledOut = schedules.filter((item) => item.direction === "Out" && within(item.dueDate)).reduce((sum, item) => sum + item.amount, 0);
  const expenseOut = expenses.filter((item) => within(item.expenseDate)).reduce((sum, item) => sum + item.grossAmount, 0);
  return { days, cashIn: invoiceIn + scheduledIn, cashOut: scheduledOut + expenseOut, net: invoiceIn + scheduledIn - scheduledOut - expenseOut };
}

export function workloadForecast(planner: PlannerEntry[], team: TeamMember[], jobs: Job[], weeks = 12, now = new Date()): WorkloadForecast[] {
  const activeStaff = team.filter((member) => member.status === "Active");
  return Array.from({ length: weeks }, (_, index) => {
    const start = new Date(now); start.setDate(start.getDate() + index * 7 - ((start.getDay() + 6) % 7)); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    const entries = planner.filter((entry) => { const date = new Date(entry.date); return entry.status !== "Cancelled" && date >= start && date < end; });
    const demandHours = entries.reduce((sum, entry) => sum + hoursBetween(entry.date, entry.startTime, entry.endTime) * Math.max(1, entry.teamMemberIds.length), 0);
    const capacityHours = activeStaff.length * 37.5;
    const utilisation = capacityHours > 0 ? demandHours / capacityHours * 100 : demandHours > 0 ? 100 : 0;
    const expectedRevenue = entries.reduce((sum, entry) => sum + (entry.jobId ? (jobs.find((job) => job.id === entry.jobId)?.value ?? 0) : 0), 0);
    return { period: start.toISOString().slice(0, 10), demandHours, capacityHours, utilisation, expectedRevenue, status: utilisation > 100 ? "Overbooked" : utilisation < 60 ? "Underbooked" : "Balanced" };
  });
}
