import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { typedCollectionTables } from "../lib/cloud/migrationStoragePolicy-core.mjs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_049_field_inventory_projections.sql", import.meta.url),
  "utf8",
);
const metadataHardening = readFileSync(
  new URL("../supabase/migrations/20260809_050_restrict_field_material_price_metadata.sql", import.meta.url),
  "utf8",
);
const boundary = readFileSync(
  new URL("../supabase/migrations/20260813235633_secure_field_mutation_boundary.sql", import.meta.url),
  "utf8",
);
const historicalTypedReads = readFileSync(
  new URL("../supabase/migrations/20260803_017_customer_typed_table_reads.sql", import.meta.url),
  "utf8",
);
const stockMovementBoundary = readFileSync(
  new URL("../supabase/migrations/20260903132756_keep_field_stock_movements_office_only.sql", import.meta.url),
  "utf8",
);
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");

function functionBody(source, name) {
  const start = source.indexOf(`create or replace function ${name}`);
  const end = source.indexOf("revoke execute on function", start);
  return source.slice(start, end);
}

const materialProjection = functionBody(metadataHardening, "private.jr_field_material_payload");
const stockProjection = functionBody(migration, "private.jr_field_stock_item_payload");
const purchaseProjection = functionBody(migration, "private.jr_field_purchase_list_payload");
const purchaseMerge = functionBody(migration, "private.jr_merge_field_purchase_list_payload");
const writeGuard = functionBody(migration, "private.guard_jr_electrician_inventory_payload");

