-- Planner assignment arrays are relational security data, not free-form JSON.
-- Require every referenced team member to resolve inside the planner entry's
-- organisation. New assignments must target live members. Historical
-- tombstones may retain a subsequently deleted member, but future member
-- deletion is blocked while an active planner entry still references them.
-- Field users may create only a self assignment and may not rewrite an
-- office-controlled assignment set on update.

create or replace function private.jr_planner_team_assignments_are_valid(
  target_organisation_id uuid,
  record_payload jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with assignment_values as (
    select assignment.value
    from jsonb_array_elements(
      case
        when jsonb_typeof(record_payload -> 'teamMemberIds') = 'array'
          then record_payload -> 'teamMemberIds'
        else '[]'::jsonb
      end
    ) assignment(value)
  ),
  assignment_ids as (
    select
      value,
      case
        when jsonb_typeof(value) = 'string' then value #>> '{}'
        else null
      end as team_member_source_id
    from assignment_values
  )
  select coalesce(
    jsonb_typeof(record_payload) = 'object'
    and jsonb_typeof(record_payload -> 'teamMemberIds') = 'array'
    and not exists (
      select 1
      from assignment_ids assignment
      where assignment.team_member_source_id is null
        or assignment.team_member_source_id = ''
        or assignment.team_member_source_id <> btrim(assignment.team_member_source_id)
    )
    and (
      select count(*) = count(distinct assignment.team_member_source_id)
      from assignment_ids assignment
    )
    and not exists (
      select 1
      from assignment_ids assignment
      where not exists (
        select 1
        from public.team_members member
        where member.organisation_id = target_organisation_id
          and member.source_id = assignment.team_member_source_id
      )
    ),
    false
  )
$$;

revoke execute on function private.jr_planner_team_assignments_are_valid(uuid, jsonb)
from public, anon, authenticated, service_role;

create or replace function private.jr_planner_team_assignments_are_live(
  target_organisation_id uuid,
  record_payload jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.jr_planner_team_assignments_are_valid(target_organisation_id, record_payload)
    and not exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(record_payload -> 'teamMemberIds') = 'array'
            then record_payload -> 'teamMemberIds'
          else '[]'::jsonb
        end
      ) assignment(value)
      where not exists (
        select 1
        from public.team_members member
        where member.organisation_id = target_organisation_id
          and member.source_id = (assignment.value #>> '{}')
          and member.deleted_at is null
      )
    ),
    false
  )
$$;

revoke execute on function private.jr_planner_team_assignments_are_live(uuid, jsonb)
from public, anon, authenticated, service_role;

create or replace function private.guard_jr_planner_team_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_team_member_source_id text;
  assignment_id text;
  assignments_changed boolean;
  require_live_assignments boolean;
begin
  if tg_op = 'INSERT' then
    assignments_changed := true;
    require_live_assignments := new.deleted_at is null;
  else
    assignments_changed := new.payload -> 'teamMemberIds'
      is distinct from old.payload -> 'teamMemberIds';
    require_live_assignments := new.deleted_at is null
      and (old.deleted_at is not null or assignments_changed);
  end if;

  -- An unchanged tombstone may contain legacy data that predates this guard.
  -- Any active row or assignment rewrite must still remain tenant-valid.
  if (new.deleted_at is null or assignments_changed)
    and not private.jr_planner_team_assignments_are_valid(new.organisation_id, new.payload) then
    raise exception 'Planner assignments must reference unique team members in the same organisation'
      using errcode = '23503';
  end if;

  if require_live_assignments then
    if not private.jr_planner_team_assignments_are_live(new.organisation_id, new.payload) then
      raise exception 'New planner assignments must reference non-deleted team members in the same organisation'
        using errcode = '23503';
    end if;

    -- Lock in stable order so a concurrent team-member tombstone cannot commit
    -- between validation and this planner write.
    for assignment_id in
      select assignment.value #>> '{}'
      from jsonb_array_elements(new.payload -> 'teamMemberIds') assignment(value)
      order by 1
    loop
      perform member.id
      from public.team_members member
      where member.organisation_id = new.organisation_id
        and member.source_id = assignment_id
        and member.deleted_at is null
      for no key update;

      if not found then
        raise exception 'New planner assignments must reference non-deleted team members in the same organisation'
          using errcode = '23503';
      end if;
    end loop;
  end if;

  if private.current_jr_role() = 'electrician' then
    if tg_op = 'INSERT' then
      actor_team_member_source_id := private.current_team_member_source_id();
      if actor_team_member_source_id is null
        or jsonb_array_length(new.payload -> 'teamMemberIds') <> 1
        or new.payload -> 'teamMemberIds' ->> 0 is distinct from actor_team_member_source_id then
        raise exception 'Electricians may create planner entries assigned only to themselves'
          using errcode = '42501';
      end if;
    elsif assignments_changed then
      raise exception 'Electricians cannot change planner team assignments'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_jr_planner_team_assignments()
from public, anon, authenticated;
grant execute on function private.guard_jr_planner_team_assignments()
to service_role;

create or replace function private.guard_jr_assigned_team_member_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.deleted_at is not null or new.deleted_at is null then
      return new;
    end if;
  end if;

  if exists (
    select 1
    from public.planner_entries planner
    where planner.organisation_id = old.organisation_id
      and planner.deleted_at is null
      and jsonb_typeof(planner.payload -> 'teamMemberIds') = 'array'
      and (planner.payload -> 'teamMemberIds') ? old.source_id
  ) then
    raise exception 'Reassign active planner entries before deleting this team member'
      using errcode = '23503';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_jr_assigned_team_member_deletion()
from public, anon, authenticated;
grant execute on function private.guard_jr_assigned_team_member_deletion()
to service_role;

do $$
declare
  invalid_source_id text;
begin
  -- Hold both write paths from validation through trigger installation. This
  -- DO block is one transaction even when recovery runs psql in autocommit.
  execute 'lock table public.planner_entries, public.team_members in share row exclusive mode';

  select planner.source_id
    into invalid_source_id
  from public.planner_entries planner
  where planner.deleted_at is null
    and not private.jr_planner_team_assignments_are_live(planner.organisation_id, planner.payload)
  limit 1;

  if invalid_source_id is not null then
    raise exception 'Cannot secure planner entry % because its team assignments are invalid',
      invalid_source_id;
  end if;

  execute 'drop trigger if exists planner_team_assignment_guard on public.planner_entries';
  execute 'create trigger planner_team_assignment_guard
    before insert or update on public.planner_entries
    for each row execute function private.guard_jr_planner_team_assignments()';
  execute 'drop trigger if exists assigned_team_member_deletion_guard on public.team_members';
  execute 'create trigger assigned_team_member_deletion_guard
    before update of deleted_at or delete on public.team_members
    for each row execute function private.guard_jr_assigned_team_member_deletion()';
end
$$;

notify pgrst, 'reload schema';
