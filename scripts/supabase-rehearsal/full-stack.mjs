import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { seedBaseline } from "./fixtures.mjs";
import { read, hash, manifest, order, baselineIndex, snapshot, catalog, apply, checkPreservation, checkAccess } from "./common.mjs";

// No connection/credential arguments. This owns only a freshly generated local CI project.
assert.equal(process.argv.length,2,"The full rehearsal accepts no arguments");
assert.equal(process.env.GITHUB_ACTIONS,"true","Run this destructive synthetic restore only in an ephemeral GitHub Actions job");
assert.equal(process.env.CI,"true");
assert(!process.env.DOCKER_HOST,"Use the runner's local Docker daemon");
const workspace = await mkdtemp(join(tmpdir(),"jr-os-supabase-"));
const project = basename(workspace).toLowerCase();
const databaseContainer = `supabase_db_${project}`;
const cli = fileURLToPath(new URL("node_modules/.bin/supabase",import.meta.url));
const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith("SUPABASE_")));
childEnv.SUPABASE_TELEMETRY_DISABLED = "1";
const started = Date.now();
let db;
let ownedProject = false;

function command(binary,args,input) {
  try {
    return execFileSync(binary,args,{cwd:workspace,env:childEnv,input,maxBuffer:32*1024*1024,timeout:600_000,stdio:["pipe","pipe","pipe"]});
  } catch (error) {
    // Never print captured CLI status/output, which can contain local credentials.
    throw new Error(`${basename(binary)} ${args[0]} failed: ${String(error.stderr ?? error.code).slice(-4000)}`);
  }
}
const supabase = (...args)=>command(cli,[...args,"--workdir",workspace]);
const docker = (...args)=>command("docker",args);
const sameData = (actual,expected,message)=>assert.equal(hash(JSON.stringify(actual)),hash(JSON.stringify(expected)),message);

function assertLocal(status) {
  const database = new URL(status.DB_URL);
  const api = new URL(status.API_URL);
  assert.equal(database.protocol,"postgresql:");
  assert.equal(database.hostname,"127.0.0.1");
  assert.equal(database.port,"54322");
  assert.equal(database.pathname,"/postgres");
  assert.equal(database.search,"");
  assert.equal(api.origin,"http://127.0.0.1:54321");
  assert.equal(api.pathname,"/");
}

async function connect(url) {
  const client = new pg.Client({connectionString:url,connectionTimeoutMillis:10_000});
  await client.connect();
  return {query:(...args)=>client.query(...args),exec:sql=>client.query(sql),close:()=>client.end()};
}

function platformClient(status) {
  const password = `Synthetic-${randomUUID()}-Aa9!`;
  const objects = new Map();
  const token = actor=>actor?.token ?? status.ANON_KEY;
  async function request(path,{actor,method="GET",body,headers={}}={}) {
    return fetch(`${status.API_URL}${path}`,{method,redirect:"error",signal:AbortSignal.timeout(15_000),
      headers:{apikey:status.ANON_KEY,Authorization:`Bearer ${token(actor)}`,...headers},body});
  }
  async function json(path,options={}) {
    const response = await request(path,{...options,body:options.body === undefined ? undefined : JSON.stringify(options.body),
      headers:{...(options.body === undefined ? {} : {"Content-Type":"application/json"}),...options.headers}});
    if(!response.ok) {
      const failure = await response.json().catch(()=>({}));
      assert.fail(`${options.method ?? "GET"} ${path}: HTTP ${response.status}; ${String(failure.message ?? failure.error ?? "request failed").slice(0,300)}`);
    }
    return response.status === 204 ? null : response.json();
  }
  async function signIn(actor) {
    const session = await json("/auth/v1/token?grant_type=password",{method:"POST",body:{email:actor.email,password}});
    assert.equal(session.user.id,actor.id,"Restored password login changed identity");
    return {...actor,token:session.access_token,refreshToken:session.refresh_token};
  }
  return {request,json,objects,signIn,
    async createIdentity(name,email) {
      const result = await json("/auth/v1/signup",{method:"POST",body:{email,password,data:{business_name:"Synthetic upgrade rehearsal"}}});
      assert(result.access_token,"Local signup must return a real Auth session");
      const claims = JSON.parse(Buffer.from(result.access_token.split(".")[1],"base64url"));
      assert(claims.session_id);
      const actor = {id:result.user.id,session:claims.session_id,token:result.access_token,refreshToken:result.refresh_token};
      if (name === "revoked") {
        const response = await request("/auth/v1/logout?scope=global",{method:"POST",actor});
        assert(response.ok,"Auth must revoke the negative fixture's real session");
      }
      return actor;
    },
    async uploadObject(actor,path) {
      const bytes = Buffer.from(`%PDF-1.4\nSynthetic existing file: ${path}\n%%EOF\n`);
      const response = await request(`/storage/v1/object/jr-os-private/${path}`,{method:"POST",actor,body:bytes,
        headers:{"Content-Type":"application/pdf","x-upsert":"false"}});
      assert(response.ok,`Existing object upload failed: HTTP ${response.status}`);
      objects.set(path,bytes);
    },
  };
}

