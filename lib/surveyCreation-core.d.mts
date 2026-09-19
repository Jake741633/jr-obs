export type SurveyCreationSyncState = "Synced" | "Pending" | "Offline" | "Failed" | "Conflict";

export function fieldSurveyCreationAllowed(input: { fieldMode: boolean; online: boolean }): boolean;
export function surveyCreationRequiresCloudConfirmation(input: { mode: "local" | "migration" | "cloud"; online: boolean; authenticated: boolean }): boolean;
export function surveyCreateSyncMessage(state: SurveyCreationSyncState): string;
export function confirmSurveyBeforeNavigation(input: {
  flush: () => Promise<unknown>;
  isCurrent: () => boolean;
  getSyncState: () => SurveyCreationSyncState;
  navigate: () => void;
}): Promise<SurveyCreationSyncState>;
export function persistSurveyBeforeNavigation(input: {
  persist: () => void;
  requiresCloudConfirmation: boolean;
  flush: () => Promise<unknown>;
  isCurrent: () => boolean;
  getSyncState: () => SurveyCreationSyncState;
  navigate: () => void;
}): Promise<SurveyCreationSyncState>;
