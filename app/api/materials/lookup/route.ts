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

const supplierHosts: Record<SupplierKey, ReadonlySet<string>> = {
  CEF: new Set(["cef.co.uk", "www.cef.co.uk"]),
  Screwfix: new Set(["screwfix.com", "www.screwfix.com"]),
  "TLC Direct": new Set(["tlc-direct.co.uk", "www.tlc-direct.co.uk"]),
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function sameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function allowedSupplierUrl(value: string, supplier: SupplierKey, baseUrl?: string) {
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "https:" && supplierHosts[supplier].has(url.hostname.toLowerCase())
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

async function fetchSupplierPage(searchUrl: string, supplier: SupplierKey, signal: AbortSignal) {
  let currentUrl = searchUrl;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      cache: "no-store",
      redirect: "manual",
      signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; JR-OS-Material-Lookup/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    const nextUrl = location ? allowedSupplierUrl(location, supplier, currentUrl) : null;
    if (!nextUrl) throw new Error("Supplier returned an unsafe redirect.");
    currentUrl = nextUrl;
  }
  throw new Error("Supplier returned too many redirects.");
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
  if (!sameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin supplier lookups are not allowed." }, { status: 403 });
  }

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
    const response = await fetchSupplierPage(searchUrl, supplier, controller.signal);
    if (!response.ok) throw new Error(`Supplier returned ${response.status}`);
    const html = await response.text();
    const product = productFromJsonLd(html, stockCode);
    const finalSupplierUrl = allowedSupplierUrl(response.url, supplier) || searchUrl;
    const result: ProductResult = {
      supplier,
      stockCode,
      searchUrl,
      exactMatch: product?.exactMatch ?? false,
      name: product?.name,
      manufacturer: product?.manufacturer,
      productUrl: product?.productUrl
        ? allowedSupplierUrl(product.productUrl, supplier, finalSupplierUrl) || finalSupplierUrl
        : finalSupplierUrl,
      publicPrice: product?.publicPrice,
      message: product?.name
        ? "Product details found. Confirm the item and your account-specific trade price before saving."
        : "An exact product could not be read automatically. Open the supplier results and confirm the item manually.",
    };
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    const result: ProductResult = {
      supplier,
      stockCode,
      searchUrl,
      exactMatch: false,
      message: "The supplier blocked or did not return machine-readable details. Open the supplier search result to confirm the product.",
    };
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } finally {
    clearTimeout(timeout);
  }
}
