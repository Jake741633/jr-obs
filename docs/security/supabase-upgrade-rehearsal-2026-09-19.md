# Existing-data SQL upgrade rehearsal

The local SQL stage passed on 19 September 2026. It restores a synthetic baseline
backup and applies the exact 70 pending migrations from the
[review manifest](./supabase-upgrade-manifest-2026-09-19.json). Application source
baseline: `42793af2d24a987aab622e89dc64a211b7cab103` on `jr-os-v2`.

This is an embedded PostgreSQL rehearsal, not a hosted Supabase restore or a
production backup. No production schema, records, credentials or configuration
were changed. A subsequent
[full service rehearsal](./supabase-full-stack-rehearsal-2026-09-19.md) passed
native restoration and real Auth, Data API and Storage checks with synthetic data.
Its PR is awaiting npm audit recovery. Production execution still requires a
protected backup and restore review plus separate authorization.

## Run it

From the repository root, with Node.js 22:

```sh
npm ci --ignore-scripts --prefix scripts/supabase-rehearsal
npm audit --audit-level=moderate --prefix scripts/supabase-rehearsal
npm test --prefix scripts/supabase-rehearsal
```

The command creates in-memory databases and accepts no database URL, credentials
or command-line arguments. Its dependencies have their own pinned lockfile and
are not application dependencies. The `upgrade-rehearsal` job in JR OS CI runs
the same command for pull requests and updates to `jr-os-v2` and `main`.

## Coverage and result

| Check | Result |
| --- | --- |
| Engine | PostgreSQL 17.5 in PGlite 0.4.6; linked project is PostgreSQL 17.6 |
| Baseline | Initial schema plus all 36 effective migrations through `private_file_object_path_uniqueness` |
| Existing records | 134 synthetic rows across all 31 baseline tables, including Auth and Storage metadata |
| Identities | Nine users, eight session rows, two populated tenants; owner, admin, office, assigned field, live/stale customer, revoked and inactive actors |
| Upgrade | All 70 manifest files execute unchanged, in recovery order, with SHA-256 verification |
| Supersession | Obsolete planner migration 063 stays excluded; self-contained 064 preserves completed/cancelled history for archived team members |
| Preservation | 125 existing rows preserve their data; nine changes match explicit migration rules |
| History | All nine existing audit rows and all historical approval evidence survive; three new audit rows record repairs |
| SQL access | Office access retains commercial data; field/customer projections and private-file reads retain their tenant/assignment scope; stale/revoked/inactive access is denied |
| Final schema | Latest marker matches the manifest; all 44 public tables have RLS |
| Existing probes | Planner tombstone and private Storage operation probes pass and roll back without changing upgraded records |
| Dependency audit | No vulnerabilities at the moderate-or-higher gate |

The nine reviewed changes are six private-file `storage_key` backfills, two
Sent-to-Accepted quote repairs backed by existing approval evidence, and one
stale portal membership changing to inactive. Unknown file bindings remain NULL.
The comparison checks every other field, including identity, payload, version,
timestamps and attribution; it does not broadly ignore mutable columns.

Fixtures also cover archived customers/jobs, completed/cancelled/deleted planner
history, issued certificates, drafts, invoices, payments, deposits, payment links,
surveys and private photos, existing object metadata, local-backup records and
import markers. Object bytes are not represented.

## Synthetic backup and rejected baselines

The runner uses PGlite's WASM `pg_dump`, creates a fresh database, restores the
dump, then compares every row and the restored columns, constraints, triggers,
indexes, policies, functions and effective grants. It performs the upgrade on
that restored database. Each run reports its synthetic dump size and SHA-256;
random fixture identifiers and timestamps make those hashes run-specific.

Four additional restored databases contain deliberately invalid existing data:

- A private-file object path for the wrong tenant: migration 036 rejects it.
- A job whose payload ID disagrees with its envelope: migration 039 rejects it.
- A planner entry referencing a missing team member: migration 064 rejects it.
- Two historical approval decisions for one quote: the atomic-approval migration rejects them.

