import { businessRoles, canManageStaff } from "./businessAccounts.mjs";

function cleanText(value) {
  return String(value ?? "").trim();
}

function normaliseEmail(value) {
  return cleanText(value).toLowerCase();
}

function profileOrganisationId(profile) {
  return cleanText(profile?.organisationId ?? profile?.organisation_id);
}

function profileUserId(profile) {
  return cleanText(profile?.userId ?? profile?.user_id ?? profile?.id);
}

function hasActiveMembershipState(profile) {
  const status = cleanText(profile?.status).toLowerCase();
  if (profile?.active === false || status === "suspended") return false;
  return profile?.active === true || status === "active";
}

function isValidOrganisationMember(profile, organisationId) {
  const safeOrganisationId = cleanText(organisationId);
  return Boolean(
    profile
      && safeOrganisationId
      && profileUserId(profile)
      && profileOrganisationId(profile) === safeOrganisationId
      && businessRoles.includes(profile.role),
  );
}

export function isActiveOrganisationMember(profile, organisationId) {
  return isValidOrganisationMember(profile, organisationId) && hasActiveMembershipState(profile);
}

export function assertOrganisationAccess(profile, organisationId) {
  if (!isActiveOrganisationMember(profile, organisationId)) {
    throw new Error("This account does not have active access to that business.");
  }
  return profile;
}

export function canReadOrganisationRecord(profile, record) {
  if (!record || typeof record !== "object") return false;
  return isActiveOrganisationMember(profile, record.organisationId ?? record.organisation_id);
}

export function filterOrganisationRecords(profile, records = []) {
  if (!Array.isArray(records)) return [];
  return records.filter((record) => canReadOrganisationRecord(profile, record));
}

export function findPendingInviteForAccount(invites = [], email, organisationId) {
  const safeEmail = normaliseEmail(email);
  const safeOrganisationId = cleanText(organisationId);
  if (!safeEmail || !safeOrganisationId || !Array.isArray(invites)) return null;

  return invites.find((invite) => (
    invite?.status === "pending"
      && normaliseEmail(invite.email) === safeEmail
      && cleanText(invite.organisationId ?? invite.organisation_id) === safeOrganisationId
  )) ?? null;
}

export function hasDuplicatePendingInvite(invites = [], candidate = {}) {
  return Boolean(findPendingInviteForAccount(
    invites,
    candidate.email,
    candidate.organisationId ?? candidate.organisation_id,
  ));
}

export function canManageOrganisationMember(actorProfile, targetProfile) {
  if (!actorProfile || !targetProfile) return false;
  const actorOrganisationId = profileOrganisationId(actorProfile);

  if (!actorOrganisationId || !isValidOrganisationMember(targetProfile, actorOrganisationId)) return false;
  if (!isActiveOrganisationMember(actorProfile, actorOrganisationId)) return false;
  if (!canManageStaff(actorProfile.role)) return false;
  if (targetProfile.role === "owner") return false;
  if (actorProfile.role === "admin" && targetProfile.role === "admin") return false;
  return true;
}
