import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("../app/jobs/[id]/workspace/page.tsx", import.meta.url), "utf8");

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return source.slice(start, end);
}

const contactCards = section(
  workspace,
  '<section className="grid gap-4 md:grid-cols-2">',
  '<p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">On-site workspace</p>',
);

test("workspace customer and builder calls provide 48px touch targets", () => {
  assert.match(contactCards, /customer\?\.phone \? <a href=\{`tel:\$\{customer\.phone\}`\} className="mt-3 inline-flex min-h-12/);
  assert.match(contactCards, /builder\?\.phone \? <a href=\{`tel:\$\{builder\.phone\}`\} className="mt-3 inline-flex min-h-12/);
  assert.doesNotMatch(contactCards, /min-h-11/);
});
