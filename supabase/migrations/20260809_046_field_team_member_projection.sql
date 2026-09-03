-- Team member payloads contain payroll rates, emergency contacts, private notes
-- and qualification identifiers. Electricians need a working crew directory for
-- field workflows, but they do not need the complete office/HR record. Keep the
-- source table office-only and maintain a deliberately allowlisted projection
-- for electrician reads.

create table if not exists public.field_team_members (
  id uuid primary key references public.team_members(id) on delete cascade,
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

create index if not exists field_team_members_org_updated_idx
on public.field_team_members (organisation_id, updated_at desc);

alter table public.field_team_members enable row level security;

revoke all privileges on table public.field_team_members
from public, anon, authenticated, service_role;
grant select on table public.field_team_members to authenticated;
grant select, insert, update, delete on table public.field_team_members to service_role;

create or replace function private.jr_field_team_payload(record_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', record_payload -> 'id',
    'name', record_payload -> 'name',
    'role', record_payload -> 'role',
    'status', record_payload -> 'status',
    'email', record_payload -> 'email',
    'phone', record_payload -> 'phone',
    'vanRegistration', record_payload -> 'vanRegistration',
    'qualifications', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', qualification -> 'id',
        'name', qualification -> 'name',
        'issuedAt', qualification -> 'issuedAt',
        'expiresAt', qualification -> 'expiresAt'
      )) order by qualification_ordinality)
      from jsonb_array_elements(
        case
          when jsonb_typeof(record_payload -> 'qualifications') = 'array'
            then record_payload -> 'qualifications'
          else '[]'::jsonb
        end
      ) with ordinality as team_qualification(qualification, qualification_ordinality)
    ), '[]'::jsonb),
    'createdAt', record_payload -> 'createdAt',
    'updatedAt', record_payload -> 'updatedAt'
  ))
$$;

revoke execute on function private.jr_field_team_payload(jsonb)
from public, anon, authenticated, service_role;

create or replace function private.refresh_jr_field_team_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.field_team_members where id = old.id;
    return old;
  end if;

  insert into public.field_team_members (
    id,
    organisation_id,
    source_id,
    customer_source_id,
    job_source_id,
    version,
    source_updated_at,
    payload,
    deleted_at,
    created_at,
    updated_at
  ) values (
    new.id,
    new.organisation_id,
    new.source_id,
    new.customer_source_id,
    new.job_source_id,
    new.version,
    new.source_updated_at,
    private.jr_field_team_payload(new.payload),
    new.deleted_at,
    new.created_at,
    new.updated_at
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

revoke execute on function private.refresh_jr_field_team_member()
from public, anon, authenticated;
grant execute on function private.refresh_jr_field_team_member()
to service_role;

drop trigger if exists field_team_member_projection on public.team_members;
create trigger field_team_member_projection
after insert or update or delete on public.team_members
for each row execute function private.refresh_jr_field_team_member();

insert into public.field_team_members (
  id,
  organisation_id,
  source_id,
  customer_source_id,
  job_source_id,
  version,
  source_updated_at,
  payload,
  deleted_at,
  created_at,
  updated_at
)
select
  member.id,
  member.organisation_id,
  member.source_id,
  member.customer_source_id,
  member.job_source_id,
  member.version,
  member.source_updated_at,
  private.jr_field_team_payload(member.payload),
  member.deleted_at,
  member.created_at,
  member.updated_at
from public.team_members member
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

drop policy if exists field_team_members_electrician_select
on public.field_team_members;
create policy field_team_members_electrician_select
on public.field_team_members
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'electrician'
);

drop policy if exists team_members_select on public.team_members;
create policy team_members_select
on public.team_members
for select to authenticated
using (
  organisation_id = private.current_organisation_id()
  and private.can_manage_office_data()
);

notify pgrst, 'reload schema';
