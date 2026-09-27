import assert from "node:assert/strict";

// Runs only inside the existing synthetic rehearsal. Every fixture, attempted
// write and audit entry is rolled back; no production URL or credentials input.
export async function checkSavedCalculationAccess(db, actors) {
  const key = "jr-os-electrical-calculations";
  const source = "calculation-access-rehearsal";
  const payload = { id: source, jobId: "job", customerId: "customer", title: "Private calculation", evidenceReference: "Private design evidence" };
  const insert = `insert into public.cloud_collections
    (organisation_id,collection_key,source_id,customer_source_id,job_source_id,payload,created_by,updated_by)
    values($1,$2,$3,$4,$5,$6,$7,$7) returning source_id,payload`;
  const values = (actor, org = actor.org, data = payload) => [org,key,data.id,data.customerId ?? null,data.jobId ?? null,JSON.stringify(data),actor.id];

  async function asActor(actor, sql, params = []) {
    await db.exec("savepoint calculation_actor");
    try {
      const claims = actor ? { role: "authenticated", sub: actor.id, session_id: actor.session, email: actor.email, amr: [{ method: "password" }] } : { role: "anon" };
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
      await db.exec(actor ? "set local role authenticated" : "set local role anon");
      return (await db.query(sql, params)).rows;
    } finally {
      // Also recovers an aborted statement before restoring the caller's role.
      await db.exec("rollback to savepoint calculation_actor; release savepoint calculation_actor");
    }
  }

  await db.exec("begin");
  try {
    for (const actor of [actors.owner, actors.other]) await db.query(insert, values(actor));
    const read = "select organisation_id,payload from public.cloud_collections where collection_key=$1 and source_id=$2";
    for (const name of ["owner", "admin", "office", "other"]) {
      const actor = actors[name];
      const rows = await asActor(actor, read, [key,source]);
      assert.equal(rows.length, 1, `${name}: exactly one tenant's calculation must be visible`);
      assert.equal(rows[0].organisation_id, actor.org);
      assert.equal(rows[0].payload.evidenceReference, payload.evidenceReference);
      const created = await asActor(actor, insert, values(actor, actor.org, { ...payload, id: `${source}-create` }));
      assert.equal(created.length, 1, `${name}: office-authorised calculation create must succeed`);
    }
    for (const name of ["field", "customer", "stale", "revoked", "inactive"]) {
      const actor = actors[name];
      assert.deepEqual(await asActor(actor, read, [key,source]), [], `${name}: private calculation must be hidden`);
      await assert.rejects(asActor(actor, insert, values(actor, actors.owner.org, { ...payload, id: `${source}-denied` })), { code: "42501" }, `${name}: calculation create must fail`);
    }
    assert.deepEqual(await asActor(actors.field, "select source_id from public.field_cloud_collections where collection_key=$1", [key]), [], "Field projection must not expose the new collection");
    try {
      assert.deepEqual(await asActor(null, read, [key,source]), [], "Anonymous calculation query must expose no records");
    } catch (error) {
      assert.equal(error.code, "42501", "Anonymous access must either be denied or return no rows");
    }
    await assert.rejects(asActor(actors.owner, insert, values(actors.owner, actors.other.org, { ...payload, id: `${source}-cross` })), { code: "42501" }, "Cross-tenant calculation insert must fail");
    await assert.rejects(asActor(actors.owner, insert, values(actors.owner, actors.owner.org, { ...payload, id: `${source}-missing`, jobId: "missing-job" })), { code: "42501" }, "Missing job binding must fail");
    const forged = values(actors.owner, actors.owner.org, { ...payload, id: `${source}-forged` });
    forged[4] = "archived-job";
    await assert.rejects(asActor(actors.owner, insert, forged), { code: "42501" }, "Envelope and payload job bindings must match");
    const standalone = await asActor(actors.owner, insert, values(actors.owner, actors.owner.org, { id: `${source}-note`, title: "Standalone design note" }));
    assert.equal(standalone.length, 1);
  } finally {
    await db.exec("rollback");
  }
  console.log("Saved calculation tenant, role, session and job-binding assertions passed; fixtures rolled back");
}
