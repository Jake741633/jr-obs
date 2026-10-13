import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const runnerSource = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");
const integrationSource = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");

const anchor = "    // Customer scoping for typed tables and portal writes.";

for (const phrase of [
  "Electrician must not read complete certificate records",
  "Office should retain complete certificate records",
]) {
  assert.match(runnerSource, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
}

const certificateCoverage = [
  "    const certificateA = source(\"certificate-a\");",
  "    const draftBaseCertificate = await listRecords(accounts.A.customer, \"certificates\", \"select=source_id,payload&source_id=eq.\" + certificateA);",
  "    await expectAllowed(draftBaseCertificate, \"Customer base certificate query should fail closed\");",
  "    assert.deepEqual(draftBaseCertificate.payload, [], \"Customer must not read complete Draft certificate records\");",
  "",
  "    const draftCustomerCertificate = await listRecords(accounts.A.customer, \"customer_certificates\", \"select=source_id,payload&source_id=eq.\" + certificateA);",
  "    await expectAllowed(draftCustomerCertificate, \"Draft customer certificate projection query should execute safely\");",
  "    assert.deepEqual(draftCustomerCertificate.payload, [], \"Draft certificates must not appear in the customer projection\");",
  "",
  "    const issuedCertificatePayload = {",
  "      id: certificateA,",
  "      customerId: customerA,",
  "      jobId: jobA,",
  "      testRun: runId,",
  "      number: \"EIC-SEC-001\",",
  "      type: \"Electrical Installation Certificate\",",
  "      status: \"Issued\",",
  "      installationAddress: \"1 Test Street\",",
  "      description: \"Issued customer certificate\",",
  "      inspectorName: \"Field electrician\",",
  "      schemeProvider: \"Test scheme\",",
  "      registrationNumber: \"REG-SEC-001\",",
  "      inspectionDate: \"2026-08-09\",",
  "      nextInspectionDate: \"2031-08-09\",",
  "      outcome: \"Satisfactory\",",
  "      observations: \"Customer-visible observation\",",
  "      structuredObservations: [{",
  "        id: source(\"certificate-observation-a\"),",
  "        sourceText: \"Internal drafting source\",",
  "        location: \"Consumer unit\",",
  "        observation: \"Final observation\",",
  "        recommendation: \"No action\",",
  "        regulationReference: \"BS 7671\",",
  "        code: \"No code\",",
  "        confidence: \"Low\",",
  "        accepted: true,",
  "      }],",
  "      externalPdfUrl: \"https://example.com/certificate.pdf\",",
  "      createdAt: \"2026-08-09T00:00:00.000Z\",",
  "      updatedAt: \"2026-08-09T00:00:00.000Z\",",
  "    };",
  "",
  "    await expectDenied(",
  "      await patchRecords(accounts.A.electrician, \"certificates\", \"source_id=eq.\" + certificateA, { payload: issuedCertificatePayload }),",
  "      \"Electrician direct certificate issuance must fail closed\",",
  "    );",
  "    await expectAllowed(",
  "      await patchRecords(accounts.A.office, \"certificates\", \"source_id=eq.\" + certificateA, { payload: issuedCertificatePayload }),",
  "      \"Office should issue a same-tenant certificate\",",
  "    );",
  "",
  "    const officeIssuedCertificate = await listRecords(accounts.A.office, \"certificates\", \"select=source_id,payload&source_id=eq.\" + certificateA);",
  "    await expectAllowed(officeIssuedCertificate, \"Office issued certificate query should execute\");",
  "    assert.equal(officeIssuedCertificate.payload.length, 1, \"Office should retain the complete issued certificate\");",
  "    assert.equal(officeIssuedCertificate.payload[0].payload.structuredObservations[0].sourceText, \"Internal drafting source\", \"Office should retain internal certificate drafting metadata\");",
  "",
  "    const electricianIssuedCertificate = await listRecords(accounts.A.electrician, \"certificates\", \"select=source_id,payload&source_id=eq.\" + certificateA);",
  "    await expectAllowed(electricianIssuedCertificate, \"Electrician complete issued certificate query should fail closed\");",
  "    assert.deepEqual(electricianIssuedCertificate.payload, [], \"Electrician must not read complete issued certificate records\");",
  "",
  "    const customerIssuedCertificate = await listRecords(accounts.A.customer, \"customer_certificates\", \"select=source_id,payload&source_id=eq.\" + certificateA);",
  "    await expectAllowed(customerIssuedCertificate, \"Customer issued certificate projection query should execute\");",
  "    assert.equal(customerIssuedCertificate.payload.length, 1, \"Issued certificates should appear in the customer projection\");",
  "    assert.equal(customerIssuedCertificate.payload[0].payload.status, \"Issued\");",
  "    assert.equal(customerIssuedCertificate.payload[0].payload.number, \"EIC-SEC-001\");",
  "    assert.equal(customerIssuedCertificate.payload[0].payload.observations, \"Customer-visible observation\");",
  "    assert.equal(customerIssuedCertificate.payload[0].payload.externalPdfUrl, \"https://example.com/certificate.pdf\", \"The live issued projection should retain the current certificate capability for guarded activation\");",
  "    assert.equal(customerIssuedCertificate.payload[0].payload.structuredObservations, undefined, \"Customer certificate projection must omit internal structured observations\");",
  "",
  "    const customerIssuedBase = await listRecords(accounts.A.customer, \"certificates\", \"select=source_id,payload&source_id=eq.\" + certificateA);",
  "    await expectAllowed(customerIssuedBase, \"Customer complete issued certificate query should fail closed\");",
  "    assert.deepEqual(customerIssuedBase.payload, [], \"Customer must not bypass the projection through the base certificate table\");",
  "",
  "    const crossTenantCertificate = await listRecords(accounts.B.customer, \"customer_certificates\", \"select=source_id&source_id=eq.\" + certificateA);",
  "    await expectAllowed(crossTenantCertificate, \"Cross-tenant customer certificate query should execute safely\");",
  "    assert.deepEqual(crossTenantCertificate.payload, [], \"Another organisation must not read the issued certificate projection\");",
  "",
  "    await expectDenied(",
  "      await insertRecord(accounts.A.customer, \"customer_certificates\", {",
  "        organisation_id: organisationA,",
  "        source_id: source(\"forged-customer-certificate\"),",
  "        customer_source_id: customerA,",
  "        version: 1,",
  "        payload: { id: source(\"forged-customer-certificate\"), status: \"Issued\" },",
  "        created_at: new Date().toISOString(),",
  "        updated_at: new Date().toISOString(),",
  "      }),",
  "      \"Customer must not write the issued certificate projection\",",
  "    );",
  "",
  "    await expectAllowed(",
  "      await patchRecords(accounts.A.office, \"certificates\", \"source_id=eq.\" + certificateA, { payload: { ...issuedCertificatePayload, status: \"Superseded\", updatedAt: \"2026-08-10T00:00:00.000Z\" } }),",
  "      \"Office should supersede a same-tenant certificate\",",
  "    );",
  "    const supersededCustomerCertificate = await listRecords(accounts.A.customer, \"customer_certificates\", \"select=source_id&source_id=eq.\" + certificateA);",
  "    await expectAllowed(supersededCustomerCertificate, \"Superseded customer certificate projection query should execute safely\");",
  "    assert.deepEqual(supersededCustomerCertificate.payload, [], \"Superseded certificates must disappear from the customer projection\");",
  "    const officeSupersededCertificate = await listRecords(accounts.A.office, \"certificates\", \"select=source_id,payload&source_id=eq.\" + certificateA);",
  "    await expectAllowed(officeSupersededCertificate, \"Office superseded certificate query should execute\");",
  "    assert.equal(officeSupersededCertificate.payload[0].payload.status, \"Superseded\", \"Office should retain the superseded certificate history\");",
  "",
].join("\n");

assert.equal(integrationSource.split(anchor).length - 1, 1, "Expected one customer-scope anchor in the live RLS integration test");
const patchedIntegration = integrationSource.replace(anchor, certificateCoverage + anchor);

for (const phrase of [
  "Customer must not read complete Draft certificate records",
  "Draft certificates must not appear in the customer projection",
  "Electrician direct certificate issuance must fail closed",
  "Office should issue a same-tenant certificate",
  "Electrician must not read complete issued certificate records",
  "Issued certificates should appear in the customer projection",
  "The live issued projection should retain the current certificate capability for guarded activation",
  "Customer certificate projection must omit internal structured observations",
  "Customer must not bypass the projection through the base certificate table",
  "Another organisation must not read the issued certificate projection",
  "Customer must not write the issued certificate projection",
  "Superseded certificates must disappear from the customer projection",
  "Office should retain the superseded certificate history",
]) {
  assert.match(patchedIntegration, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
}

test("live RLS runner proves customers receive issued certificates only", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "jr-os-customer-certificate-rls-"));
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
    assert.equal(result.status ?? 1, 0, "Customer certificate live RLS wrapper should complete successfully");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
