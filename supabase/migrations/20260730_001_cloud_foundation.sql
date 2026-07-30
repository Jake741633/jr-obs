create extension if not exists pgcrypto;

-- Extend the existing JR OS organisation/profile foundation rather than creating a second tenant model.
alter table public.organisations add column if not exists created_by uuid references auth.users(id);
alter table public.organisations add column if not exists updated_by uuid references auth.users(id);
alter table public.organisations add column if not exists updated_at timestamptz not null default now();
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner','admin','office','electrician','customer'));
alter table public.profiles add column if not exists customer_source_id text;
alter table public.profiles add column if not exists active boolean not null default true;

create or replace function public.current_organisation_id() returns uuid language sql stable security definer set search_path=public as $$ select organisation_id from public.profiles where id=auth.uid() and active limit 1 $$;
create or replace function public.current_role() returns text language sql stable security definer set search_path=public as $$ select role from public.profiles where id=auth.uid() and active limit 1 $$;
create or replace function public.can_manage_business() returns boolean language sql stable security definer set search_path=public as $$ select coalesce(public.current_role() in ('owner','admin'),false) $$;
create or replace function public.can_manage_office_data() returns boolean language sql stable security definer set search_path=public as $$ select coalesce(public.current_role() in ('owner','admin','office'),false) $$;
create or replace function public.can_manage_field_data() returns boolean language sql stable security definer set search_path=public as $$ select coalesce(public.current_role() in ('owner','admin','office','electrician'),false) $$;
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); new.updated_by=auth.uid(); new.version=coalesce(old.version,0)+1; return new; end $$;

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) default auth.uid(), action text not null, entity_table text not null, source_id text,
  before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create index if not exists audit_log_org_created_idx on public.audit_log (organisation_id,created_at desc);

create table if not exists public.migration_markers (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  storage_key text not null, source_id text not null, source_updated_at timestamptz, imported_at timestamptz not null default now(), imported_by uuid references auth.users(id) default auth.uid(),
  unique (organisation_id,storage_key,source_id)
);

create table if not exists public.private_files (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  source_id text not null, job_source_id text, customer_source_id text, bucket text not null default 'jr-os-private', object_path text not null,
  file_name text not null, mime_type text, version integer not null default 1, created_by uuid references auth.users(id) default auth.uid(), updated_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organisation_id,source_id)
);

-- Typed entity tables preserve the original local record in payload while stable source_id enables idempotent migration.
do $$
declare t text;
begin
  foreach t in array array['customers','builders','jobs','pricing_documents','invoices','payments','expenses','materials','stock_items','stock_movements','purchase_lists','planner_entries','team_members','timesheets','certificates','electrical_testing_records','job_documents','portal_approvals','portal_requests','ai_recommendation_evidence'] loop
    execute format('create table if not exists public.%I (
      id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
      source_id text not null, customer_source_id text, job_source_id text, version integer not null default 1,
      source_updated_at timestamptz, payload jsonb not null default ''{}''::jsonb, deleted_at timestamptz,
      created_by uuid references auth.users(id) default auth.uid(), updated_by uuid references auth.users(id) default auth.uid(),
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organisation_id,source_id)
    )',t);
    execute format('create index if not exists %I on public.%I (organisation_id,updated_at desc)',t||'_org_updated_idx',t);
    execute format('create index if not exists %I on public.%I (organisation_id,customer_source_id)',t||'_customer_idx',t);
    execute format('create index if not exists %I on public.%I (organisation_id,job_source_id)',t||'_job_idx',t);
    execute format('drop trigger if exists %I on public.%I',t||'_touch',t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',t||'_touch',t);
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists %I on public.%I',t||'_select',t);
    execute format('create policy %I on public.%I for select to authenticated using (
      organisation_id=public.current_organisation_id() and (
        public.current_role()<>''customer'' or customer_source_id=(select customer_source_id from public.profiles where id=auth.uid())
      )
    )',t||'_select',t);
    execute format('drop policy if exists %I on public.%I',t||'_insert',t);
    execute format('create policy %I on public.%I for insert to authenticated with check (organisation_id=public.current_organisation_id() and public.can_manage_field_data())',t||'_insert',t);
    execute format('drop policy if exists %I on public.%I',t||'_update',t);
    execute format('create policy %I on public.%I for update to authenticated using (organisation_id=public.current_organisation_id() and public.can_manage_field_data()) with check (organisation_id=public.current_organisation_id() and public.can_manage_field_data())',t||'_update',t);
    execute format('drop policy if exists %I on public.%I',t||'_delete',t);
    execute format('create policy %I on public.%I for delete to authenticated using (organisation_id=public.current_organisation_id() and public.can_manage_business())',t||'_delete',t);
  end loop;
end $$;

alter table public.audit_log enable row level security;
alter table public.migration_markers enable row level security;
alter table public.private_files enable row level security;
create policy audit_read on public.audit_log for select to authenticated using (organisation_id=public.current_organisation_id() and public.can_manage_office_data());
create policy audit_append on public.audit_log for insert to authenticated with check (organisation_id=public.current_organisation_id());
create policy markers_manage on public.migration_markers for all to authenticated using (organisation_id=public.current_organisation_id() and public.can_manage_office_data()) with check (organisation_id=public.current_organisation_id() and public.can_manage_office_data());
create policy files_read on public.private_files for select to authenticated using (organisation_id=public.current_organisation_id() and (public.current_role()<>'customer' or customer_source_id=(select customer_source_id from public.profiles where id=auth.uid())));
create policy files_write on public.private_files for all to authenticated using (organisation_id=public.current_organisation_id() and public.can_manage_field_data()) with check (organisation_id=public.current_organisation_id() and public.can_manage_field_data());

insert into storage.buckets (id,name,public) values ('jr-os-private','jr-os-private',false) on conflict (id) do update set public=false;
create policy jr_private_select on storage.objects for select to authenticated using (bucket_id='jr-os-private' and (storage.foldername(name))[1]=public.current_organisation_id()::text);
create policy jr_private_insert on storage.objects for insert to authenticated with check (bucket_id='jr-os-private' and (storage.foldername(name))[1]=public.current_organisation_id()::text and public.can_manage_field_data());
create policy jr_private_update on storage.objects for update to authenticated using (bucket_id='jr-os-private' and (storage.foldername(name))[1]=public.current_organisation_id()::text and public.can_manage_field_data());
create policy jr_private_delete on storage.objects for delete to authenticated using (bucket_id='jr-os-private' and (storage.foldername(name))[1]=public.current_organisation_id()::text and public.can_manage_business());
