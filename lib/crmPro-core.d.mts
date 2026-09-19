import type { LeadPriority, LeadStage, LegacyLeadStage } from "./models";

export const crmLeadStages: readonly LeadStage[];
export function normaliseLeadStage(stage: LeadStage | LegacyLeadStage | string): LeadStage;
export function moveLeadStage(stage: LeadStage | LegacyLeadStage | string, direction: -1 | 1): LeadStage;
export function ageInDays(value: string, now?: Date): number;
export function repeatCustomerScore(input: { completedJobs?: number; acceptedQuotes?: number; paidInvoices?: number; interactions?: number; reviewReceived?: boolean }): number;
export function followUpPriority(input: { ageDays?: number; estimatedValue?: number; highValueThreshold?: number; priority?: LeadPriority; overdue?: boolean; contactable?: boolean }): number;
