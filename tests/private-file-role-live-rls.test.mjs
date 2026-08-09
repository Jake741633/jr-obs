import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const runnerSource = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");
const integrationSourceUrl = new URL("./supabase-rls.integration.mjs", import.meta.url);

const constantsAnchor = "for (const [label, snippet] of [";
const chainAnchor = "    .replace(genericReadSnippet, safeGenericReadSnippet);";

const injectedConstants = String.raw`
const ownPrivateMetadataSnippet = `    await expectAllowed(\n      await insertRecord(accounts.A.electrician, "private_files", {\n        organisation_id: organisationA,\n        source_id: source("file-own"),\n        job_source_id: jobA,\n        customer_source_id: customerA,\n        bucket: "jr-os-private",\n        object_path: ownStoragePath,\n        file_name: "file.txt",\n        mime_type: "text/plain",\n        created_by: accounts.A.electrician.id,\n        updated_by: accounts.A.electrician.id,\n      }),\n      "Staff should write private file metadata",\n    );`;

const safeOwnPrivateMetadataSnippet = `    await expectAllowed(\n      await insertRecord(accounts.A.electrician, "private_files", {\n        organisation_id: organisationA,\n        source_id: source("file-own"),\n        storage_key: "jr-os-job-documents",\n        job_source_id: jobA,\n        customer_source_id: customerA,\n        bucket: "jr-os-private",\n        object_path: ownStoragePath,\n        file_name: "file.txt",\n        mime_type: "text/plain",\n        created_by: accounts.A.electrician.id,\n        updated_by: accounts.A.electrician.id,\n      }),\n      "Staff should write private file metadata",\n    );`;

const otherCustomerMetadataSnippet = `    await expectAllowed(\n      await insertRecord(accounts.A.office, "private_files", {\n        organisation_id: organisationA,\n        source_id: otherCustomerFile,\n        job_source_id: otherCustomerJobA,\n        customer_source_id: otherCustomerA,\n        bucket: "jr-os-private",\n        object_path: otherCustomerStoragePath,\n        file_name: "other-customer.txt",\n        mime_type: "text/plain",\n        created_by: accounts.A.office.id,\n        updated_by: accounts.A.office.id,\n      }),\n      "Office should write other-customer file metadata",\n    );`;

const privateRoleCoverage = `    await expectAllowed(\n      await insertRecord(accounts.A.office, "private_files", {\n        organisation_id: organisationA,\n        source_id: otherCustomerFile,\n        storage_key: "jr-os-job-documents",\n        job_source_id: otherCustomerJobA,\n        customer_source_id: otherCustomerA,\n        bucket: "jr-os-private",\n        object_path: otherCustomerStoragePath,\n        file_name: "other-customer.txt",\n        mime_type: "text/plain",\n        created_by: accounts.A.office.id,\n        updated_by: accounts.A.office.id,\n      }),\n      "Office should write other-customer file metadata",\n    );\n\n    await expectAllowed(\n      await storageRequest(accounts.A.electrician, "jr-os-private", ownStoragePath, { method: "GET" }, "authenticated"),\n      "Electrician should download a field job document",\n    );\n    await expectAllowed(\n      await storageRequest(accounts.A.customer, "jr-os-private", ownStoragePath, { method: "GET" }, "authenticated"),\n      "Customer should download their own job document",\n    );\n\n    const surveyPhotoFile = source("survey-photo-role");\n    const surveyPhotoPath = \`\${organisationA}/jobs/\${jobA}/\${surveyPhotoFile}/survey.jpg\`;\n    await expectAllowed(\n      await storageRequest(accounts.A.electrician, "jr-os-private", surveyPhotoPath, {\n        method: "POST",\n        headers: { "Content-Type": "image/jpeg", "x-upsert": "false" },\n        body: Buffer.from("survey-photo"),\n      }),\n      "Electrician should upload a field survey photo",\n    );\n    await expectAllowed(\n      await insertRecord(accounts.A.electrician, "private_files", {\n        organisation_id: organisationA,\n        source_id: surveyPhotoFile,\n        storage_key: "jr-os-surveys",\n        job_source_id: jobA,\n        customer_source_id: customerA,\n        bucket: "jr-os-private",\n        object_path: surveyPhotoPath,\n        file_name: "survey.jpg",\n        mime_type: "image/jpeg",\n        created_by: accounts.A.electrician.id,\n        updated_by: accounts.A.electrician.id,\n      }),\n      "Electrician should register field survey photo metadata",\n    );\n    await expectAllowed(\n      await storageRequest(accounts.A.electrician, "jr-os-private", surveyPhotoPath, { method: "GET" }, "authenticated"),\n      "Electrician should download a field survey photo",\n    );\n    await expectDenied(\n      await storageRequest(accounts.A.customer, "jr-os-private", surveyPhotoPath, { method: "GET" }, "authenticated"),\n      "Customer must not download an internal survey photo",\n    );\n\n    const expenseReceiptFile = source("expense-receipt-role");\n    const expenseReceiptPath = \`\${organisationA}/jobs/\${jobA}/\${expenseReceiptFile}/receipt.pdf\`;\n    await expectAllowed(\n      await storageRequest(accounts.A.office, "jr-os-private", expenseReceiptPath, {\n        method: "POST",\n        headers: { "Content-Type": "application/pdf", "x-upsert": "false" },\n        body: Buffer.from("private-expense"),\n      }),\n      "Office should upload a private expense receipt",\n    );\n    await expectAllowed(\n      await insertRecord(accounts.A.office, "private_files", {\n        organisation_id: organisationA,\n        source_id: expenseReceiptFile,\n        storage_key: "jr-os-expenses",\n        job_source_id: jobA,\n        customer_source_id: customerA,\n        bucket: "jr-os-private",\n        object_path: expenseReceiptPath,\n        file_name: "receipt.pdf",\n        mime_type: "application/pdf",\n        created_by: accounts.A.office.id,\n        updated_by: accounts.A.office.id,\n      }),\n      "Office should register private expense receipt metadata",\n    );\n    const electricianExpenseMetadata = await listRecords(accounts.A.electrician, "private_files", \`select=source_id&source_id=eq.\${expenseReceiptFile}\`);\n    await expectAllowed(electricianExpenseMetadata, "Electrician expense metadata query should fail closed");\n    assert.deepEqual(electricianExpenseMetadata.payload, [], "Electrician must not read expense receipt metadata");\n    const customerExpenseMetadata = await listRecords(accounts.A.customer, "private_files", \`select=source_id&source_id=eq.\${expenseReceiptFile}\`);\n    await expectAllowed(customerExpenseMetadata, "Customer expense metadata query should fail closed");\n    assert.deepEqual(customerExpenseMetadata.payload, [], "Customer must not read expense receipt metadata");\n    await expectAllowed(\n      await storageRequest(accounts.A.office, "jr-os-private", expenseReceiptPath, { method: "GET" }, "authenticated"),\n      "Office should download a private expense receipt",\n    );\n    await expectDenied(\n      await storageRequest(accounts.A.electrician, "jr-os-private", expenseReceiptPath, { method: "GET" }, "authenticated"),\n      "Electrician must not download a private expense receipt",\n    );\n    await expectDenied(\n      await storageRequest(accounts.A.customer, "jr-os-private", expenseReceiptPath, { method: "GET" }, "authenticated"),\n      "Customer must not download a private expense receipt",\n    );\n    await expectDenied(\n      await storageRequest(accounts.A.electrician, "jr-os-private", expenseReceiptPath, {\n        method: "POST",\n        headers: { "Content-Type": "application/pdf", "x-upsert": "true" },\n        body: Buffer.from("forged-expense"),\n      }),\n      "Electrician must not overwrite a private expense receipt",\n    );\n\n    const unknownPrivateFile = source("unknown-private-role");\n    const unknownPrivatePath = \`\${organisationA}/unassigned/\${unknownPrivateFile}/unknown.txt\`;\n    await expectAllowed(\n      await storageRequest(accounts.A.office, "jr-os-private", unknownPrivatePath, {\n        method: "POST",\n        headers: { "Content-Type": "text/plain", "x-upsert": "false" },\n        body: Buffer.from("unknown-private"),\n      }),\n      "Office should upload unknown historical-style private data",\n    );\n    await expectAllowed(\n      await insertRecord(accounts.A.office, "private_files", {\n        organisation_id: organisationA,\n        source_id: unknownPrivateFile,\n        job_source_id: null,\n        customer_source_id: null,\n        bucket: "jr-os-private",\n        object_path: unknownPrivatePath,\n        file_name: "unknown.txt",\n        mime_type: "text/plain",\n        created_by: accounts.A.office.id,\n        updated_by: accounts.A.office.id,\n      }),\n      "Office should register unknown private metadata",\n    );\n    await expectAllowed(\n      await storageRequest(accounts.A.office, "jr-os-private", unknownPrivatePath, { method: "GET" }, "authenticated"),\n      "Office should retain unknown private metadata access",\n    );\n    await expectDenied(\n      await storageRequest(accounts.A.electrician, "jr-os-private", unknownPrivatePath, { method: "GET" }, "authenticated"),\n      "Electrician must not read unknown private metadata",\n    );\n    await expectDenied(\n      await storageRequest(accounts.A.customer, "jr-os-private", unknownPrivatePath, { method: "GET" }, "authenticated"),\n      "Customer must not read unknown private metadata",\n    );\n\n    const legacyRolePath = \`\${organisationA}/legacy-role/legacy.txt\`;\n    await expectAllowed(\n      await storageRequest(accounts.A.office, "jr-os-files", legacyRolePath, {\n        method: "POST",\n        headers: { "Content-Type": "text/plain", "x-upsert": "false" },\n        body: Buffer.from("legacy-private"),\n      }),\n      "Office should retain legacy private storage upload access",\n    );\n    await expectAllowed(\n      await storageRequest(accounts.A.office, "jr-os-files", legacyRolePath, { method: "GET" }, "authenticated"),\n      "Office should retain legacy private storage reads",\n    );\n    await expectDenied(\n      await storageRequest(accounts.A.electrician, "jr-os-files", legacyRolePath, { method: "GET" }, "authenticated"),\n      "Electrician must not read metadata-less legacy private storage",\n    );`;

