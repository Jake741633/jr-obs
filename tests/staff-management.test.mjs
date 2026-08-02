import assert from "node:assert/strict";
import test from "node:test";

import {
  changeStaffRole,
  reactivateStaffMember,
  revokePendingStaffInvite,
  suspendStaffMember,
} from "../lib/cloud/staffManagement.mjs";

const owner = {
  id: "owner-1",
  organisationId: "org-1",
  role: "owner",
  status: "active",
};

const admin = {
  id: "admin-1",
  organisationId: "org-1",
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
  organisation_id: "org-1",
  role: "electrician",
  status: "active",
};

const now = "2026-08-01T23:30:00.000Z";

test("owners can change staff roles without mutating the source profile", () => {
  const source = structuredClone(office);
  const updated = changeStaffRole(owner, office, "electrician", now);

  assert.equal(updated.role, "electrician");
  assert.equal(updated.updatedAt, now);
  assert.deepEqual(office, source);
});

test("admins can assign staff roles but cannot create or manage admins", () => {
  assert.equal(changeStaffRole(admin, electrician, "office", now).role, "office");
  assert.throws(() => changeStaffRole(admin, office, "admin", now), /cannot be assigned/);
  assert.throws(() => changeStaffRole(admin, { ...admin, id: "admin-2" }, "office", now), /cannot be managed/);
});

test("role changes reject owners, invalid roles and cross-organisation targets", () => {
  assert.throws(() => changeStaffRole(owner, owner, "office", now), /cannot be managed/);
  assert.throws(() => changeStaffRole(owner, office, "owner", now), /cannot be assigned/);
  assert.throws(() => changeStaffRole(owner, office, "unknown", now), /cannot be assigned/);
  assert.throws(
    () => changeStaffRole(owner, { ...office, organisationId: "org-2" }, "electrician", now),
    /cannot be managed/,
  );
});

test("inactive and non-manager accounts cannot change staff access", () => {
  assert.throws(() => suspendStaffMember({ ...owner, status: "suspended" }, office, now), /active owner or admin/);
  assert.throws(() => suspendStaffMember(office, electrician, now), /active owner or admin/);
});

test("staff can be suspended and reactivated without mutating source records", () => {
  const source = structuredClone(electrician);
  const suspended = suspendStaffMember(owner, electrician, now);

  assert.equal(suspended.active, false);
  assert.equal(suspended.status, "suspended");
  assert.equal(suspended.suspendedAt, now);
  assert.equal(suspended.updatedAt, now);
  assert.deepEqual(electrician, source);

  const reactivated = reactivateStaffMember(
    owner,
    { ...suspended, suspended_at: "2026-08-01T23:30:00.000Z" },
    "2026-08-02T08:00:00.000Z",
  );
  assert.equal(reactivated.active, true);
  assert.equal(reactivated.status, "active");
  assert.equal(reactivated.suspendedAt, undefined);
  assert.equal(reactivated.suspended_at, undefined);
  assert.equal(reactivated.updatedAt, "2026-08-02T08:00:00.000Z");
  assert.equal(suspended.status, "suspended");
});

test("suspension closes conflicting live membership state", () => {
  const conflicted = {
    ...office,
    active: true,
    status: "suspended",
    suspendedAt: "earlier",
  };
  const result = suspendStaffMember(owner, conflicted, now);

  assert.equal(result.active, false);
  assert.equal(result.status, "suspended");
  assert.equal(result.suspendedAt, now);
  assert.equal(result.updatedAt, now);
  assert.equal(conflicted.active, true);
});

test("suspending an already suspended profile returns a separate unchanged copy", () => {
  const suspended = { ...office, status: "suspended", suspendedAt: "earlier" };
  const result = suspendStaffMember(owner, suspended, now);

  assert.notEqual(result, suspended);
  assert.deepEqual(result, suspended);
});

test("pending invitations can only be revoked inside the manager organisation", () => {
  const invite = {
    id: "invite-1",
    organisationId: "org-1",
    email: "staff@example.com",
    role: "electrician",
    status: "pending",
  };
  const source = structuredClone(invite);
  const revoked = revokePendingStaffInvite(owner, invite, now);

  assert.equal(revoked.status, "revoked");
  assert.equal(revoked.revokedAt, now);
  assert.equal(revoked.updatedAt, now);
  assert.deepEqual(invite, source);

  assert.throws(
    () => revokePendingStaffInvite(owner, { ...invite, organisationId: "org-2" }, now),
    /same organisation/,
  );
  assert.throws(() => revokePendingStaffInvite(owner, { ...invite, status: "accepted" }, now), /Only pending/);
});

test("admins cannot revoke admin invitations while owners can", () => {
  const adminInvite = {
    id: "invite-admin",
    organisation_id: "org-1",
    email: "admin@example.com",
    role: "admin",
    status: "pending",
  };

  assert.throws(() => revokePendingStaffInvite(admin, adminInvite, now), /cannot manage admin invitations/);
  assert.equal(revokePendingStaffInvite(owner, adminInvite, now).status, "revoked");
});
