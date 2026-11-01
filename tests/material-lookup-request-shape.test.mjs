import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const routeSource = await readFile(new URL("../app/api/materials/lookup/route.ts", import.meta.url), "utf8");

test("material lookup rejects non-object JSON bodies before reading fields", () => {
  assert.match(routeSource, /function plainRecord\(value: unknown\): value is Record<string, unknown>/);
  assert.match(routeSource, /value !== null && typeof value === "object" && !Array\.isArray\(value\)/);
  assert.match(routeSource, /let body: unknown;/);

  const guardIndex = routeSource.indexOf("if (!plainRecord(body))");
  const supplierReadIndex = routeSource.indexOf("text(body.supplier)");
  assert.ok(guardIndex >= 0, "expected a body-shape guard");
  assert.ok(supplierReadIndex >= 0, "expected supplier field access");
  assert.ok(guardIndex < supplierReadIndex, "body shape must be checked before field access");
  assert.match(
    routeSource.slice(guardIndex, supplierReadIndex),
    /NextResponse\.json\(\{ error: "Invalid lookup request\." \}, \{ status: 400 \}\)/,
  );
});
