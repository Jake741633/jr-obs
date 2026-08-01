function cleanText(value) {
  return String(value ?? "").trim();
}

function normaliseEmail(value) {
  return cleanText(value).toLowerCase();
}

export function buildBusinessOnboarding({
  organisationId,
  businessName,
  ownerUserId,
  ownerEmail,
  now = new Date().toISOString(),
} = {}) {
  const safeOrganisationId = cleanText(organisationId);
  const safeBusinessName = cleanText(businessName);
  const safeOwnerUserId = cleanText(ownerUserId);
  const safeOwnerEmail = normaliseEmail(ownerEmail);

  if (!safeOrganisationId) throw new Error("Organisation ID is required.");
  if (!safeBusinessName) throw new Error("Business name is required.");
  if (!safeOwnerUserId) throw new Error("Owner account is required.");
  if (!safeOwnerEmail || !safeOwnerEmail.includes("@")) throw new Error("A valid owner email address is required.");

  return {
    organisation: {
      id: safeOrganisationId,
      name: safeBusinessName,
      ownerUserId: safeOwnerUserId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    ownerProfile: {
      id: safeOwnerUserId,
      userId: safeOwnerUserId,
      email: safeOwnerEmail,
      organisationId: safeOrganisationId,
      role: "owner",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
  };
}

export function canCreateBusinessAccount(existingProfile) {
  return !existingProfile?.organisationId && !existingProfile?.organisation_id;
}

export function assertBusinessOnboardingAvailable(existingProfile) {
  if (!canCreateBusinessAccount(existingProfile)) {
    throw new Error("This account already belongs to a business organisation.");
  }
  return true;
}

export function linkAcceptedStaffInvite(invite, userId, email, now = new Date().toISOString()) {
  const safeUserId = cleanText(userId);
  const safeEmail = normaliseEmail(email);

  if (!invite || invite.status !== "pending") throw new Error("Only pending staff invitations can be linked.");
  if (!safeUserId) throw new Error("User account is required.");
  if (!safeEmail || normaliseEmail(invite.email) !== safeEmail) throw new Error("The signed-in email does not match this invitation.");

  const organisationId = cleanText(invite.organisationId ?? invite.organisation_id);
  if (!organisationId) throw new Error("The invitation is not linked to a business organisation.");

  return {
    invite: {
      ...invite,
      status: "accepted",
      userId: safeUserId,
      acceptedAt: now,
    },
    profile: {
      id: safeUserId,
      userId: safeUserId,
      email: safeEmail,
      organisationId,
      role: invite.role,
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
  };
}
