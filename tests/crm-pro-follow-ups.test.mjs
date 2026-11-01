import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const followUps = await readFile(new URL("../app/crm/follow-ups/page.tsx", import.meta.url), "utf8");
const crm = await readFile(new URL("../lib/crmPro.ts", import.meta.url), "utf8");
const actions = await readFile(new URL("../components/crm/FollowUpActions.tsx", import.meta.url), "utf8");
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
  assert.match(followUps, /Log contact/);
  assert.match(actions, /store\.createItem/);
  assert.match(actions, /current\.leads\.updateItem/);
  assert.match(actions, /nextFollowUpDate/);
  assert.doesNotMatch(actions + followUps, /\.setItems/);
  assert.match(followUps, /min-h-12/);
  assert.match(followUps, /contactPhoneHref/);
  assert.match(followUps, /sms:/);
  assert.match(followUps, /contactEmailHref/);
});

test("future snoozes and completed lost-opportunity contact suppress premature resurfacing", () => {
  assert.match(crm, /scheduled && quote\.nextFollowUpDate! > today/);
  assert.match(crm, /!lead\.lostFollowUpCompletedAt/);
  assert.match(actions, /lostFollowUpCompletedAt:/);
  assert.match(followUps, /actions\.openPostpone/);
});

test("follow-up centre is reachable from mobile and desktop workspace navigation", () => {
  assert.match(navigation, /\["Follow-up Centre", "\/crm\/follow-ups"\]/);
});
