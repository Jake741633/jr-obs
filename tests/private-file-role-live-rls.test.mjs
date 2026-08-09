import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const runnerSource = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");
const integrationSource = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");

function lines(...values) {
  return values.join("\n");
}

const ownMetadata = lines(
  '    await expectAllowed(await insertRecord(accounts.A.electrician, "private_files", {',
  '      organisation_id: organisationA, source_id: source("file-own"), job_source_id: jobA, customer_source_id: customerA,',
  '      bucket, object_path: ownPath, file_name: "photo.png", mime_type: "image/png",',
  '    }), "Staff should write private file metadata");',
);

const safeOwnMetadata = lines(
  '    await expectAllowed(await insertRecord(accounts.A.electrician, "private_files", {',
  '      organisation_id: organisationA, source_id: source("file-own"), storage_key: "jr-os-job-documents", job_source_id: jobA, customer_source_id: customerA,',
  '      bucket, object_path: ownPath, file_name: "photo.png", mime_type: "image/png",',
  '    }), "Staff should write private file metadata");',
);

const otherCustomerMetadata = lines(
  '    await expectAllowed(await insertRecord(accounts.A.office, "private_files", {',
  '      organisation_id: organisationA, source_id: source("file-other"), job_source_id: otherCustomerJobA, customer_source_id: otherCustomerA,',
  '      bucket, object_path: otherCustomerPath, file_name: "other.png", mime_type: "image/png",',
  '    }), "Office should write other-customer file metadata");',
);

const safeOtherCustomerMetadata = lines(
  '    await expectAllowed(await insertRecord(accounts.A.office, "private_files", {',
  '      organisation_id: organisationA, source_id: source("file-other"), storage_key: "jr-os-job-documents", job_source_id: otherCustomerJobA, customer_source_id: otherCustomerA,',
  '      bucket, object_path: otherCustomerPath, file_name: "other.png", mime_type: "image/png",',
  '    }), "Office should write other-customer file metadata");',
);

const roleCoverage = lines(
  '',
  '    await expectAllowed(',
  '      await downloadStorageObject(accounts.A.electrician, ownPath),',
  '      "Electrician should download a field job document",',
  '    );',
  '    await expectAllowed(',
  '      await downloadStorageObject(accounts.A.customer, ownPath),',
  '      "Customer should download their own job document",',
  '    );',
  '',
  '    const surveyPhotoFile = source("survey-photo-role");',
  '    const surveyPhotoPath = organisationA + "/jobs/" + jobA + "/" + surveyPhotoFile + "/survey.jpg";',
  '    context.objectPaths.push(surveyPhotoPath);',
  '    await expectAllowed(',
  '      await uploadStorageObject(accounts.A.electrician, surveyPhotoPath, pngBytes, "image/jpeg"),',
  '      "Electrician should upload a field survey photo",',
  '    );',
  '    await expectAllowed(await insertRecord(accounts.A.electrician, "private_files", {',
  '      organisation_id: organisationA, source_id: surveyPhotoFile, storage_key: "jr-os-surveys", job_source_id: jobA, customer_source_id: customerA,',
  '      bucket, object_path: surveyPhotoPath, file_name: "survey.jpg", mime_type: "image/jpeg",',
  '    }), "Electrician should register field survey photo metadata");',
  '    await expectAllowed(',
  '      await downloadStorageObject(accounts.A.electrician, surveyPhotoPath),',
  '      "Electrician should download a field survey photo",',
  '    );',
  '    await expectDenied(',
  '      await downloadStorageObject(accounts.A.customer, surveyPhotoPath),',
  '      "Customer must not download an internal survey photo",',
  '    );',
  '',
  '    const expenseReceiptFile = source("expense-receipt-role");',
  '    const expenseReceiptPath = organisationA + "/jobs/" + jobA + "/" + expenseReceiptFile + "/receipt.pdf";',
  '    context.objectPaths.push(expenseReceiptPath);',
  '    await expectAllowed(',
  '      await uploadStorageObject(accounts.A.office, expenseReceiptPath, new Uint8Array([37, 80, 68, 70]), "application/pdf"),',
  '      "Office should upload a private expense receipt",',
  '    );',
  '    await expectAllowed(await insertRecord(accounts.A.office, "private_files", {',
  '      organisation_id: organisationA, source_id: expenseReceiptFile, storage_key: "jr-os-expenses", job_source_id: jobA, customer_source_id: customerA,',
  '      bucket, object_path: expenseReceiptPath, file_name: "receipt.pdf", mime_type: "application/pdf",',
  '    }), "Office should register private expense receipt metadata");',
  '    const electricianExpenseMetadata = await listRecords(accounts.A.electrician, "private_files", "select=source_id&source_id=eq." + expenseReceiptFile);',
  '    await expectAllowed(electricianExpenseMetadata, "Electrician expense metadata query should fail closed");',
  '    assert.deepEqual(electricianExpenseMetadata.payload, [], "Electrician must not read expense receipt metadata");',
  '    const customerExpenseMetadata = await listRecords(accounts.A.customer, "private_files", "select=source_id&source_id=eq." + expenseReceiptFile);',
  '    await expectAllowed(customerExpenseMetadata, "Customer expense metadata query should fail closed");',
  '    assert.deepEqual(customerExpenseMetadata.payload, [], "Customer must not read expense receipt metadata");',
  '    await expectAllowed(',
  '      await downloadStorageObject(accounts.A.office, expenseReceiptPath),',
  '      "Office should download a private expense receipt",',
  '    );',
  '    await expectDenied(',
  '      await downloadStorageObject(accounts.A.electrician, expenseReceiptPath),',
  '      "Electrician must not download a private expense receipt",',
  '    );',
  '    await expectDenied(',
  '      await downloadStorageObject(accounts.A.customer, expenseReceiptPath),',
  '      "Customer must not download a private expense receipt",',
  '    );',
  '    await expectDenied(',
  '      await authenticated(accounts.A.electrician, "/storage/v1/object/" + bucket + "/" + encodedPath(expenseReceiptPath), {',
  '        method: "POST",',
  '        rawBody: new Uint8Array([37, 80, 68, 70, 45, 70, 79, 82, 71, 69, 68]),',
  '        extraHeaders: { "Content-Type": "application/pdf", "x-upsert": "true" },',
  '      }),',
  '      "Electrician must not overwrite a private expense receipt",',
  '    );',
  '',
  '    const unknownPrivateFile = source("unknown-private-role");',
  '    const unknownPrivatePath = organisationA + "/unassigned/" + unknownPrivateFile + "/unknown.txt";',
  '    context.objectPaths.push(unknownPrivatePath);',
  '    await expectAllowed(',
  '      await uploadStorageObject(accounts.A.office, unknownPrivatePath, new Uint8Array([117, 110, 107, 110, 111, 119, 110]), "text/plain"),',
  '      "Office should upload unknown historical-style private data",',
  '    );',
  '    await expectAllowed(await insertRecord(accounts.A.office, "private_files", {',
  '      organisation_id: organisationA, source_id: unknownPrivateFile, job_source_id: null, customer_source_id: null,',
  '      bucket, object_path: unknownPrivatePath, file_name: "unknown.txt", mime_type: "text/plain",',
  '    }), "Office should register unknown private metadata");',
  '    await expectAllowed(',
  '      await downloadStorageObject(accounts.A.office, unknownPrivatePath),',
  '      "Office should retain unknown private metadata access",',
  '    );',
  '    await expectDenied(',
  '      await downloadStorageObject(accounts.A.electrician, unknownPrivatePath),',
  '      "Electrician must not read unknown private metadata",',
  '    );',
  '    await expectDenied(',
  '      await downloadStorageObject(accounts.A.customer, unknownPrivatePath),',
  '      "Customer must not read unknown private metadata",',
  '    );',
);

