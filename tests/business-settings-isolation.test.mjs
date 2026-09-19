import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const settingsPath = new URL("../lib/businessSettings.ts", import.meta.url);

async function read(path) {
  return readFile(path, "utf8");
}

test("new organisations start without JR Electrical Services identity data", async () => {
  const settings = await read(settingsPath);

  assert.match(settings, /companyName: ""/);
  assert.match(settings, /address: ""/);
  assert.match(settings, /phone: ""/);
  assert.match(settings, /website: ""/);
  assert.match(settings, /inspectorName: ""/);
  assert.match(settings, /footerText: "Thank you for your business\."/);

  assert.doesNotMatch(settings, /JR Electrical Services/);
  assert.doesNotMatch(settings, /Jake Rinaldi/);
  assert.doesNotMatch(settings, /07508 306825/);
  assert.doesNotMatch(settings, /jrelectricalservices\.org/);
});
