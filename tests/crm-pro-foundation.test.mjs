import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  crmLeadStages,
  followUpPriority,
  moveLeadStage,
  normaliseLeadStage,
  repeatCustomerScore,
} from "../lib/crmPro-core.mjs";
import { tenantListQuery } from "../lib/cloud/repository-core.mjs";

const crmSource = await readFile(new URL("../lib/crmPro.ts", import.meta.url), "utf8");
const collectionsSource = await readFile(new URL("../lib/cloud/coreBusinessCollections.ts", import.meta.url), "utf8");

test("CRM Pro exposes the complete ten-stage sales pipeline", () => {
  assert.deepEqual(crmLeadStages, [
    "New Lead",
    "Contacted",
    "Survey Booked",
    "Survey Complete",
    "Quote Sent",
    "Follow-up Due",
    "Accepted",
    "Lost",
    "Completed",
    "Cancelled",
  ]);
  assert.equal(normaliseLeadStage("New enquiry"), "New Lead");
  assert.equal(normaliseLeadStage("Quote required"), "Survey Complete");
  assert.equal(normaliseLeadStage("Won"), "Accepted");
  assert.equal(moveLeadStage("Survey Booked", 1), "Survey Complete");
  assert.equal(moveLeadStage("New Lead", -1), "New Lead");
});

test("repeat and follow-up scoring are bounded and reward stronger evidence", () => {
  const newCustomer = repeatCustomerScore({ completedJobs: 0 });
  const repeatCustomer = repeatCustomerScore({ completedJobs: 3, acceptedQuotes: 2, paidInvoices: 2, interactions: 5, reviewReceived: true });
  assert.equal(newCustomer, 0);
  assert.equal(repeatCustomer, 100);
  const ordinary = followUpPriority({ ageDays: 2, estimatedValue: 200, priority: "Normal" });
  const urgent = followUpPriority({ ageDays: 8, estimatedValue: 4_000, priority: "Urgent", overdue: true });
  assert.ok(urgent > ordinary);
  assert.ok(urgent <= 100);
});

test("customer timeline unifies every requested CRM record type newest first", () => {
  for (const kind of ["Enquiry", "Quote", "Estimate", "Job", "Variation", "Invoice", "Payment", "Certificate", "Photo", "Note", "Email", "Phone call", "AI activity"]) {
    assert.match(crmSource, new RegExp(`\\| \\"${kind.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\"`));
  }
  assert.match(crmSource, /timeline\.toSorted\(\(left, right\) => right\.occurredAt\.localeCompare\(left\.occurredAt\)\)/);
});

test("CRM Pro collections use the existing cloud and offline adapter", () => {
  for (const hook of ["useCustomerProfilesCollection", "useCustomerInteractionsCollection", "useSalesLeadsCollection", "useLeadActivitiesCollection", "useJobVariationsCollection", "useAiRemindersCollection", "useCrmFollowUpSettingsCollection"]) {
    assert.match(collectionsSource, new RegExp(`export function ${hook}\\(\\) \\{ return useCloudLocalCollection`));
  }
  assert.match(crmSource, /jr-os-crm-follow-up-settings/);
  const organisationA = tenantListQuery({ organisationId: "org-a", collectionKey: "jr-os-customer-interactions" });
  const organisationB = tenantListQuery({ organisationId: "org-b", collectionKey: "jr-os-customer-interactions" });
  assert.match(organisationA, /organisation_id=eq\.org-a/);
  assert.match(organisationA, /collection_key=eq\.jr-os-customer-interactions/);
  assert.notEqual(organisationA, organisationB);
});
