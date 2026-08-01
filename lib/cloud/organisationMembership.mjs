import { businessRoles, canManageStaff } from "./businessAccounts.mjs";

function cleanText(value) {
  return String(value ?? "").trim();
}

function normaliseEmail(value) {
  return cleanText(value).toLowerCase();
}

export function isActiveOrganisationMember(profile, organisationId) {
  const safeOrganisationId = cleanText(organisationId);
  return Boolean(
    profile
      && safeOrganisationId
      && cleanText(profile.organisationId ?? profile.organisation_id) === safeOrganisationId
      && businessRoles.includes(profile.role)
      && profile.status !== "suspended",
  );
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
  const actorOrganisationId = cleanText(actorProfile.organisationId ?? actorProfile.organisation_id);
  const targetOrganisationId = cleanText(targetProfile.organisationId ?? targetProfile.organisation_id);

  if (!actorOrganisationId || actorOrganisationId !== targetOrganisationId) return false;
  if (!isActiveOrganisationMember(actorProfile, actorOrganisationId)) return false;
  if (!canManageStaff(actorProfile.role)) return false;
  if (targetProfile.role === "owner") return false;
  if (actorProfile.role === "admin" && targetProfile.role === "admin") return false;
  return true;
}
