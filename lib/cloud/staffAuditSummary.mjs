const supportedActions = Object.freeze([
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

function actionOf(value) {
  const action = cleanText(value?.action);
  return supportedActions.includes(action) ? action : "unknown";
}

export function summariseStaffAudit(entries = [], organisationId) {
  const safeOrganisationId = cleanText(organisationId);
  if (!safeOrganisationId || !Array.isArray(entries)) {
    return { total: 0, latestAt: null, byAction: Object.fromEntries(supportedActions.map((action) => [action, 0])) };
  }

  const scoped = entries.filter((entry) => organisationIdOf(entry) === safeOrganisationId);
  const byAction = Object.fromEntries(supportedActions.map((action) => [action, 0]));
  let latestAt = null;

  for (const entry of scoped) {
    const action = actionOf(entry);
    if (action !== "unknown") byAction[action] += 1;
    const occurredAt = cleanText(entry?.occurredAt ?? entry?.occurred_at);
    if (occurredAt && (!latestAt || occurredAt > latestAt)) latestAt = occurredAt;
  }

  return { total: scoped.length, latestAt, byAction };
}

export function latestStaffAuditEntries(entries = [], organisationId, limit = 10) {
  const safeOrganisationId = cleanText(organisationId);
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : 10;
  if (!safeOrganisationId || !Array.isArray(entries) || safeLimit === 0) return [];

  return entries
    .filter((entry) => organisationIdOf(entry) === safeOrganisationId)
    .toSorted((left, right) => String(right?.occurredAt ?? right?.occurred_at ?? "").localeCompare(String(left?.occurredAt ?? left?.occurred_at ?? "")))
    .slice(0, safeLimit)
    .map((entry) => ({ ...entry }));
}

export { supportedActions as staffAuditSummaryActions };
