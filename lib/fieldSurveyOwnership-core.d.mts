export function fieldSurveyEditAllowed(input: {
  fieldMode: boolean;
  userId?: string | null;
  creatorId?: string | null;
}): boolean;

export function surveySyncStateBlocksEdits(state?: string | null): boolean;

export interface SurveySyncTracker {
  targetKey: string;
  state: string | null;
  initialized: boolean;
}

export function nextSurveySyncTracker(input: {
  current: SurveySyncTracker;
  targetKey: string;
  nextState: string;
  requiresReconciliation: boolean;
}): SurveySyncTracker;
