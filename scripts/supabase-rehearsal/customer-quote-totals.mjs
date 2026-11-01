import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Only synthetic rehearsal connections reach this check. All records and the
// repeated migration application are rolled back before returning to the caller.
export async function checkCustomerQuoteTotals(db, actors) {
  const migration = await readFile(new URL("../../supabase/migrations/20261101085426_project_customer_quote_total.sql", import.meta.url), "utf8");
  const base = { items: [{ quantity: 2, unitPrice: 100, unitCost: 1 }], pricingSettings: { contingencyPercent: 10, travelPrice: 30, parkingPrice: 5, travelCost: 1 }, internalNotes: "private" };
  const cases = [
    ["legacy", base, 255],
    ["snapshot", { ...base, profitability: { sellingPrice: 310, expectedProfit: 999 } }, 310],
    ["zero", { ...base, profitability: { sellingPrice: 0 } }, 0],
    ["plain", { items: base.items }, 200],
    ["empty", { items: [] }, 0],
    ["null-settings", { items: base.items, pricingSettings: null, profitability: null }, 200],
    ["missing-price", { ...base, profitability: { expectedProfit: 999 } }, 255],
    ...[null, "310", -1, {}, 1.79e308].map((sellingPrice, i) => [`invalid-snapshot-${i}`, { ...base, profitability: { sellingPrice } }, i === 4 ? sellingPrice : null]),
    ["overflow-snapshot", { ...base, profitability: { sellingPrice: "1e309" } }, null],
    ["invalid-profitability", { ...base, profitability: [] }, null],
    ["invalid-lines", { ...base, items: [{ quantity: "2", unitPrice: 100 }] }, null],
    ["missing-lines", { pricingSettings: {} }, null],
    ["invalid-settings", { ...base, pricingSettings: "private" }, null],
    ["invalid-extra", { ...base, pricingSettings: { travelPrice: "30" } }, null],
    ["overflow-lines", { items: [{ quantity: 1e308, unitPrice: 10 }] }, null],
    ["negative-total", { items: [{ quantity: 1, unitPrice: -1 }] }, null],
    ...[
      { quantity: 0, unitPrice: 100 },
      { quantity: -1, unitPrice: 10 },
      { quantity: 1, unitPrice: -10 },
    ].map((line, i) => [`invalid-line-among-valid-${i}`, { items: [...base.items, line] }, null]),
    ...["contingencyPercent", "travelPrice", "parkingPrice"].map((key) => [
      `negative-setting-${key}`, { ...base, pricingSettings: { [key]: -1 } }, null,
    ]),
    ["snapshot-over-invalid-lines", { items: [{ quantity: -1, unitPrice: 1 }], profitability: { sellingPrice: 310 } }, 310],
  ];
  async function asActor(actor, sql, params = []) {
    await db.exec("savepoint quote_actor");
    try {
      const claims = actor ? { role: "authenticated", sub: actor.id, session_id: actor.session, email: actor.email, amr: [{ method: "password" }] } : { role: "anon" };
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
      await db.exec(actor ? "set local role authenticated" : "set local role anon");
      return (await db.query(sql, params)).rows;
    } finally {
      await db.exec("rollback to savepoint quote_actor; release savepoint quote_actor");
    }
  }
  await db.exec("begin");
  try {
    for (const [name, payload, expected] of cases) {
      const actual = (await db.query("select private.jr_customer_quote_net_total($1::jsonb)::float8 as total", [JSON.stringify(payload)])).rows[0].total;
      assert.equal(actual, expected, `SQL customer selling total: ${name}`);
    }
    const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
    const precisionFixtures = [
      { items: [{ quantity: 3, unitPrice: 1.005 }] },
      { items: [{ quantity: 3, unitPrice: 1.005 }], pricingSettings: { contingencyPercent: 7.25, travelPrice: 0.015, parkingPrice: 0.035 } },
      { items: [{ quantity: 1, unitPrice: 1e16 }, { quantity: 1, unitPrice: 1 }, { quantity: 1, unitPrice: 1 }] },
    ];
    // The helper must guarantee round-trip JSON even under a caller session
    // configured to print fewer float digits.
    await db.exec("set local extra_float_digits=-3");
    for (const payload of precisionFixtures) {
      const subtotal = payload.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const settings = payload.pricingSettings;
      const expected = subtotal + subtotal * ((settings?.contingencyPercent ?? 0) / 100)
        + (settings?.travelPrice ?? 0) + (settings?.parkingPrice ?? 0);
      const projectedJson = (await db.query("select private.jr_customer_pricing_payload($1::jsonb)::text as payload", [JSON.stringify(payload)])).rows[0].payload;
      const actual = JSON.parse(projectedJson).customerNetTotal;
      assert.equal(actual, expected, "Projection JSON must round-trip the quote engine's double exactly");
      assert.equal(money.format(actual), money.format(expected), "Customer currency must match the quote engine at half-penny boundaries");
    }
    assert.equal(money.format(3 * 1.005), "£3.01", "Half-penny fixture must detect exact NUMERIC arithmetic");
    for (const input of [
      '{"profitability":{"sellingPrice":1e309}}',
      '{"items":[{"quantity":1e309,"unitPrice":0}]}',
      '{"items":[],"pricingSettings":{"travelPrice":1e309}}',
      '{"items":[{"quantity":1e-400,"unitPrice":1}]}',
      '{"items":[{"quantity":1e-200,"unitPrice":1e-200}]}',
    ]) {
      assert.equal((await db.query("select private.jr_customer_quote_net_total($1::jsonb) as total", [input])).rows[0].total, null, "Out-of-JavaScript-range JSON numbers must be withheld");
    }
    const source = "customer-total-rehearsal";
    for (const [suffix, actor, customer, status] of [
      ["own", actors.owner, "customer", "Sent"],
      ["draft", actors.owner, "customer", "Draft"],
      ["other-customer", actors.owner, "other-customer", "Sent"],
      ["other-tenant", actors.other, "customer", "Sent"],
    ]) {
      if (suffix === "other-customer") {
        await db.query("insert into public.customers(organisation_id,source_id,customer_source_id,payload) values($1,$2,$2,$3)", [actor.org, customer, JSON.stringify({ id: customer })]);
      }
      const id = `${source}-${suffix}`;
      const payload = { ...base, id, customerId: customer, type: "Quote", status, profitability: { sellingPrice: 310, expectedProfit: 999 }, notes: "Customer scope", terms: "Terms" };
      await db.query("insert into public.pricing_documents(organisation_id,source_id,customer_source_id,payload) values($1,$2,$3,$4)", [actor.org, id, customer, JSON.stringify(payload)]);
    }
    // Reconstruct an old projection without the new aggregate, then apply the
    // real migration again inside this surrounding rollback-only transaction.
    await db.query("update public.customer_pricing_documents set payload=payload-'customerNetTotal' where source_id like $1", [`${source}-%`]);
    const canonical = (await db.query("select to_jsonb(p) as row from public.pricing_documents p order by id")).rows;
    const projections = (await db.query("select id,version,payload->'documentVersion' as document_version from public.customer_pricing_documents order by id")).rows;
    const policies = (await db.query("select * from pg_policies where tablename in ('pricing_documents','customer_pricing_documents') order by policyname")).rows;
    await db.exec(migration.replace(/^begin;\s*$/m, "").replace(/^commit;\s*$/m, ""));
    assert.deepEqual((await db.query("select to_jsonb(p) as row from public.pricing_documents p order by id")).rows, canonical, "Reprojection must preserve all canonical quote data and versions");
    assert.deepEqual((await db.query("select id,version,payload->'documentVersion' as document_version from public.customer_pricing_documents order by id")).rows, projections, "Reprojection must preserve visible row identities and approval document versions");
    assert.deepEqual((await db.query("select * from pg_policies where tablename in ('pricing_documents','customer_pricing_documents') order by policyname")).rows, policies, "Reprojection must preserve visibility policies");
    const read = "select payload from public.customer_pricing_documents where source_id like $1 order by source_id";
    const own = await asActor(actors.customer, read, [`${source}-%`]);
    assert.equal(own.length, 1, "Customer may read only their visible tenant quote");
    assert.equal(own[0].payload.customerNetTotal, 310, "Existing visible quote must acquire its accepted selling total");
    for (const field of ["pricingSettings", "profitability", "internalNotes"]) assert.equal(own[0].payload[field], undefined, `${field} must remain private`);
    assert.equal(own[0].payload.items[0].unitCost, undefined, "Private line cost must remain absent");
    for (const role of ["field", "stale", "revoked", "inactive"]) assert.deepEqual(await asActor(actors[role], read, [`${source}-%`]), [], `${role}: no customer aggregate access`);
    await assert.rejects(asActor(actors.customer, "update public.customer_pricing_documents set payload='{}' where source_id=$1", [`${source}-own`]), { code: "42501" }, "Customer projection writes must stay denied");
    await assert.rejects(asActor(actors.customer, "select private.jr_customer_quote_net_total('{}')"), { code: "42501" }, "Private total helper must not become callable by customers");
    const fractionalId = `${source}-half-penny`;
    const fractionalQuote = { ...precisionFixtures[0], id: fractionalId, customerId: "customer", type: "Quote", status: "Sent", vatEnabled: false, vatRate: 0 };
    await db.query("insert into public.pricing_documents(organisation_id,source_id,customer_source_id,payload) values($1,$2,'customer',$3)", [actors.owner.org, fractionalId, JSON.stringify(fractionalQuote)]);
    const customerJson = await asActor(actors.customer, "select payload::text as json from public.customer_pricing_documents where source_id=$1", [fractionalId]);
    const customerTotal = JSON.parse(customerJson[0].json).customerNetTotal;
    assert.equal(customerTotal, 3 * 1.005, "Trigger-maintained customer projection must preserve the JavaScript price");
    assert.equal(money.format(customerTotal), "£3.01", "Actual customer projection must display the same half-penny total");
  } finally {
    await db.exec("rollback");
  }
}
