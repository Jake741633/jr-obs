export function normaliseRecordCreatorMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([sourceId, creatorId]) => {
    const normalisedCreatorId = typeof creatorId === "string" ? creatorId.trim() : "";
    return sourceId.trim() && normalisedCreatorId ? [[sourceId, normalisedCreatorId]] : [];
  }));
}

export function creatorMapForCloudRows(rows, records) {
  if (!Array.isArray(rows) || !Array.isArray(records)) return {};
  const visibleIds = new Set(records.flatMap((record) => {
    const id = record && typeof record === "object" && typeof record.id === "string" ? record.id : "";
    return id ? [id] : [];
  }));
  return normaliseRecordCreatorMap(Object.fromEntries(rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const sourceId = typeof row.source_id === "string" ? row.source_id : "";
    const payloadId = row.payload && typeof row.payload === "object" && typeof row.payload.id === "string"
      ? row.payload.id
      : "";
    return sourceId && payloadId === sourceId && visibleIds.has(sourceId)
      ? [[sourceId, row.created_by]]
      : [];
  })));
}

export function retainRecordCreatorsForRecords(creators, records) {
  if (!Array.isArray(records)) return {};
  const visibleIds = new Set(records.flatMap((record) => {
    const id = record && typeof record === "object" && typeof record.id === "string" ? record.id : "";
    return id ? [id] : [];
  }));
  return Object.fromEntries(Object.entries(normaliseRecordCreatorMap(creators)).filter(([sourceId]) => visibleIds.has(sourceId)));
}
