import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canAccessPath } from "../lib/cloud/permissions.ts";

const page = readFileSync(new URL("../app/jobs/[id]/page.tsx", import.meta.url), "utf8");

test("electrician job contacts do not advertise guarded office routes", () => {
  for (const path of ["/customers/customer-1", "/builders/builder-1"]) {
    assert.equal(canAccessPath("electrician", path), false, `${path} must remain office-only`);
  }

  assert.match(page, /import \{ canAccessPath, canEditFinance \} from "\.\.\/\.\.\/\.\.\/lib\/cloud\/permissions"/);
  assert.match(page, /const customerHref = customer \? `\/customers\/\$\{customer\.id\}` : ""/);
  assert.match(page, /const builderHref = builder \? `\/builders\/\$\{builder\.id\}` : ""/);
  assert.match(
    page,
    /const canOpenCustomer = Boolean\(customerHref\) && \([\s\S]*canAccessPath\(identityState\.identity\?\.role, customerHref, identityState\.identity\?\.email\)/,
  );
  assert.match(
    page,
    /const canOpenBuilder = Boolean\(builderHref\) && \([\s\S]*canAccessPath\(identityState\.identity\?\.role, builderHref, identityState\.identity\?\.email\)/,
  );
  assert.match(page, /\{canOpenCustomer \? <Link href=\{customerHref\}[\s\S]*>Open customer<\/Link> : null\}/);
  assert.match(page, /\{canOpenBuilder \? <Link href=\{builderHref\}[\s\S]*>Open builder<\/Link> : null\}/);
  assert.doesNotMatch(page, /<Link href=\{`\/(?:customers|builders)\/\$\{/);
});

test("office roles and intentionally unrestricted local mode retain contact links", () => {
  assert.equal(canAccessPath("owner", "/customers/customer-1"), true);
  assert.equal(canAccessPath("admin", "/builders/builder-1"), true);
  assert.equal(canAccessPath("office", "/customers/customer-1"), true);
  assert.equal(canAccessPath("office", "/builders/builder-1"), true);
  assert.match(page, /identityState\.mode === "local"[\s\S]*\|\| canAccessPath/);
});
