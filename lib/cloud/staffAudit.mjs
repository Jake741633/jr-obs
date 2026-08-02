const staffAuditActions = Object.freeze([
  "invited",
  "invite-revoked",
  "invite-accepted",
  "role-changed",
  "suspended",
  "reactivated",
]);

function cleanText(value) {
  return String(value ?? "").trim();
}

function organisationIdOf(value) {
  return cleanText(value?.organisationId ?? value?.organisation_id);
}

function actorIdOf(value) {
  return cleanText(value?.userId ?? value?.user_id ?? value?.id);
}

export function buildStaffAuditEntry({
  id,
  action,
  actorProfile,
  targetProfile,
  invite,
  previousRole,
  nextRole,
  reason,
  now = new Date().toISOString(),
} = {}) {
  const organisationId = organisationIdOf(targetProfile) || organisationIdOf(invite) || organisationIdOf(actorProfile);
  const actorUserId = actorIdOf(actorProfile);
  const targetUserId = actorIdOf(targetProfile) || cleanText(invite?.userId ?? invite?.user_id);
  const targetEmail = cleanText(targetProfile?.email ?? invite?.email).toLowerCase();
  const safeAction = cleanText(action);

  if (!cleanText(id)) throw new Error("Staff audit entry ID is required.");
  if (!staffAuditActions.includes(safeAction)) throw new Error("Unsupported staff audit action.");
  if (!organisationId) throw new Error("Staff audit entries require an organisation.");
  if (!actorUserId) throw new Error("Staff audit entries require an actor account.");
  if (!targetUserId && !targetEmail) throw new Error("Staff audit entries require a target account or invitation.");
  if (organisationIdOf(actorProfile) !== organisationId) {
    throw new Error("Staff audit actions must remain inside the actor organisation.");
  }

  const entry = {
    id: cleanText(id),
    organisationId,
    action: safeAction,
    actorUserId,
    targetUserId: targetUserId || null,
    targetEmail: targetEmail || null,
    occurredAt: now,
  };

  const safePreviousRole = cleanText(previousRole);
  const safeNextRole = cleanText(nextRole);
  const safeReason = cleanText(reason);

  if (safePreviousRole) entry.previousRole = safePreviousRole;
  if (safeNextRole) entry.nextRole = safeNextRole;
  if (safeReason) entry.reason = safeReason;

  return entry;
}

export function filterStaffAuditForOrganisation(entries = [], organisationId) {
  const safeOrganisationId = cleanText(organisationId);
  if (!safeOrganisationId || !Array.isArray(entries)) return [];

  return entries
    .filter((entry) => organisationIdOf(entry) === safeOrganisationId)
    .toSorted((left, right) => String(right.occurredAt ?? "").localeCompare(String(left.occurredAt ?? "")));
}

export { staffAuditActions };
