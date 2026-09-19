# Full Supabase existing-data rehearsal

The full service rehearsal passed on 19 September 2026 at 17:15:36 UTC against
code head `750dc5a0acbe422b4011bc85c717f07183e19fd1` in
[CI run 35457448264](https://github.com/Jake741633/jr-obs/actions/runs/35457448264),
job `105935146622`. The required npm audit subsequently failed during upstream
maintenance, so the workflow is **not green** and
[PR #241](https://github.com/Jake741633/jr-obs/pull/241) remains unmerged.

The `full-supabase-upgrade` job starts an unlinked temporary Supabase project on
the GitHub runner with PostgreSQL 17, Auth, the Data API and Storage, using pinned
Supabase CLI 2.117.0 and a separate dependency lockfile.

The runner accepts no connection arguments and requires an ephemeral GitHub
Actions environment. It creates a unique project directory, verifies loopback
service addresses and targets only containers carrying that new project ID.
There are no hosted credentials, production connections or uploaded backup
artifacts. Cleanup removes the temporary project's containers, data volumes and
synthetic dump. The existing embedded SQL rehearsal still tests four rejected
baselines independently.

## Procedure

1. Apply the initial schema and 36 effective baseline migrations unchanged.
2. Create nine synthetic users through Auth, revoke one through the logout API,
   seed the shared representative business records, and upload eight private
   files through Storage HTTP. Preserve a synthetic migration-history row with
   the reviewed baseline version/name; this is not production history.
3. Stop service containers, snapshot all public/private/Auth/Storage records and
   the catalog, and capture a native `pg_dump` archive of the local database.
4. Drop that synthetic database, recreate it from the archive with `pg_restore`,
   and compare records, columns, constraints, triggers, indexes, policies,
   functions, effective grants and migration history before any upgrade.
5. Apply the exact 70 pending files in frozen recovery order, verifying their
   hashes. Check every existing public row against the same nine explicitly
   reviewed transformations as the embedded rehearsal. Auth and Storage rows
   must remain identical. Check SQL access, RLS and both rollback probes.
6. Restart services. Exercise existing JWTs, fresh password logins, a restored
   refresh token, revoked-token denial, tenant and role API boundaries, and
   private downloads with byte hashes and negative access cases. Replace an
   existing drawing, verify the new bytes as its assigned field reader, and
   confirm bulk deletion leaves the object untouched, then delete that existing
   unbound file through the permitted single-object owner Storage API. Verify
   its metadata is removed and its bytes cannot be downloaded.

The restart waits for Auth, Storage and the Data API to become ready before
running access assertions. The catalog comparison retains visible column order
and every column definition while excluding internal ordinal/descriptor numbers:
PostgreSQL leaves physical gaps after dropped columns, and a logical restore
compacts those gaps. A focused native-dump regression check accepted that
renumbering and still detected a visible column reorder. The full-platform run
also covers this case in existing Auth tables.

## Verified result

| Check | Result |
| --- | --- |
| Native database | PostgreSQL 17.6, Supabase image `17.6.1.167`; linked project uses `17.6.1.155` |
| Services | Auth `v2.196.0`, PostgREST `v16.2`, Storage `v1.72.1`, Kong `2.8.1`; exact image digests are in the run log |
| Baseline | Initial schema plus 36 effective migrations, 107 existing public rows and representative managed-platform records |
| Native logical restore | All snapshotted rows, catalog definitions/effective grants and synthetic migration history preserved |
| Frozen upgrade | All 70 pending files passed; 98 public rows unchanged and nine transformations matched the reviewed rules |
| Auth and Storage metadata | All existing platform rows preserved before service restart |
| SQL access | Tenant/role checks and both rollback probes passed; all 44 public tables retain RLS |
| Auth HTTP | Existing JWTs, owner/field/customer password sign-in, office token refresh, and revoked-token denial passed |
| Data API | Management, field and customer scopes, cross-tenant isolation, stale/inactive/revoked actors and anonymous denial passed |
| Stored files | Eight original byte hashes preserved; assigned-field reads and negative download cases passed |
| File writes | Existing-file upsert and field readback passed; bulk deletion had no effect; single-file deletion removed metadata and prevented download |
| Runtime | 76 seconds including container startup, followed by successful temporary-project cleanup |
| Application checks | All 1,576 tests passed; lint had zero errors and 17 existing warnings; production build and preview passed |
| Embedded SQL checks | Synthetic restore, all 70 migrations, preservation and four rejected baselines passed |
| Current dependency audits | Blocked by npm maintenance; still required before merge |

The successful run's disposable archive was 497,519 bytes with SHA-256
`16f264f970398e2b9097a0aed42818980d56b8bc216d457a24ddecd42df64eea`.
Random fixture IDs and timestamps make this hash specific to that run. No dump
or credential artifact was uploaded.

## CI audit blocker

The same lockfiles passed the moderate-or-higher audit before the outage. Fresh
local audits subsequently received HTTP 503 from npm's bulk advisory endpoint,
with npm explicitly reporting maintenance. GitHub's bundled npm 10.9.8 falls
back to the retired quick endpoint, which returns HTTP 400 and a misleading
package-tree error. This affected both the unchanged application lockfile and
the isolated rehearsal lockfile. No lockfile was regenerated in response.

[npm's status page](https://status.npmjs.org/) announced maintenance for
19 September, 17:00–19:00 UTC; that is a scheduled window, not a guaranteed
recovery time. Tests and builds now run before their dependency audits so their
results remain visible during an audit-service outage. An audit failure still
fails the job and workflow. No audit is skipped, downgraded or allowed to fail.

After npm recovers, rerun the failed workflow jobs, inspect the exact PR head's
checks and preview, and merge only after every required check passes. Recheck
the current target branch before merging, then verify its resulting workflows.

## Scope

This rehearses a synthetic database replacement in the same local cluster.
Cluster roles, JWT keys and the Storage object volume are retained. Object bytes
are uploaded before the upgrade and checked afterward; this does not test
restoration from an independent object backup. Local email confirmation is off
to create fixtures without sending mail. Production confirmation stays enabled.
No production SQL, Auth settings, keys, passwords or paid services are changed.

`pg_restore --create` restores database properties outside a single transaction.
Each migration is submitted as one SQL batch, and some files contain their own
transaction boundaries. Neither the restore nor the complete migration sequence
is claimed to be atomic. The existing SQL rehearsal covers rejection/rollback
of individual invalid baselines.

A passing run supplies full-service synthetic upgrade evidence. It does not
prove that the linked project has a usable backup, that platform versions match
exactly, or that a real-data restore will succeed. The separate protected hosted
RLS/Storage suite remains the hosted acceptance check. A protected production
export, real-data restore review and explicit production migration authorization
remain required. Physical mobile installation checks remain separate.

References: [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started),
[CI testing](https://supabase.com/docs/guides/deployment/ci/testing), and
[backup/restore guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
plus [PostgreSQL dropped-column catalog behavior](https://www.postgresql.org/docs/17/catalog-pg-attribute.html).
