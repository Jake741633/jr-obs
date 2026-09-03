-- Migration markers identify one stable legacy record. Office users may update
-- import timestamps and attribution, but must not move an existing marker to a
-- different tenant, storage key or source record.

create or replace function public.guard_jr_migration_marker_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.organisation_id is distinct from old.organisation_id
    or new.storage_key is distinct from old.storage_key
    or new.source_id is distinct from old.source_id then
    raise exception 'Migration marker identity fields are immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_jr_migration_marker_identity() from public, anon, authenticated;

drop trigger if exists migration_markers_identity_guard on public.migration_markers;
create trigger migration_markers_identity_guard
before update on public.migration_markers
for each row execute function public.guard_jr_migration_marker_identity();
