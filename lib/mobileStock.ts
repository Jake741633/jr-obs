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

export function applyStockUsage(input: {
  stockItems: StockItem[];
  usage: StockUsageInput;
  movementId: string;
  now: string;
}): StockUsageResult | null {
  const item = input.stockItems.find((entry) => entry.id === input.usage.stockItemId);
  if (!item || input.usage.quantity <= 0) return null;

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
  const existingMaterialIds = new Set(
    input.existingLists
      .flatMap((list) => list.items)
      .filter((item) => item.status !== "Delivered")
      .map((item) => item.materialId)
      .filter(Boolean),
  );

  const items = lowStockItems(input.stockItems)
    .filter((item) => !item.materialId || !existingMaterialIds.has(item.materialId))
    .map((item) => {
      const material = input.materials.find((entry) => entry.id === item.materialId);
      const targetQuantity = Math.max(item.minimumQuantity * 2, item.minimumQuantity + 1);
      return {
        id: `${input.purchaseListId}-${item.id}`,
        materialId: item.materialId,
        description: item.description,
        supplier: material?.supplier || item.supplier,
        stockCode: material?.stockCode || item.stockCode,
        supplierUrl: material?.supplierUrl,
        quantity: Math.max(1, targetQuantity - item.quantity),
        unitCost: material?.tradeCost ?? item.unitCost,
        status: "Needed" as const,
      };
    });

  if (!items.length) return null;

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

export function matchesScanCode(item: StockItem, material: Material | undefined, scanCode: string) {
  const normalized = scanCode.trim().toLowerCase();
  if (!normalized) return false;
  return [item.id, item.stockCode, material?.id, material?.stockCode]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase() === normalized);
}
