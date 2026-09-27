import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const builderPage = await readFile(new URL("../app/builders/[id]/page.tsx", import.meta.url), "utf8");
const builderList = await readFile(new URL("../app/builders/page.tsx", import.meta.url), "utf8");
const quickActions = await readFile(new URL("../components/crm/BuilderQuickActions.tsx", import.meta.url), "utf8");
const crm = await readFile(new URL("../lib/crmPro.ts", import.meta.url), "utf8");

test("builder CRM calculates all requested relationship signals from cloud collections", () => {
  for (const hook of ["useBuildersCollection", "useJobsCollection", "usePricingDocumentsCollection", "useInvoicesCollection", "usePaymentsCollection", "useSalesLeadsCollection"]) assert.match(builderPage, new RegExp(`${hook}\\(\\)`));
  assert.match(builderPage, /buildBuilderCrmIntelligence/);
  for (const label of ["Active jobs", "Completed jobs", "Revenue received", "Average project", "Payment history", "Repeat work", "Referral opportunities", "Upcoming projects"]) assert.match(builderPage, new RegExp(label));
  assert.match(builderList, /useBuildersCollection\(\)/);
});

test("closed and lost opportunities are excluded from builder referrals", () => {
  assert.match(crm, /referralOpportunities = linkedLeads\.filter\(\(lead\) => lead\.source === "Builder" && !terminal\.has/);
});

test("builder quick actions are one-handed and preserve the relationship link", () => {
  for (const label of ["Call", "Text", "Email", "Navigate", "Quote", "Opportunity"]) assert.match(quickActions, new RegExp(`label="${label}"`));
  assert.match(quickActions, /env\(safe-area-inset-bottom\)/);
  assert.match(quickActions, /builderId=\$\{builderId\}/);
  assert.match(quickActions, /source=Builder/);
  assert.match(quickActions, /min-h-14/);
});
