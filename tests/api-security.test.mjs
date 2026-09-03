import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const apiRoot = fileURLToPath(new URL("../app/api", import.meta.url));
const lookupRoutePath = fileURLToPath(new URL("../app/api/materials/lookup/route.ts", import.meta.url));
const lookupRoute = readFileSync(lookupRoutePath, "utf8");
const materialsPage = readFileSync(new URL("../app/materials/page.tsx", import.meta.url), "utf8");
const supabaseClient = readFileSync(new URL("../lib/supabase/client.ts", import.meta.url), "utf8");

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

test("supplier lookup accepts no request-controlled organisation selector", () => {
  assert.match(lookupRoute, /let body: unknown;/);
  assert.match(lookupRoute, /if \(!plainRecord\(body\)\)/);
  assert.doesNotMatch(lookupRoute, /organisation_id|organisationId/);
  assert.match(lookupRoute, /\/rest\/v1\/profiles\?id=eq\.\$\{encodeURIComponent\(userId\)\}&active=eq\.true&select=role,active&limit=1/);
});

test("supplier lookup rejects cross-origin production calls", () => {
  assert.match(lookupRoute, /request\.headers\.get\("origin"\)/);
  assert.match(lookupRoute, /process\.env\.NODE_ENV !== "production"/);
  assert.match(lookupRoute, /new URL\(origin\)\.origin === new URL\(request\.url\)\.origin/);
  assert.match(lookupRoute, /Cross-origin supplier lookups are not allowed/);
});

test("supplier lookup authenticates an active permitted profile before supplier access", () => {
  assert.match(lookupRoute, /\/auth\/v1\/user/);
  assert.match(lookupRoute, /active=eq\.true&select=role,active&limit=1/);
  assert.match(lookupRoute, /new Set\(\["owner", "admin", "office", "electrician"\]\)/);
  assert.match(lookupRoute, /Sign in before using supplier lookups/);
  assert.match(lookupRoute, /Supplier lookups are not permitted for this account/);
  assert.match(lookupRoute, /Supplier lookup authentication is temporarily unavailable/);
  const accessCheck = lookupRoute.indexOf("const access = await materialLookupAccess(request);");
  const bodyRead = lookupRoute.indexOf("body = await request.json();");
  const supplierFetch = lookupRoute.indexOf("const response = await fetchSupplierPage(searchUrl, supplier, controller.signal);");
  assert.ok(accessCheck >= 0 && bodyRead > accessCheck, "Authentication must complete before request payload processing");
  assert.ok(supplierFetch > bodyRead, "Supplier network access must remain behind authentication and validation");
});

test("supplier lookup uses explicit validated bearer authority without duplicating the session into cookies", () => {
  assert.match(materialsPage, /import \{ readSupabaseSession \} from "\.\.\/\.\.\/lib\/supabase\/client"/);
  assert.match(materialsPage, /const session = readSupabaseSession\(\);/);
  assert.match(materialsPage, /if \(!session \|\| session\.is_password_recovery\)/);
  assert.match(materialsPage, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(lookupRoute, /request\.headers\.get\("authorization"\)/);
  assert.match(lookupRoute, /\^Bearer\\s\+\(\.\+\)\$\/i/);
  assert.doesNotMatch(lookupRoute, /request\.headers\.get\("cookie"\)|materialLookupSessionCookie/);
  assert.doesNotMatch(supabaseClient, /materialLookupSessionCookie|document\.cookie/);
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
