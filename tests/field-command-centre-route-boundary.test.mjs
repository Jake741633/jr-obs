import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canAccessPath, roleLandingPath } from "../lib/cloud/permissions.ts";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";

const commandCentre = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const accessGuard = readFileSync(new URL("../components/CloudAccessGuard.tsx", import.meta.url), "utf8");
const mobileNavigation = readFileSync(new URL("../components/MobileNav.tsx", import.meta.url), "utf8");

test("the command centre exposes office finance and unsupported reminder mutations", () => {
  assert.match(commandCentre, /usePricingDocumentsCollection\(\)/);
  assert.match(commandCentre, /useInvoicesCollection\(\)/);
  assert.match(commandCentre, /FinanceDirectorInsights/);
  assert.match(commandCentre, /PaymentControlDashboard/);
  assert.match(commandCentre, /reminders\.setItems/);
  assert.match(commandCentre, /Reminder saved/);
  assert.match(commandCentre, /Reminder updated/);
  assert.deepEqual(
    collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-ai-reminders"),
    { kind: "deny" },
  );
});

test("electricians use the dedicated field landing page instead of the owner command centre", () => {
  assert.equal(canAccessPath("electrician", "/"), false);
  assert.equal(canAccessPath("electrician", "/field"), true);
  assert.equal(canAccessPath("electrician", "/field/site-diary"), true);
  assert.equal(roleLandingPath("electrician"), "/field");
  assert.match(accessGuard, /href=\{roleLandingPath\(identity\.role\)\}/);
});

test("field mobile navigation replaces the owner home link with the field workspace", () => {
  assert.match(mobileNavigation, /identity\?\.role === "electrician"/);
  assert.match(mobileNavigation, /item\.href === "\/" \? \{ \.\.\.item, label: "Field", href: "\/field" \}/);
  assert.match(mobileNavigation, /navigation\.length === 3 \? "grid-cols-3"/);
});

test("office roles retain the command centre and role-appropriate landing pages", () => {
  for (const role of ["owner", "admin", "office"]) assert.equal(canAccessPath(role, "/"), true);
  assert.equal(roleLandingPath("owner"), "/");
  assert.equal(roleLandingPath("office"), "/");
  assert.equal(roleLandingPath("customer"), "/customer-portal");
});
