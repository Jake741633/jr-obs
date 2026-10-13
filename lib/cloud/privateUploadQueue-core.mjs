export function privateUploadMatchesAuthorization(item, authorization) {
  return Boolean(item && authorization)
    && item.organisationId === authorization.organisationId
    && item.userId === authorization.userId
    && item.authorizationRole === authorization.role
    && (item.authorizationCustomerSourceId ?? null) === (authorization.customerSourceId ?? null);
}

export function partitionPrivateUploadQueue(items, authorization, storageKey) {
  const preserved = [];
  const activeQueue = [];

  for (const item of Array.isArray(items) ? items : []) {
    if (privateUploadMatchesAuthorization(item, authorization) && item.storageKey === storageKey) {
      activeQueue.push(item);
    } else {
      preserved.push(item);
    }
  }

  return { preserved, activeQueue };
}
