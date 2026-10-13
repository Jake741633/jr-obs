function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normaliseDailyProgress(entry) {
  return {
    ...entry,
    plantAndEquipment: text(entry?.plantAndEquipment),
    deliveriesReceived: text(entry?.deliveriesReceived),
    toolboxTalks: text(entry?.toolboxTalks),
    engineerSignatureName: text(entry?.engineerSignatureName),
    engineerSignedAt: text(entry?.engineerSignedAt),
    customerSignOffName: text(entry?.customerSignOffName),
    customerSignOffNotes: text(entry?.customerSignOffNotes),
    customerSignedAt: text(entry?.customerSignedAt),
    dailySummary: text(entry?.dailySummary),
  };
}

export function buildDailyProgressSummary(entry) {
  const record = normaliseDailyProgress(entry);
  const parts = [
    text(record.workCompleted) ? `Work completed: ${text(record.workCompleted)}` : "",
    text(record.materialsUsed) ? `Materials: ${text(record.materialsUsed)}` : "",
    record.plantAndEquipment ? `Plant/equipment: ${record.plantAndEquipment}` : "",
    record.deliveriesReceived ? `Deliveries: ${record.deliveriesReceived}` : "",
    text(record.delays) ? `Delays: ${text(record.delays)}` : "",
    text(record.issuesAndRisks) ? `H&S/issues: ${text(record.issuesAndRisks)}` : "",
    record.toolboxTalks ? `Toolbox talks: ${record.toolboxTalks}` : "",
    text(record.followUpActions) ? `Next actions: ${text(record.followUpActions)}` : "",
  ].filter(Boolean);

  return parts.join(" ") || "Site diary recorded with no daily progress detail.";
}

export function dailyProgressSignOffState(entry) {
  const record = normaliseDailyProgress(entry);
  return {
    engineerSigned: Boolean(record.engineerSignatureName && record.engineerSignedAt),
    customerSigned: Boolean(record.customerSignOffName && record.customerSignedAt),
  };
}

export function dailyProgressWarnings(entry, { requireEngineerSignature = true } = {}) {
  const record = normaliseDailyProgress(entry);
  const warnings = [];
  if (text(record.delays)) warnings.push("Delay recorded");
  if (text(record.issuesAndRisks)) warnings.push("H&S or site issue recorded");
  if (text(record.followUpActions)) warnings.push("Follow-up action outstanding");
  if (requireEngineerSignature && (!record.engineerSignatureName || !record.engineerSignedAt)) warnings.push("Engineer signature missing");
  return warnings;
}
