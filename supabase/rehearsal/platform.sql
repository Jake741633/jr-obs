-- LOCAL SQL REHEARSAL ONLY. Never apply to a hosted Supabase database.
-- Minimal platform contracts used by JR OS; not a Supabase installation.
-- Auth/Storage helper bodies were compared with the disposable project's
-- catalog on 2026-09-19. Tables intentionally model only relevant columns.
-- No Auth HTTP service, token validation, object bytes or Storage API exists.

create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema storage;
create extension pgcrypto;

create table auth.users (
  id uuid primary key,
  aud text,
  role text,
  email text,
  raw_user_meta_data jsonb,
  raw_app_meta_data jsonb,
  created_at timestamptz default now()
);
create table auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz,
  updated_at timestamptz,
  not_after timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$$;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  owner_id text,
  version text,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(bucket_id, name)
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts, 1) - 1];
end
$$;
create function storage.operation() returns text language plpgsql stable as $$
begin
  return current_setting('storage.operation', true);
end;
$$;
create function storage.allow_only_operation(expected_operation text)
returns boolean language sql stable as $$
  with current_operation as (select storage.operation() as raw_operation),
  normalized as (
    select case when raw_operation like 'storage.%' then substr(raw_operation, 9)
      else raw_operation end as current_operation,
      case when expected_operation like 'storage.%' then substr(expected_operation, 9)
      else expected_operation end as requested_operation from current_operation
  )
  select case when requested_operation is null or requested_operation = '' then false
    else coalesce(current_operation = requested_operation, false) end from normalized
$$;
create function storage.allow_any_operation(expected_operations text[])
returns boolean language sql stable as $$
  with current_operation as (select storage.operation() as raw_operation),
  normalized as (
    select case when raw_operation like 'storage.%' then substr(raw_operation, 9)
      else raw_operation end as current_operation from current_operation
  )
  select exists (
    select 1 from normalized n
    cross join lateral unnest(expected_operations) as expected_operation
    where expected_operation is not null and expected_operation <> ''
      and n.current_operation = case when expected_operation like 'storage.%'
        then substr(expected_operation, 9) else expected_operation end
  )
$$;

grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to authenticated, service_role;
grant all on auth.users, auth.sessions to service_role;
grant execute on all functions in schema auth, storage to anon, authenticated, service_role;
-- Hosted default grants precede JR OS migration 031, which narrows them.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
