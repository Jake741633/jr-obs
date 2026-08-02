import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const jobDetailPage = readFileSync(new URL("../app/jobs/[id]/page.tsx", import.meta.url), "utf8");

test("job detail page protects long records inside responsive layouts", () => {
  assert.match(jobDetailPage, /flex\s+flex-wrap\s+items-start\s+justify-between/);
  assert.match(jobDetailPage, /min-w-0\s+flex-1/);
  assert.match(jobDetailPage, /whitespace-pre-wrap/);
  assert.match(jobDetailPage, /shrink-0/);
});

test("job detail workflow actions remain touch friendly and able to wrap on phones", () => {
  const wrappingActionRows = jobDetailPage.match(/flex\s+flex-wrap\s+items-end\s+justify-between\s+gap-3/g) ?? [];
  assert.ok(wrappingActionRows.length >= 3, "workflow, document and timeline action rows should wrap safely on phones");
  assert.match(jobDetailPage, /min-h-11/);
});

test("job detail forms use shared mobile-safe fields and accessible direct controls", () => {
  assert.match(jobDetailPage, /InputField,\s*TextareaField/);
  const directTouchControls = jobDetailPage.match(/min-h-11/g) ?? [];
  assert.ok(directTouchControls.length >= 3, "selects, file inputs and actions should retain accessible touch height");
  assert.match(jobDetailPage, /w-full|md:grid-cols-2/);
});

test("job detail cards avoid cramped fixed columns on phones", () => {
  assert.match(jobDetailPage, /grid\s+gap-4\s+sm:grid-cols-3/);
  assert.match(jobDetailPage, /grid\s+gap-4\s+md:grid-cols-2/);
  assert.match(jobDetailPage, /flex\s+flex-col\s+gap-4\s+md:flex-row/);
});