`;

const patchedChain = `${chainAnchor.slice(0, -1)}\n    .replace(ownPrivateMetadataSnippet, safeOwnPrivateMetadataSnippet)\n    .replace(otherCustomerMetadataSnippet, privateRoleCoverage);`;

test("live RLS runner proves private Storage follows source-collection roles", () => {
  assert.equal(runnerSource.split(constantsAnchor).length - 1, 1, "Expected one runner validation anchor");
  assert.equal(runnerSource.split(chainAnchor).length - 1, 1, "Expected one runner replacement-chain anchor");

  const patchedRunner = runnerSource
    .replace(constantsAnchor, `${injectedConstants}${constantsAnchor}`)
    .replace(chainAnchor, patchedChain);

  for (const phrase of [
    "Electrician should download a field job document",
    "Customer should download their own job document",
    "Electrician should download a field survey photo",
    "Customer must not download an internal survey photo",
    "Electrician must not read expense receipt metadata",
    "Customer must not read expense receipt metadata",
    "Electrician must not download a private expense receipt",
    "Customer must not download a private expense receipt",
    "Electrician must not overwrite a private expense receipt",
    "Electrician must not read unknown private metadata",
    "Customer must not read unknown private metadata",
    "Electrician must not read metadata-less legacy private storage",
  ]) {
    assert.match(patchedRunner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }

  const temporaryDirectory = mkdtempSync(join(tmpdir(), "jr-os-private-role-rls-"));
  const temporaryRunner = join(temporaryDirectory, "run-supabase-rls.integration.mjs");
  const temporaryIntegration = join(temporaryDirectory, "supabase-rls.integration.mjs");
  try {
    writeFileSync(temporaryRunner, patchedRunner, "utf8");
    copyFileSync(integrationSourceUrl, temporaryIntegration);
    const result = spawnSync(process.execPath, [temporaryRunner], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    assert.equal(result.status ?? 1, 0, "Private-file role live RLS wrapper should complete successfully");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
