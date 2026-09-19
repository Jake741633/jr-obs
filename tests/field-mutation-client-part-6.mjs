import {
  assert,
  test,
  repository,
  adapter,
  storage,
  client,
} from "./field-mutation-client-helpers.mjs";

test("client sends idempotent RPC args and reconciles mounted safe caches without requeueing", () => {
  for (const arg of ["record_source_id", "expected_version", "requested_status", "collection_key_value", "record_payload", "mutation_id"]) {
    assert.match(repository, new RegExp(`${arg}:`));
  }
  assert.match(client, /class CloudRequestError extends Error/);
  assert.match(client, /error\.status === 409 \|\| error\.code === "PT409"/);
  assert.match(repository, /state: isCloudConflictError\(error\) \? "Conflict" : "Failed"/);
  assert.match(adapter, /index < 0 \? "create" : "unknown"/);
  assert.match(storage, /before \? undefined : 0/);
  assert.match(repository, /jr-os-cloud-cache-reconciled/);
  assert.match(storage, /window\.addEventListener\("jr-os-cloud-cache-reconciled", reconcileCloudCache\)/);
  assert.match(storage, /previousRef\.current = next/);
  assert.match(storage, /return \(\) => window\.removeEventListener\("jr-os-cloud-cache-reconciled", reconcileCloudCache\)/);
});
