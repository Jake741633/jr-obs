import type { Material, PricingLineItem } from "./models";
import { reviewEstimateCosts, validEstimateAmount } from "./estimateCostReview";
import { savedIdentityIndex } from "./assistantIdentity";

export type QuoteLineReviewField = "identity" | "description" | "quantity" | "unitCost" | "unitPrice" | "labourHours" | "amount";
export function reviewQuoteDraftLines(lines: readonly PricingLineItem[]) {
  const identities = savedIdentityIndex(lines), costs = reviewEstimateCosts(lines);
  const reviews = lines.map((line, index) => {
    const fields: QuoteLineReviewField[] = [];
    const editable = identities.unique.has(line.id);
    if (!editable) fields.push("identity");
    if (typeof line.description !== "string" || !line.description.trim()) fields.push("description");
    const quantity = validEstimateAmount(line.quantity) && line.quantity > 0;
    if (!quantity) fields.push("quantity");
    if (!validEstimateAmount(line.unitCost)) fields.push("unitCost");
    if (!validEstimateAmount(line.unitPrice)) fields.push("unitPrice");
    const buying = quantity && validEstimateAmount(line.unitCost) ? line.quantity * line.unitCost : undefined;
    const selling = quantity && validEstimateAmount(line.unitPrice) ? line.quantity * line.unitPrice : undefined;
    if (!costs.totalsValid || (buying !== undefined && !validEstimateAmount(buying)) || (selling !== undefined && !validEstimateAmount(selling))) fields.push("amount");
    if (line.category === "Labour") {
      const hours = line.labourHours ?? (line.labourMode === "Hours" ? line.quantity : undefined);
      if (!validEstimateAmount(hours) || hours <= 0 || (line.labourMode === "Hours" && hours !== line.quantity)) fields.push("labourHours");
    }
    return { id: line.id, index, editable, fields, buyingAmount: validEstimateAmount(buying) ? buying : undefined, sellingAmount: validEstimateAmount(selling) ? selling : undefined };
  });
  const needsReviewCount = reviews.filter(line => line.fields.length).length;
  return { complete: costs.complete && needsReviewCount === 0, needsReviewCount, costs, lines: reviews };
}

export function editQuoteDraftLine(line: PricingLineItem, patch: Partial<Pick<PricingLineItem, "description" | "quantity" | "unitCost" | "unitPrice" | "labourHours">>): PricingLineItem {
  const next = { ...line, ...patch };
  if (line.category === "Labour" && line.labourMode === "Hours" && Object.hasOwn(patch, "quantity")) next.labourHours = patch.quantity;
  return next;
}

export function materialQuoteDraftLine(material: Material | null, id: string): { line: PricingLineItem; costBasis: string } {
  if (!id.trim()) throw new Error("A new line needs a unique identity.");
  if (material && (typeof material.name !== "string" || !material.name.trim())) throw new Error("The saved material needs a name before it can be added.");
  const unitCost = material && validEstimateAmount(material.tradeCost) ? material.tradeCost : undefined;
  return {
    line: {
      id, category: "Materials", quantity: 1,
      description: material ? `${material.name.trim()}${typeof material.unit === "string" && material.unit ? ` · per ${material.unit}` : ""}` : "",
      unitCost, unitPrice: material && validEstimateAmount(material.sellPrice) ? material.sellPrice : NaN,
      ...(material ? { materialId: material.id, supplier: typeof material.supplier === "string" ? material.supplier : undefined, stockCode: typeof material.stockCode === "string" ? material.stockCode : undefined } : {}),
    },
    costBasis: unitCost === undefined ? "Not recorded" : "Saved material buying allowance",
  };
}
