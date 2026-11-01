import type { JobPack, Material } from "./models";
import { hasSavedIdentity, savedIdentityIndex } from "./assistantIdentity";
import { materialSupplierReferences } from "./materialSuppliers";
import { materialShareDetails, type ShareableMaterial } from "./materialSharing";

function matches(query: string, values: unknown[]) {
  const haystack = values.filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
  return query.toLowerCase().trim().split(/\s+/).every(word => haystack.includes(word));
}

export function quoteDraftMaterialChoices(materials: readonly Material[], query: string): Material[] {
  return savedIdentityIndex(materials).selectable.filter(material => typeof material.name === "string" && material.name.trim()
    && matches(query, [material.name, material.manufacturer, material.category, material.unit,
      ...materialSupplierReferences(material).flatMap(source => [source.supplier, source.stockCode, source.supplierUrl])]))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
}

export function quoteDraftPackChoices(packs: readonly JobPack[], query: string): JobPack[] {
  return savedIdentityIndex(packs).selectable.filter(pack => typeof pack.name === "string" && pack.name.trim()
    && matches(query, [pack.name, pack.category, pack.description, pack.labourDescription,
      ...(Array.isArray(pack.materials) ? pack.materials.map(line => line && typeof line === "object" ? line.description : undefined) : [])]))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
}

/** Product fields only. Choosing a quote reference never reprices or changes a saved material. */
export function quoteDraftMaterialProduct(material: Material, referenceId: string): ShareableMaterial {
  if (!hasSavedIdentity(material.id) || typeof material.name !== "string" || !material.name.trim()) throw new Error("Choose a named material with a valid identity.");
  const reference = referenceId === "preferred" ? material : materialSupplierReferences(material).find(source => source.id === referenceId);
  if (!reference) throw new Error("That wholesaler reference is missing or ambiguous. Choose a current reference again.");
  const { name, supplier, stockCode, supplierUrl } = materialShareDetails({ name: material.name, supplier: reference.supplier, stockCode: reference.stockCode, supplierUrl: reference.supplierUrl });
  return { name, supplier, stockCode, supplierUrl };
}
