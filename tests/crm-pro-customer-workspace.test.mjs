import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const customerPage = await readFile(new URL("../app/customers/[id]/page.tsx", import.meta.url), "utf8");
const quickActions = await readFile(new URL("../components/crm/CustomerQuickActions.tsx", import.meta.url), "utf8");
const crmPage = await readFile(new URL("../app/crm/page.tsx", import.meta.url), "utf8");
const quotesPage = await readFile(new URL("../app/quotes/page.tsx", import.meta.url), "utf8");
const invoicesPage = await readFile(new URL("../app/invoices/page.tsx", import.meta.url), "utf8");
const plannerPage = await readFile(new URL("../app/planner/page.tsx", import.meta.url), "utf8");

test("customer workspace uses the unified cloud-aware CRM record set", () => {
  assert.match(customerPage, /buildCustomerTimeline/);
  assert.match(customerPage, /buildCustomerIntelligence/);
  for (const hook of [
    "useCustomersCollection",
    "usePricingDocumentsCollection",
    "useJobsCollection",
    "useInvoicesCollection",
    "usePaymentsCollection",
    "useCertificatesCollection",
    "useJobDocumentsCollection",
    "useCustomerInteractionsCollection",
    "useAiRemindersCollection",
  ]) {
    assert.match(customerPage, new RegExp(`${hook}\\(\\)`));
  }
  for (const label of ["Total spend", "Outstanding", "Lifetime value", "Payment speed", "Repeat score", "Last job", "Last quote", "Builder relationship", "Referral source", "Review status"]) {
    assert.match(customerPage, new RegExp(label));
  }
});

test("mobile quick action dock exposes all ten requested customer actions", () => {
  for (const label of ["Call", "Text", "Email", "Navigate", "Invoice", "Quote", "Book survey", "Book work", "Complete", "Review"]) {
    assert.match(quickActions, new RegExp(`label=\\"${label}\\"`));
  }
  assert.match(quickActions, /env\(safe-area-inset-bottom\)/);
  assert.match(quickActions, /min-h-14/);
  assert.match(quickActions, /\/invoices\?\$\{query\}/);
  assert.match(quickActions, /\/quotes\?\$\{query\}/);
  assert.match(quickActions, /\/planner\?\$\{query\}&type=Survey/);
});

test("quick-create destinations accept and persist the linked customer", () => {
  for (const source of [quotesPage, invoicesPage, plannerPage]) {
    assert.match(source, /new URLSearchParams\(window\.location\.search\)/);
    assert.match(source, /parameters\.get\("customerId"\)/);
    assert.match(source, /parameters\.get\("action"\) === "create"/);
  }
  assert.match(plannerPage, /customerId: form\.customerId \|\| undefined/);
  assert.match(plannerPage, /customerId: customer\?\.id \|\| job\?\.customerId/);
});

test("CRM care settings record referral and builder relationship context", () => {
  assert.match(crmPage, /Referral source/);
  assert.match(crmPage, /Builder relationship/);
  assert.match(crmPage, /Full CRM timeline/);
  assert.match(crmPage, /"Call", "Text", "Email"/);
});
