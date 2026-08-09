-- Builder records contain private CRM relationship notes. Electricians need
-- operational builder contact details, not the complete office relationship
-- history. Keep the source table office-only and expose a contact-safe field
-- projection for electrician reads.

create table if not exists public.field_builders (
  id uuid primary key references public.builders(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  source_id text not null,
  customer_source_id text,
  job_source_id text,
  version integer not null check (version > 0),
  source_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organisation_id, source_id)
);

create index if not exists field_builders_org_updated_idx
on public.field_builders (organisation_id, updated_at desc);

alter table public.field_builders enable row level security;

revoke all privileges on table public.field_builders
from public, anon, authenticated, service_role;
grant select on table public.field_builders to authenticated;
grant select, insert, update, delete on table public.field_builders to service_role;

create or replace function private.jr_field_builder_payload(record_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', record_payload -> 'id',
    'companyName', record_payload -> 'companyName',
    'contactName', record_payload -> 'contactName',
    'email', record_payload -> 'email',
    'phone', record_payload -> 'phone',
    'address', record_payload -> 'address',
    'createdAt', record_payload -> 'createdAt',
    'updatedAt', record_payload -> 'updatedAt'
  ))
$$;

revoke execute on function private.jr_field_builder_payload(jsonb)
from public, anon, authenticated, service_role;

create or replace function private.refresh_jr_field_builder_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.field_builders where id = old.id;
    return old;
  end if;

  insert into public.field_builders (
    id, organisation_id, source_id, customer_source_id, job_source_id, version,
    source_updated_at, payload, deleted_at, created_at, updated_at
  ) values (
    new.id, new.organisation_id, new.source_id, new.customer_source_id,
    new.job_source_id, new.version, new.source_updated_at,
    private.jr_field_builder_payload(new.payload), new.deleted_at,
    new.created_at, new.updated_at
  )
  on conflict (id) do update set
    organisation_id = excluded.organisation_id,
    source_id = excluded.source_id,
    customer_source_id = excluded.customer_source_id,
    job_source_id = excluded.job_source_id,
    version = excluded.version,
    source_updated_at = excluded.source_updated_at,
    payload = excluded.payload,
    deleted_at = excluded.deleted_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

revoke execute on function private.refresh_jr_field_builder_projection()
from public, anon, authenticated;
grant execute on function private.refresh_jr_field_builder_projection()
to service_role;

drop trigger if exists field_builder_projection on public.builders;
create trigger field_builder_projection
after insert or update or delete on public.builders
for each row execute function private.refresh_jr_field_builder_projection();

insert into public.field_builders (
  id, organisation_id, source_id, customer_source_id, job_source_id, version,
  source_updated_at, payload, deleted_at, created_at, updated_at
)
select
  builder.id, builder.organisation_id, builder.source_id,
  builder.customer_source_id, builder.job_source_id, builder.version,
  builder.source_updated_at, private.jr_field_builder_payload(builder.payload),
  builder.deleted_at, builder.created_at, builder.updated_at
from public.builders builder
on conflict (id) do update set
  organisation_id = excluded.organisation_id,
  source_id = excluded.source_id,
  customer_source_id = excluded.customer_source_id,
  job_source_id = excluded.job_source_id,
  version = excluded.version,
  source_updated_at = excluded.source_updated_at,
  payload = excluded.payload,
  deleted_at = excluded.deleted_at,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

drop policy if exists field_builders_electrician_select on public.field_builders;
create policy field_builders_electrician_select
on public.field_builders
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'electrician'
);

drop policy if exists builders_select on public.builders;
create policy builders_select
on public.builders
for select to authenticated
using (
  organisation_id = private.current_organisation_id()
  and private.can_manage_office_data()
);

notify pgrst, 'reload schema';
