import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const runnerSource = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");
const integrationSource = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");
const anchor = "    // Customer scoping for typed tables and portal writes.";

const timelineCoverage = [
  "    const customerTimelineA = source(\"customer-timeline-a\");",
  "    await expectAllowed(",
  "      await insertRecord(accounts.A.office, \"cloud_collections\", genericRecord(",
  "        organisationA,",
  "        \"jr-os-job-timeline\",",
  "        customerTimelineA,",
  "        accounts.A.office,",
  "        customerA,",
  "        jobA,",
  "        {",
  "          milestone: \"First fix complete\",",
  "          eventType: \"Note\",",
  "          note: \"Private staff margin and internal customer note\",",
  "          completedBy: \"Private staff member\",",
  "          sourceId: source(\"private-timeline-source\"),",
  "          sourceType: \"Internal financial note\",",
  "          completedAt: \"2026-08-10T12:00:00.000Z\",",
  "          createdAt: \"2026-08-10T12:00:00.000Z\",",
  "        },",
  "      )),",
  "      \"Office should create a complete customer job timeline record\",",
  "    );",
  "",
  "    const officeTimeline = await listRecords(accounts.A.office, \"cloud_collections\", \"select=source_id,payload&collection_key=eq.jr-os-job-timeline&source_id=eq.\" + customerTimelineA);",
  "    await expectAllowed(officeTimeline, \"Office complete timeline query should execute\");",
  "    assert.equal(officeTimeline.payload.length, 1, \"Office should retain complete timeline history\");",
  "    assert.equal(officeTimeline.payload[0].payload.note, \"Private staff margin and internal customer note\");",
  "    assert.equal(officeTimeline.payload[0].payload.completedBy, \"Private staff member\");",
  "",
  "    const customerRawTimeline = await listRecords(accounts.A.customer, \"cloud_collections\", \"select=source_id,payload&collection_key=eq.jr-os-job-timeline&source_id=eq.\" + customerTimelineA);",
  "    await expectAllowed(customerRawTimeline, \"Customer complete timeline query should fail closed\");",
  "    assert.deepEqual(customerRawTimeline.payload, [], \"Customer must not read complete job timeline records\");",
  "",
  "    const customerTimeline = await listRecords(accounts.A.customer, \"customer_job_timeline\", \"select=source_id,payload&source_id=eq.\" + customerTimelineA);",
  "    await expectAllowed(customerTimeline, \"Customer timeline projection query should execute\");",
  "    assert.equal(customerTimeline.payload.length, 1, \"Customer should retain safe job progress events\");",
  "    assert.equal(customerTimeline.payload[0].payload.milestone, \"First fix complete\");",
  "    assert.equal(customerTimeline.payload[0].payload.jobId, jobA);",
  "    assert.equal(customerTimeline.payload[0].payload.note, \"\", \"Customer timeline projection must blank arbitrary internal notes\");",
  "    assert.equal(customerTimeline.payload[0].payload.completedBy, undefined, \"Customer timeline projection must omit staff attribution\");",
  "    assert.equal(customerTimeline.payload[0].payload.sourceId, undefined, \"Customer timeline projection must omit internal source IDs\");",
  "    assert.equal(customerTimeline.payload[0].payload.sourceType, undefined, \"Customer timeline projection must omit internal source types\");",
  "    assert.equal(customerTimeline.payload[0].payload.eventType, undefined, \"Customer timeline projection must omit internal event classification\");",
  "",
  "    const crossTenantTimeline = await listRecords(accounts.B.customer, \"customer_job_timeline\", \"select=source_id&source_id=eq.\" + customerTimelineA);",
  "    await expectAllowed(crossTenantTimeline, \"Cross-tenant customer timeline query should execute safely\");",
  "    assert.deepEqual(crossTenantTimeline.payload, [], \"Another organisation must not read the customer timeline projection\");",
  "",
  "    await expectDenied(",
  "      await insertRecord(accounts.A.customer, \"customer_job_timeline\", {",
  "        organisation_id: organisationA,",
  "        collection_key: \"jr-os-job-timeline\",",
  "        source_id: source(\"forged-customer-timeline\"),",
  "        customer_source_id: customerA,",
  "        job_source_id: jobA,",
  "        version: 1,",
  "        payload: { id: source(\"forged-customer-timeline\"), jobId: jobA, milestone: \"Paid\", note: \"\" },",
  "        created_at: new Date().toISOString(),",
  "        updated_at: new Date().toISOString(),",
  "      }),",
  "      \"Customer must not write the job timeline projection\",",
  "    );",
  "",
].join("\n");

assert.equal(integrationSource.split(anchor).length - 1, 1, "Expected one customer-scope anchor in the live RLS integration test");
const patchedIntegration = integrationSource.replace(anchor, timelineCoverage + anchor);

for (const phrase of [
  "Customer must not read complete job timeline records",
  "Customer should retain safe job progress events",
  "Customer timeline projection must blank arbitrary internal notes",
  "Customer timeline projection must omit staff attribution",
  "Customer timeline projection must omit internal source IDs",
  "Customer timeline projection must omit internal source types",
  "Another organisation must not read the customer timeline projection",
  "Customer must not write the job timeline projection",
]) {
  assert.match(patchedIntegration, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
}

test("live RLS runner proves customer timelines expose progress only", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "jr-os-customer-timeline-rls-"));
  const temporaryRunner = join(temporaryDirectory, "run-supabase-rls.integration.mjs");
  const temporaryIntegration = join(temporaryDirectory, "supabase-rls.integration.mjs");
  try {
    writeFileSync(temporaryRunner, runnerSource, "utf8");
    writeFileSync(temporaryIntegration, patchedIntegration, "utf8");
    const result = spawnSync(process.execPath, [temporaryRunner], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    assert.equal(result.status ?? 1, 0, "Customer timeline live RLS wrapper should complete successfully");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
