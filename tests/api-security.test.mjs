import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const apiRoot = fileURLToPath(new URL("../app/api", import.meta.url));
const lookupRoutePath = fileURLToPath(new URL("../app/api/materials/lookup/route.ts", import.meta.url));
const lookupRoute = readFileSync(lookupRoutePath, "utf8");

function listRouteFiles(directory, prefix = "") {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = `${directory}/${entry}`;
    const relativePath = prefix ? `${prefix}/${entry}` : entry;
    return statSync(absolutePath).isDirectory()
      ? listRouteFiles(absolutePath, relativePath)
      : entry === "route.ts"
        ? [relativePath]
        : [];
  });
}

test("server API route inventory stays explicit for security review", () => {
  assert.deepEqual(listRouteFiles(apiRoot).sort(), ["materials/lookup/route.ts"]);
});

test("supplier lookup remains tenant-neutral and accepts no organisation selector", () => {
  assert.match(lookupRoute, /let body: \{ supplier\?: string; stockCode\?: string \}/);
  assert.doesNotMatch(lookupRoute, /organisation_id|organisationId|supabaseFetch|\/rest\/v1|\.from\(/);
});

test("supplier lookup rejects cross-origin production calls", () => {
  assert.match(lookupRoute, /request\.headers\.get\("origin"\)/);
  assert.match(lookupRoute, /process\.env\.NODE_ENV !== "production"/);
  assert.match(lookupRoute, /new URL\(origin\)\.origin === new URL\(request\.url\)\.origin/);
  assert.match(lookupRoute, /Cross-origin supplier lookups are not allowed/);
});

test("supplier fetches and returned links stay on audited HTTPS hosts", () => {
  assert.match(lookupRoute, /redirect: "manual"/);
  assert.match(lookupRoute, /url\.protocol === "https:"/);
  assert.match(lookupRoute, /supplierHosts\[supplier\]\.has\(url\.hostname\.toLowerCase\(\)\)/);
  assert.match(lookupRoute, /unsafe redirect/);
  assert.match(lookupRoute, /allowedSupplierUrl\(product\.productUrl, supplier, finalSupplierUrl\)/);
});

test("supplier stock codes are encoded into fixed audited search URLs", () => {
  assert.match(lookupRoute, /cef\.co\.uk\/search\?q=\$\{encodeURIComponent\(code\)\}/);
  assert.match(lookupRoute, /screwfix\.com\/search\?search=\$\{encodeURIComponent\(code\)\}/);
  assert.match(lookupRoute, /tlc-direct\.co\.uk\/Search\?query=\$\{encodeURIComponent\(code\)\}/);
  assert.match(lookupRoute, /stockCode\.length > 80/);
});
