-- JR OS initial cloud schema
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

create index if not exists app_records_org_collection_idx
  on public.app_records (organisation_id, collection);

alter table public.organisations enable row level security;
alter table public.profiles enable row level security;
alter table public.app_records enable row level security;

create policy "Members can view their organisation"
on public.organisations for select
to authenticated
using (id in (select organisation_id from public.profiles where id = auth.uid()));

create policy "Users can view their profile"
on public.profiles for select
to authenticated
using (id = auth.uid() or organisation_id in (select organisation_id from public.profiles where id = auth.uid()));

create policy "Users can update their profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Members can read organisation records"
on public.app_records for select
to authenticated
using (organisation_id in (select organisation_id from public.profiles where id = auth.uid()));

create policy "Members can create organisation records"
on public.app_records for insert
to authenticated
with check (organisation_id in (select organisation_id from public.profiles where id = auth.uid()));

create policy "Members can update organisation records"
on public.app_records for update
to authenticated
using (organisation_id in (select organisation_id from public.profiles where id = auth.uid()))
with check (organisation_id in (select organisation_id from public.profiles where id = auth.uid()));

create policy "Owners and office can delete records"
on public.app_records for delete
to authenticated
using (
  organisation_id in (
    select organisation_id from public.profiles
    where id = auth.uid() and role in ('owner','office')
  )
);

insert into storage.buckets (id, name, public)
values ('jr-os-files', 'jr-os-files', false)
on conflict (id) do nothing;

create policy "Members can view organisation files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] in (
    select organisation_id::text from public.profiles where id = auth.uid()
  )
);

create policy "Members can upload organisation files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] in (
    select organisation_id::text from public.profiles where id = auth.uid()
  )
);
