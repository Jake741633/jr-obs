export const supplierNames = ["CEF", "Screwfix", "TLC Direct"] as const;
export type SupplierName = typeof supplierNames[number];
export interface SupplierLookupResult {
  supplier: SupplierName;
  stockCode: string;
  name?: string;
  manufacturer?: string;
  productUrl?: string;
  searchUrl: string;
  exactMatch: boolean;
  message: string;
}

const origins: Record<SupplierName, readonly string[]> = {
  CEF: ["https://cef.co.uk", "https://www.cef.co.uk"],
  Screwfix: ["https://screwfix.com", "https://www.screwfix.com"],
  "TLC Direct": ["https://tlc-direct.co.uk", "https://www.tlc-direct.co.uk"],
};

function safeLink(value: unknown, supplier: SupplierName): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return !url.username && !url.password && origins[supplier].includes(url.origin);
  } catch { return false; }
}

/** Accept only a result for this submitted lookup; never turn a stale response into a new answer. */
export function supplierLookupResult(value: unknown, supplier: SupplierName, stockCode: string): SupplierLookupResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The supplier response could not be checked. Try the lookup again.");
  const result = value as Record<string, unknown>;
  if (result.supplier !== supplier || result.stockCode !== stockCode || typeof result.exactMatch !== "boolean" || typeof result.message !== "string"
    || !safeLink(result.searchUrl, supplier) || (result.productUrl !== undefined && !safeLink(result.productUrl, supplier))
    || (result.name !== undefined && typeof result.name !== "string") || (result.manufacturer !== undefined && typeof result.manufacturer !== "string")) {
    throw new Error("The supplier response does not match this lookup or has an invalid link. Try again.");
  }
  return { supplier, stockCode, exactMatch: result.exactMatch, message: result.message, searchUrl: result.searchUrl,
    ...(typeof result.productUrl === "string" ? { productUrl: result.productUrl } : {}),
    ...(typeof result.name === "string" ? { name: result.name } : {}),
    ...(typeof result.manufacturer === "string" ? { manufacturer: result.manufacturer } : {}) };
}
