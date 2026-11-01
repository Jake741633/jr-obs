import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const runnerSource = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");
const integrationSource = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");
const anchor = "    // Customer payment links must resolve through the exact customer-visible";

const coverage = [
  '    const portalDeposit = source("portal-deposit-projection");',
  '    await expectAllowed(',
  '      await insertRecord(accounts.A.office, "cloud_collections", genericRecord(',
  '        organisationA, "jr-os-deposit-requirements", portalDeposit, accounts.A.office,',
  '        null, null, { pricingDocumentId: acceptedQuoteA, mode: "Percentage", value: 20, dueRule: "On acceptance", createdAt: "2026-08-14T09:15:00.000Z", updatedAt: "2026-08-14T09:15:00.000Z", internalNote: "PRIVATE DEPOSIT NOTE" },',
  '      )),',
  '      "Office should create a legacy unbound deposit requirement",',
  '    );',
  '    const customerRawDeposit = await listRecords(accounts.A.customer, "cloud_collections", `select=source_id,payload&collection_key=eq.jr-os-deposit-requirements&source_id=eq.${portalDeposit}`);',
  '    await expectAllowed(customerRawDeposit, "Customer raw deposit query should fail closed");',
  '    assert.deepEqual(customerRawDeposit.payload, [], "Customer must not read complete generic deposit rows");',
  '    const customerDeposit = await listRecords(accounts.A.customer, "customer_deposit_requirements", `select=source_id,payload,customer_source_id,job_source_id&collection_key=eq.jr-os-deposit-requirements&source_id=eq.${portalDeposit}`);',
  '    await expectAllowed(customerDeposit, "Customer deposit projection query should execute");',
  '    assert.equal(customerDeposit.payload.length, 1, "Accepted pricing should expose its deposit requirement");',
  '    assert.equal(customerDeposit.payload[0].customer_source_id, customerA, "Deposit projection customer scope must come from canonical pricing");',
  '    assert.equal(customerDeposit.payload[0].job_source_id, jobA, "Deposit projection job scope must come from canonical pricing");',
  '    assert.equal(customerDeposit.payload[0].payload.pricingDocumentId, acceptedQuoteA);',
  '    assert.equal(customerDeposit.payload[0].payload.internalNote, undefined, "Deposit projection must omit internal fields");',
  '    assert.equal(customerDeposit.payload[0].payload.customerId, undefined, "Deposit projection must not trust caller customer IDs");',
  '    const conflictingEnvelopeDeposit = source("portal-deposit-conflicting-envelope");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-deposit-requirements", conflictingEnvelopeDeposit, accounts.A.office, otherCustomerA, otherCustomerJobA, { pricingDocumentId: acceptedQuoteA, mode: "Fixed", value: 10, dueRule: "On acceptance" })), "Office may retain a conflicting deposit source for repair");',
  '    assert.deepEqual((await listRecords(accounts.A.customer, "customer_deposit_requirements", `select=source_id&source_id=eq.${conflictingEnvelopeDeposit}`)).payload, [], "Conflicting deposit envelopes must fail closed rather than rebind customers");',
  '    const otherCustomerDeposit = await listRecords(accounts.B.customer, "customer_deposit_requirements", `select=source_id&source_id=eq.${portalDeposit}`);',
  '    await expectAllowed(otherCustomerDeposit, "Cross-tenant deposit projection query should execute safely");',
  '    assert.deepEqual(otherCustomerDeposit.payload, [], "Another organisation must not read the customer deposit projection");',
  '    const acceptedOtherCustomerQuote = source("quote-a-other-customer-accepted-deposit");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "pricing_documents", typedRecord(organisationA, acceptedOtherCustomerQuote, otherCustomerA, otherCustomerJobA, { type: "Quote", status: "Accepted", number: "Q-SEC-OTHER-DEPOSIT", title: "Other customer accepted quote", items: [] })), "Office should create another customer accepted quote for deposit isolation");',
  '    const sameTenantOtherCustomerDeposit = source("portal-deposit-other-customer");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-deposit-requirements", sameTenantOtherCustomerDeposit, accounts.A.office, null, null, { pricingDocumentId: acceptedOtherCustomerQuote, mode: "Fixed", value: 25, dueRule: "On acceptance" })), "Office should create another customer deposit source");',
  '    assert.deepEqual((await listRecords(accounts.A.customer, "customer_deposit_requirements", `select=source_id&source_id=eq.${sameTenantOtherCustomerDeposit}`)).payload, [], "Another customer must not read the customer deposit projection");',
  '    const orphanDeposit = source("portal-deposit-orphan");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-deposit-requirements", orphanDeposit, accounts.A.office, null, null, { pricingDocumentId: source("missing-pricing"), mode: "Fixed", value: 25, dueRule: "On acceptance" })), "Office may retain an orphan deposit source for repair");',
  '    assert.deepEqual((await listRecords(accounts.A.customer, "customer_deposit_requirements", `select=source_id&source_id=eq.${orphanDeposit}`)).payload, [], "Orphan deposits must not enter the customer projection");',
  '    const malformedDeposit = source("portal-deposit-malformed");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-deposit-requirements", malformedDeposit, accounts.A.office, null, null, { pricingDocumentId: acceptedQuoteA, mode: "Percentage", value: "twenty", dueRule: "On acceptance" })), "Office may retain malformed legacy deposit data for repair");',
  '    assert.deepEqual((await listRecords(accounts.A.customer, "customer_deposit_requirements", `select=source_id&source_id=eq.${malformedDeposit}`)).payload, [], "Malformed deposits must not enter the customer projection");',
  '    await expectDeniedWithCode(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-deposit-requirements", source("portal-deposit-duplicate"), accounts.A.office, null, null, { pricingDocumentId: acceptedQuoteA, mode: "Fixed", value: 10, dueRule: "On acceptance" })), "23505", "A pricing document must not expose duplicate deposit requirements");',
  '',
  '    const pendingDeposit = source("portal-deposit-pending");',
  '    await expectAllowed(',
  '      await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-deposit-requirements", pendingDeposit, accounts.A.office, null, null, { pricingDocumentId: secondQuoteA, mode: "Fixed", value: 50, dueRule: "Specified date", dueDate: "2026-08-31" })),',
  '      "Office should create a deposit before customer acceptance",',
  '    );',
  '    assert.deepEqual((await listRecords(accounts.A.customer, "customer_deposit_requirements", `select=source_id&source_id=eq.${pendingDeposit}`)).payload, [], "Sent pricing must hide its deposit requirement");',
  '    await expectAllowed(await patchRecords(accounts.A.office, "pricing_documents", `source_id=eq.${secondQuoteA}`, { payload: { id: secondQuoteA, customerId: customerA, jobId: jobA, type: "Quote", status: "Accepted" } }), "Office should accept the pending-deposit quote");',
  '    assert.equal((await listRecords(accounts.A.customer, "customer_deposit_requirements", `select=source_id&source_id=eq.${pendingDeposit}`)).payload.length, 1, "Accepting pricing must reveal an existing safe deposit projection without rewriting its source");',
  '    await expectDenied(',
  '      await insertRecord(accounts.A.customer, "customer_deposit_requirements", { organisation_id: organisationA, collection_key: "jr-os-deposit-requirements", source_id: source("forged-deposit-projection"), customer_source_id: customerA, version: 1, payload: { id: "forged" }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),',
  '      "Customer must not write the deposit projection",',
  '    );',
  '    await expectAllowed(await patchRecords(accounts.A.owner, "cloud_collections", `source_id=eq.${portalDeposit}`, { deleted_at: new Date().toISOString() }), "Owner should tombstone the deposit source");',
  '    assert.deepEqual((await listRecords(accounts.A.customer, "customer_deposit_requirements", `select=source_id&source_id=eq.${portalDeposit}`)).payload, [], "Tombstoned deposits must leave the customer projection");',
  '    const rawPortalActivity = source("customer-raw-portal-activity");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-portal-activity", rawPortalActivity, accounts.A.office, customerA, jobA, { action: "Internal", detail: "PRIVATE ACTIVITY" })), "Office should retain portal audit activity");',
  '    assert.deepEqual((await listRecords(accounts.A.customer, "cloud_collections", `select=source_id&source_id=eq.${rawPortalActivity}`)).payload, [], "Customer must not read raw portal activity");',
  '',
].join("\n");

