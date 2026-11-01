export interface PrivateUploadAuthorizationScope {
  organisationId: string;
  userId: string;
  role: string;
  customerSourceId?: string;
}

export interface PrivateUploadQueueScopeItem {
  organisationId: string;
  userId: string;
  authorizationRole: string;
  authorizationCustomerSourceId?: string;
  storageKey: string;
}

export function privateUploadMatchesAuthorization(
  item: PrivateUploadQueueScopeItem,
  authorization: PrivateUploadAuthorizationScope,
): boolean;

export function partitionPrivateUploadQueue<T extends PrivateUploadQueueScopeItem>(
  items: readonly T[],
  authorization: PrivateUploadAuthorizationScope,
  storageKey: string,
): { preserved: T[]; activeQueue: T[] };
