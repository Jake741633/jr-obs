export function collectionFilter(collectionKey) {
  return collectionKey ? `&collection_key=eq.${encodeURIComponent(collectionKey)}` : "";
}

export function tenantRecordQuery({ organisationId, sourceId, collectionKey, includeDeleted = true }) {
  const deletedFilter = includeDeleted ? "" : "&deleted_at=is.null";
  return `select=*&organisation_id=eq.${encodeURIComponent(organisationId)}&source_id=eq.${encodeURIComponent(sourceId)}${collectionFilter(collectionKey)}${deletedFilter}&limit=1`;
}

export function tenantListQuery({ organisationId, collectionKey }) {
  return `select=*&organisation_id=eq.${encodeURIComponent(organisationId)}${collectionFilter(collectionKey)}&deleted_at=is.null`;
}

export function hasVersionConflict(currentVersion, expectedVersion) {
  return currentVersion !== undefined && expectedVersion !== undefined && currentVersion !== expectedVersion;
}

export function linkedSourceIds(payload) {
  if (!payload || typeof payload !== "object") return { customerSourceId: undefined, jobSourceId: undefined };
  return {
    customerSourceId: typeof payload.customerId === "string" ? payload.customerId : undefined,
    jobSourceId: typeof payload.jobId === "string" ? payload.jobId : undefined,
  };
}

export function coalesceQueue(queue, next) {
  const index = queue.findIndex((item) => item.table === next.table && item.sourceId === next.sourceId && item.collectionKey === next.collectionKey);
  if (index < 0) return [...queue, next];
  const copy = [...queue];
  copy[index] = next;
  return copy;
}

export function makeTombstone({ currentVersion = 0, userId, deletedAt }) {
  return {
    version: currentVersion + 1,
    deleted_at: deletedAt,
    updated_at: deletedAt,
    updated_by: userId,
  };
}

export function pendingImports(records, existingRows) {
  const existing = new Map(existingRows.map((row) => [row.source_id, row]));
  return records.filter((record) => {
    const cloud = existing.get(record.id);
    if (!cloud) return true;
    if (cloud.deleted_at) return false;
    return (record.updatedAt || "") > (cloud.source_updated_at || "");
  });
}
