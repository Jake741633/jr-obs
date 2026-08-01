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
    customerSourceId: typeof payload.customerId === "string"
      ? payload.customerId
      : typeof payload.customerSourceId === "string"
        ? payload.customerSourceId
        : undefined,
    jobSourceId: typeof payload.jobId === "string"
      ? payload.jobId
      : typeof payload.jobSourceId === "string"
        ? payload.jobSourceId
        : undefined,
  };
}

export function buildTypedEnvelope({
  organisationId,
  sourceId,
  payload,
  version,
  sourceUpdatedAt,
  createdBy,
  updatedBy,
}) {
  const links = linkedSourceIds(payload);
  return {
    organisation_id: organisationId,
    source_id: sourceId,
    customer_source_id: links.customerSourceId ?? null,
    job_source_id: links.jobSourceId ?? null,
    version,
    source_updated_at: sourceUpdatedAt,
    payload: payload ?? null,
    deleted_at: null,
    created_by: createdBy ?? null,
    updated_by: updatedBy ?? null,
  };
}

export function buildGenericEnvelope({ collectionKey, ...typed }) {
  if (!collectionKey) throw new Error("Generic cloud records require a collection key.");
  return {
    ...buildTypedEnvelope(typed),
    collection_key: collectionKey,
  };
}

export function buildCloudEnvelope(input) {
  return input.collectionKey ? buildGenericEnvelope(input) : buildTypedEnvelope(input);
}

export function coalesceQueue(queue, next) {
  const index = queue.findIndex((item) => item.organisationId === next.organisationId && item.table === next.table && item.sourceId === next.sourceId && item.collectionKey === next.collectionKey);
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

export function applyLocalCrud(records, operation) {
  if (operation.type === "remove") return records.filter((record) => record.id !== operation.id);
  const index = records.findIndex((record) => record.id === operation.record.id);
  if (index < 0) return [operation.record, ...records];
  return records.map((record, recordIndex) => recordIndex === index ? operation.record : record);
}

export function queueModeChange({ mode, online, queue, change }) {
  if (mode === "local") return { queue, status: online ? "Synced" : "Offline" };
  const state = online ? "Pending" : "Offline";
  return { queue: coalesceQueue(queue, { ...change, state }), status: state };
}

export function cloudRowsToCache(rows) {
  const latest = new Map();
  for (const row of rows) {
    const current = latest.get(row.source_id);
    if (!current || (row.version || 0) > (current.version || 0)) latest.set(row.source_id, row);
  }
  return [...latest.values()].filter((row) => !row.deleted_at).map((row) => row.payload);
}

export function retainVersionConflict(queue, change, currentVersion) {
  if (!hasVersionConflict(currentVersion, change.expectedVersion)) return queue;
  return coalesceQueue(queue, {
    ...change,
    state: "Conflict",
    error: `Cloud version ${currentVersion} differs from expected ${change.expectedVersion}.`,
  });
}
