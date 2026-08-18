function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function email(value) {
  return text(value).toLowerCase();
}

function fieldOperatorMember({ identity, teamMembers, mode } = {}) {
  const activeMembers = Array.isArray(teamMembers)
    ? teamMembers.filter((member) => text(member?.status).toLowerCase() === "active")
    : [];

  if (mode === "local") {
    return activeMembers.find((member) => text(member?.role).toLowerCase() === "owner")
      ?? activeMembers[0];
  }

  const identityEmail = email(identity?.email);
  if (!identityEmail) return undefined;
  const matchingMembers = activeMembers.filter((member) => email(member?.email) === identityEmail);
  return matchingMembers.length === 1 ? matchingMembers[0] : undefined;
}

export function fieldOperatorName(options = {}) {
  const member = fieldOperatorMember(options);
  return text(member?.name) || text(member?.id);
}

export function fieldOperatorMemberId(options = {}) {
  return text(fieldOperatorMember(options)?.id);
}

export function siteDiaryOperatorName(options) {
  return fieldOperatorName(options);
}
