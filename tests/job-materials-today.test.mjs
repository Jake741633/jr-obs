import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

import { buildJobMaterialUsage, materialsTodaySummary, materialsUsedToday } from "../lib/jobMaterialsToday-core.mjs";

test("builds a stable job material usage record from stock usage", () => {
  const record = buildJobMaterialUsage({
    stockItem: { id: "stock-1", materialId: "mat-1", description: "2.5mm T&E", unit: "Metre", unitCost: 1.25 },
    material: { id: "mat-1", supplier: "CEF" },
    quantity: 12,
    jobId: "job-1",
    note: "Kitchen sockets",
    usageId: "usage-1",
    now: "2026-08-02T09:00:00.000Z",
  });
  assert.equal(record.id, "usage-1");
  assert.equal(record.jobId, "job-1");
  assert.equal(record.materialId, "mat-1");
  assert.equal(record.quantity, 12);
  assert.equal(record.unitCost, 1.25);
  assert.equal(record.supplier, "CEF");
});

test("materials used today filters and totals job-linked usage", () => {
  const records = [
    { id: "a", jobId: "job-1", usedAt: "2026-08-02T10:00:00.000Z", quantity: 2, unitCost: 5 },
    { id: "b", jobId: "job-2", usedAt: "2026-08-02T08:00:00.000Z", quantity: 3, unitCost: 4 },
    { id: "c", jobId: "job-1", usedAt: "2026-08-01T08:00:00.000Z", quantity: 99, unitCost: 99 },
  ];
  assert.deepEqual(materialsUsedToday(records, "2026-08-02").map((item) => item.id), ["a", "b"]);
  assert.deepEqual(materialsTodaySummary(records, "2026-08-02"), { lines: 2, quantity: 5, cost: 22, jobs: 2 });
});

test("mobile materials uses cloud-aware collections and writes job material usage", () => {
  const page = fs.readFileSync(new URL("../app/field/materials/page.tsx", import.meta.url), "utf8");
  assert.match(page, /useJobMaterialUsageCollection/);
  assert.match(page, /buildJobMaterialUsage/);
  assert.doesNotMatch(page, /useLocalStorageCollection/);
  assert.match(page, /Materials used today/);
});
