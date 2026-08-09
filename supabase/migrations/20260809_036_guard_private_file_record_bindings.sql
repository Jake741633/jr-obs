-- Customer Storage reads trust private_files.customer_source_id. Validate the
-- initial metadata binding so a staff upload cannot expose one customer's job
-- object to another customer by supplying a forged customer or job source ID.

do $$
begin
  if exists (
    select 1
    from public.private_files file
    where (storage.foldername(file.object_path))[1] is distinct from file.organisation_id::text
      or (
        file.job_source_id is null
        and (storage.foldername(file.object_path))[2] is distinct from 'unassigned'
      )
      or (
        file.job_source_id is not null
        and (
          (storage.foldername(file.object_path))[2] is distinct from 'jobs'
          or (storage.foldername(file.object_path))[3] is distinct from file.job_source_id
          or not exists (
            select 1
            from public.jobs job
            where job.organisation_id = file.organisation_id
              and job.source_id = file.job_source_id
              and job.customer_source_id is not distinct from file.customer_source_id
          )
        )
      )
      or (
        file.customer_source_id is not null
        and not exists (
          select 1
          from public.customers customer
          where customer.organisation_id = file.organisation_id
            and customer.source_id = file.customer_source_id
        )
      )
  ) then
    raise exception 'Cannot secure private-file bindings while invalid customer, job or object-path metadata exists';
  end if;
end
$$;

create or replace function private.guard_jr_private_file_record_binding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (storage.foldername(new.object_path))[1] is distinct from new.organisation_id::text then
    raise exception 'Private-file object path must belong to its organisation'
      using errcode = '42501';
  end if;

  if new.customer_source_id is not null
    and not exists (
      select 1
      from public.customers customer
      where customer.organisation_id = new.organisation_id
        and customer.source_id = new.customer_source_id
        and customer.deleted_at is null
    ) then
    raise exception 'Private-file customer must belong to its organisation'
      using errcode = '42501';
  end if;

  if new.job_source_id is null then
    if (storage.foldername(new.object_path))[2] is distinct from 'unassigned' then
      raise exception 'Private-file object path must match its unassigned scope'
        using errcode = '42501';
    end if;
  elsif (storage.foldername(new.object_path))[2] is distinct from 'jobs'
    or (storage.foldername(new.object_path))[3] is distinct from new.job_source_id
    or not exists (
      select 1
      from public.jobs job
      where job.organisation_id = new.organisation_id
        and job.source_id = new.job_source_id
        and job.customer_source_id is not distinct from new.customer_source_id
        and job.deleted_at is null
    ) then
    raise exception 'Private-file job must belong to its organisation and customer'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_jr_private_file_record_binding()
from public, anon, authenticated;
grant execute on function private.guard_jr_private_file_record_binding()
to service_role;

drop trigger if exists private_files_record_binding_guard on public.private_files;
create trigger private_files_record_binding_guard
before insert on public.private_files
for each row execute function private.guard_jr_private_file_record_binding();

notify pgrst, 'reload schema';
