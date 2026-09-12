-- Run with psql -v ON_ERROR_STOP=1 after migrations, on a disposable test DB.
-- All users, sessions, signup organisations and records are rolled back.
begin;
do $$
declare
  roles text[] := array['owner','admin','office','electrician','customer','owner'];
  actors uuid[] := array[]::uuid[];
  session_ids uuid[] := array[]::uuid[];
  emails text[] := array[]::text[];
  organisation_a uuid;
  organisation_b uuid;
  actor_org uuid;
  run_id text := gen_random_uuid()::text;
  customer_id text;
  team_id text;
  record_ids uuid[] := array[]::uuid[];
  record_id uuid;
  source text;
  claims text;
  result public.planner_entries%rowtype;
  affected integer;
  visible integer;
  i integer;
begin
  customer_id := 'planner-customer-' || run_id;
  team_id := 'planner-team-' || run_id;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  for i in 1..6 loop
    actors := array_append(actors, gen_random_uuid());
    session_ids := array_append(session_ids, gen_random_uuid());
    emails := array_append(emails, 'planner-' || actors[i] || '@example.com');
    insert into auth.users(id, aud, role, email, raw_user_meta_data)
    values (actors[i], 'authenticated', 'authenticated', emails[i],
      jsonb_build_object('business_name', 'JR OS rollback planner ' || run_id));
    select organisation_id into actor_org from public.profiles where id = actors[i];
    if i = 1 then
      organisation_a := actor_org;
      insert into public.customers(organisation_id, source_id, customer_source_id, payload)
      values (organisation_a, customer_id, customer_id, jsonb_build_object('id', customer_id));
    elsif i = 6 then
      organisation_b := actor_org;
    else
      -- Replace only the fresh signup membership created in this transaction.
      delete from public.profiles where id = actors[i] and organisation_id = actor_org;
      insert into public.profiles(id, organisation_id, role, customer_source_id)
      values (actors[i], organisation_a, roles[i], case when i = 5 then customer_id else null end);
    end if;
    insert into auth.sessions(id, user_id) values (session_ids[i], actors[i]);
  end loop;
  if organisation_a = organisation_b then raise exception 'Distinct tenants required'; end if;
  insert into public.team_members(organisation_id, source_id, payload)
  values (organisation_a, team_id, jsonb_build_object('id', team_id, 'email', emails[4], 'status', 'Active'));
  for i in 1..3 loop
    source := 'planner-' || run_id || '-' || i;
    insert into public.planner_entries(organisation_id, source_id, payload)
    values (organisation_a, source, jsonb_build_object('id', source,
      'teamMemberIds', jsonb_build_array(team_id),
      'status', case when i = 2 then 'Cancelled' else 'Complete' end))
    returning id into record_id;
    record_ids := array_append(record_ids, record_id);
  end loop;

  for i in 1..6 loop
    claims := jsonb_build_object('role','authenticated','sub',actors[i],
      'session_id',session_ids[i], 'amr',jsonb_build_array(jsonb_build_object('method','password')))::text;
    perform set_config('request.jwt.claims', claims, true);
    set local role authenticated;
    if private.current_jr_role() is distinct from roles[i] then
      raise exception 'Expected active role % for actor %', roles[i], i;
    end if;
    if i <= 2 then
      update public.planner_entries set deleted_at = now()
      where id = record_ids[i] and version = 1 returning * into result;
      get diagnostics affected = row_count;
      if affected <> 1 or result.deleted_at is null or result.version <> 2
        or result.id <> record_ids[i] then
        raise exception 'Management tombstone must return exactly one versioned row';
      end if;
    end if;
    select count(*) into visible from public.planner_entries
    where id = any(record_ids[1:2]) and deleted_at is not null;
    if visible <> (case when i = 1 then 1 when i = 2 then 2 else 0 end) then
      raise exception 'Incorrect tombstone visibility for role % / actor %: %', roles[i], i, visible;
    end if;
    select count(*) into visible from public.planner_entries where id = record_ids[3];
    if visible <> (case when i <= 4 then 1 else 0 end) then
      raise exception 'Existing live-row scope changed for actor %', i;
    end if;
    if i = 4 and private.current_team_member_source_id() is distinct from team_id then
      raise exception 'Field denial must exercise a genuinely assigned electrician';
    end if;
    if i > 2 then
      begin
        update public.planner_entries set deleted_at = now()
        where id = record_ids[3] returning * into result;
        get diagnostics affected = row_count;
        if affected <> 0 then raise exception 'Unauthorized tombstone affected a row'; end if;
      exception when raise_exception then
        if sqlerrm <> 'Only an owner or admin can delete or restore records' then raise; end if;
      end;
    end if;
    reset role;
    if exists(select 1 from public.planner_entries where id = record_ids[3] and deleted_at is not null) then
      raise exception 'Denied archive changed the control record';
    end if;
  end loop;

  -- Revoking the session must remove management tombstone visibility too.
  delete from auth.sessions where id = session_ids[1];
  perform set_config('request.jwt.claims', jsonb_build_object('role','authenticated',
    'sub',actors[1], 'session_id',session_ids[1],
    'amr',jsonb_build_array(jsonb_build_object('method','password')))::text, true);
  set local role authenticated;
  if exists(select 1 from public.planner_entries where id = any(record_ids)) then
    raise exception 'Revoked owner session retained planner access';
  end if;
  reset role;
end;
$$;
rollback;
select 'Planner management tombstone and denial assertions passed; fixtures rolled back' as result;
