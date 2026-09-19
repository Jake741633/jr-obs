function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function email(value) {
  return text(value).toLowerCase();
}

function activeTeamMembers(teamMembers) {
  return Array.isArray(teamMembers)
    ? teamMembers.filter((member) => text(member?.status).toLowerCase() === "active")
    : [];
}

function uniqueFieldOperatorMember({ identity, teamMembers, mode } = {}) {
  const activeMembers = activeTeamMembers(teamMembers);
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
  const member = uniqueFieldOperatorMember(options);
  return text(member?.name) || text(member?.id);
}

export function fieldOperatorMemberId(options = {}) {
  return text(uniqueFieldOperatorMember(options)?.id);
}

export function fieldJobAssignedToOperator({ job, operatorMemberId } = {}) {
  const memberId = text(operatorMemberId);
  return Boolean(memberId && Array.isArray(job?.assignedTo) && job.assignedTo.includes(memberId));
}

export function siteDiaryOperatorName(options) {
  return fieldOperatorName(options);
}
