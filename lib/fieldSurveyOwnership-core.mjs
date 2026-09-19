export function fieldSurveyEditAllowed({ fieldMode, userId, creatorId }) {
  if (!fieldMode) return true;
  const activeUserId = typeof userId === "string" ? userId.trim() : "";
  const recordCreatorId = typeof creatorId === "string" ? creatorId.trim() : "";
  return Boolean(activeUserId && recordCreatorId && activeUserId === recordCreatorId);
}

export function surveySyncStateBlocksEdits(state) {
  return state === "Failed" || state === "Conflict";
}

export function nextSurveySyncTracker({ current, targetKey, nextState, requiresReconciliation }) {
  if (nextState !== "Synced") return { targetKey, state: nextState, initialized: true };
  if (current.targetKey !== targetKey || !current.initialized) {
    return { targetKey, state: null, initialized: true };
  }
  if (current.state === "Synced"
    || surveySyncStateBlocksEdits(current.state)
    || (requiresReconciliation && current.state !== null)) return current;
  return { targetKey, state: null, initialized: true };
}
