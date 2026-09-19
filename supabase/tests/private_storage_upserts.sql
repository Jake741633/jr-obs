-- Run against the dedicated disposable project after migrations.
-- Reproduce Storage's POST x-upsert permission query, including RETURNING.
-- All Auth, public and Storage rows are rolled back; no object bytes are stored.
begin;
do $$
declare
  actor_roles text[] := array['owner','admin','office','electrician','customer','admin','office','office'];
  actors uuid[] := array[]::uuid[];
  session_ids uuid[] := array[]::uuid[];
  organisation_a uuid;
  signup_organisation uuid;
  run_id text := gen_random_uuid()::text;
  customer_id text := 'upsert-customer-' || run_id;
  job_id text := 'upsert-job-' || run_id;
  document_id text := 'upsert-document-' || run_id;
  object_path text;
  orphan_path text;
  claims text;
  operation_name text;
  stored_object storage.objects%rowtype;
  affected integer;
  visible integer;
  i integer;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  for i in 1..8 loop
    actors := array_append(actors, gen_random_uuid());
    session_ids := array_append(session_ids, gen_random_uuid());
    insert into auth.users(id, aud, role, email, raw_user_meta_data)
    values (actors[i], 'authenticated', 'authenticated',
      'upsert-' || actors[i] || '@example.com',
      jsonb_build_object('business_name', 'JR OS rollback upsert ' || run_id));
    select organisation_id into signup_organisation from public.profiles where id = actors[i];
    if i = 1 then
      organisation_a := signup_organisation;
      insert into public.customers(organisation_id, source_id, customer_source_id, payload)
      values (organisation_a, customer_id, customer_id, jsonb_build_object('id', customer_id));
    else
      -- Replace only each fresh signup membership inside this transaction.
      delete from public.profiles where id = actors[i] and organisation_id = signup_organisation;
      insert into public.profiles(id, organisation_id, role, active, customer_source_id)
      values (actors[i], case when i = 6 then signup_organisation else organisation_a end,
        actor_roles[i], i <> 8, case when i = 5 then customer_id else null end);
    end if;
    insert into auth.sessions(id, user_id) values (session_ids[i], actors[i]);
  end loop;
  delete from auth.sessions where id = session_ids[7];

  insert into public.jobs(organisation_id, source_id, customer_source_id, payload)
  values (organisation_a, job_id, customer_id,
    jsonb_build_object('id', job_id, 'customerId', customer_id));
  insert into public.job_documents(organisation_id, source_id, customer_source_id, job_source_id, payload)
  values (organisation_a, document_id, customer_id, job_id,
    jsonb_build_object('id', document_id, 'customerId', customer_id, 'jobId', job_id));
  object_path := organisation_a || '/jobs/' || job_id || '/' || document_id || '/photo.png';
  orphan_path := organisation_a || '/jobs/' || job_id || '/unregistered-' || run_id || '/photo.png';
  insert into public.private_files(
    organisation_id, source_id, storage_key, customer_source_id, job_source_id,
    bucket, object_path, file_name, mime_type, created_by, updated_by
  ) values (
    organisation_a, document_id, 'jr-os-job-documents', customer_id, job_id,
    'jr-os-private', object_path, 'photo.png', 'image/png', actors[1], actors[1]
  );

  for i in 1..8 loop
    claims := jsonb_build_object('role', 'authenticated', 'sub', actors[i],
      'session_id', session_ids[i], 'amr', jsonb_build_array(jsonb_build_object('method', 'password')))::text;
    perform set_config('request.jwt.claims', claims, true);
    perform set_config('storage.operation', 'storage.object.upload', true);
    set local role authenticated;
    if i <= 6 and private.current_jr_role() is distinct from actor_roles[i] then
      raise exception 'Expected a live % fixture for actor %', actor_roles[i], i;
    end if;
    if i >= 7 and private.current_jr_role() is not null then
      raise exception 'Revoked/inactive actor % retained a live role', i;
    end if;
    if i <= 3 then
      -- First iteration inserts; subsequent owner/admin/office retries update.
      insert into storage.objects(bucket_id, name, owner, owner_id, version, metadata)
      values ('jr-os-private', object_path, actors[i], actors[i]::text, i::text,
        jsonb_build_object('mimetype', 'image/png', 'size', i))
      on conflict (bucket_id, name) do update
      set version = excluded.version, metadata = excluded.metadata
      returning * into stored_object;
      get diagnostics affected = row_count;
      if affected <> 1 or stored_object.name <> object_path or stored_object.version <> i::text then
        raise exception 'Metadata-bound upsert must return exactly one object for %', actor_roles[i];
      end if;
    else
      begin
        insert into storage.objects(bucket_id, name, owner, owner_id, version, metadata)
        values ('jr-os-private', object_path, actors[i], actors[i]::text, 'forbidden',
          jsonb_build_object('mimetype', 'image/png', 'size', 999))
        on conflict (bucket_id, name) do update
        set version = excluded.version, metadata = excluded.metadata
        returning * into stored_object;
        raise exception 'Unauthorized actor % passed upsert permission checks', i;
      exception when insufficient_privilege then null;
      end;
    end if;
    reset role;
  end loop;
  if not exists (select 1 from storage.objects where bucket_id = 'jr-os-private'
    and name = object_path and version = '3' and metadata ->> 'size' = '3') then
    raise exception 'Denied upserts changed the stored object';
  end if;

  -- Restore the active office actor for operation and exact-metadata checks.
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated',
    'sub', actors[3], 'session_id', session_ids[3],
    'amr', jsonb_build_array(jsonb_build_object('method', 'password')))::text, true);
  set local role authenticated;
  perform set_config('storage.operation', 'storage.object.upload_update', true);
  update storage.objects set version = 'put-retry'
  where bucket_id = 'jr-os-private' and name = object_path returning * into stored_object;
  get diagnostics affected = row_count;
  if affected <> 1 or stored_object.version <> 'put-retry' then
    raise exception 'Existing authenticated PUT update must remain available';
  end if;

  perform set_config('storage.operation', 'storage.object.upload', true);
  insert into storage.objects(bucket_id, name, owner, owner_id, version, metadata)
  values ('jr-os-private', orphan_path, actors[3], actors[3]::text, 'original',
    jsonb_build_object('mimetype', 'image/png', 'size', 8));
  begin
    insert into storage.objects(bucket_id, name, owner, owner_id, version, metadata)
    values ('jr-os-private', orphan_path, actors[3], actors[3]::text, 'forbidden',
      jsonb_build_object('mimetype', 'image/png', 'size', 999))
    on conflict (bucket_id, name) do update set version = excluded.version
    returning * into stored_object;
    raise exception 'Upsert without exact metadata must be rejected';
  exception when insufficient_privilege then null;
  end;
  foreach operation_name in array array[
    'storage.object.list', 'storage.object.list_v2', 'storage.object.sign',
    'storage.object.sign_many', 'storage.object.sign_upload_url',
    'storage.object.upload_signed', 'storage.object.get_public', 'unknown', ''
  ] loop
    perform set_config('storage.operation', operation_name, true);
    select count(*) into visible from storage.objects
    where bucket_id = 'jr-os-private' and name = object_path;
    if visible <> 0 then raise exception 'Operation % exposed a private object', operation_name; end if;
  end loop;
  perform set_config('storage.operation', 'storage.object.get_authenticated', true);
  select count(*) into visible from storage.objects
  where bucket_id = 'jr-os-private' and name = object_path;
  if visible <> 1 then raise exception 'Authenticated office download must remain available'; end if;
  reset role;
  if not exists (select 1 from storage.objects where bucket_id = 'jr-os-private'
    and name = orphan_path and version = 'original') then
    raise exception 'Denied orphan retry changed the stored object';
  end if;
  -- Storage's DELETE API must first see the target under the same operation.
  -- Probe that policy prerequisite without disabling Storage's direct-SQL
  -- deletion protection. Actual deletion is covered by the HTTP suite.
  for i in 1..8 loop
    perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated',
      'sub', actors[i], 'session_id', session_ids[i],
      'amr', jsonb_build_array(jsonb_build_object('method', 'password')))::text, true);
    set local role authenticated;
    perform set_config('storage.operation', 'storage.object.delete', true);
    select count(*) into visible from storage.objects
    where bucket_id = 'jr-os-private' and name in (object_path, orphan_path);
    if visible <> (case when i <= 2 then 2 else 0 end) then
      raise exception 'DELETE target visibility incorrect for actor %: %', i, visible;
    end if;
    foreach operation_name in array array[
      'storage.object.list', 'storage.object.list_v2', 'storage.object.sign',
      'storage.object.sign_many', 'storage.object.sign_upload_url',
      'storage.object.upload_signed', 'storage.object.get_public',
      'storage.object.delete_many', 'unknown', ''
    ] loop
      perform set_config('storage.operation', operation_name, true);
      select count(*) into visible from storage.objects
      where bucket_id = 'jr-os-private' and name in (object_path, orphan_path);
      if visible <> 0 then
        raise exception 'Operation % exposed private objects for actor %', operation_name, i;
      end if;
    end loop;
    reset role;
  end loop;
end;
$$;
rollback;
select 'Storage upsert, delete-target, metadata, role, session and operation checks passed; fixtures rolled back' as result;
