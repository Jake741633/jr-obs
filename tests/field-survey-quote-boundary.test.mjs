import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const surveyPage = readFileSync(new URL("../app/surveys/[id]/page.tsx", import.meta.url), "utf8");
const policy = readFileSync(new URL("../lib/cloud/fieldMutationPolicy-core.mjs", import.meta.url), "utf8");

test("pricing documents remain outside the approved electrician mutation routes", () => {
  assert.doesNotMatch(policy, /jr-os-pricing-documents/);
  assert.match(policy, /default-deny/);
});

test("field survey detail fails closed before quote creation", () => {
  assert.match(surveyPage, /useCloudIdentity\(\)/);
  assert.match(surveyPage, /const fieldMode = identity\?\.role === "electrician"/);
  assert.match(surveyPage, /if \(fieldMode\) \{[\s\S]*?Quote creation is restricted to office roles\.[\s\S]*?return;/);
  assert.match(surveyPage, /fieldMode \? <p[^>]*>Survey recommendations are ready for office review\. Quote creation is restricted to office roles\.<\/p> : <Button onClick=\{createQuote\}>/);
});

test("office survey workflow retains draft quote generation", () => {
  assert.match(surveyPage, /quotes\.setItems\(\(current\) => \[quote, \.\.\.current\]\)/);
  assert.match(surveyPage, /Generate draft quote/);
});
