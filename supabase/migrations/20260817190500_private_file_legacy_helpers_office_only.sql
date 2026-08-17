-- Remove broad same-organisation field access from legacy private-file helpers.

create or replace function private.jr_can_read_private_file(
  storage_key_value text,
  customer_source_id_value text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'customer'
      and storage_key_value = 'jr-os-job-documents'
      and customer_source_id_value = private.current_customer_source_id()
    ),
    false
  )
$$;

revoke execute on function private.jr_can_read_private_file(text,text)
from public, anon;
grant execute on function private.jr_can_read_private_file(text,text)
to authenticated, service_role;

create or replace function private.jr_can_write_private_file(storage_key_value text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.can_manage_office_data(), false)
$$;

revoke execute on function private.jr_can_write_private_file(text)
from public, anon;
grant execute on function private.jr_can_write_private_file(text)
to authenticated, service_role;
