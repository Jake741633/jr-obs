import type { JobPack, LabourRate, Material, PricingLineItem } from "./models";
import { hasSavedIdentity, savedIdentityIndex } from "./assistantIdentity";
import { validEstimateAmount } from "./estimateCostReview";
import { jobPackQuoteLines, jobPackTotals, hasLegacyOtherAllowances } from "./jobPackCatalogue";

export interface QuoteDraftAddition {
  lines: PricingLineItem[];
  costBasisByLineId: Record<string, string>;
  customerNotes?: string;
  scopeItem?: string;
}

export function labourQuoteDraftAddition(rate: LabourRate | null, id: string): QuoteDraftAddition {
  if (!hasSavedIdentity(id)) throw new Error("A new labour line needs a valid identity.");
  if (rate && (!hasSavedIdentity(rate.id) || typeof rate.name !== "string" || !rate.name.trim() || rate.active !== true)) throw new Error("Choose a named active saved labour rate.");
  if (rate && !["Hour", "Day", "Half day", "Call-out", "Minimum charge"].includes(rate.unit)) throw new Error("Review the saved labour billing unit before adding it.");
  const unitCost = rate && validEstimateAmount(rate.costRate) ? rate.costRate : undefined;
  return {
    lines: [{ id, category: "Labour", description: rate ? `${rate.name.trim()} · per ${rate.unit.toLowerCase()}` : "", quantity: 1,
      unitCost, unitPrice: rate && validEstimateAmount(rate.chargeRate) ? rate.chargeRate : NaN,
      ...(rate ? { labourRateId: rate.id } : {}),
      labourMode: rate?.unit === "Hour" ? "Hours" : rate?.unit === "Day" ? "Days" : "Fixed",
      labourHours: rate?.unit === "Hour" ? 1 : undefined }],
    costBasisByLineId: { [id]: unitCost === undefined ? "Not recorded" : "Saved labour buying allowance" },
  };
}

/** Validate a complete pack before generating identities; no partial import is returned. */
export function jobPackQuoteDraftAddition(pack: JobPack, materials: Material[], nextId: () => string): QuoteDraftAddition {
  if (!hasSavedIdentity(pack.id) || typeof pack.name !== "string" || !pack.name.trim()) throw new Error("Choose a named job pack with a valid identity.");
  if (!Array.isArray(pack.materials) || (pack.otherAllowances !== undefined && !Array.isArray(pack.otherAllowances))) throw new Error("Review the saved job pack lines before adding it.");
  for (const value of [pack.description, pack.labourDescription, pack.testingRequirements, pack.certificatesRequired, pack.notes]) {
    if (value !== undefined && typeof value !== "string") throw new Error("Review the saved job pack descriptions and scope notes.");
  }
  const sourceLines = [...pack.materials, ...(pack.otherAllowances ?? [])];
  if (sourceLines.some(line => !line || typeof line !== "object" || !hasSavedIdentity(line.id) || typeof line.description !== "string" || !line.description.trim())
    || savedIdentityIndex(sourceLines).unusableCount) throw new Error("Review missing or duplicate job pack line identities and descriptions.");
  if (hasLegacyOtherAllowances(pack.notes) || jobPackTotals(pack, materials).total === null) throw new Error("Review the job pack amounts and any legacy Other charges before adding it.");
  if (pack.labourHours <= 0 && !sourceLines.length) throw new Error("This job pack has no pricing lines to add.");
  const lines = jobPackQuoteLines(pack, materials, nextId).map(line => ({ ...line,
    supplier: typeof line.supplier === "string" ? line.supplier : undefined,
    stockCode: typeof line.stockCode === "string" ? line.stockCode : undefined }));
  if (savedIdentityIndex(lines).unusableCount) throw new Error("New quote line identities are missing or duplicated. Try adding the pack again.");
  const costBasisByLineId: Record<string, string> = {};
  const materialOffset = pack.labourHours > 0 ? 1 : 0;
  for (const [index, line] of lines.entries()) {
    costBasisByLineId[line.id] = line.unitCost === undefined ? "Not recorded"
      : line.category === "Materials" && pack.materials[index - materialOffset]?.unitCost === undefined ? "Materials library buying allowance" : "Saved job pack buying allowance";
  }
  const customerNotes = [`Added job pack: ${pack.name.trim()}`, pack.description,
    pack.testingRequirements ? `Testing: ${pack.testingRequirements}` : "",
    pack.certificatesRequired ? `Certification: ${pack.certificatesRequired}` : "",
    pack.notes ? `Scope notes & exclusions: ${pack.notes}` : ""].filter(Boolean).join("\n\n");
  return { lines, costBasisByLineId, customerNotes, scopeItem: `Added job pack: ${pack.name.trim()}` };
}
