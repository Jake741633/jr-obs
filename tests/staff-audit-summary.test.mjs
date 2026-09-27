import test from "node:test";
import assert from "node:assert/strict";
import {
  latestStaffAuditEntries,
  staffAuditSummaryActions,
  summariseStaffAudit,
} from "../lib/cloud/staffAuditSummary.mjs";

const entries = [
  { id: "a1", organisationId: "org-1", action: "invited", occurredAt: "2026-08-01T09:00:00.000Z" },
  { id: "a2", organisation_id: "org-1", action: "role-changed", occurred_at: "2026-08-02T10:00:00.000Z" },
  { id: "a3", organisationId: "org-1", action: "suspended", occurredAt: "2026-08-02T11:00:00.000Z" },
  { id: "a4", organisationId: "org-2", action: "reactivated", occurredAt: "2026-08-03T12:00:00.000Z" },
  { id: "a5", organisationId: "org-1", action: "unsupported", occurredAt: "2026-08-04T12:00:00.000Z" },
];

test("staff audit summary exposes every supported action", () => {
  assert.deepEqual(staffAuditSummaryActions, [
    "invited",
    "invite-revoked",
    "invite-accepted",
    "role-changed",
    "suspended",
    "reactivated",
  ]);
});

test("summarises only the requested organisation without hiding unknown records", () => {
  const summary = summariseStaffAudit(entries, "org-1");

  assert.equal(summary.total, 4);
  assert.equal(summary.latestAt, "2026-08-04T12:00:00.000Z");
  assert.deepEqual(summary.byAction, {
    invited: 1,
    "invite-revoked": 0,
    "invite-accepted": 0,
    "role-changed": 1,
    suspended: 1,
    reactivated: 0,
  });
});

test("empty and invalid summary input returns a complete zero-value shape", () => {
  const expected = {
    total: 0,
    latestAt: null,
    byAction: {
      invited: 0,
      "invite-revoked": 0,
      "invite-accepted": 0,
      "role-changed": 0,
      suspended: 0,
      reactivated: 0,
    },
  };

  assert.deepEqual(summariseStaffAudit([], "org-1"), expected);
  assert.deepEqual(summariseStaffAudit(entries, ""), expected);
  assert.deepEqual(summariseStaffAudit(null, "org-1"), expected);
});

test("recent entries are organisation-scoped newest-first and safely limited", () => {
  const recent = latestStaffAuditEntries(entries, "org-1", 2);

  assert.deepEqual(recent.map((entry) => entry.id), ["a5", "a3"]);
  assert.notEqual(recent[0], entries[4]);
  assert.deepEqual(latestStaffAuditEntries(entries, "org-1", 0), []);
  assert.deepEqual(latestStaffAuditEntries(entries, "org-1", -3), []);
});

test("recent entry results do not mutate the source list or source records", () => {
  const source = structuredClone(entries);
  const recent = latestStaffAuditEntries(entries, "org-1", 10);

  recent[0].action = "reactivated";
  assert.deepEqual(entries, source);
});
