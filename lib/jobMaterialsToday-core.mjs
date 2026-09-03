export function buildJobMaterialUsage({ stockItem, material, quantity, jobId, note = "", usageId, now, recordedBy = "Mobile Materials" }) {
  const amount = Number(quantity || 0);
  if (!stockItem || !jobId || !usageId || !now || !Number.isFinite(amount) || amount <= 0) return null;
  return {
    id: usageId,
    jobId,
    materialId: stockItem.materialId || material?.id || undefined,
    description: stockItem.description || material?.description || "Material",
    quantity: amount,
    unit: stockItem.unit || material?.unit || "Each",
    unitCost: Number(stockItem.unitCost ?? material?.unitCost ?? material?.costPrice ?? 0) || 0,
    supplier: material?.supplier || stockItem.supplier || "",
    usedAt: now,
    recordedBy,
    notes: String(note || "").trim(),
    createdAt: now,
    updatedAt: now,
  };
}

export function materialsUsedToday(records, date) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => record?.usedAt?.slice(0, 10) === date)
    .sort((left, right) => String(right.usedAt).localeCompare(String(left.usedAt)));
}

export function materialsTodaySummary(records, date) {
  const today = materialsUsedToday(records, date);
  return {
    lines: today.length,
    quantity: today.reduce((total, record) => total + (Number(record.quantity) || 0), 0),
    cost: today.reduce((total, record) => total + ((Number(record.quantity) || 0) * (Number(record.unitCost) || 0)), 0),
    jobs: new Set(today.map((record) => record.jobId).filter(Boolean)).size,
  };
}
