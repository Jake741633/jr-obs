import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const requiredSuites = [
  "operator-permissions.test.mjs",
  "operator-navigation.test.mjs",
  "customer-portal-tenant-boundary.test.mjs",
  "offline-queue-tenant-isolation.test.mjs",
  "background-sync-tenant-isolation.test.mjs",
  "private-file-ownership-isolation.test.mjs",
  "audit-log-tenant-boundary.test.mjs",
  "audit-policy-integrity.test.mjs",
  "multi-tenant-penetration-regression.test.mjs",
  "forged-browser-session-rejection.test.mjs",
  "email-auth-recovery-flow.test.mjs",
  "suspended-cloud-context.test.mjs",
  "jobProgressCore.test.mjs",
  "generic-collection-role-guard.test.mjs",
  "private-storage-customer-scope.test.mjs",
  "customer-profile-visibility.test.mjs",
  "legacy-storage-staff-reads.test.mjs",
  "legacy-storage-upload-boundary.test.mjs",
  "private-file-metadata-delete-guard.test.mjs",
  "customer-generic-collection-reads.test.mjs",
  "customer-typed-table-reads.test.mjs",
  "customer-portal-insert-guard.test.mjs",
  "tombstone-transition-guard.test.mjs",
  "migration-marker-delete-guard.test.mjs",
  "migration-marker-identity-guard.test.mjs",
  "private-file-identity-guard.test.mjs",
  "server-side-replay-penetration.test.mjs",
  "legacy-app-record-identity-guard.test.mjs",
  "legacy-backup-role-guard.test.mjs",
  "private-authorization-helper-boundary.test.mjs",
  "public-database-grants.test.mjs",
  "sensitive-metadata-delete-audit.test.mjs",
  "portal-record-binding-guard.test.mjs",
  "private-file-object-path-uniqueness.test.mjs",
  "private-file-record-binding-guard.test.mjs",
  "active-auth-session-guard.test.mjs",
  "business-authentication-method-guard.test.mjs",
  "cloud-record-binding-guard.test.mjs",
  "profile-management-hierarchy-guard.test.mjs",
  "authenticated-storage-transfer-guard.test.mjs",
  "customer-pricing-projection.test.mjs",
  "electrician-office-read-boundary.test.mjs",
  "profile-directory-read-boundary.test.mjs",
  "electrician-pricing-read-boundary.test.mjs",
  "field-team-projection.test.mjs",
  "job-role-projections.test.mjs",
  "field-cloud-collection-projection.test.mjs",
  "field-inventory-projections.test.mjs",
];

const testsDirectory = new URL("./", import.meta.url);

for (const suite of requiredSuites) {
  test(`security audit retains ${suite}`, () => {
    assert.equal(existsSync(new URL(suite, testsDirectory)), true);
  });
}

test("penetration suite retains every final attack class", () => {
  const penetration = readFileSync(new URL("multi-tenant-penetration-regression.test.mjs", testsDirectory), "utf8");

  for (const requiredPhrase of [
    "record enumeration",
    "browser cache tampering",
    "offline queue replay",
    "stale identity responses",
    "backup payloads",
    "private file path and authenticated download tampering",
    "customer sessions",
    "tenant-sensitive state",
    "forged or expired browser sessions",
  ]) {
    assert.match(penetration, new RegExp(requiredPhrase.replaceAll(" ", "\\s+"), "i"));
  }
});

test("live RLS coverage preserves privileged AI and tombstone boundaries", () => {
  const liveRls = readFileSync(new URL("supabase-rls.integration.mjs", testsDirectory), "utf8");

  for (const requiredPhrase of [
    "Electrician must not write office-only AI learning memory",
    "Electrician must not create a soft-delete tombstone",
    "Owner should create a soft-delete tombstone",
    "Customer must not attach an approval to another tenant's job while keeping their own customer ID",
    "Customer must not attach a request to another customer's job while keeping their own customer ID",
    "Electrician must not forge another user's private-file attribution",
    "Staff must not register private-file metadata for another tenant path",
    "Staff must not bypass the private-file metadata MIME allowlist",
    "Authorization helper RPC must not be exposed",
    "Anonymous Data API access must fail at the grant boundary",
    "Legacy storage must reject disallowed MIME types",
    "Private file metadata deletion must create an immutable tenant audit row",
    "Staff must not bind a portal request to another tenant's job",
    "Staff must not rebind a customer portal submission",
    "Staff must not bind private-file metadata to another customer's job",
    "Staff must not bind private-file metadata to another tenant's job",
    "Staff must not alias an existing private object to a second metadata row",
    "Revoked access tokens must not retain tenant reads",
    "Revoked access tokens must not retain tenant writes",
    "Recovery-only sessions must not read tenant data",
    "Recovery-only sessions must not write tenant data",
    "RLS metadata must match the stored business payload",
    "Cloud records must not bind another organisation's customer or job",
    "Cloud records must not bind a job to a different customer",
    "Cloud payload ids must match stable source ids",
    "Admins must not promote themselves to owner",
    "Admins must not manage another admin",
    "Staff must not change the owner membership",
    "Demoted sessions must lose staff management authority",
    "Profile user identities must not be rebound",
    "Customers must not rebind their portal scope",
    "Signed upload URL creation must be disabled",
    "Pre-existing signed upload tokens must be rejected",
    "Signed download URL creation must be disabled",
    "Authenticated staff upload must succeed",
    "Revoked sessions must not upload private objects",
    "Revoked sessions must not download private objects",
    "Customer base pricing query should fail closed",
    "Customer pricing projection must omit staff-only profitability",
    "Another customer must not read the pricing projection",
    "Another organisation must not read the pricing projection",
    "Customer must not write the pricing projection",
    "Electrician must not read office-only typed data",
    "Electrician should retain field collection reads",
    "Electrician must not read office-only generic data",
    "Office should retain sensitive generic reads",
    "Customer must retain own invoice reads",
    "Electrician must not read customer portal workflow data",
    "Owners should retain organisation profile administration",
    "Admins should retain organisation profile administration",
    "Office must not enumerate authentication profiles",
    "Electrician must not enumerate authentication profiles",
    "Customer must not enumerate authentication profiles",
    "Suspended sessions must not read their authentication profile",
    "Recovery-only sessions must not resolve an authentication profile",
    "Revoked access tokens must not read their authentication profile",
  ]) {
    assert.match(liveRls, new RegExp(requiredPhrase.replaceAll(" ", "\\s+"), "i"));
  }
  assert.doesNotMatch(liveRls, /Field staff should create a soft-delete tombstone/i);
});
