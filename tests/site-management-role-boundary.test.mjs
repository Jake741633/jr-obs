import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";
import { canAccessPath } from "../lib/cloud/permissions.ts";

const siteManagement = readFileSync(new URL("../app/site-management/page.tsx", import.meta.url), "utf8");
const fieldDiary = readFileSync(new URL("../app/field/site-diary/page.tsx", import.meta.url), "utf8");
const jobReview = readFileSync(new URL("../app/ai/job-review/page.tsx", import.meta.url), "utf8");
const jobPage = readFileSync(new URL("../app/jobs/[id]/page.tsx", import.meta.url), "utf8");

test("site management exposes owner/admin-controlled operational mutations", () => {
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

test("site management remains restricted to the roles that already had broad workspace access", () => {
  assert.equal(canAccessPath("office", "/site-management"), false);
  assert.equal(canAccessPath("owner", "/site-management"), true);
  assert.equal(canAccessPath("admin", "/site-management"), true);
});

test("office job review routes document work to the permitted job folder", () => {
  assert.equal(canAccessPath("office", "/ai/job-review"), true);
  assert.equal(canAccessPath("office", "/site-management"), false);
  assert.equal(canAccessPath("office", "/jobs/job-1"), true);
  assert.deepEqual(
    collectionCloudMutationRoute("job_documents", "office", "jr-os-job-documents"),
    { kind: "direct" },
  );
  assert.match(jobReview, /const canOpenSiteManagement = unrestricted \|\| canAccessPath\(identity\?\.role, "\/site-management", identity\?\.email\)/);
  assert.match(jobReview, /href: canOpenSiteManagement \? "\/site-management" : `\/jobs\/\$\{selected\.id\}`/);
  assert.match(jobPage, /Documents and records/);
  assert.match(jobPage, /Save document/);
});