async function ready(client,owner) {
  let last = "connection unavailable";
  for(let attempt=0;attempt<60;attempt++) {
    try {
      const responses = await Promise.all([
        client.request("/auth/v1/health"),
        client.request("/storage/v1/status"),
        client.request("/rest/v1/jobs?select=id&limit=0",{actor:owner}),
      ]);
      last = responses.map(response=>response.status).join("/");
      const healthy = responses.every(response=>response.ok);
      await Promise.all(responses.map(response=>response.arrayBuffer()));
      if(healthy) return;
    } catch { /* Containers reconnect after restoring the local database. */ }
    await delay(1000);
  }
  throw new Error(`Restored Auth/Storage/Data API did not become ready: ${last}`);
}

async function checkHttp(client,actors,connection) {
  const jobs = actor=>client.json("/rest/v1/jobs?select=organisation_id,source_id,payload&deleted_at=is.null",{actor});
  for(const name of ["owner","admin","office","other"]) {
    const rows = await jobs(actors[name]);
    assert.deepEqual(rows.map(row=>[row.organisation_id,row.source_id]),[[actors[name].org,"job"]],`${name}: REST tenant scope`);
    assert.equal(rows[0].payload.contractValue,9000);
  }
  for(const name of ["field","customer","stale","revoked","inactive"]) {
    assert.deepEqual(await jobs(actors[name]),[],`${name}: REST canonical records must be hidden`);
  }
  const anonymous = await client.request("/rest/v1/jobs?select=id");
  assert([401,403].includes(anonymous.status),"Anonymous REST access must be denied by grants");
  for(const [name,view] of [["field","field_jobs"],["customer","customer_jobs"]]) {
    const rows = await client.json(`/rest/v1/${view}?select=organisation_id,source_id,payload`,{actor:actors[name]});
    assert.deepEqual(rows.map(row=>[row.organisation_id,row.source_id]),[[actors.owner.org,"job"]]);
    assert(!Object.hasOwn(rows[0].payload,"contractValue"),`${name}: REST projection leaked office detail`);
  }
  for(const name of ["stale","revoked","inactive"]) {
    assert.deepEqual(await client.json("/rest/v1/customer_jobs?select=source_id",{actor:actors[name]}),[]);
  }
  for(const [path,expected] of client.objects) {
    const actor = path.startsWith(`${actors.owner.org}/`) ? actors.owner : actors.other;
    const response = await client.request(`/storage/v1/object/authenticated/jr-os-private/${path}`,{actor});
    assert(response.ok,`Owner cannot download existing ${path.split("/").at(-2)}: HTTP ${response.status}`);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(expected),"Existing object bytes changed");
  }
  const path = source=>`${actors.owner.org}/jobs/job/${source}/file.pdf`;
  for(const name of ["field"]) {
    const response = await client.request(`/storage/v1/object/authenticated/jr-os-private/${path("document")}`,{actor:actors[name]});
    assert(response.ok,`${name}: authorized existing drawing download failed`);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(client.objects.get(path("document"))));
  }
  for(const [name,source] of [["other","document"],["field","expense"],["customer","document"],["stale","document"],["revoked","document"],["inactive","document"],[null,"document"]]) {
    const response = await client.request(`/storage/v1/object/authenticated/jr-os-private/${path(source)}`,{actor:actors[name]});
    assert([400,401,403,404].includes(response.status),`${name ?? "anonymous"}: unauthorized Storage download returned ${response.status}`);
  }
  const replacement = Buffer.from("%PDF-1.4\nSynthetic replacement after upgrade\n%%EOF\n");
  const replaced = await client.request(`/storage/v1/object/jr-os-private/${path("document")}`,{method:"POST",actor:actors.owner,body:replacement,
    headers:{"Content-Type":"application/pdf","x-upsert":"true"}});
  assert(replaced.ok,`Existing-file upsert failed after restore/upgrade: HTTP ${replaced.status}`);
  const replacedDownload = await client.request(`/storage/v1/object/authenticated/jr-os-private/${path("document")}`,{actor:actors.field});
  assert(replacedDownload.ok);
  assert.equal(hash(Buffer.from(await replacedDownload.arrayBuffer())),hash(replacement));
  const stored = async()=>Number((await connection.query("select count(*) from storage.objects where bucket_id='jr-os-private' and name=$1",[path("unknown-file")])).rows[0].count);
  const bulk = await client.json("/storage/v1/object/jr-os-private",{method:"DELETE",actor:actors.owner,body:{prefixes:[path("unknown-file")]}});
  assert.deepEqual(bulk,[],"Bulk deletion must remain denied by its separate operation policy");
  assert.equal(await stored(),1,"Denied bulk deletion changed object metadata");
  await client.json(`/storage/v1/object/jr-os-private/${path("unknown-file")}`,{method:"DELETE",actor:actors.owner});
  assert.equal(await stored(),0,"Permitted single-object deletion did not remove metadata");
  const removed = await client.request(`/storage/v1/object/authenticated/jr-os-private/${path("unknown-file")}`,{actor:actors.owner});
  assert([400,404].includes(removed.status),`Deleted synthetic object request returned HTTP ${removed.status}`);
  for(const name of ["owner","field","customer"]) {
    const fresh = await client.signIn(actors[name]);
    const user = await client.json("/auth/v1/user",{actor:fresh});
    assert.equal(user.id,actors[name].id);
    const view = name === "owner" ? "jobs" : `${name}_jobs`;
    const rows = await client.json(`/rest/v1/${view}?select=source_id&deleted_at=is.null`,{actor:fresh});
    assert.deepEqual(rows.map(row=>row.source_id),["job"],`${name}: fresh password login lost application access`);
  }
  const refreshed = await client.json("/auth/v1/token?grant_type=refresh_token",{method:"POST",body:{refresh_token:actors.office.refreshToken}});
  assert.equal(refreshed.user.id,actors.office.id);
  assert.equal((await jobs({...actors.office,token:refreshed.access_token})).length,1,"Restored refresh token lost office access");
  const revoked = await client.request("/auth/v1/token?grant_type=refresh_token",{method:"POST",body:JSON.stringify({refresh_token:actors.revoked.refreshToken}),headers:{"Content-Type":"application/json"}});
  assert([400,401,403].includes(revoked.status),"Revoked refresh token became usable after restore");
  console.log("HTTP checks passed: existing and fresh sessions, refresh/revocation, tenant/role projections, eight file hashes, denied downloads, upsert and delete");
}

