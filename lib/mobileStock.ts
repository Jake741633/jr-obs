import type { Material, PurchaseList, StockItem, StockMovement } from "./models";

export interface StockUsageInput {
  stockItemId: string;
  quantity: number;
  jobId?: string;
  note?: string;
}

export interface StockUsageResult {
  stockItems: StockItem[];
  movement: StockMovement;
  updatedItem: StockItem;
  shortage: number;
}

export function stockItemIdentityIndex(stockItems: StockItem[]) {
  const index = new Map<string, StockItem | undefined>();
  for (const item of stockItems) if (typeof item.id === "string" && item.id.trim()) index.set(item.id, index.has(item.id) ? undefined : item);
  return index;
}

export function applyStockUsage(input: {
  stockItems: StockItem[];
  usage: StockUsageInput;
  movementId: string;
  now: string;
}): StockUsageResult | null {
  const item = stockItemIdentityIndex(input.stockItems).get(input.usage.stockItemId);
  if (!item || !Number.isFinite(input.usage.quantity) || input.usage.quantity <= 0 || !Number.isFinite(item.quantity) || item.quantity < 0 || !["Each", "Metre", "Drum", "Box", "Pack"].includes(item.unit)) return null;

  const shortage = Math.max(0, input.usage.quantity - item.quantity);
  const updatedItem: StockItem = {
    ...item,
    quantity: Math.max(0, item.quantity - input.usage.quantity),
    updatedAt: input.now,
  };

  return {
    stockItems: input.stockItems.map((entry) => entry.id === item.id ? updatedItem : entry),
    updatedItem,
    shortage,
    movement: {
      id: input.movementId,
      stockItemId: item.id,
      type: "Used",
      quantity: input.usage.quantity,
      jobId: input.usage.jobId || undefined,
      note: input.usage.note?.trim() || "Materials used from mobile stock workflow.",
      movedAt: input.now,
      createdAt: input.now,
    },
  };
}

export function lowStockItems(stockItems: StockItem[]) {
  return stockItems.filter((item) => item.quantity <= item.minimumQuantity);
}

export function buildLowStockPurchaseList(input: {
  stockItems: StockItem[];
  materials: Material[];
  existingLists: PurchaseList[];
  purchaseListId: string;
  number: string;
  now: string;
  jobId?: string;
}): PurchaseList | null {
  if (input.stockItems.some((item) => !Number.isFinite(item.quantity) || item.quantity < 0 || !Number.isFinite(item.minimumQuantity) || item.minimumQuantity < 0)) {
    throw new Error("Review stock quantities and minimum levels before preparing a request.");
  }
  const existingMaterialIds = new Set(
    input.existingLists
      .flatMap((list) => list.items)
      .filter((item) => item.status !== "Delivered")
      .map((item) => item.materialId)
      .filter(Boolean),
  );
  const existingStockIds = new Set(input.existingLists.flatMap((list) => list.items
    .filter((item) => item.status !== "Delivered" && typeof item.id === "string" && item.id.startsWith(`${list.id}-`))
    .map((item) => item.id.slice(list.id.length + 1))));

  const items = lowStockItems(input.stockItems)
    .filter((item) => !existingStockIds.has(item.id) && (!item.materialId || !existingMaterialIds.has(item.materialId)))
    .map((item) => {
      if (typeof item.id !== "string" || !item.id.trim() || input.stockItems.filter((entry) => entry.id === item.id).length !== 1 || typeof item.description !== "string" || !item.description.trim() || !["Each", "Metre", "Drum", "Box", "Pack"].includes(item.unit)) {
        throw new Error("Review the replenishment stock identities, descriptions and units before preparing a request.");
      }
      const matches = item.materialId ? input.materials.filter((entry) => entry.id === item.materialId) : [];
      if (item.materialId && matches.length !== 1) throw new Error("A linked material is unavailable or ambiguous. Review its saved stock record.");
      const material = matches[0];
      if (material && material.unit !== item.unit) throw new Error("The linked material and stock units differ. Review the saved material link before preparing a request.");
      const targetQuantity = Math.max(item.minimumQuantity * 2, item.minimumQuantity + 1);
      const quantity = Math.max(1, targetQuantity - item.quantity);
      const unitCost = material ? material.tradeCost : item.unitCost;
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0 || !Number.isFinite(quantity * unitCost)) {
        throw new Error("Review replenishment quantities and unit costs before preparing a request.");
      }
      return {
        id: `${input.purchaseListId}-${item.id}`,
        materialId: item.materialId,
        description: item.description,
        supplier: material?.supplier || item.supplier,
        stockCode: material?.stockCode || item.stockCode,
        supplierUrl: material?.supplierUrl,
        quantity,
        unitCost,
        status: "Needed" as const,
      };
    });

  if (!items.length) return null;
  if (!Number.isFinite(items.reduce((total, item) => total + item.quantity * item.unitCost, 0))) throw new Error("Review replenishment quantities and unit costs before preparing a request.");

  return {
    id: input.purchaseListId,
    number: input.number,
    title: input.jobId ? "Mobile materials replenishment" : "Low-stock replenishment",
    jobId: input.jobId || undefined,
    items,
    notes: "Generated automatically from stock items at or below their minimum quantity.",
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function lowStockRequestSourceSignature(list: PurchaseList, stockItems: StockItem[], materials: Material[]) {
  const lineIds = new Set(list.items.map((item) => item.id));
  const includedStock = stockItems.filter((item) => lineIds.has(`${list.id}-${item.id}`));
  const materialIds = new Set(includedStock.map((item) => item.materialId).filter(Boolean));
  return JSON.stringify({ stock: includedStock, materials: materials.filter((item) => materialIds.has(item.id)) });
}

export function matchesScanCode(item: StockItem, material: Material | undefined, scanCode: string) {
  const normalized = scanCode.trim().toLowerCase();
  if (!normalized) return false;
  return [item.id, item.stockCode, material?.id, material?.stockCode]
    .filter(Boolean)
    .some((value) => String(value).trim().toLowerCase() === normalized);
}

export function stockScanMatches(stockItems: StockItem[], materials: Material[], scanCode: string) {
  const materialIndex = new Map<string, Material | undefined>();
  for (const material of materials) if (typeof material.id === "string" && material.id.trim()) materialIndex.set(material.id, materialIndex.has(material.id) ? undefined : material);
  return stockItems.filter((item) => matchesScanCode(item, item.materialId ? materialIndex.get(item.materialId) : undefined, scanCode));
}
