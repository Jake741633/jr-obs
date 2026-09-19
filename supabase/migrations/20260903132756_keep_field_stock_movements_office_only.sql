-- Canonical stock-movement rows preserve tenant-wide operational history,
-- including job and location links, free-text notes, actor metadata and exact
-- timestamps. Cloud electricians have no secured movement-history consumer;
-- Mobile Materials keeps cloud stock deductions locked. Keep complete history
-- office-only instead of returning every tenant movement through the typed API.
drop policy if exists stock_movements_select on public.stock_movements;
create policy stock_movements_select
on public.stock_movements
for select to authenticated
using (
  organisation_id = private.current_organisation_id()
  and (select private.can_manage_office_data())
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
    '20260903132756_keep_field_stock_movements_office_only.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
