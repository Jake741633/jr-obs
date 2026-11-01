import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");
const start = source.indexOf("async function expectFilteredUpdateUnchanged(");
const end = source.indexOf("\nconst integrationTest", start);
assert.ok(start >= 0 && end > start);
const record = { source_id: "fixture-a", version: 3, deleted_at: null, payload: { id: "fixture-a", notes: "Private" } };
const response = (payload, ok = true) => ({ response: { ok }, payload });

async function check({ before = response([record]), after = response([record]), result = response([]) } = {}) {
  const account = { id: "electrician" };
  const reader = { id: "office" };
  let reads = 0;
  let writes = 0;
  const verify = runInNewContext(`${source.slice(start, end)}\nexpectFilteredUpdateUnchanged`, {
    assert: { ...assert, deepEqual: (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message) },
    expectAllowed: async (value, message) => assert.equal(value.response.ok, true, message),
    listRecords: async (actor, table, query) => {
      assert.equal(actor, reader);
      assert.equal(table, "builders");
      assert.equal(query, "select=*&source_id=eq.fixture-a");
      return structuredClone(reads++ === 0 ? before : after);
    },
    patchRecords: async (actor, table, query, body) => {
      assert.equal(actor, account);
      assert.equal(table, "builders");
      assert.equal(query, "source_id=eq.fixture-a");
      assert.equal(body.payload.notes, "Forged");
      writes++;
      return result;
    },
  });
  await verify({ account, reader, table: "builders", filter: "source_id=eq.fixture-a", body: { payload: { id: "fixture-a", notes: "Forged" } }, message: "Forbidden write" });
  assert.equal(reads, 2);
  assert.equal(writes, 1);
}

test("filtered update requires zero returned rows and an unchanged full canonical record", () => check());
test("filtered update rejects returned rows", () => assert.rejects(check({ result: response([record]) }), /must return zero rows/));
test("filtered update rejects missing initial fixtures", () => assert.rejects(check({ before: response([]) }), /requires an existing/));
test("filtered update rejects multiple initial fixtures", () => assert.rejects(check({ before: response([record, record]) }), /requires an existing/));
test("filtered update rejects malformed responses", () => assert.rejects(check({ result: response(null) }), /must return zero rows/));
test("filtered update rejects arbitrary HTTP failures", () => assert.rejects(check({ result: response([], false) }), /without matching rows/));
test("filtered update requires a successful initial canonical read", () => assert.rejects(check({ before: response([record], false) }), /read before update/));
test("filtered update requires a successful final canonical read", () => assert.rejects(check({ after: response([record], false) }), /read after update/));
for (const [name, after] of [
  ["payload changes", [{ ...record, payload: { ...record.payload, notes: "Forged" } }]],
  ["version changes", [{ ...record, version: 4 }]],
  ["soft deletion", [{ ...record, deleted_at: "2026-09-19T00:00:00Z" }]],
  ["row disappearance", []],
]) {
  test(`filtered update rejects ${name} even with an empty response`, () => assert.rejects(check({ after: response(after) }), /entire canonical record must remain unchanged/));
}
