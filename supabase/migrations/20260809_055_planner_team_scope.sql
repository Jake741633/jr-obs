-- Planner entries expose customer locations, job links and operational notes.
-- Office roles retain the complete dispatch diary. Electricians may only read,
-- create or update entries that include their uniquely resolved team identity.

create or replace function private.planner_entry_includes_current_team_member(record_payload jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(record_payload -> 'teamMemberIds') = 'array'
    and (record_payload -> 'teamMemberIds') ? private.current_team_member_source_id(),
    false
  )
$$;

revoke execute on function private.planner_entry_includes_current_team_member(jsonb)
from public, anon;
grant execute on function private.planner_entry_includes_current_team_member(jsonb)
to authenticated, service_role;

drop policy if exists planner_entries_select on public.planner_entries;
create policy planner_entries_select
on public.planner_entries
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and (
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'electrician'
      and private.planner_entry_includes_current_team_member(payload)
    )
  )
);

drop policy if exists planner_entries_field_insert on public.planner_entries;
create policy planner_entries_field_insert
on public.planner_entries
for insert to authenticated
with check (
  organisation_id = private.current_organisation_id()
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and (
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'electrician'
      and private.planner_entry_includes_current_team_member(payload)
    )
  )
);

drop policy if exists planner_entries_field_update on public.planner_entries;
create policy planner_entries_field_update
on public.planner_entries
for update to authenticated
using (
  organisation_id = private.current_organisation_id()
  and (
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'electrician'
      and private.planner_entry_includes_current_team_member(payload)
    )
  )
)
with check (
  organisation_id = private.current_organisation_id()
  and (
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'electrician'
      and private.planner_entry_includes_current_team_member(payload)
    )
  )
);

notify pgrst, 'reload schema';
