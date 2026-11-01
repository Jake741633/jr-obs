import type { BusinessRole, StaffAssignableRole, StaffInvite, StaffProfile } from "./businessAccounts.mjs";

export type TimestampedStaffProfile<T extends StaffProfile = StaffProfile> = T & {
  updatedAt: string;
};

export type SuspendedStaffProfile<T extends StaffProfile = StaffProfile> = T & {
  active: false;
  status: "suspended";
  suspendedAt: string;
  updatedAt: string;
};

export type ActiveStaffProfile<T extends StaffProfile = StaffProfile> = Omit<T, "suspendedAt" | "suspended_at"> & {
  active: true;
  status: "active";
  updatedAt: string;
};

export type RevokedStaffInvite<T extends StaffInvite = StaffInvite> = T & {
  status: "revoked";
  revokedAt: string;
  updatedAt: string;
};

export function changeStaffRole<T extends StaffProfile>(
  actorProfile: StaffProfile,
  targetProfile: T,
  nextRole: StaffAssignableRole,
  now?: string,
): TimestampedStaffProfile<T> & { role: BusinessRole };

export function suspendStaffMember<T extends StaffProfile>(
  actorProfile: StaffProfile,
  targetProfile: T,
  now?: string,
): SuspendedStaffProfile<T>;

export function reactivateStaffMember<T extends StaffProfile>(
  actorProfile: StaffProfile,
  targetProfile: T,
  now?: string,
): ActiveStaffProfile<T>;

export function revokePendingStaffInvite<T extends StaffInvite>(
  actorProfile: StaffProfile,
  invite: T,
  now?: string,
): RevokedStaffInvite<T>;
