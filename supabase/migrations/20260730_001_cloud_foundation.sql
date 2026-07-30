create extension if not exists pgcrypto;

create type public.jr_role as enum ('owner','admin','office','electrician','customer');

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.jr_role not null,
  customer_source_id text,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,user_id)
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_table text not null,
  source_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table public.migration_markers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  storage_key text not null,
  source_id text not null,
  source_updated_at timestamptz,
  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users(id),
  unique (business_id,storage_key,source_id)
);

create table public.private_files (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  source_id text not null,
  job_source_id text,
  customer_source_id text,
  bucket text not null default 'jr-os-private',
  object_path text not null,
  file_name text not null,
  mime_type text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,source_id)
);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); new.updated_by=auth.uid(); return new; end $$;
create or replace function public.is_business_member(target uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.business_memberships m where m.business_id=target and m.user_id=auth.uid() and m.active) $$;
create or replace function public.has_business_role(target uuid, allowed public.jr_role[]) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.business_memberships m where m.business_id=target and m.user_id=auth.uid() and m.active and m.role=any(allowed)) $$;
create or replace function public.portal_customer_source(target uuid) returns text language sql stable security definer set search_path=public as $$ select customer_source_id from public.business_memberships where business_id=target and user_id=auth.uid() and active limit 1 $$;

-- Existing JR OS entities use stable local source IDs and JSONB payloads during migration.
do $$
declare t text;
begin
  foreach t in array array[
    'customers','builders','jobs','pricing_documents','invoices','payments','expenses','materials','stock_items','stock_movements','purchase_lists','planner_entries','team_members','timesheets','certificates','electrical_testing_records','job_documents','portal_approvals','portal_requests','ai_recommendation_evidence'
  ] loop
    execute format('create table public.%I (
      id uuid primary key default gen_random_uuid(),
      business_id uuid not null references public.businesses(id) on delete cascade,
      source_id text not null,
      customer_source_id text,
      job_source_id text,
      version integer not null default 1,
      source_updated_at timestamptz,
      payload jsonb not null default ''{}''::jsonb,
      deleted_at timestamptz,
      created_by uuid references auth.users(id),
      updated_by uuid references auth.users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (business_id,source_id)
    )', t);
    execute format('create index %I on public.%I (business_id,updated_at desc)', t||'_business_updated_idx', t);
    execute format('create index %I on public.%I (business_id,customer_source_id)', t||'_customer_idx', t);
    execute format('create index %I on public.%I (business_id,job_source_id)', t||'_job_idx', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t||'_touch', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (
      public.is_business_member(business_id) and (
        public.has_business_role(business_id,array[''owner'',''admin'',''office'',''electrician'']::public.jr_role[])
        or customer_source_id=public.portal_customer_source(business_id)
      )
    )', t||'_select', t);
    execute format('create policy %I on public.%I for insert with check (
      public.has_business_role(business_id,array[''owner'',''admin'',''office'',''electrician'']::public.jr_role[])
    )', t||'_insert', t);
    execute format('create policy %I on public.%I for update using (
      public.has_business_role(business_id,array[''owner'',''admin'',''office'',''electrician'']::public.jr_role[])
    ) with check (
      public.has_business_role(business_id,array[''owner'',''admin'',''office'',''electrician'']::public.jr_role[])
    )', t||'_update', t);
    execute format('create policy %I on public.%I for delete using (
      public.has_business_role(business_id,array[''owner'',''admin'']::public.jr_role[])
    )', t||'_delete', t);
  end loop;
end $$;

alter table public.businesses enable row level security;
alter table public.business_memberships enable row level security;
alter table public.audit_log enable row level security;
alter table public.migration_markers enable row level security;
alter table public.private_files enable row level security;

create policy businesses_select on public.businesses for select using (public.is_business_member(id));
create policy businesses_update on public.businesses for update using (public.has_business_role(id,array['owner','admin']::public.jr_role[]));
create policy memberships_select on public.business_memberships for select using (public.is_business_member(business_id));
create policy memberships_manage on public.business_memberships for all using (public.has_business_role(business_id,array['owner','admin']::public.jr_role[])) with check (public.has_business_role(business_id,array['owner','admin']::public.jr_role[]));
create policy audit_select on public.audit_log for select using (public.has_business_role(business_id,array['owner','admin','office']::public.jr_role[]));
create policy audit_insert on public.audit_log for insert with check (public.is_business_member(business_id));
create policy markers_manage on public.migration_markers for all using (public.has_business_role(business_id,array['owner','admin','office']::public.jr_role[])) with check (public.has_business_role(business_id,array['owner','admin','office']::public.jr_role[]));
create policy files_select on public.private_files for select using (public.is_business_member(business_id) and (public.has_business_role(business_id,array['owner','admin','office','electrician']::public.jr_role[]) or customer_source_id=public.portal_customer_source(business_id)));
create policy files_write on public.private_files for all using (public.has_business_role(business_id,array['owner','admin','office','electrician']::public.jr_role[])) with check (public.has_business_role(business_id,array['owner','admin','office','electrician']::public.jr_role[]));

insert into storage.buckets (id,name,public) values ('jr-os-private','jr-os-private',false) on conflict (id) do update set public=false;
create policy private_objects_select on storage.objects for select using (bucket_id='jr-os-private' and public.is_business_member((storage.foldername(name))[1]::uuid));
create policy private_objects_insert on storage.objects for insert with check (bucket_id='jr-os-private' and public.has_business_role((storage.foldername(name))[1]::uuid,array['owner','admin','office','electrician']::public.jr_role[]));
create policy private_objects_update on storage.objects for update using (bucket_id='jr-os-private' and public.has_business_role((storage.foldername(name))[1]::uuid,array['owner','admin','office','electrician']::public.jr_role[]));
create policy private_objects_delete on storage.objects for delete using (bucket_id='jr-os-private' and public.has_business_role((storage.foldername(name))[1]::uuid,array['owner','admin']::public.jr_role[]));