test("typed inventory projections are RLS protected read-only application surfaces", () => {
  for (const table of ["field_materials", "field_stock_items", "field_purchase_lists"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(
    migration,
    /grant select on table\s+public\.field_materials,\s+public\.field_stock_items,\s+public\.field_purchase_lists\s+to authenticated/is,
  );
  assert.match(
    migration,
    /grant select, insert, update, delete on table\s+public\.field_materials,\s+public\.field_stock_items,\s+public\.field_purchase_lists\s+to service_role/is,
  );
  assert.match(migration, /private\.current_jr_role\(\) = ''electrician''/i);
  assert.match(migration, /deleted_at is null/i);
});

test("material projection keeps catalogue data but removes all price intelligence and metadata", () => {
  for (const key of [
    "id",
    "name",
    "category",
    "manufacturer",
    "supplier",
    "supplierUrl",
    "stockCode",
    "unit",
    "favourite",
    "notes",
  ]) {
    assert.match(materialProjection, new RegExp(`'${key}'`));
  }
  for (const privateKey of ["tradeCost", "sellPrice", "priceHistory", "lastPriceCheckedAt", "priceSource"]) {
    assert.doesNotMatch(materialProjection, new RegExp(`'${privateKey}'`));
  }
  assert.match(metadataHardening, /update public\.field_materials projection[\s\S]*private\.jr_field_material_payload\(source\.payload\)/i);
});

test("stock projection removes unit cost while retaining stock-control fields", () => {
  for (const key of [
    "id",
    "materialId",
    "description",
    "locationId",
    "quantity",
    "minimumQuantity",
    "unit",
    "stockCode",
    "supplier",
    "notes",
  ]) {
    assert.match(stockProjection, new RegExp(`'${key}'`));
  }
  assert.doesNotMatch(stockProjection, /'unitCost'/i);
});

test("purchase projection removes item costs and quote linkage", () => {
  for (const key of ["id", "number", "title", "jobId", "items", "description", "supplier", "stockCode", "supplierUrl", "quantity", "status", "notes"]) {
    assert.match(purchaseProjection, new RegExp(`'${key}'`));
  }
  assert.doesNotMatch(purchaseProjection, /'unitCost'|'pricingDocumentId'/i);
});

test("historical inventory guards stripped prices before direct field writes closed", () => {
  assert.match(writeGuard, /private\.current_jr_role\(\) <> 'electrician'/i);
  assert.match(writeGuard, /new\.payload := private\.jr_field_material_payload\(new\.payload\)/i);
  assert.match(writeGuard, /new\.payload := old\.payload \|\| private\.jr_field_material_payload\(new\.payload\)/i);
  assert.match(writeGuard, /new\.payload := private\.jr_field_stock_item_payload\(new\.payload\)/i);
  assert.match(writeGuard, /new\.payload := old\.payload \|\| private\.jr_field_stock_item_payload\(new\.payload\)/i);
  assert.match(writeGuard, /new\.payload := private\.jr_field_purchase_list_payload\(new\.payload\)/i);
  assert.match(writeGuard, /new\.payload := private\.jr_merge_field_purchase_list_payload\(old\.payload, new\.payload\)/i);
});

test("final boundary makes inventory writes office-only pending an atomic inventory RPC", () => {
  for (const table of ["materials", "stock_items", "stock_movements", "purchase_lists"]) {
    assert.match(boundary, new RegExp(`'${table}'`));
  }
  assert.match(boundary, /table_name \|\| '_office_insert'[\s\S]*private\.can_manage_office_data\(\)/i);
  const rpcStart = boundary.indexOf("create or replace function public.jr_field_save_collection");
  const rpcEnd = boundary.indexOf("revoke execute on function public.jr_field_save_collection", rpcStart);
  const rpc = boundary.slice(rpcStart, rpcEnd);
  assert.doesNotMatch(rpc, /jr-os-job-material-usage|jr-os-stock-locations/i);
});

test("purchase-list field edits preserve hidden per-item cost by stable item id", () => {
  assert.match(purchaseMerge, /old_payload \|\| private\.jr_field_purchase_list_payload\(new_payload\)/i);
  assert.match(purchaseMerge, /old_item ->> 'id' = new_item ->> 'id'/i);
  assert.match(purchaseMerge, /old_item[\s\S]*\|\| new_item/i);
});

test("complete inventory source rows are office-only after the projection migration", () => {
  assert.match(migration, /array\['materials','stock_items','purchase_lists'\]/i);
  assert.match(migration, /drop policy if exists %I on public\.%I[\s\S]*table_name \|\| '_select'/i);
  assert.match(migration, /organisation_id = private\.current_organisation_id\(\)[\s\S]*private\.can_manage_office_data\(\)/i);
});

test("canonical stock movement history is office-only after the final read boundary", () => {
  assert.match(
    historicalTypedReads,
    /'stock_movements'[\s\S]*public\.current_jr_role\(\) in \(''owner'',''admin'',''office'',''electrician''\)/i,
    "the historical policy must demonstrate the field-read exposure being closed",
  );
  const policyStart = stockMovementBoundary.indexOf("drop policy if exists stock_movements_select");
  const policyEnd = stockMovementBoundary.indexOf("create or replace function public.jr_os_deployed_migration", policyStart);
  const policy = stockMovementBoundary.slice(policyStart, policyEnd);
  assert.match(policy, /drop policy if exists stock_movements_select on public\.stock_movements/i);
  assert.match(policy, /create policy stock_movements_select[\s\S]*for select to authenticated/i);
  assert.match(policy, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(policy, /and \(select private\.can_manage_office_data\(\)\)/i);
  assert.doesNotMatch(policy, /electrician|customer|deleted_at/i);
  assert.doesNotMatch(stockMovementBoundary, /for (?:insert|update|delete)/i);
  assert.match(stockMovementBoundary, /'20260903132756_keep_field_stock_movements_office_only\.sql'/i);
});

test("electrician repositories read price-safe typed inventory projections", () => {
  assert.match(collections, /electrician:\s*\{[\s\S]*materials:\s*"field_materials"/i);
  assert.match(collections, /electrician:\s*\{[\s\S]*purchase_lists:\s*"field_purchase_lists"/i);
  assert.match(collections, /electrician:\s*\{[\s\S]*stock_items:\s*"field_stock_items"/i);
  assert.equal(typedCollectionTables["jr-os-materials"], "materials");
  assert.equal(typedCollectionTables["jr-os-stock-items"], "stock_items");
  assert.equal(typedCollectionTables["jr-os-purchase-lists"], "purchase_lists");
});

test("recovery and deployment guidance retain typed inventory pricing privacy", () => {
  const genericIndex = recovery.indexOf("20260809_048_field_cloud_collection_projection.sql");
  const inventoryIndex = recovery.indexOf("20260809_049_field_inventory_projections.sql");
  const metadataIndex = recovery.indexOf("20260809_050_restrict_field_material_price_metadata.sql");
  const electricalTestingIndex = recovery.indexOf("20260903121755_keep_field_electrical_testing_office_only.sql");
  const stockMovementIndex = recovery.indexOf("20260903132756_keep_field_stock_movements_office_only.sql");
  assert.ok(genericIndex >= 0 && inventoryIndex > genericIndex, "typed inventory projection must follow generic field projection hardening");
  assert.ok(metadataIndex > inventoryIndex, "material price metadata hardening must follow typed inventory projection creation");
  assert.ok(stockMovementIndex > electricalTestingIndex, "stock movement read hardening must follow the prior final migration");
  assert.match(
    recovery,
    /begin;\s*\\ir \.\.\/migrations\/20260903132756_keep_field_stock_movements_office_only\.sql\s*commit;/i,
  );
  assert.match(setup, /typed inventory reads remove material trade and sell prices, price-check metadata, stock unit costs and purchase-list item costs/i);
  assert.match(setup, /inventory edits preserve hidden office pricing/i);
  assert.match(setup, /canonical stock-movement history, including job links, movement notes and timestamps, remains office-only/i);
});
