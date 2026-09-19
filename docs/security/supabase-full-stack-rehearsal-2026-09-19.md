# Full Supabase existing-data rehearsal

This adds the `full-supabase-upgrade` job to JR OS CI. Acceptance is pending its
first completed run. It starts an unlinked temporary Supabase project on the
GitHub runner with PostgreSQL 17, Auth, the Data API and Storage, using pinned
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
