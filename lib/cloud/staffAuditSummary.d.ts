import type { StaffAuditAction, StaffAuditEntry } from "./staffAudit.mjs";

export type StaffAuditActionCounts = Record<StaffAuditAction, number>;

export interface StaffAuditSummary {
  total: number;
  latestAt: string | null;
  byAction: StaffAuditActionCounts;
}

export const staffAuditSummaryActions: readonly StaffAuditAction[];

export function summariseStaffAudit(
  entries: readonly StaffAuditEntry[] | unknown,
  organisationId: string,
): StaffAuditSummary;

export function latestStaffAuditEntries<T extends StaffAuditEntry>(
  entries: readonly T[] | unknown,
  organisationId: string,
  limit?: number,
): T[];
