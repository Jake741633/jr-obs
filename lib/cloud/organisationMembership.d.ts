import type { BusinessRole, StaffInvite, StaffProfile } from "./businessAccounts.mjs";

export interface OrganisationRecord {
  organisationId?: string;
  organisation_id?: string;
  [key: string]: unknown;
}

export interface OrganisationProfile extends StaffProfile {
  organisationId?: string;
  organisation_id?: string;
  role: BusinessRole;
  status?: "active" | "suspended";
}

export function isActiveOrganisationMember(
  profile: OrganisationProfile | null | undefined,
  organisationId: string,
): boolean;

export function assertOrganisationAccess<T extends OrganisationProfile>(
  profile: T | null | undefined,
  organisationId: string,
): T;

export function canReadOrganisationRecord(
  profile: OrganisationProfile | null | undefined,
  record: OrganisationRecord | null | undefined,
): boolean;

export function filterOrganisationRecords<T extends OrganisationRecord>(
  profile: OrganisationProfile | null | undefined,
  records?: T[] | null,
): T[];

export function findPendingInviteForAccount(
  invites: StaffInvite[] | null | undefined,
  email: string,
  organisationId: string,
): StaffInvite | null;

export function hasDuplicatePendingInvite(
  invites: StaffInvite[] | null | undefined,
  candidate?: Partial<StaffInvite> & { organisation_id?: string },
): boolean;

export function canManageOrganisationMember(
  actorProfile: OrganisationProfile | null | undefined,
  targetProfile: OrganisationProfile | null | undefined,
): boolean;
