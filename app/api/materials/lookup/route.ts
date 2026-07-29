import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SupplierKey = "CEF" | "Screwfix" | "TLC Direct";

type ProductResult = {
  supplier: SupplierKey;
  stockCode: string;
  name?: string;
  manufacturer?: string;
  productUrl?: string;
  publicPrice?: number;
  searchUrl: string;
  exactMatch: boolean;
  message: string;
};

const supplierSearch: Record<SupplierKey, (code: string) => string> = {
  CEF: (code) => `https://www.cef.co.uk/search?q=${encodeURIComponent(code)}`,
  Screwfix: (code) => `https://www.screwfix.com/search?search=${encodeURIComponent(code)}`,
  "TLC Direct": (code) => `https://www.tlc-direct.co.uk/Search?query=${encodeURIComponent(code)}`,
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function collectJsonLd(html: string) {
  const values: unknown[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const parsed = JSON.parse(match[1]);
      values.push(parsed);
    } catch {
      // Ignore malformed supplier metadata and continue to the next block.
    }
  }
  return values;
}

function flatten(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const children = [record["@graph"], record.itemListElement, record.item].flatMap(flatten);
  return [record, ...children];
}

function productFromJsonLd(html: string, stockCode: string) {
  const normalisedCode = stockCode.replace(/\s+/g, "").toLowerCase();
  const records = collectJsonLd(html).flatMap(flatten);
  const products = records.filter((record) => {
    const type = text(record["@type"]).toLowerCase();
    return type === "product" || type === "listitem";
  });

  const exact = products.find((record) => {
    const codes = [record.sku, record.mpn, record.productID, record.identifier]
      .map(text)
      .map((item) => item.replace(/\s+/g, "").toLowerCase());
    return codes.includes(normalisedCode);
  });
  const candidate = exact ?? products[0];
  if (!candidate) return null;

  const item = candidate.item && typeof candidate.item === "object"
    ? candidate.item as Record<string, unknown>
    : candidate;
  const offers = item.offers && typeof item.offers === "object"
    ? item.offers as Record<string, unknown>
    : undefined;
  const brand = item.brand && typeof item.brand === "object"
    ? text((item.brand as Record<string, unknown>).name)
    : text(item.brand);

  return {
    name: text(item.name),
    manufacturer: brand || text(item.manufacturer),
    productUrl: text(item.url),
    publicPrice: numberValue(offers?.price),
    exactMatch: Boolean(exact),
  };
}

export async function POST(request: Request) {
  let body: { supplier?: string; stockCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid lookup request." }, { status: 400 });
  }

  const supplier = text(body.supplier) as SupplierKey;
  const stockCode = text(body.stockCode);
  if (!Object.hasOwn(supplierSearch, supplier)) {
    return NextResponse.json({ error: "Choose CEF, Screwfix or TLC Direct." }, { status: 400 });
  }
  if (!stockCode || stockCode.length > 80) {
    return NextResponse.json({ error: "Enter a valid supplier stock code." }, { status: 400 });
  }

  const searchUrl = supplierSearch[supplier](stockCode);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(searchUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; JR-OS-Material-Lookup/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) throw new Error(`Supplier returned ${response.status}`);
    const html = await response.text();
    const product = productFromJsonLd(html, stockCode);
    const result: ProductResult = {
      supplier,
      stockCode,
      searchUrl,
      exactMatch: product?.exactMatch ?? false,
      name: product?.name,
      manufacturer: product?.manufacturer,
      productUrl: product?.productUrl || response.url || searchUrl,
      publicPrice: product?.publicPrice,
      message: product?.name
        ? "Product details found. Confirm the item and your account-specific trade price before saving."
        : "An exact product could not be read automatically. Open the supplier results and confirm the item manually.",
    };
    return NextResponse.json(result);
  } catch {
    const result: ProductResult = {
      supplier,
      stockCode,
      searchUrl,
      exactMatch: false,
      message: "The supplier blocked or did not return machine-readable details. Open the supplier search result to confirm the product.",
    };
    return NextResponse.json(result);
  } finally {
    clearTimeout(timeout);
  }
}
