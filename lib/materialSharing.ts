import type { Material } from "./models";

export type ShareableMaterial = Pick<Material, "name" | "supplier" | "stockCode" | "supplierUrl">;

/** Validate locally only; a product link never requires a supplier/network lookup. */
export function safeMaterialProductUrl(value: unknown): string {
  if (typeof value !== "string" || /[\p{Cc}\p{Cf}\u2028\u2029]/u.test(value)) return "";
  const link = value.trim();
  if (!/^https?:\/\/[^/]/i.test(link) || /\s|\\|%(?:0[0-9a-f]|1[0-9a-f]|7f)|%(?![0-9a-f]{2})/i.test(link)) return "";
  const authority = link.split("/")[2];
  if (!authority || authority.includes("@")) return "";
  try {
    const url = new URL(link);
    return ["https:", "http:"].includes(url.protocol) && url.hostname && !url.username && !url.password ? link : "";
  } catch {
    return "";
  }
}

function visibleText(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, "").trim() : "";
}

/** Deliberate allowlist: never spread a record containing prices or private notes. */
export function materialShareDetails(material: ShareableMaterial) {
  const name = visibleText(material.name);
  const supplier = visibleText(material.supplier);
  const stockCode = visibleText(material.stockCode);
  const supplierUrl = safeMaterialProductUrl(material.supplierUrl);
  const text = [name, supplier && `Supplier: ${supplier}`, stockCode && `Code: ${stockCode}`, supplierUrl].filter(Boolean).join("\n");
  return { name, supplier, stockCode, supplierUrl, text };
}
