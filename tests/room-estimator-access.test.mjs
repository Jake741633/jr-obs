import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [navigationSource, permissionsSource] = await Promise.all([
  readFile(new URL("../components/navigation.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/cloud/permissions.ts", import.meta.url), "utf8"),
]);

function roleEntry(role) {
  const match = permissionsSource.match(new RegExp(`\\b${role}: \\[([^\\]]*)\\]`));
  assert.ok(match, `Missing ${role} role page declaration`);
  return match[1];
}

test("room estimator is exposed once in workspace navigation beside pricing tools", () => {
  const routeMatches = navigationSource.match(/"\/room-estimator"/g) ?? [];
  assert.equal(routeMatches.length, 1);

  const priceBookIndex = navigationSource.indexOf('["Electrical Price Book", "/price-book"]');
  const roomEstimatorIndex = navigationSource.indexOf('["Mobile Room Estimator", "/room-estimator"]');
  const estimatesIndex = navigationSource.indexOf('["Estimates", "/estimates"]');

  assert.ok(priceBookIndex >= 0, "Electrical Price Book navigation item is missing");
  assert.ok(roomEstimatorIndex > priceBookIndex, "Mobile Room Estimator should follow the Price Book");
  assert.ok(estimatesIndex > roomEstimatorIndex, "Mobile Room Estimator should stay with estimating tools");
});

test("office users can access the price book and room estimator", () => {
  const officePages = roleEntry("office");
  assert.match(officePages, /"\/price-book"/);
  assert.match(officePages, /"\/room-estimator"/);
});

test("field and customer roles are not given internal estimating access", () => {
  const electricianPages = roleEntry("electrician");
  const customerPages = roleEntry("customer");

  assert.doesNotMatch(electricianPages, /"\/price-book"|"\/room-estimator"/);
  assert.doesNotMatch(customerPages, /"\/price-book"|"\/room-estimator"/);
});
