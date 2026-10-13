-- UPDATE ... RETURNING must be able to SELECT the resulting tombstone.
-- Owners/admins already control deletion through guard_jr_tombstone_transition.
-- Keep the existing live-row/assigned-electrician policy unchanged and expose
-- tombstones only to those management roles inside their current organisation.
drop policy if exists planner_entries_management_tombstones_select on public.planner_entries;
create policy planner_entries_management_tombstones_select
on public.planner_entries
for select to authenticated
using (
  deleted_at is not null
  and organisation_id = private.current_organisation_id()
  and private.can_manage_business()
);

create or replace function public.jr_os_deployed_migration()
returns jsonb
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'migration',
    '20260912184426_allow_management_planner_tombstone_returns.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
