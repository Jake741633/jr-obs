import type { StaffAuditEntry } from "./staffAudit.mjs";
import type { StaffProfile } from "./businessAccounts.mjs";

export const auditViewerRoles: readonly ["owner", "admin"];

export function canViewStaffAudit(
  profile: StaffProfile | null | undefined,
  organisationId: string,
): boolean;

export function assertStaffAuditAccess(
  profile: StaffProfile | null | undefined,
  organisationId: string,
): true;

export function staffAuditEntriesForViewer<T extends StaffAuditEntry>(
  entries: readonly T[] | null | undefined,
  profile: StaffProfile | null | undefined,
  organisationId: string,
): T[];
