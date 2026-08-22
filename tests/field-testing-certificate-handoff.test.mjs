import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";

const page = readFileSync(new URL("../app/field/testing/page.tsx", import.meta.url), "utf8");
const permissions = readFileSync(new URL("../lib/cloud/permissions.ts", import.meta.url), "utf8");

test("electrician certificate writes remain default deny while office roles stay direct", () => {
  assert.deepEqual(collectionCloudMutationRoute("certificates", "electrician"), { kind: "deny" });
  assert.deepEqual(collectionCloudMutationRoute("certificates", "office"), { kind: "direct" });
  assert.match(permissions, /electrician: \["\/menu", "\/jobs", "\/field", "\/surveys", "\/cloud"\]/);
  assert.match(permissions, /deniedPath: "\/certificates",[\s\S]*?href: "\/field\/testing"/);
});

test("field testing replaces certificate-only controls with an office handoff", () => {
  assert.match(page, /if \(fieldMode\) \{ setMessage\("Certificate linking and authoring are office-controlled\./);
  assert.match(page, /fieldMode \? <div[^>]*>.*Certificate handoff.*Certificate linking, authoring and issue remain with the office\./s);
  assert.match(page, /fieldMode \? <p[^>]*>Save the testing draft and provide this structured summary to the office\./s);
  assert.match(page, /: <div className="flex flex-wrap gap-2"><Button[^>]*>Prepare for linked certificate<\/Button><Link href="\/certificates"/);
});

test("testing never optimistically mutates a linked certificate", () => {
  assert.doesNotMatch(page, /certificates\.setItems\(/);
  const functionBody = page.match(/function prepareCertificateSummary\(\) \{([\s\S]*?)\n  \}\n\n  const ready/);
  assert.ok(functionBody, "certificate preparation function should exist");
  assert.ok(functionBody[1].indexOf("if (fieldMode)") < functionBody[1].indexOf("persistRecord(record)"));
  assert.doesNotMatch(functionBody[1], /certificates\.setItems/);
  assert.match(page, /Field testing does not directly modify certificate records/);
});
