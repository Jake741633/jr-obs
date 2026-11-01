import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const identityGuard = readFileSync(new URL("../supabase/migrations/20260803_024_cloud_record_identity_guard.sql", import.meta.url), "utf8");
const tombstoneGuard = readFileSync(new URL("../supabase/migrations/20260803_021_tombstone_transition_guard.sql", import.meta.url), "utf8");
const markerGuard = readFileSync(new URL("../supabase/migrations/20260803_022_migration_marker_delete_guard.sql", import.meta.url), "utf8");

test("forged cloud record identity updates are rejected server-side", () => {
  assert.match(identityGuard, /new\.organisation_id is distinct from old\.organisation_id/i);
  assert.match(identityGuard, /new\.source_id is distinct from old\.source_id/i);
  assert.match(identityGuard, /new\.created_by is distinct from old\.created_by/i);
  assert.match(identityGuard, /new\.collection_key is distinct from old\.collection_key/i);
  assert.match(identityGuard, /raise exception/i);
});

test("soft-delete and restore replay require privileged authority", () => {
  assert.match(tombstoneGuard, /new\.deleted_at is distinct from old\.deleted_at/i);
  assert.match(tombstoneGuard, /not public\.can_manage_business\(\)/i);
  assert.match(tombstoneGuard, /Only an owner or admin can delete or restore records/i);
  assert.match(tombstoneGuard, /before insert or update of deleted_at/i);
});

test("migration markers cannot be deleted to replay legacy imports by office users", () => {
  assert.match(markerGuard, /for delete to authenticated/i);
  assert.match(markerGuard, /public\.can_manage_business\(\)/i);
  assert.match(markerGuard, /imported_by\s*=\s*auth\.uid\(\)/i);
  assert.doesNotMatch(markerGuard, /for all to authenticated/i);
});
