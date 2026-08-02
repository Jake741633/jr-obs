import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStaffAuditEntry,
  filterStaffAuditForOrganisation,
  staffAuditActions,
} from "../lib/cloud/staffAudit.mjs";

const owner = {
  id: "owner-1",
  organisationId: "org-1",
  role: "owner",
  status: "active",
};

const electrician = {
  id: "staff-1",
  organisationId: "org-1",
  email: "STAFF@EXAMPLE.COM",
  role: "electrician",
  status: "active",
};

test("staff audit exposes every supported access action", () => {
  assert.deepEqual([...staffAuditActions], [
    "invited",
    "invite-revoked",
    "invite-accepted",
    "role-changed",
    "suspended",
    "reactivated",
  ]);
});

test("builds immutable organisation-scoped staff audit evidence", () => {
  const entry = buildStaffAuditEntry({
    id: "audit-1",
    action: "role-changed",
    actorProfile: owner,
    targetProfile: electrician,
    previousRole: "electrician",
    nextRole: "office",
    reason: "Moved into office support",
    now: "2026-08-02T08:00:00.000Z",
  });

  assert.deepEqual(entry, {
    id: "audit-1",
    organisationId: "org-1",
    action: "role-changed",
    actorUserId: "owner-1",
    targetUserId: "staff-1",
    targetEmail: "staff@example.com",
    occurredAt: "2026-08-02T08:00:00.000Z",
    previousRole: "electrician",
    nextRole: "office",
    reason: "Moved into office support",
  });
  assert.equal(electrician.email, "STAFF@EXAMPLE.COM");
});

test("invitation audit entries retain a normalised target email", () => {
  const entry = buildStaffAuditEntry({
    id: "audit-2",
    action: "invited",
    actorProfile: owner,
    invite: {
      organisation_id: "org-1",
      email: "  NEW.STARTER@EXAMPLE.COM ",
    },
    now: "2026-08-02T08:05:00.000Z",
  });

  assert.equal(entry.targetUserId, null);
  assert.equal(entry.targetEmail, "new.starter@example.com");
});

test("rejects unsupported, incomplete and cross-organisation audit entries", () => {
  assert.throws(() => buildStaffAuditEntry({
    id: "audit-3",
    action: "promoted",
    actorProfile: owner,
    targetProfile: electrician,
  }), /Unsupported staff audit action/);

  assert.throws(() => buildStaffAuditEntry({
    id: "audit-4",
    action: "suspended",
    actorProfile: owner,
    targetProfile: { ...electrician, organisationId: "org-2" },
  }), /inside the actor organisation/);

  assert.throws(() => buildStaffAuditEntry({
    action: "suspended",
    actorProfile: owner,
    targetProfile: electrician,
  }), /entry ID is required/);
});

test("filters audit history to one organisation newest first without mutation", () => {
  const entries = [
    { id: "a", organisationId: "org-1", occurredAt: "2026-08-01T09:00:00.000Z" },
    { id: "b", organisation_id: "org-2", occurredAt: "2026-08-03T09:00:00.000Z" },
    { id: "c", organisation_id: "org-1", occurredAt: "2026-08-02T09:00:00.000Z" },
  ];
  const original = structuredClone(entries);

  assert.deepEqual(filterStaffAuditForOrganisation(entries, "org-1").map((entry) => entry.id), ["c", "a"]);
  assert.deepEqual(entries, original);
  assert.deepEqual(filterStaffAuditForOrganisation(entries, ""), []);
});
