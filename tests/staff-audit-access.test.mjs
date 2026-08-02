import test from "node:test";
import assert from "node:assert/strict";

import {
  assertStaffAuditAccess,
  auditViewerRoles,
  canViewStaffAudit,
  staffAuditEntriesForViewer,
} from "../lib/cloud/staffAuditAccess.mjs";

const owner = { id: "owner-1", organisationId: "org-1", role: "owner", status: "active" };
const admin = { id: "admin-1", organisation_id: "org-1", role: "admin", status: "active" };

const entries = [
  { id: "older", organisationId: "org-1", action: "invited", occurredAt: "2026-08-01T09:00:00.000Z" },
  { id: "other-org", organisationId: "org-2", action: "suspended", occurredAt: "2026-08-03T09:00:00.000Z" },
  { id: "newer", organisation_id: "org-1", action: "role-changed", occurred_at: "2026-08-02T09:00:00.000Z" },
];

test("only active owners and admins can view staff audit history", () => {
  assert.deepEqual(auditViewerRoles, ["owner", "admin"]);
  assert.equal(canViewStaffAudit(owner, "org-1"), true);
  assert.equal(canViewStaffAudit(admin, "org-1"), true);

  for (const role of ["office", "electrician", "customer", "unknown", ""]) {
    assert.equal(canViewStaffAudit({ organisationId: "org-1", role, status: "active" }, "org-1"), false);
  }
});

test("audit access rejects suspended, cross-organisation and incomplete profiles", () => {
  assert.equal(canViewStaffAudit({ ...owner, status: "suspended" }, "org-1"), false);
  assert.equal(canViewStaffAudit(owner, "org-2"), false);
  assert.equal(canViewStaffAudit(null, "org-1"), false);
  assert.equal(canViewStaffAudit(owner, ""), false);

  assert.throws(
    () => assertStaffAuditAccess({ ...owner, status: "suspended" }, "org-1"),
    /Only active owners and admins can view staff access history/,
  );
});

test("authorised viewers receive only their organisation entries newest first", () => {
  const visible = staffAuditEntriesForViewer(entries, owner, "org-1");
  assert.deepEqual(visible.map((entry) => entry.id), ["newer", "older"]);
  assert.equal(visible.some((entry) => entry.id === "other-org"), false);
});

test("staff audit access supports Supabase field names", () => {
  assert.equal(canViewStaffAudit(admin, "org-1"), true);
  const visible = staffAuditEntriesForViewer(entries, admin, "org-1");
  assert.deepEqual(visible.map((entry) => entry.id), ["newer", "older"]);
});

test("returned audit entries and source lists are not mutated", () => {
  const source = structuredClone(entries);
  const visible = staffAuditEntriesForViewer(entries, owner, "org-1");

  visible[0].action = "changed-locally";
  visible.reverse();

  assert.deepEqual(entries, source);
  assert.equal(entries.find((entry) => entry.id === "newer")?.action, "role-changed");
});

test("non-array audit input is safely returned as an empty list after access is checked", () => {
  assert.deepEqual(staffAuditEntriesForViewer(null, owner, "org-1"), []);
  assert.throws(() => staffAuditEntriesForViewer(null, { ...owner, role: "office" }, "org-1"));
});
