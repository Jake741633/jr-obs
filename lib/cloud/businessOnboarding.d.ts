import type {
  BusinessAccount,
  StaffInvite,
  StaffProfile,
} from "./businessAccounts.mjs";

export interface BusinessOnboardingInput {
  organisationId?: string;
  businessName?: string;
  ownerUserId?: string;
  ownerEmail?: string;
  now?: string;
}

export interface BusinessOwnerProfile extends StaffProfile {
  id: string;
  userId: string;
  email: string;
  organisationId: string;
  role: "owner";
  status: "active";
  createdAt: string;
  updatedAt: string;
}

export interface BusinessOnboardingResult {
  organisation: BusinessAccount;
  ownerProfile: BusinessOwnerProfile;
}

export interface PendingStaffInvite extends StaffInvite {
  status: "pending";
}

export interface LinkedStaffProfile extends StaffProfile {
  id: string;
  userId: string;
  email: string;
  organisationId: string;
  status: "active";
  createdAt: string;
  updatedAt: string;
}

export interface LinkedStaffInviteResult {
  invite: StaffInvite & {
    status: "accepted";
    userId: string;
    acceptedAt: string;
  };
  profile: LinkedStaffProfile;
}

export interface ExistingOrganisationProfile {
  organisationId?: string | null;
  organisation_id?: string | null;
  [key: string]: unknown;
}

export function buildBusinessOnboarding(input?: BusinessOnboardingInput): BusinessOnboardingResult;
export function canCreateBusinessAccount(
  existingProfile?: ExistingOrganisationProfile | null,
): boolean;
export function assertBusinessOnboardingAvailable(
  existingProfile?: ExistingOrganisationProfile | null,
): true;
export function linkAcceptedStaffInvite(
  invite: PendingStaffInvite,
  userId: string,
  email: string,
  now?: string,
): LinkedStaffInviteResult;
