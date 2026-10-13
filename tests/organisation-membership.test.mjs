import assert from "node:assert/strict";
import test from "node:test";

import {
  assertOrganisationAccess,
  canManageOrganisationMember,
  canReadOrganisationRecord,
  filterOrganisationRecords,
  findPendingInviteForAccount,
  hasDuplicatePendingInvite,
  isActiveOrganisationMember,
} from "../lib/cloud/organisationMembership.mjs";

const owner = {
  id: "owner-1",
  organisationId: "org-1",
  role: "owner",
  status: "active",
};

const admin = {
  id: "admin-1",
  organisation_id: "org-1",
  role: "admin",
  status: "active",
};

const office = {
  id: "office-1",
  organisationId: "org-1",
  role: "office",
  status: "active",
};

const electrician = {
  id: "electrician-1",
  organisationId: "org-1",
  role: "electrician",
  status: "active",
};

test("recognises only active members of the requested organisation", () => {
  assert.equal(isActiveOrganisationMember(owner, "org-1"), true);
  assert.equal(isActiveOrganisationMember(admin, "org-1"), true);
  assert.equal(isActiveOrganisationMember(owner, "org-2"), false);
  assert.equal(isActiveOrganisationMember({ ...office, status: "suspended" }, "org-1"), false);
  assert.equal(isActiveOrganisationMember({ ...office, role: "unknown" }, "org-1"), false);
  assert.equal(isActiveOrganisationMember(null, "org-1"), false);
});

test("requires an explicit active membership state and user identity", () => {
  assert.equal(isActiveOrganisationMember({ ...office, status: undefined }, "org-1"), false);
  assert.equal(isActiveOrganisationMember({ ...office, status: "revoked" }, "org-1"), false);
  assert.equal(isActiveOrganisationMember({ ...office, status: undefined, active: false }, "org-1"), false);
  assert.equal(isActiveOrganisationMember({ ...office, status: undefined, active: true }, "org-1"), true);
  assert.equal(isActiveOrganisationMember({ ...office, active: false }, "org-1"), false);
  assert.equal(isActiveOrganisationMember({ ...office, id: "", status: "active" }, "org-1"), false);
});

test("asserts organisation access without mutating the profile", () => {
  const source = structuredClone(owner);
  assert.equal(assertOrganisationAccess(owner, "org-1"), owner);
  assert.deepEqual(owner, source);
  assert.throws(() => assertOrganisationAccess(owner, "org-2"), /does not have active access/);
});

test("filters records to the signed-in organisation", () => {
  const records = [
    { id: "customer-1", organisationId: "org-1" },
    { id: "customer-2", organisation_id: "org-2" },
    { id: "customer-3" },
  ];

  assert.equal(canReadOrganisationRecord(owner, records[0]), true);
  assert.equal(canReadOrganisationRecord(owner, records[1]), false);
  assert.deepEqual(filterOrganisationRecords(owner, records).map((record) => record.id), ["customer-1"]);
  assert.deepEqual(filterOrganisationRecords(owner, null), []);
  assert.deepEqual(records.map((record) => record.id), ["customer-1", "customer-2", "customer-3"]);
});

test("matches pending invites by normalised email and organisation", () => {
  const invites = [
    { id: "invite-1", email: " Staff@Example.com ", organisationId: "org-1", status: "pending" },
    { id: "invite-2", email: "staff@example.com", organisationId: "org-2", status: "pending" },
    { id: "invite-3", email: "staff@example.com", organisationId: "org-1", status: "accepted" },
  ];

  assert.equal(findPendingInviteForAccount(invites, "staff@example.com", "org-1")?.id, "invite-1");
  assert.equal(findPendingInviteForAccount(invites, "staff@example.com", "org-3"), null);
  assert.equal(hasDuplicatePendingInvite(invites, { email: "STAFF@example.com", organisation_id: "org-1" }), true);
  assert.equal(hasDuplicatePendingInvite(invites, { email: "new@example.com", organisationId: "org-1" }), false);
});

test("limits staff management to the same organisation and role hierarchy", () => {
  assert.equal(canManageOrganisationMember(owner, admin), true);
  assert.equal(canManageOrganisationMember(owner, office), true);
  assert.equal(canManageOrganisationMember(admin, office), true);
  assert.equal(canManageOrganisationMember(admin, electrician), true);
  assert.equal(canManageOrganisationMember(admin, { ...admin, id: "admin-2" }), false);
  assert.equal(canManageOrganisationMember(office, electrician), false);
  assert.equal(canManageOrganisationMember(owner, { ...office, organisationId: "org-2" }), false);
  assert.equal(canManageOrganisationMember(owner, owner), false);
  assert.equal(canManageOrganisationMember({ ...owner, status: "suspended" }, office), false);
});

test("rejects malformed or unscoped membership targets", () => {
  assert.equal(canManageOrganisationMember(owner, { ...office, id: "" }), false);
  assert.equal(canManageOrganisationMember(owner, { ...office, role: "unknown" }), false);
  assert.equal(canManageOrganisationMember(owner, { ...office, organisationId: "" }), false);
  assert.equal(canManageOrganisationMember(owner, { ...office, organisationId: "org-2" }), false);
});
