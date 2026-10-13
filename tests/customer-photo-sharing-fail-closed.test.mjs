import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_058_fail_closed_customer_photo_sharing.sql", import.meta.url),
  "utf8",
);
const portal = readFileSync(new URL("../lib/customerPortal.ts", import.meta.url), "utf8");
const privateFileLive = readFileSync(new URL("./private-file-role-live-rls.test.mjs", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");

test("customer sessions cannot query raw job documents", () => {
  const policy = /create policy job_documents_select[\s\S]*?;\n/i.exec(migration)?.[0] ?? "";
  assert.match(policy, /private\.current_jr_role\(\) in \('owner', 'admin', 'office', 'electrician'\)/i);
  assert.doesNotMatch(policy, /customer/i);
});

test("customer sessions cannot bypass safeToShare through private Storage", () => {
  const helper = /create or replace function private\.jr_can_read_private_file[\s\S]*?\$\$;/i.exec(migration)?.[0] ?? "";
  assert.match(helper, /private\.current_jr_role\(\) = 'electrician'/i);
  assert.match(helper, /jr-os-job-documents/i);
  assert.match(helper, /jr-os-surveys/i);
  assert.doesNotMatch(helper, /private\.current_jr_role\(\) = 'customer'/i);
  assert.match(privateFileLive, /Customer must not download an unshared job document/i);
  assert.doesNotMatch(privateFileLive, /Customer should download their own job document/i);
});

test("raw portal photo-share records are temporarily fail closed for customers", () => {
  const policy = /create policy "cloud collections tenant read"[\s\S]*?;\n/i.exec(migration)?.[0] ?? "";
  assert.match(policy, /jr-os-job-timeline/i);
  assert.match(policy, /jr-os-portal-payment-links/i);
  assert.match(policy, /jr-os-portal-activity/i);
  assert.match(policy, /jr-os-deposit-requirements/i);
  assert.doesNotMatch(policy, /jr-os-portal-photo-shares/i);
});

test("portal presentation still requires explicit safeToShare", () => {
  assert.match(portal, /shares\.filter\(\(share\) => share\.safeToShare\)/i);
  assert.match(portal, /document\.category === "Photo"/i);
});

test("schema-only recovery reapplies fail-closed customer photo sharing", () => {
  assert.match(recovery, /20260809_058_fail_closed_customer_photo_sharing\.sql/i);
});