try {
  await mkdir(join(workspace,"supabase"));
  await writeFile(join(workspace,"supabase/config.toml"),(await read("supabase/rehearsal/config.toml")).replace("REHEARSAL_PROJECT_ID",project));
  assert.equal(docker("ps","-aq","--filter",`label=com.supabase.cli.project=${project}`).toString().trim(),"","Generated project must not already exist");
  ownedProject = true;
  console.log("Starting an unlinked temporary Supabase stack with PostgreSQL 17, Auth, Data API and Storage");
  supabase("start","--exclude","realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor");
  const status = JSON.parse(supabase("status","--output","json"));
  assertLocal(status);
  assert(status.ANON_KEY,"CLI must provide a local public key");
  const client = platformClient(status);
  db = await connect(status.DB_URL);
  const version = (await db.query("show server_version")).rows[0].server_version;
  assert.match(version,/^17\./);
  console.log(`Platform ready: PostgreSQL ${version}; Supabase CLI ${supabase("--version").toString().trim()}`);
  await db.exec(await read("supabase/schema.sql"));
  await apply(db,order.slice(0,baselineIndex+1));
  const actors = await seedBaseline(db,client);
  assert.equal((await db.query("select count(*)::int as count from auth.sessions")).rows[0].count,8);
  // Preserve a synthetic history row for the reviewed baseline, not fabricated per-file production history.
  // The CLI requires a matching local file even when recording an already-applied version.
  supabase("migration","new",manifest.baseline.history_name);
  const migrationsDirectory = join(workspace,"supabase/migrations");
  const generated = await readdir(migrationsDirectory);
  assert.equal(generated.length,1);
  await rename(join(migrationsDirectory,generated[0]),join(migrationsDirectory,`${manifest.baseline.history_version}_${manifest.baseline.history_name}.sql`));
  supabase("migration","repair",manifest.baseline.history_version,"--status","applied","--local");
  await db.query("update supabase_migrations.schema_migrations set name=$2 where version=$1",[manifest.baseline.history_version,manifest.baseline.history_name]);
  const historyBefore = (await db.query("select to_jsonb(m) as data from supabase_migrations.schema_migrations m order by version")).rows;
  assert.equal(historyBefore.length,1);
  console.log("Baseline ready: nine real Auth identities, eight active sessions, two populated tenants and eight uploaded objects");

  const containers = docker("ps","--filter",`label=com.supabase.cli.project=${project}`,"--format","{{.Names}}").toString().trim().split("\n");
  assert(containers.includes(databaseContainer),"Database container must belong to this newly created project");
  const services = containers.filter(name=>name!==databaseContainer);
  assert(services.length>=3,"Need the actual Auth, Data API and Storage containers");
  console.log(`Container images:\n${docker("inspect","--format","{{.Name}} {{.Config.Image}} {{.Image}}",...containers).toString().trim()}`);
  docker("stop",...services);
  const before = await snapshot(db);
  const beforeCatalog = await catalog(db);
  const backup = docker("exec",databaseContainer,"pg_dump","-U","supabase_admin","-d","postgres","--format=custom");
  assert(backup.length>1000);
  await writeFile(join(workspace,"synthetic-baseline.dump"),backup,{mode:0o600});
  console.log("Replacing the stopped synthetic database from its native logical archive");
  await db.close(); db = undefined;
  // Replace only the database in the freshly owned local container. Cluster roles and object volume remain.
  docker("exec",databaseContainer,"psql","-U","supabase_admin","-d","template1","-v","ON_ERROR_STOP=1","-c","drop database postgres with (force)");
  // --create also restores database-level settings/ACLs. Creating a database cannot be wrapped in one transaction.
  command("docker",["exec","-i",databaseContainer,"pg_restore","-U","supabase_admin","-d","template1","--create","--exit-on-error"],backup);
  db = await connect(status.DB_URL);
  const restored = await snapshot(db);
  for(const [name,rows] of Object.entries(before)) sameData(restored[name],rows,`${name}: restored platform records changed`);
  assert.deepEqual(Object.keys(restored),Object.keys(before),"Restored table inventory changed");
  assert.deepEqual(await catalog(db),beforeCatalog,"Restored full-platform database changed catalog/ACLs");
  assert.deepEqual((await db.query("select to_jsonb(m) as data from supabase_migrations.schema_migrations m order by version")).rows,historyBefore,"Restored migration history changed");
  console.log(`Full-platform logical database restore passed: ${backup.length} bytes; SHA-256 ${hash(backup)}`);
  await apply(db,order.slice(baselineIndex+1));
  const after = await snapshot(db);
  const publicOnly = data=>Object.fromEntries(Object.entries(data).filter(([name])=>name.startsWith("public.")));
  const preserved = checkPreservation(publicOnly(before),publicOnly(after),actors);
  for(const [name,rows] of Object.entries(before)) if(!name.startsWith("public.")) sameData(after[name],rows,`${name}: upgrade changed platform records`);
  assert.equal((await db.query("select public.jr_os_deployed_migration() as marker")).rows[0].marker.migration,manifest.target_migration);
  assert.deepEqual((await db.query("select tablename from pg_tables where schemaname='public' and not rowsecurity")).rows,[]);
  await checkAccess(db,actors);
  for(const probe of ["supabase/tests/planner_tombstone_management.sql","supabase/tests/private_storage_upserts.sql"]) {
    await db.exec(await read(probe));
    sameData(await snapshot(db),after,`${probe}: rollback changed existing records`);
  }
  console.log(`All ${manifest.pending_count} migrations passed; ${preserved.unchanged} public rows unchanged, nine reviewed transformations; platform records preserved`);
  docker("start",...services);
  await ready(client,actors.owner);
  await checkHttp(client,actors,db);
  console.log(JSON.stringify({status:"passed",engine:version,pendingMigrations:manifest.pending_count,
    authUsers:before["auth.users"].length,baselineSessions:before["auth.sessions"].length,
    uploadedObjects:client.objects.size,publicTables:Object.keys(after).filter(name=>name.startsWith("public.")).length,
    target:manifest.target_migration,seconds:Math.round((Date.now()-started)/1000)},null,2));
} catch(error) {
  console.error(`FULL SUPABASE REHEARSAL FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  if(db) await db.close();
  try { if(ownedProject) supabase("stop","--project-id",project,"--no-backup"); }
  catch(error) { console.error(`Temporary project cleanup failed: ${error.message}`); process.exitCode = 1; }
  await rm(workspace,{recursive:true,force:true});
}
