import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canAccessPath } from "../lib/cloud/permissions.ts";
import { buildMobileJobReadiness } from "../lib/mobileJobControl-core.mjs";

const fieldJobPage = readFileSync(new URL("../app/field/jobs/page.tsx", import.meta.url), "utf8");

function readiness(overrides = {}) {
  return buildMobileJobReadiness({
    hasSchedule: false,
    hasContact: false,
    hasMaterials: false,
    hasTesting: false,
    jobHref: "/jobs/job-1",
    ...overrides,
  });
}

test("field readiness contains only electrician-permitted actions", () => {
  const result = readiness();
  assert.deepEqual(result.checks.map((check) => check.id), ["schedule", "contact", "materials", "testing"]);
  for (const check of result.checks) assert.equal(canAccessPath("electrician", check.href), true, `${check.href} must be electrician-permitted`);
  assert.deepEqual(result.blockers.map((check) => check.id), ["schedule", "contact", "materials", "testing"]);
  assert.equal(result.totalCount, 4);
  assert.equal(result.percentage, 0);
});

test("field readiness does not depend on office pricing, RAMS or certificate data", () => {
  const result = readiness({ hasSchedule: true, hasContact: true, hasMaterials: true, hasTesting: true });
  assert.equal(result.percentage, 100);
  assert.equal(result.blockers.length, 0);
  for (const forbidden of ["pricing", "rams", "certificate"]) {
    assert.equal(result.checks.some((check) => check.id.includes(forbidden)), false);
  }
});

test("mobile job control does not load or link office-only readiness surfaces", () => {
  assert.doesNotMatch(fieldJobPage, /usePricingDocumentsCollection/);
  assert.doesNotMatch(fieldJobPage, /useRamsCollection/);
  assert.doesNotMatch(fieldJobPage, /useCertificatesCollection/);
  assert.doesNotMatch(fieldJobPage, /href=\{customer \? `\/customers/);
  assert.doesNotMatch(fieldJobPage, /"\/customers"/);
  assert.doesNotMatch(fieldJobPage, /"\/quotes"/);
  assert.doesNotMatch(fieldJobPage, /"\/rams"/);
  assert.match(fieldJobPage, /jobHref: `\/jobs\/\$\{job\.id\}`/);
  assert.match(fieldJobPage, /<p>Material lists<\/p>/);
});
