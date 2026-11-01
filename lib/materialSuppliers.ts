import type { Material, MaterialSupplierOption } from "./models";
import { safeMaterialProductUrl } from "./materialSharing";

export const maxMaterialSupplierOptions = 10;
type PreferredSupplier = Pick<Material, "supplier" | "stockCode" | "supplierUrl">;
type SupplierMaterial = PreferredSupplier & Pick<Partial<Material>, "supplierOptions">;
const controls = /[\p{Cc}\p{Cf}\u2028\u2029]/u;

function displayText(value: unknown, limit: number) {
  if (typeof value !== "string" || value.length > limit) return "";
  return value.replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, "").trim();
}
function reference(value: PreferredSupplier): PreferredSupplier {
  return { supplier: displayText(value.supplier, 100), stockCode: displayText(value.stockCode, 128),
    supplierUrl: typeof value.supplierUrl === "string" && value.supplierUrl.length <= 2048 ? safeMaterialProductUrl(value.supplierUrl) : "" };
}
function referenceKey(value: PreferredSupplier) {
  return `${value.supplier.toLowerCase()}|${value.stockCode ? `code:${value.stockCode.toLowerCase()}` : `url:${value.supplierUrl}`}`;
}

/** Keep malformed saved metadata outside editable rows until explicitly replaced. */
export function materialSupplierDraft(value: unknown): { options: MaterialSupplierOption[]; needsReview: boolean } {
  if (value === undefined) return { options: [], needsReview: false };
  if (!Array.isArray(value) || value.length > maxMaterialSupplierOptions || value.some(item => !item || typeof item !== "object" || Array.isArray(item)
    || ["id", "supplier", "stockCode", "supplierUrl"].some(field => typeof item[field] !== "string"))) return { options: [], needsReview: true };
  return { options: value.map(item => ({ id: item.id, supplier: item.supplier, stockCode: item.stockCode, supplierUrl: item.supplierUrl })), needsReview: false };
}

/** Whitelist public product fields; never project buying prices or private notes. */
export function materialSupplierReferences(material: SupplierMaterial): MaterialSupplierOption[] {
  const preferred = reference(material);
  const result: MaterialSupplierOption[] = Object.values(preferred).some(Boolean) ? [{ id: "preferred", ...preferred }] : [];
  const raw = Array.isArray(material.supplierOptions) ? material.supplierOptions : [];
  const identities = new Map<string, number>();
  for (const item of raw) if (item && typeof item.id === "string") identities.set(item.id, (identities.get(item.id) ?? 0) + 1);
  const keys = new Set(result.map(referenceKey));
  for (const item of raw.slice(0, maxMaterialSupplierOptions)) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id.trim() || item.id === "preferred" || controls.test(item.id) || identities.get(item.id) !== 1) continue;
    const product = reference(item);
    if (!product.supplier || (!product.stockCode && !product.supplierUrl) || keys.has(referenceKey(product))) continue;
    result.push({ id: item.id, ...product }); keys.add(referenceKey(product));
  }
  return result;
}

/** Validate a reviewed form. Empty new rows carry no product and are omitted. */
export function normaliseMaterialSupplierOptions(value: unknown, preferred?: PreferredSupplier): MaterialSupplierOption[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxMaterialSupplierOptions) throw new Error(`Use a list of no more than ${maxMaterialSupplierOptions} additional wholesalers.`);
  const ids = new Set<string>();
  const keys = new Set<string>();
  if (preferred && (preferred.stockCode.trim() || preferred.supplierUrl.trim())) keys.add(referenceKey(reference(preferred)));
  const result: MaterialSupplierOption[] = [];
  for (const [index, item] of value.entries()) {
    const label = `Wholesaler ${index + 1}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`${label} needs valid supplier details.`);
    if (typeof item.id !== "string" || !item.id.trim() || item.id.length > 128 || item.id === "preferred" || controls.test(item.id) || ids.has(item.id)) throw new Error(`${label} has a missing or duplicate identity. Remove that row and add it again.`);
    ids.add(item.id);
    for (const [field, limit] of [["supplier", 100], ["stockCode", 128], ["supplierUrl", 2048]] as const) {
      if (typeof item[field] !== "string" || item[field].length > limit || controls.test(item[field])) throw new Error(`${label}: check the supplier name, code and product link lengths and remove control characters.`);
    }
    const supplier = item.supplier.trim(), stockCode = item.stockCode.trim(), rawUrl = item.supplierUrl.trim();
    if (!supplier && !stockCode && !rawUrl) continue;
    const supplierUrl = safeMaterialProductUrl(rawUrl);
    if (rawUrl && !supplierUrl) throw new Error(`${label} needs a valid http:// or https:// product link without credentials.`);
    if (!supplier || (!stockCode && !supplierUrl)) throw new Error(`${label} needs a supplier name and a stock code or product link.`);
    const product = { supplier, stockCode, supplierUrl };
    if (keys.has(referenceKey(product))) throw new Error(`${label} repeats a supplier/code or product link already entered. Keep one reference for that item.`);
    keys.add(referenceKey(product)); result.push({ id: item.id, ...product });
  }
  return result;
}

/** Swap references only. The caller retains and explicitly reviews its price inputs. */
export function promoteMaterialSupplier(preferred: PreferredSupplier, options: MaterialSupplierOption[], id: string) {
  if (options.filter(item => item.id === id).length !== 1) throw new Error("Choose one current wholesaler to use as preferred.");
  const selected = normaliseMaterialSupplierOptions(options.filter(item => item.id === id))[0];
  if (!selected) throw new Error("Enter the wholesaler's code or product link before choosing it.");
  const previous = { supplier: preferred.supplier, stockCode: preferred.stockCode, supplierUrl: preferred.supplierUrl };
  const keepPrevious = Object.values(previous).some(value => value.trim());
  return { supplier: selected.supplier, stockCode: selected.stockCode, supplierUrl: selected.supplierUrl,
    supplierOptions: options.flatMap(item => item.id === id ? keepPrevious ? [{ id: item.id, ...previous }] : [] : [{ ...item }]) };
}
