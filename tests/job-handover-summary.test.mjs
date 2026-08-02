import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/jobHandoverSummary.ts", import.meta.url), "utf8");

test("job handover summary maps operational evidence into readiness inputs", () => {
  assert.match(source, /testing:\s*evidence\.testingComplete \? 100 : 0/);
  assert.match(source, /certificates:\s*evidence\.certificateIssued \? 100 : 0/);
  assert.match(source, /materials:\s*evidence\.materialsComplete \? 100 : 0/);
  assert.match(source, /outstandingTasks:\s*evidence\.outstandingTasks/);
  assert.match(source, /outstandingSnags:\s*evidence\.outstandingSnags/);
  assert.match(source, /failedQa:\s*evidence\.failedQa/);
  assert.match(source, /pendingQa:\s*evidence\.pendingQa/);
  assert.match(source, /requiredDocumentsMissing:\s*evidence\.requiredDocumentsMissing/);
});

test("job handover summary preserves the card status literal contract", () => {
  assert.match(source, /status:\s*summary\.ready \? "Ready for handover" : "Handover blocked"/);
  assert.match(source, /blockers:\s*summary\.blockers/);
  assert.match(source, /blockerCount:\s*summary\.blockerCount/);
});

test("job handover summary remains page and storage agnostic", () => {
  assert.doesNotMatch(source, /next\/navigation|useParams|localStorage|sessionStorage|useLocalStorageCollection|useCloudCollection/);
});
