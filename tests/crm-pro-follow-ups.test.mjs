import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const followUps = await readFile(new URL("../app/crm/follow-ups/page.tsx", import.meta.url), "utf8");
const crm = await readFile(new URL("../lib/crmPro.ts", import.meta.url), "utf8");
const navigation = await readFile(new URL("../components/navigation.ts", import.meta.url), "utf8");

test("follow-up centre surfaces every requested reason from live cloud collections", () => {
  for (const hook of ["useSalesLeadsCollection", "useLeadActivitiesCollection", "usePricingDocumentsCollection", "useCustomersCollection", "useCustomerProfilesCollection", "useCrmFollowUpSettingsCollection"]) assert.match(followUps, new RegExp(`${hook}\\(\\)`));
  for (const reason of ["Quote ageing", "No response", "Survey not booked", "Awaiting acceptance", "Lost opportunity"]) assert.match(followUps, new RegExp(reason));
  assert.match(followUps, /buildFollowUpCentre/);
});

test("AI contact recommendations explain their ranking signals", () => {
  assert.match(followUps, /Who to contact today/);
  assert.match(followUps, /priorityScore/);
  assert.match(followUps, /day\$\{item\.ageDays/);
  assert.match(followUps, /opportunity/);
  assert.match(followUps, /contact details missing/);
});

test("follow-up actions are mobile friendly and write back to CRM history", () => {
  assert.match(followUps, /Mark contacted and log/);
  assert.match(followUps, /interactions\.setItems/);
  assert.match(followUps, /leadActivities\.setItems/);
  assert.match(followUps, /nextFollowUpDate/);
  assert.match(followUps, /min-h-12/);
  assert.match(followUps, /tel:/);
  assert.match(followUps, /sms:/);
  assert.match(followUps, /mailto:/);
});

test("future snoozes and completed lost-opportunity contact suppress premature resurfacing", () => {
  assert.match(crm, /quote\.nextFollowUpDate && quote\.nextFollowUpDate > today/);
  assert.match(crm, /!lead\.lostFollowUpCompletedAt/);
  assert.match(followUps, /lostFollowUpCompletedAt:/);
  assert.match(followUps, /function postpone/);
});

test("follow-up centre is reachable from mobile and desktop workspace navigation", () => {
  assert.match(navigation, /\["Follow-up Centre", "\/crm\/follow-ups"\]/);
});
