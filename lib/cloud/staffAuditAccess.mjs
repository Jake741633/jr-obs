const auditViewerRoles = Object.freeze(["owner", "admin"]);

function cleanText(value) {
  return String(value ?? "").trim();
}

function organisationIdOf(value) {
  return cleanText(value?.organisationId ?? value?.organisation_id);
}

function roleOf(value) {
  return cleanText(value?.role).toLowerCase();
}

function statusOf(value) {
  return cleanText(value?.status || "active").toLowerCase();
}

export function canViewStaffAudit(profile, organisationId) {
  const safeOrganisationId = cleanText(organisationId);
  if (!safeOrganisationId) return false;
  if (organisationIdOf(profile) !== safeOrganisationId) return false;
  if (statusOf(profile) !== "active") return false;
  return auditViewerRoles.includes(roleOf(profile));
}

export function assertStaffAuditAccess(profile, organisationId) {
  if (!canViewStaffAudit(profile, organisationId)) {
    throw new Error("Only active owners and admins can view staff access history for their organisation.");
  }
  return true;
}

export function staffAuditEntriesForViewer(entries = [], profile, organisationId) {
  assertStaffAuditAccess(profile, organisationId);
  if (!Array.isArray(entries)) return [];

  return entries
    .filter((entry) => organisationIdOf(entry) === cleanText(organisationId))
    .toSorted((left, right) => String(right?.occurredAt ?? right?.occurred_at ?? "").localeCompare(String(left?.occurredAt ?? left?.occurred_at ?? "")))
    .map((entry) => ({ ...entry }));
}

export { auditViewerRoles };
