function trimmed(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function cloudPageIdentityKey(identity) {
  if (!identity) return null;
  return JSON.stringify([
    identity.organisationId,
    identity.userId,
    identity.role,
    identity.customerSourceId ?? null,
    trimmed(identity.email)?.toLowerCase() ?? null,
  ]);
}

export function normalCloudPageSessionUserId(session) {
  if (!session?.access_token || session.is_password_recovery) return null;
  return trimmed(session.user?.id) ?? null;
}

export function matchedCloudPageIdentity(identity, accountUser, session) {
  const sessionUserId = normalCloudPageSessionUserId(session);
  if (!identity || !accountUser || !sessionUserId
    || identity.userId !== accountUser.id
    || identity.userId !== sessionUserId) return null;
  const candidate = {
    ...identity,
    // The resolved profile/session identity is fresher than the account-page
    // cache. Fall back only when that identity did not contain an email.
    email: trimmed(identity.email) ?? trimmed(accountUser.email),
  };
  return { ...candidate, key: cloudPageIdentityKey(candidate) };
}

export function canRetainSettledCloudIdentity(settled, isReady, session) {
  return Boolean(
    settled
      && !isReady
      && normalCloudPageSessionUserId(session) === settled.userId,
  );
}

export function clearSubmittedValue(current, submitted, currentRevision, submittedRevision) {
  return currentRevision === submittedRevision && current === submitted ? "" : current;
}

export function activeCloudPageOperationMatches(current, expected) {
  return Boolean(
    current
      && expected
      && current.token === expected.token
      && current.action === expected.action
      && (current.ownerKey ?? null) === (expected.ownerKey ?? null),
  );
}

export function createCloudPageOperationCoordinator() {
  let active = null;
  let nextToken = 0;
  return {
    begin(action, ownerKey = null) {
      if (active) return null;
      active = { token: ++nextToken, action, ownerKey };
      return active;
    },
    current() {
      return active;
    },
    isCurrent(expected) {
      return activeCloudPageOperationMatches(active, expected);
    },
    finish(expected) {
      if (!activeCloudPageOperationMatches(active, expected)) return false;
      active = null;
      return true;
    },
    invalidate() {
      const invalidated = active;
      active = null;
      return invalidated;
    },
  };
}

export function ownedCloudPageValue(owned, ownerKey, fallback) {
  return owned && ownerKey && owned.ownerKey === ownerKey ? owned.value : fallback;
}

export function assertCloudPageOperationCurrent(isCurrent) {
  if (isCurrent && !isCurrent()) {
    throw new Error("The active JR OS account changed before the cloud operation could continue.");
  }
}
