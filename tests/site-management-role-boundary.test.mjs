import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canAccessPath } from "../lib/cloud/permissions.ts";

const siteManagement = readFileSync(new URL("../app/site-management/page.tsx", import.meta.url), "utf8");
const fieldDiary = readFileSync(new URL("../app/field/site-diary/page.tsx", import.meta.url), "utf8");

test("site management remains office-facing because it exposes office-controlled mutations", () => {
  assert.match(siteManagement, /useJobVariationsCollection\(\)/);
  assert.match(siteManagement, /useInvoicesCollection\(\)/);
  assert.match(siteManagement, /useJobDocumentsCollection\(\)/);
  assert.match(siteManagement, /variations\.setItems/);
  assert.match(siteManagement, /invoices\.setItems/);
  assert.match(siteManagement, /documents\.setItems/);
});

test("electricians cannot open site management but retain dedicated field workflows", () => {
  assert.equal(canAccessPath("electrician", "/site-management"), false);
  assert.equal(canAccessPath("electrician", "/field"), true);
  assert.equal(canAccessPath("electrician", "/field/site-diary"), true);
  assert.match(fieldDiary, /useSiteDiariesCollection\(\)/);
});

test("office roles retain operational site-management access", () => {
  assert.equal(canAccessPath("office", "/site-management"), false);
  assert.equal(canAccessPath("owner", "/site-management"), true);
  assert.equal(canAccessPath("admin", "/site-management"), true);
});
