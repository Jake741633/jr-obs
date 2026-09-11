# Supabase restoration and deployment audit

Initial restoration checked on 11 September 2026 against the Supabase project
referenced by the `jr-os-v2` development preview. Source checkpoint:
`51e5247fe3183e5bd441f74e9a98a7995e49e537`.

The separately authorized test-project upgrade below was verified against
`fd11b9c92c90dbd23de20876d949e6f19e2c745f` later the same day.

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

## Authorized test-project upgrade

The dedicated `test` project, reference `tjfyneafvdgwrfdkpnlr`, was resumed from
`INACTIVE` to `ACTIVE_HEALTHY`. After restoration, it contained the initial schema
and nine effective migrations through `private_storage_signed_uploads`, with no
Auth users, organizations or JR OS Storage objects. The existing initial schema
was preserved.

All 93 missing effective migrations were then applied in the order recorded by
`supabase/recovery/after_schema_only.sql`, including the documented replacement of
`063` with `064`. The final history contains 103 entries: the initial schema and
all 102 effective migrations. Each expected migration name is present exactly
once. Supabase's generated history timestamps differ from repository filenames;
the names, SQL submitted during this upgrade and final marker were checked
together.

Two failures were diagnosed before proceeding:

- Two early management-API calls received the same second-resolution migration
  version. The failed transaction was verified absent from history, with its
  prior policy intact. Spacing subsequent calls by more than one second resolved
  the collision without editing migration history.
- `20260814091500_project_customer_portal_finance.sql` failed to compile with
  PostgreSQL error `42601`. Parenthesizing the SQL `CASE` expression inside its
  PL/pgSQL `IF` condition fixed the parser boundary. The original transaction had
  rolled back both projection tables and the function, so this unapplied
  migration was repaired in [PR #229](https://github.com/Jake741633/jr-obs/pull/229).
  Numeric, date and customer-binding validation remained intact. The corrected
  migration applied successfully before the remaining upgrade continued.

A rollback-only database check exercised 16 deposit cases: valid fixed and
percentage amounts, percentage bounds, zero/negative values, invalid JSON value
types, valid and invalid leap dates, missing due dates and unknown modes. It also
checked canonical customer scope, private-field redaction, deletion cleanup and
removal of a projection after an invalid update. All checks passed and all
fixture and audit rows were rolled back.

The repository's 1,522 tests passed before and after the fix was committed. Lint
reported zero errors and 17 existing warnings; production build, TypeScript and
dependency audit passed with zero vulnerabilities. All five required workflows
and the development preview passed on merged commit `fd11b9c92c90dbd23de20876d949e6f19e2c745f`.

Final staging catalog checks at 09:56 UTC found:

| Check | Result |
| --- | --- |
| Deployed migration marker | `20260903163000_redact_field_stock_locations.sql` |
| Public base tables | 44; all have RLS enabled |
| Anonymous public-schema access and table privileges | No schema usage; no SELECT, INSERT, UPDATE or DELETE privileges |
| Deployment-marker execution | Allowed for `service_role`; denied for `anon` and `authenticated` |
| Active-session and signed-upload guards | Present; a request without a session has no active session or JR OS role |
| Field and customer job/collection projections | Present |
| JR OS Storage buckets | Private; zero objects |
| Auth users, organizations, profiles, generic collections and audit rows | Zero after validation |

### Advisor review

The security advisor reported three authenticated `SECURITY DEFINER` RPCs:
`jr_field_save_collection`, `jr_field_save_job_progress` and
`jr_field_update_job_status`. These are the existing narrow field-write entry
points. Their deployed grants deny anonymous and service-role execution, their
search paths are empty, and their implementations derive identity from the
active session and enforce canonical job assignment, including receipt replays.
A transaction using the `authenticated` database role without a session verified
that all three reject at the active-field-identity guard. This SQL probe does not
replace tests with real Auth sessions. See the advisor's
[SECURITY DEFINER review guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Performance findings remain recorded for follow-up after the protected RLS run:

| Advisory | Findings | Follow-up |
| --- | --- | --- |
| [Unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) | 54 | Measure referenced-row update/delete plans before adding targeted indexes. |
| [Per-row Auth function evaluation](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan) | 18 | Profile the policies and verify any statement-level evaluation change against the role suite. |
| [Unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) | 81 | Collect representative workload statistics; this empty test database cannot establish that an index is unnecessary. |
| [Multiple permissive policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies) | 3 | Review combined policy cost while preserving distinct customer and staff access contracts. |

The linked live project was rechecked read-only after the staging upgrade. It
remains `ACTIVE_HEALTHY`, and its migration history still ends at
`private_file_object_path_uniqueness`. No production schema change was made.

## Remaining acceptance checks

1. Run the protected
   `verify:supabase-schema` and `test:rls` commands described in
   [RLS integration tests](../SUPABASE_RLS_INTEGRATION_TESTS.md), using the prepared
   dedicated test project. All role, revocation, recovery-session and private
   Storage scenarios must pass.
2. Reconcile deployed migration names with repository files before preparing an
   incremental upgrade from the actual live baseline. Rehearse that upgrade on
   staging with representative existing records and bindings. The completed
   empty-project update does not establish that data-preservation result. Do not
   replay initial schema setup over the live database or apply only selected
   hardening files.
   Account for superseded migration `063` and its replacement `064` as documented
   in [Supabase setup](../SUPABASE_SETUP.md).
3. Review the exact upgrade, a restorable backup and verification results before
   scheduling the live database change. Authorization covered project restoration
   and this dedicated test-project upgrade; production migrations still require
   a separate reviewed decision.
4. After the reviewed upgrade, verify the newest deployed marker and repeat the
   catalog/advisor checks and real role-specific app flows. Follow the existing
   Storage signed-URL key-rotation requirement in Supabase setup if old signed
   download links were issued. Keep cloud cutover blocked until all existing
   release checks pass.

The protected HTTP RLS/Storage suite has not yet been run against this prepared
schema and source checkpoint. The available GitHub connection can inspect runs
but cannot dispatch a new workflow or read/write protected environment settings.
Those settings were therefore not verified or changed during this session.

A maintainer must open the
[RLS workflow](https://github.com/Jake741633/jr-obs/actions/workflows/supabase-rls-integration.yml),
select the current `jr-os-v2` branch, and enter `JR_OS_RLS_TEST`. The protected
`supabase-test` environment must pin `SUPABASE_TEST_PROJECT_REF` to
`tjfyneafvdgwrfdkpnlr` and contain that project's matching URL, public key and
service-role secret as documented in the integration guide. Complete any missing
configuration reported by the workflow without weakening its guards. A rerun of
an older successful workflow would check out its older source commit and would
not validate this checkpoint.

Keep deployed-database acceptance pending until that exact-source workflow and
its cleanup pass. Repository checks and these staging SQL checks remain separate
evidence.
