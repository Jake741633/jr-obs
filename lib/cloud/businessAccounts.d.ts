export type BusinessRole = "owner" | "admin" | "office" | "electrician" | "customer";
export type StaffAssignableRole = Exclude<BusinessRole, "owner">;
export type BusinessAccountStatus = "active" | "suspended";
export type StaffInviteStatus = "pending" | "accepted" | "revoked";

export interface BusinessAccount {
  id: string;
  name: string;
  ownerUserId: string;
  status: BusinessAccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StaffInvite {
  organisationId: string;
  email: string;
  role: StaffAssignableRole;
  status: StaffInviteStatus;
  invitedBy: string;
  invitedAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  userId?: string;
}

export interface StaffProfile {
  id?: string;
  organisationId?: string;
  userId?: string;
  email?: string;
  role: BusinessRole;
  status?: "active" | "suspended";
  suspendedAt?: string;
  [key: string]: unknown;
}

export const businessRoles: readonly BusinessRole[];
export const staffAssignableRoles: readonly StaffAssignableRole[];

export function normaliseBusinessAccount(input?: Partial<BusinessAccount>): BusinessAccount;
export function canManageStaff(role: BusinessRole | string | null | undefined): boolean;
export function canAssignRole(
  actorRole: BusinessRole | string | null | undefined,
  targetRole: BusinessRole | string | null | undefined,
): boolean;
export function buildStaffInvite(input?: {
  organisationId?: string;
  email?: string;
  role?: StaffAssignableRole;
  invitedBy?: string;
  now?: string;
}): StaffInvite;
export function acceptStaffInvite(invite: StaffInvite, userId: string, now?: string): StaffInvite;
export function revokeStaffAccess<T extends StaffProfile>(profile: T, actorRole: BusinessRole, now?: string): T & {
  status: "suspended";
  suspendedAt: string;
};
