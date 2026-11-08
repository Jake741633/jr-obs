import test from 'node:test';

test('the upgrade manifest covers every recovery migration with its current checksum', async () => {
  // Run the same preflight used by both upgrade rehearsals in the main suite.
  // Missing files, reordered entries and stale SQL checksums must fail here too.
  await import('../scripts/supabase-rehearsal/common.mjs');
});
