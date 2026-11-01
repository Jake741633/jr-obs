export interface PrivateUploadReplayStagesInput<TMetadata> {
  authorizationIsCurrent: () => boolean;
  revalidateAuthorization: () => Promise<boolean>;
  upsertMetadata: () => Promise<TMetadata>;
  uploadObject: () => Promise<unknown>;
}

export function replayPrivateUploadStages<TMetadata>(
  input: PrivateUploadReplayStagesInput<TMetadata>,
): Promise<TMetadata>;
