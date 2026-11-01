import assert from "node:assert/strict";
import { basename } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pgDump } from "@electric-sql/pglite-tools/pg_dump";
import { seedBaseline } from "./fixtures.mjs";
import { read, hash, manifest, order, baselineIndex, snapshot, catalog, apply, checkPreservation, checkAccess } from "./common.mjs";

// This command has no URL/credential input and creates only in-memory databases.
assert.equal(process.argv.length, 2, "This local rehearsal does not accept a database URL or arguments");
const options = {extensions:{pgcrypto}};
let db = await PGlite.create(options);
const started = Date.now();
let failed = false;
async function restoreBaseline(dumpText) {
  const connection = await PGlite.create(options);
  try {
    // pg_dump does not include cluster roles. Recreate only local fixture roles.
    await connection.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    await connection.exec(dumpText);
    // pg_dump emits row_security=off for its own restore session.
    await connection.exec("set search_path to public; set row_security to on");
    return connection;
  } catch (error) {
    await connection.close();
    throw error;
  }
}

async function checkRejectedBaseline(dumpText,actor,label,setup,failingFile,reason) {
  const connection = await restoreBaseline(dumpText);
  try {
    await setup(connection,actor);
    const target = order.findIndex(file=>basename(file)===failingFile);
    assert(target>baselineIndex);
    await apply(connection,order.slice(baselineIndex+1,target));
    const before = await snapshot(connection);
    const beforeCatalog = await catalog(connection);
    await assert.rejects(()=>apply(connection,order.slice(target)),error=>{
      assert(error.message.startsWith(`${failingFile}: `),`${label}: failed at the wrong migration`);
      assert.match(error.message,reason);
      return true;
    });
    // Explicit-transaction migrations leave an aborted transaction on failure.
    await connection.exec("rollback");
    assert.deepEqual(await snapshot(connection),before,`${label}: failed migration changed records`);
    assert.deepEqual(await catalog(connection),beforeCatalog,`${label}: failed migration left partial schema changes`);
    console.log(`Rejected baseline passed: ${label}; failing migration rolled back, later files not applied`);
  } finally { await connection.close(); }
}

try {
  const version = (await db.query("show server_version")).rows[0].server_version;
  assert.match(version,/^17\./,"Rehearse on the same PostgreSQL major as the linked project");
  console.log(`Local SQL rehearsal: PostgreSQL ${version}; no hosted connections`);
  await db.exec(await read("supabase/rehearsal/platform.sql"));
  await db.exec(await read("supabase/schema.sql"));
  await apply(db,order.slice(0,baselineIndex+1));
  const actors = await seedBaseline(db);
  const before = await snapshot(db);
  const beforeCatalog = await catalog(db);
  assert.equal(before["auth.users"].length,9);
  assert.equal(before["auth.sessions"].length,8);
  assert(before["public.audit_log"].length>0,"Need existing audit history");
  for (const [table,rows] of Object.entries(before)) assert(rows.length>0,`Baseline table needs representative data: ${table}`);
  console.log(`Baseline seeded: ${Object.keys(before).length} tables, ${Object.values(before).reduce((n,rows)=>n+rows.length,0)} rows`);

  const dump = await pgDump({pg:db});
  const dumpText = await dump.text();
  // Upgrade the restored database itself. Closing the source also discards
  // pg_dump's read-only transaction on PGlite's shared connection.
  await db.close();
  db = await restoreBaseline(dumpText);
  assert.deepEqual(await snapshot(db),before,"Restored synthetic backup changed rows");
  assert.deepEqual(await catalog(db),beforeCatalog,"Restored synthetic backup changed policies, functions or grants");
  console.log(`Synthetic pg_dump restore passed (${dump.size} bytes; SHA-256 ${hash(dumpText)})`);

  await apply(db,order.slice(baselineIndex+1));
  const after = await snapshot(db);
  const preserved = checkPreservation(before,after,actors);
  assert.equal((await db.query("select public.jr_os_deployed_migration() as marker")).rows[0].marker.migration,manifest.target_migration);
  const insecure = (await db.query(`select tablename from pg_tables where schemaname='public' and not rowsecurity`)).rows;
  assert.deepEqual(insecure,[],"All public tables must retain RLS");
  await checkAccess(db,actors);
  for (const probe of ["supabase/tests/planner_tombstone_management.sql","supabase/tests/private_storage_upserts.sql"]) {
    await db.exec(await read(probe));
    assert.deepEqual(await snapshot(db),after,`${probe}: rollback did not preserve the upgraded records`);
  }
  await checkRejectedBaseline(dumpText,actors.owner,"invalid private-file path",async(connection,actor)=>{
    await connection.query(`insert into public.private_files(organisation_id,source_id,object_path,file_name)
      values($1,'bad-file','wrong-tenant/unassigned/bad.pdf','bad.pdf')`,[actor.org]);
  },"20260809_036_guard_private_file_record_bindings.sql",/invalid customer, job or object-path metadata/);
  await checkRejectedBaseline(dumpText,actors.owner,"mismatched canonical identity",async(connection,actor)=>{
    await connection.query(`insert into public.jobs(organisation_id,source_id,payload)
      values($1,'bad-job','{"id":"different-job"}')`,[actor.org]);
  },"20260809_039_guard_cloud_record_bindings.sql",/payload or customer\/job binding is invalid/);
  await checkRejectedBaseline(dumpText,actors.owner,"missing planner team member",async(connection,actor)=>{
    await connection.query(`insert into public.planner_entries(organisation_id,source_id,payload)
      values($1,'bad-planner','{"id":"bad-planner","status":"Scheduled","teamMemberIds":["missing-worker"]}')`,[actor.org]);
  },"20260810_064_preserve_planner_history_team_lifecycle.sql",/invalid team assignments/);
  await checkRejectedBaseline(dumpText,actors.owner,"duplicate historical approval",async(connection,actor)=>{
    await connection.query(`insert into public.portal_approvals(organisation_id,source_id,customer_source_id,job_source_id,
      payload,created_at,updated_at,source_updated_at)
      select organisation_id,'duplicate-approval',customer_source_id,job_source_id,
        jsonb_set(payload,'{id}','"duplicate-approval"'),created_at,updated_at,source_updated_at
      from public.portal_approvals where organisation_id=$1 and source_id='accepted-quote-approval'`,[actor.org]);
  },"20260813222646_make_portal_approval_atomic.sql",/multiple historical decisions/);
  console.log(JSON.stringify({status:"passed",pendingMigrations:manifest.pending_count,
    baselineRows:Object.values(before).reduce((n,rows)=>n+rows.length,0),
    unchangedRows:preserved.unchanged,reviewedTransformations:preserved.transformed,
    existingAuditRows:before["public.audit_log"].length,newAuditRows:after["public.audit_log"].length-before["public.audit_log"].length,
    publicTables:Object.keys(after).filter(name=>name.startsWith("public.")).length,
    rejectedBaselines:4,target:manifest.target_migration,seconds:Math.round((Date.now()-started)/1000)},null,2));
} catch (error) {
  console.error(`REHEARSAL FAILED: ${error.message}`);
  failed = true;
} finally { await db.close(); }
// WASM shutdown can set process.exitCode. Publish the result after closing it.
process.exitCode = failed ? 1 : 0;
