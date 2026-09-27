import type { BusinessRole, StaffInvite, StaffProfile } from "./businessAccounts.mjs";

export type StaffAuditAction =
  | "invited"
  | "invite-revoked"
  | "invite-accepted"
  | "role-changed"
  | "suspended"
  | "reactivated";

export interface StaffAuditEntry {
  id: string;
  organisationId: string;
  action: StaffAuditAction;
  actorUserId: string;
  targetUserId: string | null;
  targetEmail: string | null;
  occurredAt: string;
  previousRole?: BusinessRole;
  nextRole?: BusinessRole;
  reason?: string;
}

export interface BuildStaffAuditEntryInput {
  id: string;
  action: StaffAuditAction;
  actorProfile: StaffProfile;
  targetProfile?: StaffProfile;
  invite?: StaffInvite;
  previousRole?: BusinessRole;
  nextRole?: BusinessRole;
  reason?: string;
  now?: string;
}

export function buildStaffAuditEntry(input: BuildStaffAuditEntryInput): StaffAuditEntry;

export function filterStaffAuditForOrganisation<T extends StaffAuditEntry>(
  entries: readonly T[],
  organisationId: string,
): T[];

export const staffAuditActions: readonly StaffAuditAction[];
