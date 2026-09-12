-- JR OS cloud schema
-- Run in the Supabase SQL editor after creating the project.

create extension if not exists pgcrypto;

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  full_name text,
  role text not null default 'owner' check (role in ('owner','office','electrician')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_records (
  id text primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  collection text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, collection, id)
);

create index if not exists app_records_org_collection_idx on public.app_records (organisation_id, collection);

create or replace function public.handle_new_jr_os_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_organisation_id uuid;
begin
  insert into public.organisations (name)
  values (coalesce(new.raw_user_meta_data->>'business_name', 'JR Electrical Services'))
  returning id into new_organisation_id;

  insert into public.profiles (id, organisation_id, full_name, role)
  values (
    new.id,
    new_organisation_id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'JR OS Owner'), '@', 1)),
    'owner'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_jr_os_user();

alter table public.organisations enable row level security;
alter table public.profiles enable row level security;
alter table public.app_records enable row level security;

create policy "Members can view their organisation" on public.organisations for select to authenticated
using (id in (select organisation_id from public.profiles where id = auth.uid()));

create policy "Users can view organisation profiles" on public.profiles for select to authenticated
using (id = auth.uid() or organisation_id in (select organisation_id from public.profiles where id = auth.uid()));

create policy "Users can update their own profile" on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create policy "Members can read organisation records" on public.app_records for select to authenticated
using (organisation_id in (select organisation_id from public.profiles where id = auth.uid()));

create policy "Members can create organisation records" on public.app_records for insert to authenticated
with check (
  organisation_id in (select organisation_id from public.profiles where id = auth.uid())
  and created_by = auth.uid()
);

create policy "Members can update organisation records" on public.app_records for update to authenticated
using (organisation_id in (select organisation_id from public.profiles where id = auth.uid()))
with check (
  organisation_id in (select organisation_id from public.profiles where id = auth.uid())
  and updated_by = auth.uid()
);

create policy "Owners and office can delete records" on public.app_records for delete to authenticated
using (organisation_id in (
  select organisation_id from public.profiles where id = auth.uid() and role in ('owner','office')
));

insert into storage.buckets (id, name, public) values ('jr-os-files', 'jr-os-files', false)
on conflict (id) do nothing;

create policy "Members can view organisation files" on storage.objects for select to authenticated
using (
  bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] in (select organisation_id::text from public.profiles where id = auth.uid())
);

create policy "Members can upload organisation files" on storage.objects for insert to authenticated
with check (
  bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] in (select organisation_id::text from public.profiles where id = auth.uid())
);

create policy "Members can update organisation files" on storage.objects for update to authenticated
using (
  bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] in (select organisation_id::text from public.profiles where id = auth.uid())
);

create policy "Owners and office can delete organisation files" on storage.objects for delete to authenticated
using (
  bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] in (
    select organisation_id::text from public.profiles where id = auth.uid() and role in ('owner','office')
  )
);
