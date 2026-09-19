import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canAccessPath } from "../lib/cloud/permissions.ts";

const stockPage = readFileSync(new URL("../app/stock/page.tsx", import.meta.url), "utf8");
const purchasesPage = readFileSync(new URL("../app/purchases/page.tsx", import.meta.url), "utf8");
const fieldMaterialsPage = readFileSync(new URL("../app/field/materials/page.tsx", import.meta.url), "utf8");

test("stock and purchase pages expose mutation-heavy procurement controls", () => {
  assert.match(stockPage, /stock\.setItems/);
  assert.match(stockPage, /movements\.setItems/);
  assert.match(purchasesPage, /purchaseLists\.setItems/);
  assert.match(purchasesPage, /updateItem\(/);
});

test("electricians use the field materials workspace instead of office procurement pages", () => {
  assert.equal(canAccessPath("electrician", "/stock"), false);
  assert.equal(canAccessPath("electrician", "/purchases"), false);
  assert.equal(canAccessPath("electrician", "/field/materials"), true);
  assert.match(fieldMaterialsPage, /Materials & Stock/);
});

test("office roles retain stock and purchase access", () => {
  assert.equal(canAccessPath("office", "/stock"), true);
  assert.equal(canAccessPath("office", "/purchases"), true);
  assert.equal(canAccessPath("owner", "/stock"), true);
  assert.equal(canAccessPath("admin", "/purchases"), true);
});
