-- Private-file identity and ownership scope must not be reassigned after insert.
-- Metadata corrections may update descriptive fields, but changing the object,
-- tenant, source or customer/job linkage requires creating a new metadata row.

create or replace function public.guard_private_file_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organisation_id is distinct from old.organisation_id
    or new.source_id is distinct from old.source_id
    or new.customer_source_id is distinct from old.customer_source_id
    or new.job_source_id is distinct from old.job_source_id
    or new.bucket is distinct from old.bucket
    or new.object_path is distinct from old.object_path
    or new.created_by is distinct from old.created_by
  then
    raise exception 'Private-file ownership and object identity cannot be changed';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_private_file_identity() from public, anon, authenticated;

drop trigger if exists private_files_identity_guard on public.private_files;
create trigger private_files_identity_guard
before update on public.private_files
for each row execute function public.guard_private_file_identity();
