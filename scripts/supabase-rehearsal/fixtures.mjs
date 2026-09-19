import { randomUUID } from "node:crypto";

export async function seedBaseline(db) {
  const actors = {};
  const roles = {
    owner: "owner", other: "owner", admin: "admin", office: "office",
    field: "electrician", customer: "customer", stale: "customer",
    revoked: "office", inactive: "office",
  };
  await db.exec("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false)");
  for (const [name, role] of Object.entries(roles)) {
    const id = randomUUID();
    const session = randomUUID();
    const email = `${name}@rehearsal.invalid`;
    await db.query(`insert into auth.users(id,aud,role,email,raw_user_meta_data)
      values($1,'authenticated','authenticated',$2,'{"business_name":"Synthetic upgrade rehearsal"}')`, [id,email]);
    const signup = (await db.query("select organisation_id from public.profiles where id=$1", [id])).rows[0].organisation_id;
    const org = name === "owner" || name === "other" ? signup : actors.owner.org;
    if (org !== signup) {
      // Only new synthetic memberships are replaced. Applied identity guards stay enabled.
      await db.query("delete from public.profiles where id=$1 and organisation_id=$2", [id,signup]);
      await db.query(`insert into public.profiles(id,organisation_id,full_name,role,active,customer_source_id)
        values($1,$2,$3,$4,$5,$6)`, [id,org,name,role,name !== "inactive",role === "customer" ? (name === "stale" ? "deleted-customer" : "customer") : null]);
    }
    if (name !== "revoked") await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [session,id]);
    actors[name] = { id, session, email, org, role };
  }

  async function record(table, actor, source, extra = {}, options = {}) {
    if (!/^[a-z_]+$/.test(table)) throw new Error("Unsafe fixture table");
    const customer = options.customer ?? null;
    const job = options.job ?? null;
    const payload = {id:source,...(customer && table !== "customers" ? {customerId:customer} : {}),...(job ? {jobId:job} : {}),...extra};
    const columns = ["organisation_id","source_id","customer_source_id","job_source_id","payload","created_by","updated_by","created_at","updated_at","source_updated_at","deleted_at"];
    const time = options.time ?? "2026-08-01T09:00:00.000Z";
    const values = [actor.org,source,customer,job,JSON.stringify(payload),actor.id,actor.id,time,time,time,options.deleted ? time : null];
    if (table === "cloud_collections") { columns.push("collection_key"); values.push(options.key); }
    const result = await db.query(`insert into public.${table}(${columns.join(",")})
      values(${values.map((_,i)=>`$${i+1}`).join(",")}) returning id`,values);
    return result.rows[0].id;
  }

  for (const actor of [actors.owner,actors.other]) {
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({
      role:"authenticated",sub:actor.id,session_id:actor.session,email:actor.email,amr:[{method:"password"}],
    })]);
    const scope = {customer:"customer",job:"job"};
    await record("customers",actor,"customer",{name:"Synthetic customer",internalNotes:"office-secret"},{customer:"customer"});
    await record("customers",actor,"deleted-customer",{name:"Archived customer"},{customer:"deleted-customer",deleted:true});
    await record("team_members",actor,"worker",{name:"Assigned worker",email:actor === actors.owner ? actors.field.email : "other-worker@rehearsal.invalid",status:"Active",payRate:77});
    await record("team_members",actor,"archived-worker",{name:"Archived worker",status:"Inactive"},{deleted:true});
    await record("builders",actor,"builder",{name:"Synthetic builder",internalNotes:"office-secret"});
    await record("jobs",actor,"job",{title:"Existing job",status:"In progress",assignedTo:["worker"],builderId:"builder",contractValue:9000,internalNotes:"office-secret"},{customer:"customer"});
    await record("jobs",actor,"archived-job",{title:"Archived job",status:"Complete",assignedTo:[]},{customer:"customer",deleted:true});
    await record("planner_entries",actor,"planned",{status:"Scheduled",teamMemberIds:["worker"]},scope);
    await record("planner_entries",actor,"completed-history",{status:"Complete",teamMemberIds:["archived-worker"]},scope);
    await record("planner_entries",actor,"cancelled-history",{status:"Cancelled",teamMemberIds:["archived-worker"]},scope);
    await record("planner_entries",actor,"deleted-history",{status:"Complete",teamMemberIds:["archived-worker"]},{...scope,deleted:true});
    await record("timesheets",actor,"timesheet",{teamMemberId:"worker",hours:8,payRate:77},scope);
    await record("job_documents",actor,"document",{title:"Existing drawing",url:"https://example.invalid/drawing.pdf"},scope);
    await record("expenses",actor,"expense",{amount:123,notes:"office-secret"},scope);
    for (const table of ["materials","stock_items","stock_movements","purchase_lists","electrical_testing_records","ai_recommendation_evidence"]) {
      await record(table,actor,table,{name:"Existing record",unitCost:42,internalNotes:"office-secret"});
    }
    await record("certificates",actor,"certificate",{status:"Issued",pdfUrl:"https://example.invalid/certificate.pdf",internalNotes:"office-secret"},scope);
    for (const source of ["accepted-quote","repair-quote","draft-quote"]) {
      await record("pricing_documents",actor,source,{type:"Quote",status:source === "accepted-quote" ? "Accepted" : source === "repair-quote" ? "Sent" : "Draft",terms:"Existing terms",items:[],internalNotes:"office-secret"},scope);
      if (source !== "draft-quote") await record("portal_approvals",actor,`${source}-approval`,{
        documentId:source,documentType:"Quote",documentVersion:1,decision:"Accepted",
        approvalName:"Synthetic Customer",comments:"Preserve legal evidence",termsAccepted:true,
        termsSnapshot:"Existing terms",decidedAt:"2026-08-02T09:00:00.000Z",
      },{...scope,time:"2026-08-02T09:00:00.000Z"});
    }
    await record("portal_requests",actor,"request",{plannerEntryId:"planned",message:"Existing request"},scope);
    await record("invoices",actor,"invoice",{status:"Sent",items:[{description:"Work",quantity:1,unitPrice:1000}],vatEnabled:true,vatRate:20,amountPaid:0,internalNotes:"office-secret"},scope);
    await record("payments",actor,"payment",{invoiceId:"invoice",amount:100,type:"Payment",internalNotes:"office-secret"},scope);
    await record("cloud_collections",actor,"survey",{photos:[{id:"survey-photo"}],internalNotes:"office-secret"},{...scope,key:"jr-os-surveys"});
    await record("cloud_collections",actor,"progress",{status:"In progress",paymentPercent:35},{...scope,key:"jr-os-job-progress"});
    await record("cloud_collections",actor,"deposit",{pricingDocumentId:"accepted-quote",mode:"Percentage",value:25,dueRule:"On acceptance",internalNotes:"office-secret"},{...scope,key:"jr-os-deposit-requirements"});
    await record("cloud_collections",actor,"payment-link",{invoiceId:"invoice",status:"Active",url:"https://example.invalid/payment",internalNotes:"office-secret"},{...scope,key:"jr-os-portal-payment-links"});
    await record("cloud_collections",actor,"timeline",{eventType:"Job created",title:"Existing activity",internalNotes:"office-secret"},{...scope,key:"jr-os-job-timeline"});
    for (const source of ["document","expense","survey-photo","unknown-file"]) {
      const path = `${actor.org}/jobs/job/${source}/file.pdf`;
      await db.query(`insert into public.private_files(organisation_id,source_id,customer_source_id,job_source_id,
        bucket,object_path,file_name,mime_type,created_by,updated_by,created_at,updated_at)
        values($1,$2,'customer','job','jr-os-private',$3,'file.pdf','application/pdf',$4,$4,'2026-08-01','2026-08-01')`,[actor.org,source,path,actor.id]);
      await db.query(`insert into storage.objects(bucket_id,name,owner,owner_id,version,metadata)
        values('jr-os-private',$1,$2,$3,'existing-object-version','{"size":123,"mimetype":"application/pdf"}')`,[path,actor.id,actor.id]);
    }
    await db.query(`insert into public.app_records(id,organisation_id,collection,payload,created_by,updated_by)
      values($1,$2,'legacy-backup','{"existing":"local backup evidence"}',$3,$3)`,[`${actor.org}-backup`,actor.org,actor.id]);
    await db.query(`insert into public.migration_markers(organisation_id,storage_key,source_id,imported_by)
      values($1,'jr-os-customers','customer',$2)`,[actor.org,actor.id]);
  }
  // Migration execution has no end-user JWT. Audit triggers must tolerate it.
  await db.exec("select set_config('request.jwt.claims', '', false)");
  return actors;
}
