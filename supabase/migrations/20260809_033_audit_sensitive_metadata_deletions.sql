-- Hard deletes of backup, file-metadata and migration-marker records can hide
-- evidence or allow legacy data to be replayed. Record them through one
-- trigger-only function with database-derived tenant and actor attribution.

create or replace function private.audit_jr_sensitive_metadata_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_value jsonb := to_jsonb(old);
  organisation_value uuid := (before_value->>'organisation_id')::uuid;
  source_value text := coalesce(before_value->>'source_id', before_value->>'id');
begin
  if tg_op <> 'DELETE' then
    raise exception 'Sensitive metadata audit trigger only supports DELETE';
  end if;

  insert into public.audit_log (
    organisation_id,
    actor_user_id,
    action,
    entity_table,
    source_id,
    before_data,
    after_data
  ) values (
    organisation_value,
    auth.uid(),
    'record_deleted',
    tg_table_name,
    source_value,
    before_value,
    null
  );

  return old;
end;
$$;

revoke execute on function private.audit_jr_sensitive_metadata_delete()
from public, anon, authenticated;
grant execute on function private.audit_jr_sensitive_metadata_delete()
to service_role;

drop trigger if exists app_records_delete_audit on public.app_records;
create trigger app_records_delete_audit
after delete on public.app_records
for each row execute function private.audit_jr_sensitive_metadata_delete();

drop trigger if exists private_files_delete_audit on public.private_files;
create trigger private_files_delete_audit
after delete on public.private_files
for each row execute function private.audit_jr_sensitive_metadata_delete();

drop trigger if exists migration_markers_delete_audit on public.migration_markers;
create trigger migration_markers_delete_audit
after delete on public.migration_markers
for each row execute function private.audit_jr_sensitive_metadata_delete();

notify pgrst, 'reload schema';
