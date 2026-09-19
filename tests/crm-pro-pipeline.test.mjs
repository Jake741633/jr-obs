import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pipeline = await readFile(new URL("../app/leads/page.tsx", import.meta.url), "utf8");
const quotes = await readFile(new URL("../app/quotes/page.tsx", import.meta.url), "utf8");

test("sales pipeline uses cloud collections and preserves all requested stages", () => {
  assert.match(pipeline, /useSalesLeadsCollection\(\)/);
  assert.match(pipeline, /useLeadActivitiesCollection\(\)/);
  assert.match(pipeline, /const stages: readonly LeadStage\[\] = crmLeadStages/);
  assert.match(pipeline, /normaliseLeadStage\(lead\.stage\)/);
});

test("desktop pipeline supports drag and drop between stages", () => {
  assert.match(pipeline, /aria-label="Desktop sales pipeline"/);
  assert.match(pipeline, /draggable onDragStart=/);
  assert.match(pipeline, /onDragOver=/);
  assert.match(pipeline, /onDrop=\{\(\) => dropInto\(stage\)\}/);
  assert.match(pipeline, /data-pipeline-stage=\{stage\}/);
});

test("mobile pipeline supports deliberate horizontal swipe and accessible stage controls", () => {
  assert.match(pipeline, /aria-label="Mobile sales pipeline"/);
  assert.match(pipeline, /onTouchStart=/);
  assert.match(pipeline, /onTouchEnd=/);
  assert.match(pipeline, /Math\.abs\(horizontal\) >= 64/);
  assert.match(pipeline, /Mobile swipe/);
  assert.match(pipeline, /Previous lead stage/);
  assert.match(pipeline, /Next lead stage/);
});

test("pipeline exposes conversion builder and win-loss reporting", () => {
  for (const label of ["Lead win rate", "Builder opportunities", "Win / loss reporting", "Recorded loss reasons", "Quote pipeline"]) assert.match(pipeline, new RegExp(label));
  assert.match(pipeline, /lostReason:/);
  assert.match(pipeline, /cancelledReason:/);
});

test("linked builder opportunities can prefill the existing quote builder", () => {
  assert.match(pipeline, /builderId=\$\{encodeURIComponent\(lead\.builderId\)\}/);
  assert.match(quotes, /parameters\.get\("builderId"\)/);
  assert.match(quotes, /builderId: builder\?\.id \|\| ""/);
});
