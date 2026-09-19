import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, basename } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = path => readFile(resolve(root,path),"utf8");
const hash = text => createHash("sha256").update(text).digest("hex");
const manifest = JSON.parse(await read("docs/security/supabase-upgrade-manifest-2026-09-19.json"));
const recovery = await read(manifest.effective_order_source);
const order = [...recovery.matchAll(/^\\ir \.\.\/migrations\/([a-z0-9_]+\.sql)$/gm)].map(match=>`supabase/migrations/${match[1]}`);
assert.equal(new Set(order).size,order.length,"Recovery chain must not repeat migrations");
const baselineIndex = order.indexOf(manifest.baseline.repository_file);
assert.equal(baselineIndex+1,manifest.baseline.matched_effective_migrations,"Baseline moved");
assert.deepEqual(order.slice(baselineIndex+1),manifest.pending_migrations.map(item=>item.file),"Manifest must cover the entire effective suffix");
assert.equal(manifest.pending_count,manifest.pending_migrations.length);
assert.equal(basename(order.at(-1)),manifest.target_migration);
assert(!order.includes(`supabase/migrations/${manifest.superseded_file_excluded}`));
const sources = new Map();
for (const [i,item] of manifest.pending_migrations.entries()) {
  assert.equal(item.order,i+1);
  const sql = await read(item.file);
  assert.equal(hash(sql),item.sha256,`Migration changed: ${item.file}`);
  sources.set(item.file,sql);
}

const quote = name => `"${name.replaceAll('"','""')}"`;

async function snapshot(connection) {
  const tables = (await connection.query(`select schemaname,tablename from pg_tables
    where schemaname in ('public','auth','storage','private') order by schemaname,tablename`)).rows;
  const result = {};
  for (const {schemaname,tablename} of tables) {
    result[`${schemaname}.${tablename}`] = (await connection.query(`select to_jsonb(row) as data
      from ${quote(schemaname)}.${quote(tablename)} row order by to_jsonb(row)::text`)).rows.map(row=>row.data);
  }
  return result;
}

async function catalog(connection) {
  return (await connection.query(`select jsonb_build_object(
    'columns',(select jsonb_agg(to_jsonb(c) order by table_schema,table_name,ordinal_position)
      from information_schema.columns c where table_schema in ('public','auth','storage','private')),
    'constraints',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,
      'name',con.conname,'definition',pg_get_constraintdef(con.oid)) order by n.nspname,c.relname,con.conname)
      from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','auth','storage','private')),
    'triggers',(select jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)
      order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal
      and n.nspname in ('public','auth','storage','private')),
    'indexes',(select jsonb_agg(to_jsonb(i) order by schemaname,tablename,indexname)
      from pg_indexes i where schemaname in ('public','auth','storage','private')),
    'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p
      where schemaname in ('public','auth','storage','private')),
    'functions',(select jsonb_agg(jsonb_build_object('definition',pg_get_functiondef(p.oid),
      'acl',(select jsonb_agg(acl::text order by acl::text) from unnest(coalesce(p.proacl,acldefault('f',p.proowner))) acl))
      order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','auth','storage','private') and p.prokind='f'),
    'relations',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,
      'kind',c.relkind,'rls',c.relrowsecurity,
      'acl',(select jsonb_agg(acl::text order by acl::text) from unnest(coalesce(c.relacl,acldefault(
        case when c.relkind='S' then 'S' else 'r' end::"char",c.relowner))) acl)) order by n.nspname,c.relname)
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','auth','storage','private') and c.relkind in ('r','v','S'))
    ) as data`)).rows[0].data;
}

async function apply(connection,files) {
  for (const file of files) {
    try { await connection.exec(sources.get(file) ?? await read(file)); }
    catch (error) { throw new Error(`${basename(file)}: ${error.message}`,{cause:error}); }
  }
}

