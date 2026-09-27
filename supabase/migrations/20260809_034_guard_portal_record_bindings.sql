-- Staff and customer inserts share permissive policies. Validate job linkage
-- for every insert at the trigger boundary, then keep the customer/job scope
-- immutable so an office update cannot move a submission between customers.

create or replace function private.guard_jr_portal_record_binding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.customer_source_id is distinct from old.customer_source_id
      or new.job_source_id is distinct from old.job_source_id then
      raise exception 'Portal record customer and job bindings are immutable'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.job_source_id is not null
    and not exists (
      select 1
      from public.jobs j
      where j.organisation_id = new.organisation_id
        and j.source_id = new.job_source_id
        and j.customer_source_id is not distinct from new.customer_source_id
        and j.deleted_at is null
    ) then
    raise exception 'Portal record job must belong to its organisation and customer'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_jr_portal_record_binding()
from public, anon, authenticated;
grant execute on function private.guard_jr_portal_record_binding()
to service_role;

drop trigger if exists portal_approvals_binding_guard on public.portal_approvals;
create trigger portal_approvals_binding_guard
before insert or update on public.portal_approvals
for each row execute function private.guard_jr_portal_record_binding();

drop trigger if exists portal_requests_binding_guard on public.portal_requests;
create trigger portal_requests_binding_guard
before insert or update on public.portal_requests
for each row execute function private.guard_jr_portal_record_binding();

notify pgrst, 'reload schema';
