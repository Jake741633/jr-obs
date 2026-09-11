# Supabase restoration and deployment audit

Checked on 11 September 2026 against the Supabase project referenced by the
`jr-os-v2` development preview. Source checkpoint:
`51e5247fe3183e5bd441f74e9a98a7995e49e537`.

## Login availability restored

The linked project was `INACTIVE`. Resuming it returned it to `ACTIVE_HEALTHY`.
After that transition, a read-only database query succeeded, and both
`/auth/v1/health` and `/auth/v1/settings` returned HTTP 200 using the public key
already bundled with the preview. Email/password authentication is enabled and
email confirmation remains enabled. No password, API key, environment variable
or database schema was changed during this restoration.

Database contents were temporarily unavailable while the project reported
`COMING_UP`; the account and schema checks were repeated after it became healthy.
Do not diagnose missing data from checks made during restoration.

After those service checks, the account holder completed secure email/password
entry in the development preview. Fresh page state confirmed a signed-in active
owner account. Selecting **Open workspace** then opened the owner dashboard at
the preview's root URL and rendered its workspace controls. This verifies the
interactive sign-in and workspace handoff after restoration. Credentials were
not exposed in chat or application logs, and the password was not changed.

This browser check does not establish installed-app behavior on a physical phone
or completion of the database security upgrade below.

The organization is on the Free plan. Supabase documents automatic pausing for
low activity and restoration within 90 days. The precise historical pause trigger
was not established. A plan change is a separate billing decision; no synthetic
traffic or keep-alive workaround was added. See
[Supabase project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

## Database upgrade remains a release blocker

The deployed migration history ends at `private_file_object_path_uniqueness`
(`20260809134430` in Supabase's history), corresponding to repository migration
`20260809_035_private_file_object_path_uniqueness.sql`. The repository's newest
migration at this checkpoint is
`20260903163000_redact_field_stock_locations.sql`.

Catalog inspection independently confirmed missing objects; this is more than a
timestamp mismatch between migration naming conventions.

| Required protection or contract | Observed in linked project | Consequence |
| --- | --- | --- |
| `private.has_active_auth_session()` | Absent | The later database checks for revoked and verification-only sessions are not installed. |
| `private.current_jr_role()` | Checks user ID and active profile only | Its deployed definition does not call the newer live-session guard. |
| `private.reject_jr_signed_storage_upload()` | Absent | The later signed-upload rejection trigger function is not installed. |
| `public.field_jobs` and `public.customer_jobs` | Absent | Current role-specific job adapters lack their expected database views of job data. |
| `public.field_cloud_collections` | Absent | The current field collection adapter lacks its restricted projection table. |
| `public.jr_os_deployed_migration()` | Absent | The protected schema verification gate cannot confirm the required migration. |

All inspected public base tables had RLS enabled. That does not establish that
their deployed policies implement the current repository's security boundaries.
The built-in security advisor also reported disabled leaked-password protection.
Supabase makes that feature available on Pro and above; see
[password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
No billing or Auth policy change was made.

The older [source security audit](./multi-tenant-security-audit-2026-08-04.md)
describes repository regression coverage. It must not be used as evidence that
these later database migrations have been deployed.

## Reproduce the catalog checks

Run these read-only checks through a trusted database connection. They expose no
account records, credentials or business payloads.

```sql
select
  to_regprocedure('private.has_active_auth_session()') is not null
    as live_session_guard_present,
  to_regprocedure('private.reject_jr_signed_storage_upload()') is not null
    as signed_upload_guard_present,
  to_regprocedure('public.jr_os_deployed_migration()') is not null
    as deployment_marker_present,
  to_regclass('public.field_jobs') is not null as field_job_projection_present,
  to_regclass('public.customer_jobs') is not null as customer_job_projection_present,
  to_regclass('public.field_cloud_collections') is not null
    as field_collection_projection_present;

select pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname = 'current_jr_role';
```

Object presence is diagnostic only. It does not replace exact migration-marker
verification or live role and Storage tests.

## Staged repair and acceptance checks

1. Resume and verify the dedicated disposable test project, which was also
   `INACTIVE` at this audit. Confirm its exact project reference before writing
   anything. Never point the integration harness at the linked live project.
2. Establish the test schema with the existing supported recovery path in
   [Supabase setup](../SUPABASE_SETUP.md), then run the protected
   `verify:supabase-schema` and `test:rls` commands described in
   [RLS integration tests](../SUPABASE_RLS_INTEGRATION_TESTS.md). All role,
   revocation, recovery-session and private Storage scenarios must pass.
3. Reconcile deployed migration names with repository files before preparing an
   incremental upgrade from the actual live baseline. Rehearse that upgrade on
   staging, preserving existing records and bindings. Do not replay initial
   schema setup over the live database or apply only selected hardening files.
   Account for superseded migration `063` and its replacement `064` as documented
   in the supported recovery path.
4. Review the exact upgrade, a restorable backup and verification results before
   scheduling the live database change. The authorization used for this incident
   covered resuming the linked project, not applying production migrations.
5. After the reviewed upgrade, verify the newest deployed marker and repeat the
   catalog/advisor checks and real role-specific app flows. Follow the existing
   Storage signed-URL key-rotation requirement in Supabase setup if old signed
   download links were issued. Keep cloud cutover blocked until all existing
   release checks pass.

The disposable integration checks were not run during this audit. The local
workspace has no protected test credentials or local Supabase runtime; those
requirements were not bypassed. Repository tests, lint, build, type checks and
dependency review remain separate from deployed-database acceptance.
