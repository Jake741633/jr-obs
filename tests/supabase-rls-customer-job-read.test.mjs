import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");
const start = source.indexOf("    // Customer scoping for typed tables and portal writes.");
const end = source.indexOf("    await expectDenied(await insertRecord(accounts.A.customer", start);
assert.ok(start >= 0 && end > start);
const snippet = source.slice(start, end);
const job = { organisation_id: "tenant-a", source_id: "job-a", customer_source_id: "customer-a", payload: { id: "job-a", title: "Site visit", status: "First fix" } };

async function check({ canonical = [], projected = [job], failedTable } = {}) {
  const customer = { id: "customer-user-a" };
  const queries = [];
  await runInNewContext("(async () => {" + snippet + "})()", {
    assert: { ...assert, deepEqual: (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message) },
    accounts: { A: { customer } }, jobA: "job-a", organisationA: "tenant-a", customerA: "customer-a",
    expectAllowed: async (response, message) => assert.equal(response.ok, true, message),
    listRecords: async (account, table, query) => {
      assert.equal(account, customer);
      queries.push([table, query]);
      return { ok: table !== failedTable, payload: structuredClone(table === "jobs" ? canonical : projected) };
    },
  });
  assert.deepEqual(queries, [
    ["jobs", "select=source_id,customer_source_id"],
    ["customer_jobs", "select=organisation_id,source_id,customer_source_id,payload"],
  ]);
}

test("live customer job assertions require canonical denial and an exact safe projection", () => check());
test("live customer job assertions reject canonical visibility", () => assert.rejects(check({ canonical: [job] }), /must not enumerate canonical jobs/));
test("live customer job assertions reject a missing projected job", () => assert.rejects(check({ projected: [] }), /exact tenant and customer job/));
for (const [name, change] of [
  ["another tenant", { organisation_id: "tenant-b" }],
  ["another customer", { customer_source_id: "customer-b" }],
  ["another job", { source_id: "job-b" }],
]) {
  test(`live customer job assertions reject ${name}`, () => assert.rejects(check({ projected: [{ ...job, ...change }] }), /exact tenant and customer job/));
}
test("live customer job assertions reject additional projected jobs", () => assert.rejects(check({ projected: [job, { ...job, source_id: "job-b" }] }), /exact tenant and customer job/));
test("live customer job assertions reject mismatched payload identity", () => assert.rejects(check({ projected: [{ ...job, payload: { id: "job-b" } }] }), /canonical job identity/));
for (const key of ["value", "quoteSnapshot", "notes", "assignedTo", "internalNotes", "profitability"]) {
  test(`live customer job assertions reject private ${key}`, () => assert.rejects(check({ projected: [{ ...job, payload: { ...job.payload, [key]: "private" } }] }), /must omit private field/));
}
for (const failedTable of ["jobs", "customer_jobs"]) {
  test(`live customer job assertions reject HTTP failure for ${failedTable}`, () => assert.rejects(check({ failedTable }), /should execute/));
}
