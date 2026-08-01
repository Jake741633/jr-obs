import assert from "node:assert/strict";
import test from "node:test";

import {
  assertBusinessOnboardingAvailable,
  buildBusinessOnboarding,
  canCreateBusinessAccount,
  linkAcceptedStaffInvite,
} from "../lib/cloud/businessOnboarding.mjs";

const now = "2026-08-01T22:45:00.000Z";

test("builds an active business and owner profile together", () => {
  const result = buildBusinessOnboarding({
    organisationId: " org-1 ",
    businessName: " JR Electrical Services ",
    ownerUserId: " owner-1 ",
    ownerEmail: " Jake@Example.com ",
    now,
  });

  assert.deepEqual(result.organisation, {
    id: "org-1",
    name: "JR Electrical Services",
    ownerUserId: "owner-1",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  assert.deepEqual(result.ownerProfile, {
    id: "owner-1",
    userId: "owner-1",
    email: "jake@example.com",
    organisationId: "org-1",
    role: "owner",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
});

test("rejects incomplete or invalid business onboarding input", () => {
  assert.throws(() => buildBusinessOnboarding({ businessName: "JR" }), /Organisation ID is required/);
  assert.throws(() => buildBusinessOnboarding({ organisationId: "org-1" }), /Business name is required/);
  assert.throws(() => buildBusinessOnboarding({ organisationId: "org-1", businessName: "JR" }), /Owner account is required/);
  assert.throws(() => buildBusinessOnboarding({ organisationId: "org-1", businessName: "JR", ownerUserId: "owner-1", ownerEmail: "invalid" }), /valid owner email/);
});

test("prevents an existing organisation member creating another business", () => {
  assert.equal(canCreateBusinessAccount(null), true);
  assert.equal(canCreateBusinessAccount({ id: "user-1" }), true);
  assert.equal(canCreateBusinessAccount({ organisationId: "org-1" }), false);
  assert.equal(canCreateBusinessAccount({ organisation_id: "org-1" }), false);
  assert.equal(assertBusinessOnboardingAvailable(null), true);
  assert.throws(() => assertBusinessOnboardingAvailable({ organisationId: "org-1" }), /already belongs/);
});

test("links a pending staff invite to the matching signed-in account", () => {
  const invite = {
    id: "invite-1",
    organisationId: "org-1",
    email: " Staff@Example.com ",
    role: "electrician",
    status: "pending",
    invitedBy: "owner-1",
    invitedAt: "2026-08-01T20:00:00.000Z",
  };
  const original = structuredClone(invite);
  const result = linkAcceptedStaffInvite(invite, "user-2", "staff@example.com", now);

  assert.deepEqual(result.invite, {
    ...invite,
    status: "accepted",
    userId: "user-2",
    acceptedAt: now,
  });
  assert.deepEqual(result.profile, {
    id: "user-2",
    userId: "user-2",
    email: "staff@example.com",
    organisationId: "org-1",
    role: "electrician",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  assert.deepEqual(invite, original);
});

test("supports Supabase organisation ids but rejects unsafe invite linking", () => {
  const invite = {
    organisation_id: "org-2",
    email: "office@example.com",
    role: "office",
    status: "pending",
  };
  assert.equal(linkAcceptedStaffInvite(invite, "user-3", "OFFICE@example.com", now).profile.organisationId, "org-2");
  assert.throws(() => linkAcceptedStaffInvite({ ...invite, status: "accepted" }, "user-3", "office@example.com", now), /Only pending/);
  assert.throws(() => linkAcceptedStaffInvite(invite, "", "office@example.com", now), /User account is required/);
  assert.throws(() => linkAcceptedStaffInvite(invite, "user-3", "other@example.com", now), /does not match/);
  assert.throws(() => linkAcceptedStaffInvite({ ...invite, organisation_id: "" }, "user-3", "office@example.com", now), /not linked to a business/);
});
