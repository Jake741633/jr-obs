import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const runnerSource = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");
const integrationSource = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");

const anchor = '    const secondQuoteA = source("quote-a-second-sent");';

const pricingStatusCoverage = [
  '    const statusQuoteA = source("quote-a-status-transition");',
  '    const draftStatusPayload = {',
  '      type: "Quote",',
  '      status: "Draft",',
  '      number: "Q-SEC-STATUS",',
  '      title: "Internal status-transition draft",',
  '      items: [{ id: source("quote-line-status"), description: "Status work", quantity: 1, unitPrice: 75, unitCost: 5 }],',
  '      profitability: { expectedProfit: 70 },',
  '      internalNotes: "Never customer visible",',
  '    };',
  '    await expectAllowed(',
  '      await insertRecord(accounts.A.office, "pricing_documents", typedRecord(organisationA, statusQuoteA, customerA, jobA, draftStatusPayload)),',
  '      "Office should create a Draft quote for status visibility testing",',
  '    );',
  '',
  '    const hiddenDraftPricing = await listRecords(accounts.A.customer, "customer_pricing_documents", `select=source_id,payload&source_id=eq.${statusQuoteA}`);',
  '    await expectAllowed(hiddenDraftPricing, "Customer Draft pricing projection query should execute safely");',
  '    assert.deepEqual(hiddenDraftPricing.payload, [], "Draft pricing must not appear in the customer projection");',
  '',
  '    await expectAllowed(',
  '      await patchRecords(accounts.A.office, "pricing_documents", `source_id=eq.${statusQuoteA}`, { payload: { ...draftStatusPayload, status: "Sent" } }),',
  '      "Office should send the status visibility quote",',
  '    );',
  '    const visibleSentPricing = await listRecords(accounts.A.customer, "customer_pricing_documents", `select=source_id,payload&source_id=eq.${statusQuoteA}`);',
  '    await expectAllowed(visibleSentPricing, "Customer Sent pricing projection query should execute");',
  '    assert.equal(visibleSentPricing.payload.length, 1, "Sent pricing should enter the customer projection");',
  '    assert.equal(visibleSentPricing.payload[0].payload.status, "Sent");',
  '    assert.equal(visibleSentPricing.payload[0].payload.profitability, undefined, "Status projection must retain staff-only redaction");',
  '    assert.equal(visibleSentPricing.payload[0].payload.internalNotes, undefined);',
  '    assert.equal(visibleSentPricing.payload[0].payload.items[0].unitCost, undefined);',
  '',
  '    await expectAllowed(',
  '      await patchRecords(accounts.A.office, "pricing_documents", `source_id=eq.${statusQuoteA}`, { payload: draftStatusPayload }),',
  '      "Office should return the status visibility quote to Draft",',
  '    );',
  '    const hiddenRevertedDraft = await listRecords(accounts.A.customer, "customer_pricing_documents", `select=source_id&source_id=eq.${statusQuoteA}`);',
  '    await expectAllowed(hiddenRevertedDraft, "Customer reverted Draft projection query should execute safely");',
  '    assert.deepEqual(hiddenRevertedDraft.payload, [], "Returning pricing to Draft must remove the customer projection row");',
  '',
  '    await expectAllowed(',
  '      await patchRecords(accounts.A.office, "pricing_documents", `source_id=eq.${statusQuoteA}`, { payload: { ...draftStatusPayload, status: "Accepted" } }),',
  '      "Office should record the final accepted status visibility quote",',
  '    );',
  '    const visibleAcceptedPricing = await listRecords(accounts.A.customer, "customer_pricing_documents", `select=source_id,payload&source_id=eq.${statusQuoteA}`);',
  '    await expectAllowed(visibleAcceptedPricing, "Customer Accepted pricing projection query should execute");',
  '    assert.equal(visibleAcceptedPricing.payload.length, 1, "Accepted pricing should remain customer visible");',
  '    assert.equal(visibleAcceptedPricing.payload[0].payload.status, "Accepted");',
  '',
].join("\n");

assert.equal(integrationSource.split(anchor).length - 1, 1, "Expected one pricing status anchor in the live RLS integration test");
const patchedIntegration = integrationSource.replace(anchor, pricingStatusCoverage + anchor);

for (const phrase of [
  "Draft pricing must not appear in the customer projection",
  "Sent pricing should enter the customer projection",
  "Status projection must retain staff-only redaction",
  "Returning pricing to Draft must remove the customer projection row",
  "Accepted pricing should remain customer visible",
]) {
  assert.match(patchedIntegration, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
}

test("live RLS runner proves customer pricing follows visible document statuses", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "jr-os-customer-pricing-status-rls-"));
  const temporaryRunner = join(temporaryDirectory, "run-supabase-rls.integration.mjs");
  const temporaryIntegration = join(temporaryDirectory, "supabase-rls.integration.mjs");
  try {
    writeFileSync(temporaryRunner, runnerSource, "utf8");
    writeFileSync(temporaryIntegration, patchedIntegration, "utf8");
    const result = spawnSync(process.execPath, [temporaryRunner], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    assert.equal(result.status ?? 1, 0, "Customer pricing status live RLS wrapper should complete successfully");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