const legacyUpload = lines(
  '    await expectAllowed(',
  '      await uploadStorageObject(accounts.A.electrician, legacyPath, pngBytes, "image/png", legacyBucket),',
  '      "Electrician should retain authenticated legacy upload compatibility",',
  '    );',
);

const safeLegacyUpload = lines(
  '    await expectDenied(',
  '      await uploadStorageObject(accounts.A.electrician, legacyPath, pngBytes, "image/png", legacyBucket),',
  '      "Electrician must not upload to metadata-less legacy storage",',
  '    );',
  '    await expectAllowed(',
  '      await uploadStorageObject(accounts.A.office, legacyPath, pngBytes, "image/png", legacyBucket),',
  '      "Office should retain authenticated legacy upload compatibility",',
  '    );',
  '    await expectAllowed(',
  '      await downloadStorageObject(accounts.A.office, legacyPath, legacyBucket),',
  '      "Office should retain metadata-less legacy private storage reads",',
  '    );',
  '    await expectDenied(',
  '      await downloadStorageObject(accounts.A.electrician, legacyPath, legacyBucket),',
  '      "Electrician must not read metadata-less legacy private storage",',
  '    );',
);

for (const [label, snippet] of [
  ["own job-document metadata", ownMetadata],
  ["other-customer job-document metadata", otherCustomerMetadata],
  ["legacy field upload expectation", legacyUpload],
]) {
  assert.equal(integrationSource.split(snippet).length - 1, 1, `Expected one ${label} anchor`);
}

const patchedIntegration = integrationSource
  .replace(ownMetadata, safeOwnMetadata)
  .replace(otherCustomerMetadata, safeOtherCustomerMetadata + roleCoverage)
  .replace(legacyUpload, safeLegacyUpload);

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
  "Electrician must not upload to metadata-less legacy storage",
  "Electrician must not read metadata-less legacy private storage",
]) {
  assert.match(patchedIntegration, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
}

test("live RLS runner proves private Storage follows source-collection roles", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "jr-os-private-role-rls-"));
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
    assert.equal(result.status ?? 1, 0, "Private-file role live RLS wrapper should complete successfully");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
