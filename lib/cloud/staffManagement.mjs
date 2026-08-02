import { canAssignRole, canManageStaff, staffAssignableRoles } from "./businessAccounts.mjs";
import { canManageOrganisationMember, isActiveOrganisationMember } from "./organisationMembership.mjs";

function cleanText(value) {
  return String(value ?? "").trim();
}

function organisationIdOf(profile) {
  return cleanText(profile?.organisationId ?? profile?.organisation_id);
}

function assertManager(actorProfile) {
  const organisationId = organisationIdOf(actorProfile);
  if (!organisationId || !isActiveOrganisationMember(actorProfile, organisationId) || !canManageStaff(actorProfile?.role)) {
    throw new Error("Only an active owner or admin can manage staff.");
  }
  return organisationId;
}

export function changeStaffRole(actorProfile, targetProfile, nextRole, now = new Date().toISOString()) {
  const organisationId = assertManager(actorProfile);
  if (!canManageOrganisationMember(actorProfile, targetProfile)) {
    throw new Error("This staff member cannot be managed by the signed-in account.");
  }
  if (!staffAssignableRoles.includes(nextRole) || !canAssignRole(actorProfile.role, nextRole)) {
    throw new Error("That role cannot be assigned by the signed-in account.");
  }
  if (organisationIdOf(targetProfile) !== organisationId) {
    throw new Error("Staff roles can only be changed inside the same organisation.");
  }

  return {
    ...targetProfile,
    role: nextRole,
    updatedAt: now,
  };
}

export function suspendStaffMember(actorProfile, targetProfile, now = new Date().toISOString()) {
  assertManager(actorProfile);
  if (!canManageOrganisationMember(actorProfile, targetProfile)) {
    throw new Error("This staff member cannot be suspended by the signed-in account.");
  }
  if (targetProfile?.status === "suspended" && targetProfile?.active !== true) {
    return { ...targetProfile };
  }

  return {
    ...targetProfile,
    active: false,
    status: "suspended",
    suspendedAt: now,
    updatedAt: now,
  };
}

export function reactivateStaffMember(actorProfile, targetProfile, now = new Date().toISOString()) {
  assertManager(actorProfile);
  if (!canManageOrganisationMember(actorProfile, targetProfile)) {
    throw new Error("This staff member cannot be reactivated by the signed-in account.");
  }

  const {
    suspendedAt: _suspendedAt,
    suspended_at: _suspendedAtSnakeCase,
    ...profile
  } = targetProfile ?? {};
  return {
    ...profile,
    active: true,
    status: "active",
    updatedAt: now,
  };
}

export function revokePendingStaffInvite(actorProfile, invite, now = new Date().toISOString()) {
  const organisationId = assertManager(actorProfile);
  const inviteOrganisationId = cleanText(invite?.organisationId ?? invite?.organisation_id);

  if (!invite || invite.status !== "pending") {
    throw new Error("Only pending staff invitations can be revoked.");
  }
  if (!inviteOrganisationId || inviteOrganisationId !== organisationId) {
    throw new Error("Staff invitations can only be revoked inside the same organisation.");
  }
  if (actorProfile.role === "admin" && invite.role === "admin") {
    throw new Error("Admins cannot manage admin invitations.");
  }

  return {
    ...invite,
    status: "revoked",
    revokedAt: now,
    updatedAt: now,
  };
}
