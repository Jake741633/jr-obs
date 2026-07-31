# JR OS Supabase RLS integration tests

This harness tests the deployed JR OS schema and Row Level Security policies against a dedicated Supabase test project. Do not point it at production.

## What it creates

For each run the test creates:

- Two separate organisations.
- An owner, office, electrician and customer account in each organisation.
- Customer, job and portal-request records scoped to each organisation.

The test then verifies:

- Office users can create customer records for their own organisation.
- Electricians cannot create office-only customer records.
- Electricians can create field job records for their own organisation.
- Owners can only read their own organisation's records.
- Customer users can only read records matching their `customer_source_id`.
- Customer users cannot create business job records.
- Customer users can create their own portal requests.
- The second organisation cannot read the first organisation's records.

Test records and users are deleted in a `finally` cleanup block.

## Required test project

Create a separate Supabase project for automated RLS testing. Apply the JR OS schema and all migrations in order, including the generic collection migration and permission hardening migrations.

Never use a production project or production service-role key.

## GitHub environment

Create a protected GitHub environment named:

```text
supabase-test
```

Add these environment secrets:

```text
SUPABASE_TEST_URL
SUPABASE_TEST_ANON_KEY
SUPABASE_TEST_SERVICE_ROLE_KEY
```

The service-role key is used only inside the GitHub Actions runner to create and remove test users and seed tenant records. It is never referenced by browser code or prefixed with `NEXT_PUBLIC_`.

Restrict who can approve and run the `supabase-test` environment. Rotate the service-role key if it is ever exposed.

## Running in GitHub

Open **Actions → JR OS Supabase RLS Integration → Run workflow**.

The workflow is manual only and runs:

```text
npm run test:rls
```

The workflow supplies the required confirmation value:

```text
SUPABASE_TEST_CONFIRM=JR_OS_RLS_TEST
```

Without the URL, keys and exact confirmation value, the integration test is skipped.

## Running locally

Use a dedicated test project and export:

```bash
export SUPABASE_TEST_URL="https://your-test-project.supabase.co"
export SUPABASE_TEST_ANON_KEY="..."
export SUPABASE_TEST_SERVICE_ROLE_KEY="..."
export SUPABASE_TEST_CONFIRM="JR_OS_RLS_TEST"
npm run test:rls
```

Do not save the service-role key in `.env.local`, commit it, expose it to Next.js client code or deploy it to Netlify browser variables.

## Current coverage limits

The first harness covers database RLS for customers, jobs and portal requests. It does not yet verify:

- Private Storage object policies and signed URL expiry.
- Every typed and generic JR OS table.
- Update and tombstone conflicts under concurrent users.
- Certificate, payment and audit-trigger policies.
- Session expiry, refresh and revoked-user behaviour.
- File MIME inspection or malware scanning.

Expand this real-project test suite before storing production customer data.
