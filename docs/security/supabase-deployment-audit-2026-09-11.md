# Supabase restoration and deployment audit

Initial restoration checked on 11 September 2026 against the Supabase project
referenced by the `jr-os-v2` development preview. Source checkpoint:
`51e5247fe3183e5bd441f74e9a98a7995e49e537`.

The separately authorized test-project upgrade below was verified against
`fd11b9c92c90dbd23de20876d949e6f19e2c745f` later the same day.

## 19 September acceptance and availability update

The complete protected [RLS/Storage run 35432638677](https://github.com/Jake741633/jr-obs/actions/runs/35432638677)
passed on source `42cf3a9426d91c66cb00c1e1ab1a95a6f69a56f7`, including exact
project/confirmation checks, migration verification, every HTTP assertion and
cleanup. It finished at 08:43:59 UTC. The integration test took 163 seconds.
The final source tree is `c9c35026e7494bec2bbcf482611c5166bf14e321`.

The fixes were merged in dependency order:

| Change | Pull request | Merge commit |
| --- | --- | --- |
| Management planner tombstone acknowledgements | [#234](https://github.com/Jake741633/jr-obs/pull/234) | `6787f50f513c0d5f4325f169e7ffe69ec92f5a0b` |
| Private Storage upload, download and delete authorization | [#237](https://github.com/Jake741633/jr-obs/pull/237) | `1646f6271efa1a15c87ad72a0011af7fa62aeb38` |
| Safe Auth fixtures, current role contracts and scoped cleanup | [#232](https://github.com/Jake741633/jr-obs/pull/232) | `2113cca65fde1e916cae8580ada8f78c28ee37ba` |

A fresh fetch confirms the final merge has exactly the same tree as the accepted
HTTP run. All 1,576 local tests pass; lint has zero errors and the same 17 existing
warnings. Exact-head CI, dependency review and PR previews passed. All five
resulting branch checks and the preview passed after each of the three merges.

The dedicated test project is on
`20260919084500_allow_authenticated_storage_download_checks.sql`. Four new
repository migrations cover the planner fix and three Storage operation fixes:

- POST `x-upsert=true` retains `storage.object.upload` and needs the exact-metadata
  SELECT/UPDATE paths as well as INSERT.
- Single-object DELETE needs management SELECT access under
  `storage.object.delete` for its returned row.
- Hosted authenticated GET authorizes metadata under
  `object.get_authenticated_info`. The exact-metadata download path now permits
  that operation as well as `storage.object.get_authenticated`.

The existing tenant, live-session, role, assignment and canonical-record checks
remain. Customer canonical-file reads, field uploads, orphan retries without
metadata, signing, listing, public reads and unrelated operations stay denied.
The [Storage rollback probe](../../supabase/tests/private_storage_upserts.sql)
checks both permitted and denied paths. A focused real Auth fixture independently
uploaded, downloaded and deleted an object successfully through Storage HTTP.

Four test-only migration-history entries record temporary operation diagnostics
and their removal. These diagnostics never granted access. The diagnostic
function/policy and its Auth, organization, metadata and object fixtures were
removed. They are not part of the repository's production migration sequence.

After the complete HTTP run, independent read-only counts found zero Auth users,
sessions, Storage objects, field mutation receipts and rows in **all 44 public
base tables**. All 44 tables retain RLS. Security advisors still report only the
three intentional authenticated field RPCs described below; no new findings
were added.

The linked app project `kavyemkgasrtkqjgrpgw` had paused again. It was restored
under the prior restoration authorization and returned to `ACTIVE_HEALTHY`.
Both Auth health and settings endpoints returned HTTP 200; email/password login
is enabled and automatic email confirmation is disabled. This checks service
availability, not a new interactive login or installation on a physical phone.

A read-only check after restoration confirmed the same old production baseline:
initial schema plus all 36 effective migrations through repository `035`, with
no gaps or extra migration names. The three existing Auth users and organizations
remain; customers, jobs, private-file metadata and Storage objects are empty.
The live-session guard, deployment marker and field/customer job projections are
still absent. No production schema, secret, Auth setting or deployment mode was
changed.

The [review-only upgrade manifest](./supabase-upgrade-manifest-2026-09-19.json)
records the exact **70 pending effective migrations**, their recovery-script
order and SHA-256 hashes. It excludes superseded `063` and includes its
self-contained replacement `064`. This inventory prepares the next review;
it does not establish a data-preserving upgrade rehearsal or authorize execution.

## Login availability restored on 11 September

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

## Database baseline inspected on 11 September

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

## Authorized test-project upgrade on 11 September

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

## Production upgrade and mobile acceptance still pending

1. Use the committed upgrade manifest to prepare the incremental upgrade from
   the verified live baseline. Rehearse it in an isolated environment with
   representative existing Auth memberships, records, file bindings and audit
   history. The completed empty-test-project upgrade and HTTP run do not prove
   preservation of that existing data. Do not replay initial schema setup over
   the live database or apply only selected hardening files.
2. Review the exact upgrade, a restorable backup and rehearsal results before
   scheduling the live change. Authorization covers restoration and the
   dedicated test project; production migrations require a separate reviewed
   decision. Do not import real data or change cloud mode before acceptance.
3. After the reviewed upgrade, verify the newest marker, catalog/advisor checks
   and real role-specific app flows. Follow the existing signed-download key
   rotation requirement in [Supabase setup](../SUPABASE_SETUP.md) if old signed
   download links were issued. Keep cloud cutover blocked until release checks
   pass.
4. Complete installation and relaunch checks on physical iPhone and Android
   devices for signed-out, office, field and customer accounts, following
   [JR OS on a phone](../MOBILE_APP.md). Browser and repository checks do not
   establish physical-device behavior.

The protected workflow is operational through GitHub's authenticated UI. Its
`supabase-test` environment pins project `tjfyneafvdgwrfdkpnlr`; the complete run
validated its URL, public key, service credential and migration without exposing
or changing secrets. Future security changes must run from their own exact
source with successful cleanup; an older green run is not acceptance evidence
for changed code.
