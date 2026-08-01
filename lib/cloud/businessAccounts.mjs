export const businessRoles = ["owner", "admin", "office", "electrician", "customer"];
export const staffAssignableRoles = ["admin", "office", "electrician", "customer"];

function cleanText(value) {
  return String(value ?? "").trim();
}

function normaliseEmail(value) {
  return cleanText(value).toLowerCase();
}

export function normaliseBusinessAccount(input = {}) {
  const name = cleanText(input.name);
  if (!name) throw new Error("Business name is required.");

  return {
    id: cleanText(input.id),
    name,
    ownerUserId: cleanText(input.ownerUserId),
    status: input.status === "suspended" ? "suspended" : "active",
    createdAt: cleanText(input.createdAt),
    updatedAt: cleanText(input.updatedAt),
  };
}

export function canManageStaff(role) {
  return role === "owner" || role === "admin";
}

export function canAssignRole(actorRole, targetRole) {
  if (!canManageStaff(actorRole)) return false;
  if (!staffAssignableRoles.includes(targetRole)) return false;
  if (actorRole === "admin" && targetRole === "admin") return false;
  return true;
}

export function buildStaffInvite({
  organisationId,
  email,
  role,
  invitedBy,
  now = new Date().toISOString(),
} = {}) {
  const safeOrganisationId = cleanText(organisationId);
  const safeEmail = normaliseEmail(email);
  const safeInvitedBy = cleanText(invitedBy);

  if (!safeOrganisationId) throw new Error("Organisation is required.");
  if (!safeEmail || !safeEmail.includes("@")) throw new Error("A valid email address is required.");
  if (!staffAssignableRoles.includes(role)) throw new Error("That role cannot be assigned through a staff invite.");
  if (!safeInvitedBy) throw new Error("Inviting user is required.");

  return {
    organisationId: safeOrganisationId,
    email: safeEmail,
    role,
    status: "pending",
    invitedBy: safeInvitedBy,
    invitedAt: now,
    acceptedAt: null,
    revokedAt: null,
  };
}

export function acceptStaffInvite(invite, userId, now = new Date().toISOString()) {
  if (!invite || invite.status !== "pending") throw new Error("Only pending invites can be accepted.");
  const safeUserId = cleanText(userId);
  if (!safeUserId) throw new Error("User account is required.");

  return {
    ...invite,
    status: "accepted",
    acceptedAt: now,
    userId: safeUserId,
  };
}

export function revokeStaffAccess(profile, actorRole, now = new Date().toISOString()) {
  if (!canManageStaff(actorRole)) throw new Error("Only owners and admins can revoke staff access.");
  if (profile?.role === "owner") throw new Error("The business owner cannot be revoked by staff management.");

  return {
    ...profile,
    status: "suspended",
    suspendedAt: now,
  };
}
