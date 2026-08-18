function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function email(value) {
  return text(value).toLowerCase();
}

export function siteDiaryOperatorName({ identity, teamMembers, mode } = {}) {
  const activeMembers = Array.isArray(teamMembers)
    ? teamMembers.filter((member) => text(member?.status).toLowerCase() === "active")
    : [];
  const identityEmail = email(identity?.email);
  const matchingMember = identityEmail
    ? activeMembers.find((member) => email(member?.email) === identityEmail)
    : undefined;

  if (text(matchingMember?.name)) return text(matchingMember.name);

  if (mode === "local") {
    const localMember = activeMembers.find((member) => text(member?.role).toLowerCase() === "owner")
      ?? activeMembers[0];
    if (text(localMember?.name)) return text(localMember.name);
  }

  return text(identity?.email);
}
