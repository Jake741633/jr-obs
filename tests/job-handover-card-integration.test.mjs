import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cardSource = readFileSync(new URL("../components/jobs/HandoverReadinessCard.tsx", import.meta.url), "utf8");
const progressCoreSource = readFileSync(new URL("../lib/jobProgress-core.mjs", import.meta.url), "utf8");

test("handover card exposes the shared readiness contract", () => {
  for (const requiredField of ["ready", "status", "blockers", "blockerCount"]) {
    assert.match(cardSource, new RegExp(`\\b${requiredField}\\b`));
  }
});

test("handover readiness helper returns the card contract", () => {
  assert.match(progressCoreSource, /export function jobHandoverReadiness/);
  assert.match(progressCoreSource, /Ready for handover/);
  assert.match(progressCoreSource, /Handover blocked/);
  assert.match(progressCoreSource, /blockerCount/);
  assert.match(progressCoreSource, /blockers/);
});

test("handover card remains reusable and page-agnostic", () => {
  assert.doesNotMatch(cardSource, /useParams|useRouter|useLocalStorageCollection|useCloudLocalCollection/);
  assert.match(cardSource, /interface HandoverReadinessCardProps/);
  assert.match(cardSource, /readiness: HandoverReadinessSummary/);
});
