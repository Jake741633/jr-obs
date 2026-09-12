export function fieldSurveyCreationAllowed({ fieldMode, online }) {
  return !fieldMode || online;
}

export function surveyCreationRequiresCloudConfirmation({ mode, online, authenticated }) {
  if (!authenticated || mode === "local") return false;
  return mode === "cloud" || online;
}

export function surveyCreateSyncMessage(state) {
  if (state === "Conflict") return "Survey saved on this device, but cloud creation conflicted. Resolve it in Cloud Queue before opening the survey.";
  if (state === "Failed") return "Survey saved on this device, but cloud creation failed. Retry cloud confirmation before opening the survey.";
  if (state === "Offline") return "Survey saved on this device, but the connection went offline. Reconnect and retry cloud confirmation before opening it.";
  return "Survey saved on this device and is still waiting for cloud confirmation. Retry before opening it.";
}

export async function confirmSurveyBeforeNavigation({ flush, isCurrent, getSyncState, navigate }) {
  await flush();
  if (!isCurrent()) return "Failed";
  const state = getSyncState();
  if (state === "Synced") navigate();
  return state;
}

export async function persistSurveyBeforeNavigation({
  persist,
  requiresCloudConfirmation,
  flush,
  isCurrent,
  getSyncState,
  navigate,
}) {
  if (!isCurrent()) return "Failed";
  persist();
  if (!isCurrent()) return "Failed";
  if (requiresCloudConfirmation) {
    return confirmSurveyBeforeNavigation({ flush, isCurrent, getSyncState, navigate });
  }
  navigate();
  return "Synced";
}
