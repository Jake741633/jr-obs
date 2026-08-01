import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function routeExists(href) {
  const pathname = href.split(/[?#]/, 1)[0];
  if (pathname === "/") {
    await access(path.join(root, "app", "page.tsx"));
    return true;
  }
  const routePath = pathname.replace(/^\//, "");
  try {
    await access(path.join(root, "app", routePath, "page.tsx"));
    return true;
  } catch {
    return false;
  }
}

test("estimates list and detail routes exist", async () => {
  assert.equal(await routeExists("/estimates"), true);
  await access(path.join(root, "app", "estimates", "[id]", "page.tsx"));
  const detail = await readFile(path.join(root, "app", "estimates", "[id]", "page.tsx"), "utf8");
  assert.match(detail, /redirect\(`\/quotes\/\$\{encodeURIComponent\(id\)\}`\)/);
});

test("all static navigation destinations have an app route", async () => {
  const source = await readFile(path.join(root, "components", "navigation.ts"), "utf8");
  const hrefs = new Set([
    ...[...source.matchAll(/href:\s*"([^"]+)"/g)].map((match) => match[1]),
    ...[...source.matchAll(/\["[^"]+",\s*"([^"]+)"\]/g)].map((match) => match[1]),
  ]);
  const missing = [];
  for (const href of hrefs) {
    if (!await routeExists(href)) missing.push(href);
  }
  assert.deepEqual(missing, [], `Navigation routes without pages: ${missing.join(", ")}`);
});
