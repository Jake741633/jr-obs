import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const jobDetailPage = readFileSync(new URL("../app/jobs/[id]/page.tsx", import.meta.url), "utf8");

test("job detail page protects long titles addresses and notes on phones", () => {
  assert.match(jobDetailPage, /break-words/);
  assert.match(jobDetailPage, /min-w-0/);
  assert.match(jobDetailPage, /whitespace-pre-wrap/);
});

test("job detail page stacks workflow and folder actions into full-width mobile controls", () => {
  const responsiveActions = jobDetailPage.match(/w-full\s+sm:w-auto/g) ?? [];
  assert.ok(responsiveActions.length >= 3, "workflow, document and timeline actions should stack full width on phones");
});

test("job detail forms retain iPhone-safe text and touch sizes", () => {
  assert.match(jobDetailPage, /text-base\s+sm:text-sm/);
  assert.match(jobDetailPage, /min-h-12/);
});

test("job detail cards avoid cramped side-by-side rows on phones", () => {
  assert.match(jobDetailPage, /flex-col\s+gap-3\s+sm:flex-row/);
  assert.match(jobDetailPage, /grid\s+gap-3\s+sm:grid-cols-3/);
});
