import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canAccessPath } from "../lib/cloud/permissions.ts";

const certificatesPage = readFileSync(new URL("../app/certificates/page.tsx", import.meta.url), "utf8");
const testingPage = readFileSync(new URL("../app/field/testing/page.tsx", import.meta.url), "utf8");

test("certificate centre exposes canonical authoring mutations", () => {
  assert.match(certificatesPage, /certificates\.setItems/);
  assert.match(certificatesPage, /saveCertificateRevision/);
  assert.match(certificatesPage, /New certificate/);
  assert.match(certificatesPage, /Status<select/);
});

test("electricians cannot open the certificate authoring centre", () => {
  assert.equal(canAccessPath("electrician", "/certificates"), false);
  assert.equal(canAccessPath("electrician", "/field/testing"), true);
  assert.match(testingPage, /Mobile testing/);
});

test("office roles retain certificate authoring access", () => {
  assert.equal(canAccessPath("office", "/certificates"), true);
  assert.equal(canAccessPath("owner", "/certificates"), true);
  assert.equal(canAccessPath("admin", "/certificates"), true);
});
