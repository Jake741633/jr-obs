import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const models = await readFile(new URL("../lib/models.ts", import.meta.url), "utf8");
const workflow = await readFile(new URL("../components/quotes/FixedPriceWorkflowCard.tsx", import.meta.url), "utf8");
const builder = await readFile(new URL("../app/quotes/page.tsx", import.meta.url), "utf8");
const conversion = await readFile(new URL("../lib/workflow.ts", import.meta.url), "utf8");
const preview = await readFile(new URL("../components/quotes/QuotePreview.tsx", import.meta.url), "utf8");

test("fixed-price assessment context is stored with quotes and revisions", () => {
  assert.match(models, /FixedPriceWorkflowType/);
  assert.match(models, /fixedPriceWorkflow\?: FixedPriceWorkflow/);
  assert.match(builder, /fixedPriceWorkflow/);
  assert.match(builder, /exclusions: form\.exclusions/);
  assert.match(builder, /internalNotes: form\.internalNotes/);
});

test("workflow encourages fault finding through quote job and invoice", () => {
  assert.match(workflow, /Initial visit/);
  assert.match(workflow, /Fault finding/);
  assert.match(workflow, /Recommend works/);
  assert.match(workflow, /Fixed-price quotation/);
  assert.match(workflow, /Convert to Job/);
  assert.match(workflow, /Invoice from completed Job/);
});

test("accepted quote conversion preserves assessment and private context", () => {
  assert.match(conversion, /fixedPriceWorkflow: document\.fixedPriceWorkflow/);
  assert.match(conversion, /exclusions: document\.exclusions/);
  assert.match(conversion, /internalNotes: document\.internalNotes/);
});

test("customer preview shows optional exclusions without exposing internal notes", () => {
  assert.match(preview, /Optional exclusions/);
  assert.doesNotMatch(preview, /Internal quote notes/);
});