function checkPreservation(before,after,actors) {
  let unchanged = 0;
  const transformed = [];
  for (const [table,rows] of Object.entries(before)) {
    const current = new Map(after[table].map(row=>[row.id,row]));
    if (table !== "public.audit_log") assert.equal(current.size,rows.length,`${table}: rows added or removed`);
    for (const old of rows) {
      const actual = current.get(old.id);
      assert(actual,`${table}: record disappeared`);
      const expected = structuredClone(old);
      if (table === "public.private_files") {
        const keys = {document:"jr-os-job-documents",expense:"jr-os-expenses","survey-photo":"jr-os-surveys"};
        expected.storage_key = keys[old.source_id] ?? null;
        if (expected.storage_key !== null) {
          transformed.push(`${table}:${old.source_id}`);
        } else unchanged++;
      } else if (table === "public.profiles" && old.id === actors.stale.id) {
        expected.active = false;
        assert(Date.parse(actual.updated_at)>=Date.parse(old.updated_at));
        expected.updated_at = actual.updated_at;
        transformed.push(`${table}:stale-portal`);
      } else if (table === "public.pricing_documents" && old.source_id === "repair-quote") {
        expected.payload.status = "Accepted";
        assert(Date.parse(actual.payload.updatedAt)>Date.parse(old.updated_at));
        expected.payload.updatedAt = actual.payload.updatedAt;
        expected.version++;
        expected.updated_by = null;
        assert(Date.parse(actual.updated_at)>Date.parse(old.updated_at));
        assert(Date.parse(actual.source_updated_at)>Date.parse(old.source_updated_at));
        expected.updated_at = actual.updated_at;
        expected.source_updated_at = actual.source_updated_at;
        transformed.push(`${table}:historical-approval-repair`);
      } else unchanged++;
      assert.deepEqual(actual,expected,`${table}:${old.source_id ?? old.id} changed outside the reviewed transformation`);
    }
  }
  assert.equal(transformed.length,9,"Expected six metadata backfills, two quote repairs and one revoked portal");
  return {unchanged,transformed};
}

async function asActor(connection,actor,query) {
  const claims = {role:"authenticated",sub:actor.id,session_id:actor.session,email:actor.email,amr:[{method:"password"}]};
  await connection.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims)]);
  await connection.exec("set role authenticated");
  try { return (await connection.query(query)).rows; }
  finally { await connection.exec("reset role; select set_config('request.jwt.claims','',false)"); }
}

async function checkAccess(connection,actors) {
  for (const name of ["owner","admin","office"]) {
    const jobs = await asActor(connection,actors[name],"select organisation_id,source_id,payload from public.jobs where deleted_at is null");
    assert.deepEqual(jobs.map(row=>[row.organisation_id,row.source_id]),[[actors.owner.org,"job"]],`${name}: canonical tenant scope`);
    assert.equal(jobs[0].payload.contractValue,9000,"Office commercial detail must survive");
  }
  for (const name of ["field","customer","stale","revoked","inactive"]) {
    assert.deepEqual(await asActor(connection,actors[name],"select id from public.jobs"),[],`${name}: canonical jobs must be hidden`);
  }
  const field = await asActor(connection,actors.field,"select organisation_id,source_id,payload from public.field_jobs");
  assert.deepEqual(field.map(row=>[row.organisation_id,row.source_id]),[[actors.owner.org,"job"]]);
  assert(!Object.hasOwn(field[0].payload,"contractValue"),"Field projection leaked contract value");
  const portal = await asActor(connection,actors.customer,"select organisation_id,source_id,payload from public.customer_jobs");
  assert.equal(portal.length,1);
  assert.equal(portal[0].organisation_id,actors.owner.org);
  assert(!Object.hasOwn(portal[0].payload,"contractValue"),"Customer projection leaked contract value");
  assert.deepEqual(await asActor(connection,actors.stale,"select id from public.customer_jobs"),[],"Revoked portal retained access");
  const files = await asActor(connection,actors.field,"select source_id from public.private_files order by source_id");
  assert.deepEqual(files.map(row=>row.source_id),["document","survey-photo"],"Assigned field private-file scope");
  const other = await asActor(connection,actors.other,"select distinct organisation_id from public.jobs");
  assert.deepEqual(other,[{organisation_id:actors.other.org}],"Second tenant scope");
}


export { read, hash, manifest, order, baselineIndex, snapshot, catalog, apply, checkPreservation, checkAccess };
