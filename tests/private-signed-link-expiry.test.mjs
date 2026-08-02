import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const privateFiles = readFileSync(new URL("../lib/cloud/privateFiles.ts", import.meta.url), "utf8");

test("private signed download links remain short lived", () => {
  assert.match(
    privateFiles,
    /export async function signedPrivateDownloadUrl\(objectPath: string, organisationId: string, expiresIn = 300\)/,
  );
  assert.match(privateFiles, /const boundedExpiry = Math\.min\(300, Math\.max\(60, Math\.floor\(expiresIn\)\)\);/);
  assert.match(privateFiles, /createSignedDownload\(objectPath, boundedExpiry\)/);
  assert.doesNotMatch(privateFiles, /createSignedDownload\(objectPath, expiresIn\)/);
});

test("private signed downloads still require active organisation ownership", () => {
  const start = privateFiles.indexOf("export async function signedPrivateDownloadUrl");
  const end = privateFiles.indexOf("\nexport async function registerExistingPrivateFile", start);
  const signedDownload = privateFiles.slice(start, end);

  assert.match(signedDownload, /assertOrganisationPrivateObjectPath\(organisationId, objectPath\)/);
  assert.ok(
    signedDownload.indexOf("assertOrganisationPrivateObjectPath") < signedDownload.indexOf("createSignedDownload"),
    "ownership must be validated before a signed link is requested",
  );
});
