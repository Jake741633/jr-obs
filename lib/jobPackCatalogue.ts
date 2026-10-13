import type { JobPack, JobPackMaterial, Material, PricingLineItem } from "./models";

const validAmount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000;
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function packLineCost(line: JobPackMaterial, materials: Material[]): number | null {
  if (line.unitCost !== undefined) return validAmount(line.unitCost) ? line.unitCost : null;
  const matches = line.materialId ? materials.filter(item => item.id === line.materialId) : [];
  return matches.length === 1 && validAmount(matches[0].tradeCost) ? matches[0].tradeCost : null;
}

export function jobPackTotals(pack: Pick<JobPack, "labourHours" | "labourRate" | "materials">, materials: Material[]) {
  let materialsSell = 0, knownMaterialsCost = 0, missingCosts = 0;
  let valid = validAmount(pack.labourHours) && validAmount(pack.labourRate);
  for (const line of pack.materials) {
    const quantityValid = validAmount(line.quantity) && line.quantity > 0;
    if (!quantityValid || !validAmount(line.unitPrice)) valid = false;
    else materialsSell += money(line.quantity * line.unitPrice);
    const cost = packLineCost(line, materials);
    if (cost === null || !quantityValid) missingCosts++;
    else knownMaterialsCost += money(line.quantity * cost);
  }
  const labour = validAmount(pack.labourHours) && validAmount(pack.labourRate) ? money(pack.labourHours * pack.labourRate) : null;
  const total = labour === null ? NaN : money(labour + materialsSell);
  return { labour, materialsSell: money(materialsSell), knownMaterialsCost: money(knownMaterialsCost),
    materialsCost: missingCosts || !validAmount(knownMaterialsCost) ? null : money(knownMaterialsCost), missingCosts,
    total: valid && validAmount(total) ? total : null };
}

/** Pack allowances are deliberately preserved; library updates never silently reprice a reviewed pack. */
export function jobPackQuoteLines(pack: JobPack, materials: Material[], nextId: () => string): PricingLineItem[] {
  const totals = jobPackTotals(pack, materials);
  if (totals.total === null) throw new Error("Check the job pack amounts before adding it to a quote.");
  const lines: PricingLineItem[] = [];
  if (pack.labourHours > 0) lines.push({ id: nextId(), description: pack.labourDescription || `${pack.name} labour`, category: "Labour", quantity: 1,
    unitPrice: totals.labour!, labourMode: "Fixed", labourHours: pack.labourHours });
  for (const line of pack.materials) {
    const matches = line.materialId ? materials.filter(item => item.id === line.materialId) : [], source = matches.length === 1 ? matches[0] : undefined;
    const cost = packLineCost(line, materials);
    lines.push({ id: nextId(), description: line.description, category: "Materials", quantity: line.quantity, unitPrice: line.unitPrice,
      ...(cost === null ? {} : { unitCost: cost }), materialId: source?.id, supplier: source?.supplier, stockCode: source?.stockCode });
  }
  return lines;
}

function checkedIds<T extends { id: string }>(records: T[]) {
  const ids = new Set<string>();
  for (const item of records) {
    if (typeof item.id !== "string" || !item.id.trim()) throw new Error("A catalogue record has no valid identity. Resolve it before importing.");
    if (ids.has(item.id)) throw new Error("Resolve duplicate record IDs before importing the catalogue.");
    ids.add(item.id);
  }
  return ids;
}

export function catalogueImportPlan(materials: Material[], packs: JobPack[], sourceMaterials: Material[], sourcePacks: JobPack[], includePacks: boolean) {
  const materialIds = checkedIds(materials), packIds = checkedIds(packs);
  checkedIds(sourceMaterials); checkedIds(sourcePacks);
  const missingMaterials = sourceMaterials.filter(item => !materialIds.has(item.id));
  const missingPacks = includePacks ? sourcePacks.filter(item => !packIds.has(item.id)) : [];
  const available = new Set([...materialIds, ...missingMaterials.map(item => item.id)]);
  for (const pack of missingPacks) for (const line of pack.materials) {
    if (line.materialId && !available.has(line.materialId)) throw new Error(`A material required by ${pack.name} is missing from the catalogue.`);
  }
  return structuredClone({ materials: missingMaterials, packs: missingPacks });
}

type ImportPlan = { materials: Material[]; packs: JobPack[] };
export async function importCataloguePlan(plan: ImportPlan, actions: {
  isCurrent: () => boolean; createMaterial: (item: Material) => unknown; createPack: (item: JobPack) => unknown;
  onProgress?: (materials: number, packs: number) => void;
}) {
  const result = { materials: 0, packs: 0, error: "" };
  const check = () => { if (!actions.isCurrent()) throw new Error("The account or catalogue changed. Import stopped; review the current library before retrying."); };
  try {
    for (const item of plan.materials) { check(); await actions.createMaterial(item); result.materials++; check(); actions.onProgress?.(result.materials, result.packs); }
    for (const item of plan.packs) { check(); await actions.createPack(item); result.packs++; check(); actions.onProgress?.(result.materials, result.packs); }
  } catch (error) { result.error = error instanceof Error ? error.message : "The catalogue could not be saved. Check storage and retry."; }
  return result;
}
