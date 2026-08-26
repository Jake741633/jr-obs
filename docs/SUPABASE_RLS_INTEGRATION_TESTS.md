# JR OS Supabase RLS and Storage integration tests

This harness validates the deployed JR OS schema, Row Level Security policies, authentication boundaries and private Storage policies against a **dedicated disposable Supabase test project**.

Never point this workflow at production and never use production credentials.

## Required schema

The disposable project must be on the newest migration committed in `supabase/migrations` before live testing begins.

For an existing test project:

1. Apply every unapplied migration in filename order.
2. Never edit a migration that has already been applied.
3. Apply the newest migration last so it republishes the exact deployed-migration marker.

For a fresh schema-only recovery:

1. Apply `supabase/schema.sql`.
2. Run `supabase/recovery/after_schema_only.sql` with `psql` and `ON_ERROR_STOP` enabled.

The recovery script applies the current effective migration sequence. It deliberately skips superseded migration `063` and installs self-contained migration `064` instead.

The newest migration must create or replace `public.jr_os_deployed_migration()` with its own filename, revoke execution from `public`, `anon` and `authenticated`, and grant execution only to `service_role`. The protected workflow derives the expected filename from the checked-out repository and stops before any test data is created when the remote marker is missing or stale.

The protected environment must also pin the dedicated hosted project by its exact 20-character Supabase project reference. The workflow accepts only the canonical base URL `https://<project-ref>.supabase.co`; a different project, custom domain, URL path or credential-bearing URL is rejected before the migration RPC or live suite runs.

## Temporary test identities

Every run creates unique data using a random run ID.

Two organisations are created. Each organisation receives separate:

- Owner
- Admin
- Office user
- Electrician
- Customer Portal user

Customer users receive different stable `customer_source_id` values.

## Database scenarios

The suite verifies:

- Same-tenant reads and writes.
- Cross-tenant read denial.
- Cross-tenant write denial.
- Owner, admin, office, electrician and customer role boundaries.
- Office-only table write policies.
- Field-write table policies.
- Customer Portal read and insert scope.
- Customer Portal approvals and appointment requests resolve only eligible same-customer pricing and planner targets, and those targets cannot be retargeted later.
- Generic `cloud_collections` tenant and customer scope.
- Typed entity-table tenant scope.
- Soft-delete tombstones remain available for synchronisation.
- Active-record queries exclude tombstones.
- Version increments occur when records are updated.
- Office users cannot promote their own role.
- Owners can manage staff roles and active state.
- Deactivated users immediately lose tenant data access.
- Revoked refresh tokens cannot create new sessions.
- Authenticated users cannot forge, edit or delete audit records.
- Payment changes produce trigger-generated audit entries.

### Typed entities covered

- Customers
- Jobs
- Quotes and estimates (`pricing_documents`)
- Invoices
- Payments
- Expenses
- Materials
- Stock items and movements
- Purchase lists
- Planner entries
- Team members
- Builders
- Timesheets
- Certificates
- Electrical testing records
- Job documents
- Portal approvals
- Portal requests
- AI recommendation evidence

Field builder projections expose only contact-safe data for builders referenced
by a live canonical job assigned to the electrician's unique active field
identity. Same-tenant unassigned and orphan builder contacts remain hidden.

### Generic collections covered

- Surveys
- RAMS
- Job Packs
- AI learning memory

## Private Storage scenarios

The suite uses the private `jr-os-private` bucket and verifies:

- Authenticated staff can upload allowed content to their own tenant path.
- Client-created signed upload and download URLs are denied.
- Signed upload bearer tokens are rejected at the Storage table.
- Customers cannot upload files.
- Cross-tenant authenticated uploads are denied.
- Unsupported MIME uploads are denied.
- Files larger than 10 MB are denied.
- Owners can download through live authenticated requests.
- Customers can download only customer-scoped files.
- Customers cannot download another customer's file.
- Another organisation cannot read the file.
- Revoked Auth sessions cannot upload or download private objects.
- Office users cannot delete private objects.
- Admin users can delete private objects.
- `private_files` metadata follows the same tenant and customer scope.

