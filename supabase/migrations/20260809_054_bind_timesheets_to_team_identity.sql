-- Field-created timesheets must identify the authenticated worker rather than
-- trusting a client-supplied teamMemberId. Resolve an electrician to exactly one
-- same-organisation team member by the normalized authenticated email. Missing
-- or duplicate matches fail closed.

create or replace function private.current_team_member_source_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with matching_team_members as (
    select member.source_id
    from public.team_members member
    where member.organisation_id = private.current_organisation_id()
      and member.deleted_at is null
      and btrim(coalesce(auth.jwt() ->> 'email', '')) <> ''
      and lower(btrim(coalesce(member.payload ->> 'email', ''))) = lower(btrim(auth.jwt() ->> 'email'))
  )
  select case when count(*) = 1 then max(source_id) else null end
  from matching_team_members
$$;

revoke execute on function private.current_team_member_source_id()
from public, anon;
grant execute on function private.current_team_member_source_id()
to authenticated, service_role;

drop policy if exists timesheets_field_insert on public.timesheets;
create policy timesheets_field_insert
on public.timesheets
for insert to authenticated
with check (
  organisation_id = private.current_organisation_id()
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and (
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'electrician'
      and payload ->> 'teamMemberId' = private.current_team_member_source_id()
    )
  )
);

drop policy if exists timesheets_field_update on public.timesheets;
create policy timesheets_field_update
on public.timesheets
for update to authenticated
using (
  organisation_id = private.current_organisation_id()
  and (
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'electrician'
      and created_by = (select auth.uid())
    )
  )
)
with check (
  organisation_id = private.current_organisation_id()
  and (
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'electrician'
      and created_by = (select auth.uid())
      and payload ->> 'teamMemberId' = private.current_team_member_source_id()
    )
  )
);

notify pgrst, 'reload schema';
