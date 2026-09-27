import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(new URL("../lib/cloud/client.ts", import.meta.url), "utf8");
const privateFiles = readFileSync(new URL("../lib/cloud/privateFiles.ts", import.meta.url), "utf8");

test("private transfers do not mint independently valid Storage bearer URLs", () => {
  assert.doesNotMatch(client, /\/storage\/v1\/object\/sign\//);
  assert.doesNotMatch(client, /\/storage\/v1\/object\/upload\/sign\//);
  assert.match(client, /\/storage\/v1\/object\/authenticated\/\$\{cloudStorageBucket\}/);
  assert.match(client, /uploadPrivateObject[\s\S]*method: "POST"[\s\S]*cloudSession\.load\(\) \|\| undefined/);
});

test("private downloads use live authorization and revocable browser object URLs", () => {
  const start = privateFiles.indexOf("export async function authenticatedPrivateDownloadUrl");
  const end = privateFiles.indexOf("\nexport async function registerExistingPrivateFile", start);
  const authenticatedDownload = privateFiles.slice(start, end);

  assert.match(authenticatedDownload, /assertOrganisationPrivateObjectPath\(organisationId, objectPath\)/);
  assert.ok(
    authenticatedDownload.indexOf("assertOrganisationPrivateObjectPath") < authenticatedDownload.indexOf("downloadPrivateObject"),
    "ownership must be validated before an authenticated download is requested",
  );
  assert.match(authenticatedDownload, /URL\.createObjectURL\(file\)/);
  assert.match(privateFiles, /URL\.revokeObjectURL\(url\)/);
});
