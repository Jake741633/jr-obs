import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_035_private_file_object_path_uniqueness.sql", import.meta.url),
  "utf8",
);

test("private objects have exactly one metadata ownership scope", () => {
  assert.match(
    migration,
    /group by bucket, object_path[\s\S]*having count\(\*\) > 1/i,
  );
  assert.match(
    migration,
    /add constraint private_files_bucket_object_path_key\s+unique \(bucket, object_path\)/i,
  );
});

test("private object-path protection is recovery-safe and reloads PostgREST", () => {
  assert.match(
    migration,
    /if not exists \([\s\S]*conrelid = 'public\.private_files'::regclass[\s\S]*contype = 'u'/i,
  );
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});
