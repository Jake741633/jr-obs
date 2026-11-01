import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const cardSource = await readFile(new URL("../components/ui/Card.tsx", import.meta.url), "utf8");
const formFieldSource = await readFile(new URL("../components/ui/FormField.tsx", import.meta.url), "utf8");
const globalStyles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const fieldTestingSource = await readFile(new URL("../app/field/testing/page.tsx", import.meta.url), "utf8");

test("cards preserve usable width and reduce padding on phones", () => {
  assert.match(cardSource, /min-w-0/);
  assert.match(cardSource, /p-4/);
  assert.match(cardSource, /sm:p-5/);
});

test("shared fields use iPhone-safe sizing and full available width", () => {
  assert.match(formFieldSource, /min-h-12/);
  assert.match(formFieldSource, /w-full/);
  assert.match(formFieldSource, /text-base/);
  assert.match(formFieldSource, /sm:text-sm/);
});

test("dense forms stack safe touch controls without horizontal overflow", () => {
  assert.match(globalStyles, /form button:not\(\[aria-label\]\) \{ width: 100%; \}/);
  assert.match(globalStyles, /form, form > \*, form \.grid, form \.flex \{ min-width: 0; \}/);
  assert.match(globalStyles, /input, textarea, select \{ width: 100%; font-size: 16px; \}/);
});

test("field testing delete controls retain 48px touch targets", () => {
  for (const label of ["Remove circuit", "Remove outstanding action"]) {
    const labelIndex = fieldTestingSource.indexOf(`aria-label="${label}"`);
    const buttonStart = fieldTestingSource.lastIndexOf("<button", labelIndex);
    const buttonEnd = fieldTestingSource.indexOf("</button>", labelIndex);
    assert.ok(buttonStart >= 0 && labelIndex > buttonStart && buttonEnd > labelIndex);
    const button = fieldTestingSource.slice(buttonStart, buttonEnd);
    assert.match(button, /min-h-12/);
    assert.match(button, /min-w-12/);
  }
});
