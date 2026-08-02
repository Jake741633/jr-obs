import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const jobsPage = readFileSync(new URL("../app/jobs/page.tsx", import.meta.url), "utf8");

test("jobs page keeps phone actions above the mobile navigation", () => {
  assert.match(jobsPage, /fixed\s+inset-x-4\s+bottom-\[calc\(5rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(jobsPage, /pb-24\s+sm:pb-0/);
});

test("job creation and filters remain full width and touch friendly on phones", () => {
  assert.match(jobsPage, /w-full\s+sm:w-auto/);
  assert.match(jobsPage, /text-base\s+sm:text-sm/);
  assert.match(jobsPage, /min-h-12/);
});

test("job cards protect long site and title content from mobile overflow", () => {
  assert.match(jobsPage, /min-w-0/);
  assert.match(jobsPage, /break-words/);
  assert.match(jobsPage, /max-w-full/);
});

test("job card actions retain accessible minimum touch targets", () => {
  const touchTargets = jobsPage.match(/min-h-11\s+min-w-11/g) ?? [];
  assert.ok(touchTargets.length >= 3, "view, edit and delete actions should each retain 44px touch targets");
});