assert.equal(integrationSource.split(anchor).length - 1, 1, "Expected one payment-link anchor");
const patchedIntegration = integrationSource.replace(anchor, coverage + anchor);

for (const phrase of [
  "Customer must not read complete generic deposit rows",
  "Deposit projection customer scope must come from canonical pricing",
  "Deposit projection must omit internal fields",
  "Conflicting deposit envelopes must fail closed rather than rebind customers",
  "Another customer must not read the customer deposit projection",
  "Orphan deposits must not enter the customer projection",
  "Malformed deposits must not enter the customer projection",
  "A pricing document must not expose duplicate deposit requirements",
  "Sent pricing must hide its deposit requirement",
  "Accepting pricing must reveal an existing safe deposit projection without rewriting its source",
  "Customer must not write the deposit projection",
  "Tombstoned deposits must leave the customer projection",
  "Customer must not read raw portal activity",
  "Customer must not read complete generic payment-link rows",
  "Customer payment-link projection must omit internal provider labels",
]) {
  assert.match(patchedIntegration, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
}

test("live RLS runner proves customer portal finance uses safe projections only", () => {
  const directory = mkdtempSync(join(tmpdir(), "jr-os-customer-portal-finance-rls-"));
  try {
    const runner = join(directory, "run-supabase-rls.integration.mjs");
    const integration = join(directory, "supabase-rls.integration.mjs");
    writeFileSync(runner, runnerSource, "utf8");
    writeFileSync(integration, patchedIntegration, "utf8");
    const result = spawnSync(process.execPath, [runner], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
    if (result.error) throw result.error;
    assert.equal(result.status ?? 1, 0, "Customer portal finance live RLS wrapper should complete successfully");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