Each case must stop at the expected migration and reason, preserve the preceding
records and catalog after rollback, and skip later files. This does not claim
the entire 70-file sequence is atomic. The runner submits each file as one SQL
batch; plain `psql -f` can commit individual statements unless transaction
boundaries are supplied. Earlier files may already have committed, and some
migrations contain their own transaction boundaries. Production recovery
must use a reviewed backup or an explicit forward repair, not an assumed outer
transaction or an automatic retry.

## Production backup review

The authenticated Supabase dashboard was reviewed on 19 September after
[PR #239](https://github.com/Jake741633/jr-obs/pull/239) merged as
`bc5946e32bbc6e2514efc5d379f3bb038f9e2e43`. Its five resulting workflows and
the preview passed, including the rehearsal on both CI events.

For the linked project `kavyemkgasrtkqjgrpgw`:

- The project overview reported no backups.
- [Scheduled backups](https://supabase.com/dashboard/project/kavyemkgasrtkqjgrpgw/database/backups/scheduled)
  confirmed that the current Free plan does not include project backups.
- [Point-in-time recovery](https://supabase.com/dashboard/project/kavyemkgasrtkqjgrpgw/database/backups/pitr)
  showed the Pro-plan add-on offer, with no restore point available.
- The project is `ACTIVE_HEALTHY`; a fresh read-only database check still found
  three Auth users, three organisations, zero Storage objects and the unchanged
  `20260809134430` / `private_file_object_path_uniqueness` migration baseline.

No managed restore point was available to review. This does not determine whether
an independent backup exists elsewhere. No production backup was exported in
this session, and no paid plan, add-on, project, password or security setting was
changed. **The production backup gate remains unmet.**

The next backup deliverable is a protected logical export from a trusted
environment with database access, following the current
[Supabase backup/restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
It must cover the JR OS `public`/`private` schema and data, Auth identities,
Storage metadata, migration history, grants, the custom Auth signup trigger and
Storage policies. The documented default dump requires separate handling of
custom `auth`/`storage` schema changes and `supabase_migrations` history. Review
any platform encryption requirements before restoring into another project.

Keep the actual dump and credentials outside GitHub and application artifacts.
Record capture time, source baseline, file hashes and restore results without
publishing credentials or Auth records. Restore into an isolated full Supabase
environment and verify identities, memberships, canonical rows, private-file
bindings, audit history, grants, RLS and application flows before applying the
pending upgrade there. A successful export alone is not a restore test. Recheck
Storage object count at capture time and separately preserve object bytes if
any exist. Creating a paid recovery option would require a separate decision.

## Limits and remaining release evidence

[platform.sql](../../supabase/rehearsal/platform.sql) models only the Auth and
Storage database contracts used by JR OS. Its helper behavior was checked against
the disposable project's catalog. It is **local-only** and must never be applied
to hosted Supabase. It has no Auth service, JWT verification, Data API, Storage
HTTP server, object bytes, platform event triggers or concurrent workload.

The separate [protected hosted RLS/Storage acceptance](./supabase-deployment-audit-2026-09-11.md)
remains the evidence for real Auth and Storage HTTP behavior. The local run does
not replace it, model production locking/downtime, or establish that production
has a usable backup.

Before a production change, verify the live baseline again, review an actual
restorable backup and its recovery procedure, and assess the completed full
service synthetic rehearsal alongside a restore of the protected production
export. Database
backups contain Storage metadata, not stored object bytes; include an object
backup if objects exist at the final review. Review the resulting evidence and
obtain production migration authorization before execution. Physical iPhone and
Android installation checks also remain separate.

References: [PGlite pg_dump](https://pglite.dev/docs/pglite-tools),
[PostgreSQL SQL dumps](https://www.postgresql.org/docs/17/backup-dump.html), and
[Supabase database backups](https://supabase.com/docs/guides/platform/backups).
