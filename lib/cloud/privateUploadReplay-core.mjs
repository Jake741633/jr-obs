export async function replayPrivateUploadStages(input) {
  if (!input.authorizationIsCurrent()) {
    throw new Error("Private upload authorisation changed before replay.");
  }

  const authorized = await input.revalidateAuthorization();
  if (!authorized || !input.authorizationIsCurrent()) {
    throw new Error("Private upload authorisation changed before replay.");
  }

  const metadata = await input.upsertMetadata();
  if (!input.authorizationIsCurrent()) {
    throw new Error("Private upload authorisation changed before object upload.");
  }

  const authorizedForObjectUpload = await input.revalidateAuthorization();
  if (!authorizedForObjectUpload || !input.authorizationIsCurrent()) {
    throw new Error("Private upload authorisation changed before object upload.");
  }

  await input.uploadObject();
  if (!input.authorizationIsCurrent()) {
    throw new Error("Private upload authorisation changed before upload confirmation.");
  }

  const authorizedForConfirmation = await input.revalidateAuthorization();
  if (!authorizedForConfirmation || !input.authorizationIsCurrent()) {
    throw new Error("Private upload authorisation changed before upload confirmation.");
  }

  return metadata;
}
