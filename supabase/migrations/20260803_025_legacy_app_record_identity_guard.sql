-- The legacy aggregate is still used during migration and restore. Its stable
-- tenant, record, collection and creator identity must not be rewritten by an
-- otherwise-authorised update.

create or replace function public.guard_legacy_app_record_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organisation_id is distinct from old.organisation_id
    or new.id is distinct from old.id
    or new.collection is distinct from old.collection
    or new.created_by is distinct from old.created_by then
    raise exception 'Legacy app record identity fields are immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_legacy_app_record_identity() from public, anon, authenticated;

drop trigger if exists app_records_identity_guard on public.app_records;
create trigger app_records_identity_guard
before update on public.app_records
for each row execute function public.guard_legacy_app_record_identity();
