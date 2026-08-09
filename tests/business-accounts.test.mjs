import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptStaffInvite,
  buildStaffInvite,
  businessRoles,
  canAssignRole,
  canManageStaff,
  normaliseBusinessAccount,
  revokeStaffAccess,
  staffAssignableRoles,
} from "../lib/cloud/businessAccounts.mjs";

test("defines supported business and staff roles without allowing invited owners", () => {
  assert.deepEqual(businessRoles, ["owner", "admin", "office", "electrician", "customer"]);
  assert.deepEqual(staffAssignableRoles, ["admin", "office", "electrician", "customer"]);
  assert.equal(staffAssignableRoles.includes("owner"), false);
});

test("normalises business accounts and rejects unnamed organisations", () => {
  assert.deepEqual(normaliseBusinessAccount({
    id: " org-1 ",
    name: " JR Electrical Services ",
    ownerUserId: " owner-1 ",
    status: "unexpected",
    createdAt: " 2026-08-01T10:00:00.000Z ",
    updatedAt: " 2026-08-01T11:00:00.000Z ",
  }), {
    id: "org-1",
    name: "JR Electrical Services",
    ownerUserId: "owner-1",
    status: "active",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T11:00:00.000Z",
  });

  assert.throws(() => normaliseBusinessAccount({ name: "   " }), /Business name is required/);
});

test("limits staff management and role assignment by actor role", () => {
  assert.equal(canManageStaff("owner"), true);
  assert.equal(canManageStaff("admin"), true);
  assert.equal(canManageStaff("office"), false);
  assert.equal(canManageStaff("electrician"), false);
  assert.equal(canManageStaff("customer"), false);

  assert.equal(canAssignRole("owner", "admin"), true);
  assert.equal(canAssignRole("owner", "office"), true);
  assert.equal(canAssignRole("admin", "office"), true);
  assert.equal(canAssignRole("admin", "electrician"), true);
  assert.equal(canAssignRole("admin", "admin"), false);
  assert.equal(canAssignRole("owner", "owner"), false);
  assert.equal(canAssignRole("office", "electrician"), false);
});

test("builds organisation-scoped staff invitations with normalised email", () => {
  const invite = buildStaffInvite({
    organisationId: " org-1 ",
    email: " Staff.Member@Example.COM ",
    role: "electrician",
    invitedBy: " owner-1 ",
    now: "2026-08-01T12:00:00.000Z",
  });

  assert.deepEqual(invite, {
    organisationId: "org-1",
    email: "staff.member@example.com",
    role: "electrician",
    status: "pending",
    invitedBy: "owner-1",
    invitedAt: "2026-08-01T12:00:00.000Z",
    acceptedAt: null,
    revokedAt: null,
  });

  assert.throws(() => buildStaffInvite({ organisationId: "org-1", email: "invalid", role: "office", invitedBy: "owner-1" }), /valid email/);
  assert.throws(() => buildStaffInvite({ organisationId: "org-1", email: "a@example.com", role: "owner", invitedBy: "owner-1" }), /cannot be assigned/);
  assert.throws(() => buildStaffInvite({ organisationId: "", email: "a@example.com", role: "office", invitedBy: "owner-1" }), /Organisation is required/);
});

test("accepts only pending invitations and links the user account", () => {
  const invite = buildStaffInvite({
    organisationId: "org-1",
    email: "staff@example.com",
    role: "office",
    invitedBy: "owner-1",
    now: "2026-08-01T12:00:00.000Z",
  });

  const accepted = acceptStaffInvite(invite, " user-2 ", "2026-08-01T13:00:00.000Z");
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.userId, "user-2");
  assert.equal(accepted.acceptedAt, "2026-08-01T13:00:00.000Z");
  assert.equal(accepted.organisationId, "org-1");
  assert.equal(invite.status, "pending");

  assert.throws(() => acceptStaffInvite(accepted, "user-2"), /Only pending invites/);
  assert.throws(() => acceptStaffInvite(invite, "   ", "2026-08-01T13:00:00.000Z"), /User account is required/);
});

test("rejects expired invitations and honours explicit expiry dates", () => {
  const invite = buildStaffInvite({
    organisationId: "org-1",
    email: "staff@example.com",
    role: "office",
    invitedBy: "owner-1",
    now: "2026-08-01T12:00:00.000Z",
  });

  assert.throws(
    () => acceptStaffInvite(invite, "user-2", "2026-08-08T12:00:00.000Z"),
    /invitation has expired/,
  );

  const explicitlyExpired = {
    ...invite,
    expiresAt: "2026-08-02T09:00:00.000Z",
  };
  assert.throws(
    () => acceptStaffInvite(explicitlyExpired, "user-2", "2026-08-02T09:00:00.000Z"),
    /invitation has expired/,
  );

  const explicitlyValid = {
    ...invite,
    expires_at: "2026-08-10T09:00:00.000Z",
  };
  assert.equal(
    acceptStaffInvite(explicitlyValid, "user-2", "2026-08-09T09:00:00.000Z").status,
    "accepted",
  );
});

test("accepted and revoked invitations cannot be replayed", () => {
  const invite = buildStaffInvite({
    organisationId: "org-1",
    email: "staff@example.com",
    role: "electrician",
    invitedBy: "owner-1",
    now: "2026-08-01T12:00:00.000Z",
  });
  const accepted = acceptStaffInvite(invite, "user-2", "2026-08-02T12:00:00.000Z");

  assert.throws(() => acceptStaffInvite(accepted, "user-2", "2026-08-03T12:00:00.000Z"), /Only pending invites/);
  assert.throws(() => acceptStaffInvite({ ...invite, status: "revoked" }, "user-2", "2026-08-03T12:00:00.000Z"), /Only pending invites/);
});

test("revokes staff access without allowing owner removal", () => {
  const profile = { userId: "staff-1", organisationId: "org-1", role: "electrician", status: "active" };
  const revoked = revokeStaffAccess(profile, "admin", "2026-08-01T14:00:00.000Z");

  assert.deepEqual(revoked, {
    ...profile,
    status: "suspended",
    suspendedAt: "2026-08-01T14:00:00.000Z",
  });
  assert.equal(profile.status, "active");

  assert.throws(() => revokeStaffAccess(profile, "office"), /Only owners and admins/);
  assert.throws(() => revokeStaffAccess({ ...profile, role: "owner" }, "admin"), /owner cannot be revoked/);
});
