import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";

const jobPage = readFileSync(new URL("../app/jobs/[id]/page.tsx", import.meta.url), "utf8");

function section(startText, endText) {
  const start = jobPage.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = jobPage.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return jobPage.slice(start, end);
}

test("field invoice and variation mutations remain default-deny while plain timeline notes are allowed", () => {
  assert.deepEqual(
    collectionCloudMutationRoute("invoices", "electrician", "jr-os-invoices"),
    { kind: "deny" },
  );
  assert.deepEqual(
    collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-job-variations"),
    { kind: "deny" },
  );
  assert.deepEqual(
    collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-job-timeline"),
    {
      kind: "rpc",
      functionName: "jr_field_save_collection",
      resource: "cloud_collections",
      allowedIntents: ["create"],
    },
  );
});

test("cloud roles without finance authority fail closed before every invoice side effect", () => {
  const handler = section("function generateInvoice()", "\n\n  return <div");
  const guard = handler.indexOf("if (financeRestricted)");
  const guardReturn = handler.indexOf("return;", guard);
  assert.ok(guard >= 0 && guardReturn > guard, "invoice handler must return from the finance guard");
  assert.match(handler.slice(guard, guardReturn), /setInvoiceMessage\(financeHandoffMessage\)/);

  for (const sideEffect of [
    "createInvoiceFromCompletedJob",
    "invoices.setItems",
    "variations.setItems",
    "timeline.setItems",
  ]) {
    assert.ok(handler.indexOf(sideEffect) > guardReturn, `${sideEffect} must remain behind the finance guard`);
  }
});

test("field job detail shows an office handoff instead of an invoice action", () => {
  assert.match(jobPage, /useCloudIdentity\(\)/);
  assert.match(jobPage, /canEditFinance\(identityState\.identity\?\.role\)/);
  assert.match(jobPage, /identityState\.mode !== "local" && !canEditFinance/);
  assert.match(jobPage, /const isReady = identityState\.isReady &&/);
  assert.match(
    jobPage,
    /Job completion is ready for office review\. Final invoice creation is restricted to office roles\./,
  );
  assert.match(
    jobPage,
    /financeRestricted \? <p[^>]*>\{financeHandoffMessage\}<\/p> : linkedInvoices\.length \? <Link[^>]*href="\/invoices"[\s\S]*: <Button[^>]*onClick=\{generateInvoice\}>/,
  );
  assert.match(jobPage, /!financeRestricted && job\.status !== "Complete"/);
});

test("office and local job workflows retain canonical invoice generation", () => {
  assert.match(jobPage, /identityState\.mode !== "local"/);
  assert.match(jobPage, /invoices\.setItems\(\(current\) => \[generated\.invoice, \.\.\.current\]\)/);
  assert.match(jobPage, /variations\.setItems\(\(current\) => current\.map/);
  assert.match(jobPage, /timeline\.setItems\(\(current\) =>/);
  assert.match(jobPage, /Generate invoice/);
  assert.match(jobPage, /created as a draft and linked to this job and its source quote/);
});