The test does not print access tokens, refresh tokens, service-role credentials or signed URLs.

## Cleanup guarantees

All test work runs inside `try/finally`.

Cleanup attempts to remove:

- Every uploaded test object.
- Private-file metadata.
- Audit rows created by the test.
- Generic collection rows.
- All typed entity rows.
- All temporary Auth users.
- Both temporary organisations.

Cleanup uses the service role only inside the Node test runner. Each cleanup operation is best-effort so later cleanup continues even if one deletion fails.

The always-run fallback cleanup re-verifies the exact project ref and deployed migration before any destructive request. It never lists a Storage bucket root. It discovers only exact generated test organisations, removes only object paths under those organisation UUIDs that contain the matching run ID, and deletes an Auth user only when its exact generated email, UUID, expected role and protected `profiles` membership all bind it to one of those organisations. User-editable Auth metadata is never trusted as deletion authority. Organisations are deleted only by validated UUID, and unrelated objects, users and organisations are left untouched.

Use a disposable test project and enable Supabase project backups or periodic resets. A cancelled runner or infrastructure outage can still interrupt the final cleanup process.

## Protected GitHub environment

Create a GitHub environment named:

```text
supabase-test
```

Add the environment variable:

```text
SUPABASE_TEST_PROJECT_REF
```

Set it to the exact 20-character Reference ID shown in the dedicated test project's Supabase settings.

Add environment secrets:

```text
SUPABASE_TEST_URL
SUPABASE_TEST_ANON_KEY
SUPABASE_TEST_SERVICE_ROLE_KEY
```

Security requirements:

- The project must contain no production customer data.
- `SUPABASE_TEST_URL` must be the canonical hosted URL for `SUPABASE_TEST_PROJECT_REF`.
- The service-role key must be from this dedicated test project only.
- Do not prefix the service-role secret with `NEXT_PUBLIC_`.
- Do not place it in Netlify browser variables.
- Restrict environment deployment approval to trusted maintainers.
- Rotate the service-role key immediately if exposure is suspected.

## Running in GitHub

Open:

**Actions → JR OS Supabase RLS Integration → Run workflow**

Enter the exact confirmation:

```text
JR_OS_RLS_TEST
```

The workflow is manual-only, uses the protected `supabase-test` environment and prevents concurrent test runs against the same project.

It runs:

```text
npm ci
npm run verify:supabase-schema
npm run test:rls
```

Project-ref and migration verification run before the live suite and fail closed if the URL does not identify the pinned hosted project, the service-role-only marker is missing, or the marker does not equal the repository's newest migration filename. Without the environment variable, all secrets and the exact confirmation input, the integration test does not run.

## Running locally

Use only the dedicated test project:

```bash
export SUPABASE_TEST_URL="https://your-project-ref.supabase.co"
export SUPABASE_TEST_PROJECT_REF="your-20-character-ref"
export SUPABASE_TEST_ANON_KEY="..."
export SUPABASE_TEST_SERVICE_ROLE_KEY="..."
export SUPABASE_TEST_CONFIRM="JR_OS_RLS_TEST"
npm run verify:supabase-schema
npm run test:rls
```

Do not save the service-role key in a committed file or any client-readable environment variable.

## Known limits

This suite materially improves confidence but does not prove production security. Remaining work includes:

- Run the workflow after every RLS or Storage policy change once the test environment is stable.
- Add concurrent-update and explicit version-conflict tests using two live sessions.
- Add Storage malware scanning and server-side content inspection.
- Verify MIME type using file signatures rather than client headers alone.
- Add rate-limit and abuse tests.
- Test password reset, MFA and account-recovery flows.
- Test JWT expiry and access-token lifetime behaviour separately from refresh-token revocation.
- Add audit coverage for certificate issue, quote acceptance and record deletion in the live suite.
- Add backup restoration and orphaned-object cleanup drills.
- Conduct an independent security review before production customer data is stored.
