import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");
const start = source.indexOf("    // Direct job writes must affect zero rows");
const end = source.indexOf("    const rejectedJobStatusMutationId", start);
assert.ok(start >= 0 && end > start);
// Evaluate the runner's template escaping, then execute its actual live assertions.
const snippet = runInNewContext("`" + source.slice(start, end) + "`");
const job = { source_id: "job-a", version: 3, deleted_at: null, payload: { id: "job-a", status: "First fix", notes: "Private" } };

async function check({ before = [job], after = [job], result = { ok: true, payload: [] } } = {}) {
  const office = { id: "office" };
  const electrician = { id: "electrician" };
  let reads = 0;
  let writes = 0;
  await runInNewContext("(async () => {" + snippet + "})()", {
    // Normalize cross-realm arrays without weakening strict value comparisons.
    assert: { ...assert, deepEqual: (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message) },
    accounts: { A: { office, electrician } }, jobA: "job-a",
    expectAllowed: async (response, message) => assert.equal(response.ok, true, message),
    listRecords: async (account, table, query) => {
      assert.equal(account, office);
      assert.equal(table, "jobs");
      assert.equal(query, "select=*&source_id=eq.job-a");
      return { ok: true, payload: structuredClone(reads++ === 0 ? before : after) };
    },
    patchRecords: async (account, table, query, body) => {
      assert.equal(account, electrician);
      assert.equal(table, "jobs");
      assert.equal(query, "source_id=eq.job-a");
      assert.equal(body.payload.status, "Second fix");
      writes++;
      return result;
    },
  });
  assert.equal(reads, 2);
  assert.equal(writes, 1);
}

test("filtered direct job update passes only with zero returned rows and unchanged job", () => check());
test("direct job write rejects returned rows", () => assert.rejects(check({ result: { ok: true, payload: [job] } }), /must fail closed/));
test("direct job write rejects missing initial fixture", () => assert.rejects(check({ before: [] }), /requires an existing/));
test("direct job write rejects malformed response", () => assert.rejects(check({ result: { ok: true, payload: null } }), /must fail closed/));
test("direct job write does not accept arbitrary HTTP failures", () => assert.rejects(check({ result: { ok: false, payload: [] } }), /without matching rows/));
for (const [name, after] of [
  ["payload change", [{ ...job, payload: { ...job.payload, status: "Second fix" } }]],
  ["version change", [{ ...job, version: 4 }]],
  ["soft deletion", [{ ...job, deleted_at: "2026-09-12T00:00:00Z" }]],
  ["row disappearance", []],
]) {
  test(`direct job write rejects ${name} even with an empty response`, () => assert.rejects(check({ after }), /entire canonical job unchanged/));
}
