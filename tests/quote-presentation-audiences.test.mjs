import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const helper = await readFile(new URL("../lib/quotePresentation.ts", import.meta.url), "utf8");
const preview = await readFile(new URL("../components/quotes/QuotePreview.tsx", import.meta.url), "utf8");
const detail = await readFile(new URL("../app/quotes/[id]/page.tsx", import.meta.url), "utf8");
const overrides = await readFile(new URL("../app/quotes/presentation/overrides/page.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("per-quote presentation stores Customer Internal and Engineer profiles", () => {
  assert.match(helper, /QuotePresentationAudience = "Customer" \| "Internal" \| "Engineer"/);
  assert.match(helper, /profiles\?: Partial<Record<QuotePresentationAudience, QuotePresentationSettings>>/);
  assert.match(overrides, /quotePresentationAudiences\.map/);
  assert.match(overrides, /profiles: \{ \.\.\.\(selectedOverride\?\.profiles/);
});

test("customer defaults hide every internal commercial detail", () => {
  assert.match(helper, /showCostPrices: false/);
  assert.match(helper, /showOverheads: false/);
  assert.match(helper, /showMarkup: false/);
  assert.match(helper, /showInternalNotes: false/);
  assert.match(helper, /showLineTotals: false/);
});

test("internal and engineer versions use purpose-built presentation defaults", () => {
  assert.match(helper, /internalQuotePresentationSettings/);
  assert.match(helper, /engineerQuotePresentationSettings/);
  assert.match(preview, /Internal commercial summary/);
  assert.match(preview, /Internal notes/);
  assert.match(preview, /data-quote-audience=\{audience\}/);
});

test("saved quote page previews and prints each audience version", () => {
  assert.match(detail, /PDF-ready document versions/);
  assert.match(detail, /quotePresentationAudiences\.map/);
  assert.match(detail, /Print \/ save PDF/);
  assert.match(detail, /audience=\{activeAudience\}/);
  assert.match(styles, /body\.quote-printing \[data-quote-print-root\]/);
});
