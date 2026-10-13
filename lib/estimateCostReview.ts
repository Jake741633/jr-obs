/** Explicit zero is valid; an absent buying allowance is never a free material. */
export function validEstimateAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000;
}

export function reviewEstimateCosts(lines: ReadonlyArray<{ quantity: number; unitCost?: number; unitPrice: number }>) {
  let knownCost = 0, sellingTotal = 0, missingCosts = 0, invalidLines = 0;
  for (const line of lines) {
    const quantityValid = validEstimateAmount(line.quantity) && line.quantity > 0;
    const costValid = validEstimateAmount(line.unitCost);
    const priceValid = validEstimateAmount(line.unitPrice);
    if (!costValid) missingCosts++;
    const cost = quantityValid && costValid ? line.quantity * line.unitCost! : undefined;
    const price = quantityValid && priceValid ? line.quantity * line.unitPrice : undefined;
    if (!quantityValid || !priceValid || (costValid && !validEstimateAmount(cost)) || !validEstimateAmount(price)) invalidLines++;
    if (validEstimateAmount(cost)) knownCost += cost;
    if (validEstimateAmount(price)) sellingTotal += price;
  }
  const totalsValid = validEstimateAmount(knownCost) && validEstimateAmount(sellingTotal);
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  return { complete: lines.length > 0 && missingCosts === 0 && invalidLines === 0 && totalsValid,
    missingCosts, invalidLines, totalsValid, knownCost: round(knownCost), sellingTotal: round(sellingTotal) };
}
